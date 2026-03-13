import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { resolveModel } from '@/lib/agent/model-registry'
import { generateDigest, getActiveThreads, type ThreadInfo } from './channel-triage'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyDigestResult {
  orgId: string
  generatedAt: string
  summary: string
  sections: DigestSection[]
  whatsappSent: boolean
}

export interface DigestSection {
  title: string
  items: string[]
  priority: 'high' | 'normal'
}

// ---------------------------------------------------------------------------
// Data Collection
// ---------------------------------------------------------------------------

async function getPendingApprovals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ count: number; items: string[] }> {
  const { data, count } = await supabase
    .from('approval_queue')
    .select('action_type, action_summary, priority', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5)

  const items = (data ?? []).map((a: Record<string, unknown>) =>
    `[${a.priority}] ${a.action_summary || a.action_type}`
  )

  return { count: count ?? 0, items }
}

async function getOverdueTasks(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ count: number; items: string[] }> {
  const now = new Date().toISOString()
  const { data, count } = await supabase
    .from('tasks')
    .select('title, priority, metadata', { count: 'exact' })
    .eq('org_id', orgId)
    .in('status', ['pending', 'in_progress'])
    .lt('metadata->>target_date', now)
    .order('priority', { ascending: true })
    .limit(5)

  const items = (data ?? []).map((t: Record<string, unknown>) =>
    `[${t.priority}] ${t.title}`
  )

  return { count: count ?? 0, items }
}

async function getTodaysPriorities(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const { data } = await supabase
    .from('tasks')
    .select('title, priority')
    .eq('org_id', orgId)
    .in('status', ['pending', 'in_progress'])
    .in('priority', ['critical', 'high'])
    .order('priority', { ascending: true })
    .limit(5)

  return (data ?? []).map((t: Record<string, unknown>) =>
    `[${t.priority}] ${t.title}`
  )
}

// ---------------------------------------------------------------------------
// Digest Builder
// ---------------------------------------------------------------------------

function buildDigestSections(
  digestEntries: { category: string; count: number; highlights: string[] }[],
  pendingApprovals: { count: number; items: string[] },
  overdueTasks: { count: number; items: string[] },
  todaysPriorities: string[],
  waitingOnYou: ThreadInfo[],
): DigestSection[] {
  const sections: DigestSection[] = []

  // 1. Urgent: items needing immediate attention
  const urgentItems: string[] = []
  if (pendingApprovals.count > 0) {
    urgentItems.push(`${pendingApprovals.count} pending approval(s)`)
    urgentItems.push(...pendingApprovals.items.slice(0, 2))
  }
  if (overdueTasks.count > 0) {
    urgentItems.push(`${overdueTasks.count} overdue task(s)`)
    urgentItems.push(...overdueTasks.items.slice(0, 2))
  }
  if (waitingOnYou.length > 0) {
    urgentItems.push(`${waitingOnYou.length} conversation(s) waiting on you`)
    for (const t of waitingOnYou.slice(0, 2)) {
      urgentItems.push(`  ${t.contactName}: ${t.topic}`)
    }
  }

  if (urgentItems.length > 0) {
    sections.push({ title: 'Needs Your Attention', items: urgentItems, priority: 'high' })
  }

  // 2. Today's Priorities
  if (todaysPriorities.length > 0) {
    sections.push({ title: "Today's Priorities", items: todaysPriorities, priority: 'high' })
  }

  // 3. Overnight Messages
  const messageItems: string[] = []
  for (const entry of digestEntries) {
    if (entry.category === 'summary' && entry.count === 0) continue
    messageItems.push(`${entry.category}: ${entry.count} message(s)`)
    for (const h of entry.highlights.slice(0, 1)) {
      messageItems.push(`  ${h}`)
    }
  }
  if (messageItems.length > 0) {
    sections.push({ title: 'Overnight Messages', items: messageItems, priority: 'normal' })
  }

  return sections
}

function formatDigestForWhatsApp(sections: DigestSection[]): string {
  const lines: string[] = ['*Morning Briefing*', '']

  for (const section of sections) {
    const icon = section.priority === 'high' ? '!' : '-'
    lines.push(`*${section.title}*`)
    for (const item of section.items) {
      lines.push(`${icon} ${item}`)
    }
    lines.push('')
  }

  if (sections.length === 0) {
    lines.push('All clear! No urgent items this morning.')
  }

  return lines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// LLM Summary (optional enrichment)
// ---------------------------------------------------------------------------

async function generateAISummary(sections: DigestSection[]): Promise<string> {
  try {
    const client = new Anthropic()
    const sectionText = sections.map(s =>
      `${s.title}:\n${s.items.map(i => `- ${i}`).join('\n')}`
    ).join('\n\n')

    const response = await client.messages.create({
      model: resolveModel('classification'),
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Summarize this daily briefing in 2-3 short sentences for a busy business owner. Be direct and actionable.\n\n${sectionText}`,
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    return textBlock && textBlock.type === 'text' ? textBlock.text : ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Main Digest Runner
// ---------------------------------------------------------------------------

/**
 * Generate and optionally send a daily digest for an org.
 * Collects overnight messages, pending approvals, overdue tasks,
 * and conversation threads, then formats for WhatsApp delivery.
 */
export async function runDailyDigest(
  supabase: SupabaseClient,
  orgId: string,
  options: { sendWhatsApp?: boolean; hoursBack?: number } = {},
): Promise<DailyDigestResult> {
  const hoursBack = options.hoursBack ?? 12

  // Collect all digest data in parallel
  const [digestEntries, pendingApprovals, overdueTasks, todaysPriorities, threads] =
    await Promise.all([
      generateDigest(supabase, orgId, hoursBack),
      getPendingApprovals(supabase, orgId),
      getOverdueTasks(supabase, orgId),
      getTodaysPriorities(supabase, orgId),
      getActiveThreads(supabase, orgId),
    ])

  const waitingOnYou = threads.filter(t => t.status === 'waiting_on_you')
  const sections = buildDigestSections(digestEntries, pendingApprovals, overdueTasks, todaysPriorities, waitingOnYou)

  // Generate AI summary
  const aiSummary = await generateAISummary(sections)
  const whatsappText = formatDigestForWhatsApp(sections)

  // Send via WhatsApp if configured
  let whatsappSent = false
  if (options.sendWhatsApp) {
    try {
      // Look up the org owner's WhatsApp number
      const { data: orgData } = await supabase
        .from('organisations')
        .select('metadata')
        .eq('id', orgId)
        .single()

      const whatsappNumber = (orgData?.metadata as Record<string, unknown>)?.whatsapp_number as string | undefined
      if (whatsappNumber) {
        // Use the WhatsApp adapter to send
        const { sendMessage } = await import('@/lib/channels/whatsapp')
        await sendMessage(whatsappNumber, whatsappText)
        whatsappSent = true
      }
    } catch (err) {
      logger.warn('[daily-digest] Failed to send WhatsApp digest:', err)
    }
  }

  // Log the digest run
  await supabase
    .from('agent_runs')
    .insert({
      org_id: orgId,
      trigger_type: 'scheduled',
      input_summary: `Daily digest for ${hoursBack}h window`,
      output_summary: `Generated ${sections.length} sections, WhatsApp: ${whatsappSent}`,
      actions_taken: ['generate_digest', ...(whatsappSent ? ['send_whatsapp'] : [])],
      tools_called: [],
      model_used: 'classification',
      tokens_in: 0,
      tokens_out: 0,
      confidence_score: 1,
      routing_decision: 'act',
      duration_ms: 0,
    })

  return {
    orgId,
    generatedAt: new Date().toISOString(),
    summary: aiSummary || whatsappText,
    sections,
    whatsappSent,
  }
}

export const dailyDigest = {
  run: runDailyDigest,
}
