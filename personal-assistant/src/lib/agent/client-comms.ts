import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { loadVoiceProfile as loadVoiceProfileFromDisk } from './voice-loader'
import { queueAgentAction } from './approval-queue'
import { logAgentRun } from './run-logger'
import { getTemplate, mergeTemplate } from './templates'
import { getClientProfile, type ClientProfile } from './client-profiles'
import { analyzeSentiment, type SentimentResult } from './sentiment'
import { enrichContact } from './contact-enrichment'
import { getOrgNotificationConfig } from '@/lib/org/notification-config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceProfile {
  id: string
  org_id: string
  name: string
  tone: string
  style_guide: string
  greeting_templates: string[]
  sign_off: string
  avoid_phrases: string[]
}

export interface DraftRequest {
  contactSlug: string
  incomingMessage: string
  channel: 'email' | 'whatsapp' | 'sms'
  replyType?: 'acknowledgment' | 'update' | 'followup' | 'payment_reminder'
  templateName?: string
  templateVars?: Record<string, string>
  requireApproval?: boolean
}

export interface DraftedReply {
  subject?: string
  body: string
  voice: string
  confidence: number
  sentiment?: SentimentResult
  approvalId?: string
}

export interface ClientCommsTickResult {
  processed: number
  drafted: number
  sent: number
  queued: number
  failed: number
}

// ---------------------------------------------------------------------------
// Voice loading (DB + disk fallback)
// ---------------------------------------------------------------------------

export async function loadVoiceProfile(
  supabase: SupabaseClient,
  orgId: string,
  profileName?: string,
): Promise<VoiceProfile | null> {
  let query = supabase
    .from('voice_profiles')
    .select('*')
    .eq('org_id', orgId)

  if (profileName) {
    query = query.eq('name', profileName)
  } else {
    query = query.limit(1)
  }

  const { data } = await query
  return data?.[0] || null
}

/**
 * Resolve voice for a specific contact.
 * Priority: contact.voice_profile_id -> client profile override -> org default -> disk fallback.
 */
async function resolveVoice(
  supabase: SupabaseClient,
  orgId: string,
  contactSlug: string,
): Promise<{ tone: string; styleGuide: string; signOff: string; voiceName: string }> {
  // Check contact-level voice override
  const { data: contact } = await supabase
    .from('contacts')
    .select('voice_profile_id, communication_patterns')
    .eq('org_id', orgId)
    .eq('slug', contactSlug)
    .single()

  if (contact?.voice_profile_id) {
    const { data: vp } = await supabase
      .from('voice_profiles')
      .select('*')
      .eq('id', contact.voice_profile_id)
      .single()

    if (vp) {
      return {
        tone: vp.tone || 'professional and friendly',
        styleGuide: vp.style_guide || '',
        signOff: vp.sign_off || 'Best regards',
        voiceName: vp.name,
      }
    }
  }

  // Check client profile for tone override
  const profile = await getClientProfile(supabase, orgId, contactSlug)
  const toneOverride = profile?.tone

  // Org-level default voice
  const voice = await loadVoiceProfile(supabase, orgId)
  if (voice) {
    return {
      tone: toneOverride || voice.tone || 'professional and friendly',
      styleGuide: voice.style_guide || '',
      signOff: voice.sign_off || 'Best regards',
      voiceName: voice.name,
    }
  }

  // Disk fallback
  const deploymentSlug = process.env.BITBIT_DEPLOYMENT || 'awu'
  const diskVoice = await loadVoiceProfileFromDisk(deploymentSlug)

  return {
    tone: toneOverride || 'professional and friendly',
    styleGuide: diskVoice || '',
    signOff: 'Cheers',
    voiceName: 'disk-default',
  }
}

// ---------------------------------------------------------------------------
// Draft reply
// ---------------------------------------------------------------------------

export async function draftReply(
  supabase: SupabaseClient,
  orgId: string,
  request: DraftRequest,
): Promise<DraftedReply> {
  const voice = await resolveVoice(supabase, orgId, request.contactSlug)

  // Resolve contact name
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, communication_patterns, emails')
    .eq('org_id', orgId)
    .eq('slug', request.contactSlug)
    .single()

  const contactName = contact?.name || request.contactSlug

  // Analyze incoming sentiment
  let sentiment: SentimentResult | undefined
  if (request.incomingMessage) {
    sentiment = await analyzeSentiment(request.incomingMessage)
  }

  // Template-based path
  if (request.templateName) {
    const template = await getTemplate(supabase, orgId, request.templateName)
    if (template) {
      const orgConfig = await getOrgNotificationConfig(orgId)
      const vars: Record<string, string> = {
        name: contactName,
        sign_off: voice.signOff,
        org: orgConfig.name,
        ...request.templateVars,
      }
      const body = mergeTemplate(template.body_template, vars)
      const subject = template.subject_template
        ? mergeTemplate(template.subject_template, vars)
        : undefined

      return maybeQueueForApproval(supabase, orgId, request, {
        subject,
        body,
        voice: voice.voiceName,
        confidence: 0.85,
        sentiment,
      })
    }
  }

  // Built-in template shortcuts
  if (request.replyType && BUILT_IN_TEMPLATES[request.replyType]) {
    const orgConfig = await getOrgNotificationConfig(orgId)
    const body = BUILT_IN_TEMPLATES[request.replyType]
      .replace(/{name}/g, contactName)
      .replace(/{org}/g, orgConfig.name)
      .replace(/{sign_off}/g, voice.signOff)

    return maybeQueueForApproval(supabase, orgId, request, {
      subject: request.channel === 'email' ? `Re: ${contactName}` : undefined,
      body,
      voice: voice.voiceName,
      confidence: 0.75,
      sentiment,
    })
  }

  // LLM draft (Sonnet for quality)
  const body = await generateContextualReplyWithLLM(
    contactName,
    request.incomingMessage,
    voice.tone,
    voice.styleGuide,
    voice.signOff,
    request.channel,
    sentiment,
  )

  return maybeQueueForApproval(supabase, orgId, request, {
    subject: request.channel === 'email' ? `Re: ${contactName}` : undefined,
    body,
    voice: voice.voiceName,
    confidence: 0.7,
    sentiment,
  })
}

async function maybeQueueForApproval(
  supabase: SupabaseClient,
  orgId: string,
  request: DraftRequest,
  draft: DraftedReply,
): Promise<DraftedReply> {
  // Negative sentiment or explicit request -> queue for approval
  const needsApproval =
    request.requireApproval !== false &&
    (request.requireApproval === true ||
      draft.confidence < 0.8 ||
      draft.sentiment?.label === 'negative')

  if (!needsApproval) return draft

  // Find client-comms agent config
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'client-comms')
    .eq('enabled', true)
    .limit(1)
    .single()

  if (!agentConfig) return draft

  const approval = await queueAgentAction(supabase, {
    org_id: orgId,
    agent_config_id: agentConfig.id,
    action_type: 'send_client_reply',
    action_payload: {
      contactSlug: request.contactSlug,
      channel: request.channel,
      draft: draft.body,
      subject: draft.subject,
    },
    action_summary: `Draft ${request.channel} reply to ${request.contactSlug}: "${draft.body.slice(0, 80)}..."`,
    confidence_score: draft.confidence,
    priority: draft.sentiment?.label === 'negative' ? 'urgent' : 'normal',
    context_snapshot: {
      incomingMessage: request.incomingMessage.slice(0, 500),
      sentiment: draft.sentiment,
    },
  })

  return {
    ...draft,
    approvalId: approval?.id,
  }
}

// ---------------------------------------------------------------------------
// LLM drafting
// ---------------------------------------------------------------------------

async function generateContextualReplyWithLLM(
  name: string,
  incoming: string,
  tone: string,
  styleGuide: string,
  signOff: string,
  channel: 'email' | 'whatsapp' | 'sms',
  sentiment?: SentimentResult,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return generateContextualReplyFallback(name, incoming, tone, signOff)
  }

  try {
    const deploymentSlug = process.env.BITBIT_DEPLOYMENT || 'awu'
    const voiceProfileText = await loadVoiceProfileFromDisk(deploymentSlug)

    const client = new Anthropic({ apiKey })

    const sentimentNote = sentiment
      ? `\nIncoming message sentiment: ${sentiment.label} (score: ${sentiment.score.toFixed(2)}). ${sentiment.label === 'negative' ? 'Be extra empathetic and solution-oriented.' : ''}`
      : ''

    const channelGuidance: Record<string, string> = {
      email: 'Write a professional email reply. Include greeting and sign-off.',
      whatsapp: 'Write a concise WhatsApp message. Keep it brief and conversational.',
      sms: 'Write a very short SMS reply. Maximum 2-3 sentences.',
    }

    const systemPrompt = `You are a professional communication assistant drafting ${channel} replies.

Tone: ${tone}
${styleGuide ? `Style Guide: ${styleGuide}` : ''}
${voiceProfileText ? `Voice Profile:\n${voiceProfileText}` : ''}
${sentimentNote}

${channelGuidance[channel] || ''}

Draft a natural reply. End with "${signOff}" where appropriate.
Return ONLY the message body, no metadata.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Reply to this message from ${name}:\n\n${incoming}`,
        },
      ],
      system: systemPrompt,
    })

    const content = message.content[0]
    if (content.type === 'text') {
      return content.text
    }

    return generateContextualReplyFallback(name, incoming, tone, signOff)
  } catch {
    return generateContextualReplyFallback(name, incoming, tone, signOff)
  }
}

function generateContextualReplyFallback(
  name: string,
  incoming: string,
  _tone: string,
  signOff: string,
): string {
  const lower = incoming.toLowerCase()

  if (lower.includes('when') || lower.includes('timeline') || lower.includes('eta')) {
    return `Hi ${name},\n\nThanks for checking in. Let me get an update on the timeline and get back to you shortly.\n\n${signOff}`
  }

  if (lower.includes('invoice') || lower.includes('payment') || lower.includes('cost')) {
    return `Hi ${name},\n\nThanks for reaching out about billing. I'll pull up the details and send through an update.\n\n${signOff}`
  }

  if (lower.includes('issue') || lower.includes('bug') || lower.includes('problem') || lower.includes('broken')) {
    return `Hi ${name},\n\nThanks for flagging this. I'm looking into it now and will get back to you with an update ASAP.\n\n${signOff}`
  }

  return `Hi ${name},\n\nThanks for your message. I'll review and get back to you shortly.\n\n${signOff}`
}

// ---------------------------------------------------------------------------
// Weekly status update generation
// ---------------------------------------------------------------------------

export interface WeeklyStatusResult {
  contactSlug: string
  subject: string
  body: string
  tasksSummary: string
  approvalId?: string
}

export async function generateWeeklyStatus(
  supabase: SupabaseClient,
  orgId: string,
  contactSlug: string,
): Promise<WeeklyStatusResult | null> {
  // Find active projects for this contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, slug')
    .eq('org_id', orgId)
    .eq('slug', contactSlug)
    .single()

  if (!contact) return null

  // Get recent tasks associated with this contact (via tasks table or board)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentTasks } = await supabase
    .from('tasks')
    .select('title, status, priority, updated_at')
    .eq('org_id', orgId)
    .eq('contact_id', contact.id)
    .gte('updated_at', oneWeekAgo)
    .order('updated_at', { ascending: false })
    .limit(20)

  // Get recent timeline entries
  const { data: recentActivity } = await supabase
    .from('activity_feed')
    .select('action, result, created_at')
    .eq('org_id', orgId)
    .ilike('action', `%${contact.name}%`)
    .gte('created_at', oneWeekAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  const completedTasks = (recentTasks || []).filter(t => t.status === 'done')
  const inProgressTasks = (recentTasks || []).filter(t => t.status === 'in_progress' || t.status === 'doing')
  const upcomingTasks = (recentTasks || []).filter(t => t.status === 'todo' || t.status === 'backlog')

  const tasksSummary = [
    completedTasks.length > 0
      ? `Completed (${completedTasks.length}): ${completedTasks.map(t => t.title).join(', ')}`
      : null,
    inProgressTasks.length > 0
      ? `In Progress (${inProgressTasks.length}): ${inProgressTasks.map(t => t.title).join(', ')}`
      : null,
    upcomingTasks.length > 0
      ? `Coming Up (${upcomingTasks.length}): ${upcomingTasks.map(t => t.title).join(', ')}`
      : null,
  ].filter(Boolean).join('\n')

  if (!tasksSummary) return null // Nothing to report

  const voice = await resolveVoice(supabase, orgId, contactSlug)

  const apiKey = process.env.ANTHROPIC_API_KEY
  let body: string

  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: `You are drafting a weekly project status update email for a client.
Tone: ${voice.tone}
Sign off: ${voice.signOff}
Keep it concise, positive, and action-oriented. Highlight progress and next steps.
Return ONLY the email body.`,
        messages: [{
          role: 'user',
          content: `Draft a weekly status update for ${contact.name}.\n\nTask Progress:\n${tasksSummary}\n\nRecent Activity:\n${(recentActivity || []).map(a => `- ${a.action}`).join('\n') || 'None logged.'}`,
        }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      body = textBlock?.type === 'text' ? textBlock.text : buildFallbackStatus(contact.name, tasksSummary, voice.signOff)
    } catch {
      body = buildFallbackStatus(contact.name, tasksSummary, voice.signOff)
    }
  } else {
    body = buildFallbackStatus(contact.name, tasksSummary, voice.signOff)
  }

  return {
    contactSlug,
    subject: `Weekly Status Update - ${contact.name}`,
    body,
    tasksSummary,
  }
}

function buildFallbackStatus(name: string, tasksSummary: string, signOff: string): string {
  return `Hey ${name},

Here's your weekly project update:

${tasksSummary}

Let me know if you have any questions or want to adjust priorities for the coming week.

${signOff}`
}

// ---------------------------------------------------------------------------
// Scheduler tick
// ---------------------------------------------------------------------------

export async function runClientCommsTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<ClientCommsTickResult> {
  const result: ClientCommsTickResult = { processed: 0, drafted: 0, sent: 0, queued: 0, failed: 0 }
  const startTime = Date.now()

  // 0. Send approved outbound messages
  const { data: approvedReplies } = await supabase
    .from('approval_queue')
    .select('id, action_payload, action_type')
    .eq('org_id', orgId)
    .eq('action_type', 'send_client_reply')
    .eq('status', 'approved')
    .limit(20)

  for (const approval of approvedReplies || []) {
    try {
      const payload = approval.action_payload as Record<string, unknown>
      const channel = payload.channel as string
      const contactSlug = payload.contactSlug as string
      const draft = payload.draft as string
      const subject = payload.subject as string | undefined

      // Resolve contact email for email channels
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, email')
        .eq('org_id', orgId)
        .eq('slug', contactSlug)
        .single()

      if (contact?.email && (channel === 'email' || channel === 'outlook' || channel === 'gmail')) {
        const { sendInvoiceEmail } = await import('@/lib/email/send-invoice')
        const orgConfig = await getOrgNotificationConfig(orgId)
        await sendInvoiceEmail({
          to: contact.email,
          invoiceNumber: `reply-${approval.id}`,
          html: `<pre style="font-family:sans-serif;white-space:pre-wrap;">${draft}</pre>`,
          subject: subject || `Message from ${orgConfig.name}`,
        })
        result.sent++
      } else if (channel === 'whatsapp' && contact?.id) {
        // Queue as outbound WhatsApp message
        await supabase.from('channel_messages').insert({
          org_id: orgId,
          channel_type: 'whatsapp',
          direction: 'outbound',
          contact_id: contact.id,
          body: draft,
          status: 'queued',
          metadata: { approval_id: approval.id },
        })
        result.sent++
      }

      // Mark approval as resolved
      await supabase
        .from('approval_queue')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', approval.id)

      // Log to entity timeline
      if (contact?.id) {
        await supabase.from('entity_timeline').insert({
          org_id: orgId,
          entity_type: 'contact',
          entity_id: contact.id,
          event_type: 'message_sent',
          event_data: { channel, subject, body_preview: draft.slice(0, 200) },
          occurred_at: new Date().toISOString(),
        })
      }
    } catch {
      result.failed++
    }
  }

  // 1. Process unhandled inbound messages routed to client-comms
  const { data: pendingMessages } = await supabase
    .from('channel_messages')
    .select('id, org_id, channel, sender, sender_email, subject, body, received_at, metadata, contact_id')
    .eq('org_id', orgId)
    .eq('processed', false)
    .contains('metadata', { routed_to: 'client-comms' })
    .order('received_at', { ascending: true })
    .limit(20)

  for (const msg of pendingMessages || []) {
    try {
      result.processed++

      // Enrich contact from message content
      if (msg.contact_id) {
        await enrichContact(supabase, orgId, msg.contact_id, msg.body, msg.sender_email)
      }

      // Analyze sentiment and store on message
      const sentiment = await analyzeSentiment(msg.body)
      await supabase
        .from('channel_messages')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          metadata: { ...(msg.metadata || {}), sentiment },
        })
        .eq('id', msg.id)

      // Resolve contact slug for drafting
      let contactSlug: string | null = null
      if (msg.contact_id) {
        const { data: c } = await supabase
          .from('contacts')
          .select('slug')
          .eq('id', msg.contact_id)
          .single()
        contactSlug = c?.slug || null
      }

      if (!contactSlug) continue

      // Draft a reply
      const draft = await draftReply(supabase, orgId, {
        contactSlug,
        incomingMessage: msg.body,
        channel: (msg.channel as DraftRequest['channel']) || 'email',
        requireApproval: true,
      })

      result.drafted++
      if (draft.approvalId) {
        result.queued++
      } else {
        result.sent++
      }
    } catch {
      result.failed++
    }
  }

  // 2. Log the run
  await logAgentRun(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    trigger_type: 'scheduled',
    status: 'success',
    result_summary: `processed=${result.processed} drafted=${result.drafted} sent=${result.sent} queued=${result.queued} failed=${result.failed}`,
    model_used: 'sonnet',
    tokens_in: 0,
    tokens_out: 0,
    cost_estimate: 0,
    duration_ms: Date.now() - startTime,
    tool_calls: 0,
    iterations: 1,
  })

  return result
}

// ---------------------------------------------------------------------------
// Built-in templates (kept for backward compat)
// ---------------------------------------------------------------------------

const BUILT_IN_TEMPLATES: Record<string, string> = {
  acknowledgment: `Hi {name},

Thanks for your message. I'll review and get back to you shortly.

{sign_off}`,

  update: `Hi {name},

Quick update on your project:

{update_details}

{sign_off}`,

  followup: `Hi {name},

Just following up on our last conversation. Let me know if you have any questions or need anything else.

{sign_off}`,

  payment_reminder: `Hi {name},

Just a friendly reminder that invoice {invoice_ref} ({amount}) is due {due_date}.

You can pay via the link in the original invoice email, or let me know if you need it resent.

{sign_off}`,
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const clientComms = {
  draftReply,
  loadVoiceProfile,
  generateWeeklyStatus,
  runClientCommsTick,
}
