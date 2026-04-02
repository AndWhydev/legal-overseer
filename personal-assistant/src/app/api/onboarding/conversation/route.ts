import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'
import { crawlAllChannels, type CrawlProgress } from '@/lib/onboarding/intelligence-crawl'
import { synthesizeWorldModel } from '@/lib/onboarding/opus-synthesis'
import { ingestWorldModel } from '@/lib/onboarding/world-model-ingester'
import { generateNarration, type NarrationContext, type PipelineEvent } from '@/lib/onboarding/narration'
import { determineAgents } from '@/lib/onboarding/agent-activator'
import type {
  OnboardingStreamEvent,
  RevealWorldModel,
  RevealPerson,
  RevealProject,
  RevealFinancial,
  RevealStats,
} from '@/lib/onboarding/stream-types'
import type { WorldModel } from '@/lib/onboarding/opus-synthesis'
import { getReplyQueue } from './reply/queue'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return new Response(JSON.stringify({ error: 'No org found' }), { status: 400 })
  }

  const orgId = profile.org_id
  const userId = user.id

  logger.info('[api/onboarding/conversation] Starting pipeline SSE stream', {
    userId,
    orgId,
  })

  // Use service client for pipeline operations (needs to bypass RLS for writes)
  let serviceSupabase: ReturnType<typeof getServiceClient>
  try {
    serviceSupabase = getServiceClient()
  } catch {
    return new Response(JSON.stringify({ error: 'Service client not configured' }), { status: 503 })
  }

  const encoder = new TextEncoder()
  const replyQueue = getReplyQueue(orgId)

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: OnboardingStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Stream already closed
        }
      }

      // Narration state
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
      const userCorrections: Array<{ original: string; correction: string }> = []
      let narrationId = 0
      const allMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
      const pipelineStart = Date.now()

      const narrate = async (event: PipelineEvent, phase: NarrationContext['currentPhase']) => {
        // Drain any user replies before narrating
        const replies = replyQueue.drain()
        for (const reply of replies) {
          conversationHistory.push({ role: 'user', content: reply.message })
          allMessages.push({ role: 'user', content: reply.message })
          // If user replied during crawl, it might be a correction
          if (conversationHistory.length > 1) {
            const lastAssistant = conversationHistory.filter(m => m.role === 'assistant').pop()
            if (lastAssistant) {
              userCorrections.push({ original: lastAssistant.content, correction: reply.message })
            }
          }
        }

        const context: NarrationContext = {
          conversationHistory: conversationHistory.slice(-10),
          userCorrections,
          currentPhase: phase,
        }

        const message = await generateNarration(event, context)
        conversationHistory.push({ role: 'assistant', content: message })
        allMessages.push({ role: 'assistant', content: message })
        narrationId++
        send({ type: 'narration', message, id: `n-${narrationId}` })
      }

      try {
        // ── Phase 1: Crawl ──────────────────────────────────────────────
        await narrate({ type: 'crawl_start' }, 'crawling')
        send({ type: 'progress', phase: 'crawling', percent: 0 })

        const crawlProgressEvents: CrawlProgress[] = []

        const crawlResult = await crawlAllChannels(serviceSupabase, orgId, {
          monthsBack: 6,
          maxPerChannel: 100,
          onProgress: (p: CrawlProgress) => {
            crawlProgressEvents.push(p)
          },
        })

        // Narrate crawl results per channel
        for (const p of crawlProgressEvents) {
          if (p.status === 'done' && p.count > 0) {
            await narrate(
              { type: 'crawl_progress', channel: p.channel, messagesFound: p.count },
              'crawling',
            )
          }
        }

        send({ type: 'progress', phase: 'crawling', percent: 100 })

        if (crawlResult.messages.length === 0) {
          send({
            type: 'error',
            message: 'No messages found in connected channels. Connect at least one email account first.',
            recoverable: true,
          })
          controller.close()
          return
        }

        // ── Phase 2: Opus Synthesis ─────────────────────────────────────
        const channels = Object.entries(crawlResult.channelBreakdown)
          .map(([ch, n]) => `${ch}(${n})`)
          .join(', ')

        await narrate(
          { type: 'synthesis_start', totalMessages: crawlResult.messages.length, channels: Object.keys(crawlResult.channelBreakdown) },
          'synthesizing',
        )
        send({ type: 'progress', phase: 'synthesizing', percent: 10 })

        const worldModel = await synthesizeWorldModel(crawlResult.messages, 200)

        send({ type: 'progress', phase: 'synthesizing', percent: 90 })

        // Stream discovery items as narration
        for (const person of worldModel.people.slice(0, 5)) {
          await narrate(
            { type: 'contact_found', name: person.name, messageCount: 0, relationship: person.relationship },
            'synthesizing',
          )
          // Also send a discovery event for the UI
          send({
            type: 'discovery',
            category: 'contact',
            data: { name: person.name, detail: `${person.relationship} at ${person.company || 'unknown'}` },
          })
        }

        for (const project of worldModel.projects.slice(0, 3)) {
          await narrate(
            { type: 'project_found', name: project.name, people: project.people },
            'synthesizing',
          )
          send({
            type: 'discovery',
            category: 'project',
            data: { name: project.name, detail: project.description.slice(0, 100) },
          })
        }

        for (const fin of worldModel.financials.slice(0, 3)) {
          await narrate(
            { type: 'financial_found', entity: fin.entity, amount: fin.amount, type: fin.type },
            'synthesizing',
          )
          send({
            type: 'discovery',
            category: 'financial',
            data: { name: fin.entity, detail: `${fin.amount} ${fin.currency} (${fin.type})` },
          })
        }

        send({ type: 'progress', phase: 'synthesizing', percent: 100 })

        // ── Phase 3: Ingestion ──────────────────────────────────────────
        await narrate({ type: 'ingestion_start' }, 'ingesting')
        send({ type: 'progress', phase: 'ingesting', percent: 10 })

        const ingestionResult = await ingestWorldModel(serviceSupabase, orgId, userId, worldModel)

        send({ type: 'progress', phase: 'ingesting', percent: 100 })

        // ── Phase 4: Agent Activation ───────────────────────────────────
        const revealModel = mapToRevealWorldModel(worldModel, serviceSupabase, orgId)

        const agentResult = determineAgents(await revealModel)
        const resolvedReveal = await revealModel

        await narrate(
          { type: 'agents_activated', agents: agentResult.activated },
          'complete',
        )

        send({ type: 'agents', activated: agentResult.activated, reasons: agentResult.reasons })

        // ── Phase 5: Reveal ─────────────────────────────────────────────
        const stats: RevealStats = {
          totalMessages: crawlResult.messages.length,
          peopleFound: worldModel.people.length,
          projectsFound: worldModel.projects.length,
          financialsFound: worldModel.financials.length,
          channelsScanned: Object.keys(crawlResult.channelBreakdown),
          durationMs: Date.now() - pipelineStart,
        }

        const totalFinancials = worldModel.financials
          .filter(f => f.type === 'receivable')
          .reduce((sum, f) => {
            const num = parseFloat(f.amount.replace(/[^0-9.-]/g, ''))
            return sum + (isNaN(num) ? 0 : num)
          }, 0)

        await narrate(
          {
            type: 'reveal',
            peopleCount: worldModel.people.length,
            projectCount: worldModel.projects.length,
            financialTotal: totalFinancials > 0 ? `$${totalFinancials.toLocaleString()}` : '$0',
          },
          'complete',
        )

        send({ type: 'reveal', worldModel: resolvedReveal, stats })

        // ── Phase 6: Persist conversation ───────────────────────────────
        let threadId = ''
        try {
          const { data: thread } = await serviceSupabase
            .from('conversation_threads')
            .insert({
              org_id: orgId,
              user_id: userId,
              channel: 'onboarding',
              subject: 'Onboarding intelligence scan',
              status: 'resolved',
            })
            .select('id')
            .single()

          if (thread) {
            threadId = thread.id

            // Insert all conversation messages
            const messageRows = allMessages.map((msg, idx) => ({
              thread_id: threadId,
              org_id: orgId,
              role: msg.role,
              content: msg.content,
              created_at: new Date(pipelineStart + idx * 100).toISOString(),
            }))

            if (messageRows.length > 0) {
              await serviceSupabase
                .from('conversation_messages')
                .insert(messageRows)
            }
          }
        } catch (err) {
          logger.warn('[api/onboarding/conversation] Failed to persist conversation', {
            error: err instanceof Error ? err.message : String(err),
          })
          // Non-fatal: the pipeline still succeeded
        }

        // ── Complete ────────────────────────────────────────────────────
        send({ type: 'complete', threadId })

        logger.info('[api/onboarding/conversation] Pipeline complete', {
          userId,
          orgId,
          durationMs: Date.now() - pipelineStart,
          people: worldModel.people.length,
          projects: worldModel.projects.length,
          financials: worldModel.financials.length,
          contactsCreated: ingestionResult.contactsCreated,
          memoriesStored: ingestionResult.memoriesStored,
          threadId,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('[api/onboarding/conversation] Pipeline failed', { error: message, userId, orgId })
        send({ type: 'error', message, recoverable: false })
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map the synthesis WorldModel to the RevealWorldModel format expected by the UI.
 * Looks up real contact IDs from the database (created during ingestion).
 * Falls back to crypto.randomUUID() if lookup fails.
 */
async function mapToRevealWorldModel(
  model: WorldModel,
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<RevealWorldModel> {
  // Try to look up contact IDs from DB
  const contactIdMap = new Map<string, string>()
  try {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('org_id', orgId)

    for (const c of contacts ?? []) {
      contactIdMap.set(c.name.toLowerCase(), c.id)
    }
  } catch {
    // Fall back to random UUIDs
  }

  const people: RevealPerson[] = model.people.map(p => ({
    id: contactIdMap.get(p.name.toLowerCase()) ?? crypto.randomUUID(),
    name: p.name,
    company: p.company,
    role: p.role,
    relationship: p.relationship,
    messageCount: 0,
    frequency: p.communicationFrequency,
    lastInteraction: p.lastInteraction,
    outstandingItems: p.outstandingItems,
    emails: p.emails,
  }))

  const projects: RevealProject[] = model.projects.map(p => ({
    id: crypto.randomUUID(),
    name: p.name,
    status: p.status,
    people: p.people,
    urls: p.urls,
    description: p.description,
    deadlines: p.deadlines,
  }))

  const financials: RevealFinancial[] = model.financials.map(f => ({
    id: crypto.randomUUID(),
    type: f.type,
    entity: f.entity,
    amount: f.amount,
    currency: f.currency,
    dueDate: f.dueDate,
    status: f.status,
  }))

  return {
    user: {
      name: model.user.name,
      emails: model.user.emails,
      businessName: model.user.businessName,
      role: model.user.role,
    },
    people,
    projects,
    financials,
  }
}
