import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from '@/lib/channels/types'
import { logger } from '@/lib/core/logger'
import {
  classifyMessage,
  type ClassificationResult,
  classifyByHeaders,
  type SenderType,
  analyzeContentSignals,
  scoreActionability,
  shouldCreateContact,
  type ActionabilitySignals,
  type InboxCategory,
  type ShouldCreateContactInput,
} from './classifier'
import { routeMessage } from './action-router'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { writeMessageEvent } from '@/lib/context/timeline-writer'
import { linkRelationship } from '@/lib/context/relationship-linker'
import { reflectOnEvent } from './reflection'
import { getActiveOrders, matchOrdersToContext, type StandingOrder } from '@/lib/intelligence/standing-orders'
import { computeUrgency, type UrgencyResult } from '@/lib/intelligence/urgency-scorer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriageResult {
  processed: number
  actionable: number
  informational: number
  spam: number
  tasksCreated: number
  deduplicated: number
  entitiesLinked: number
  routed: { agent: string; messageId: string; priority: number }[]
}

export interface DigestEntry {
  category: string
  count: number
  highlights: string[]
}

export type MessageCategory = 'action_required' | 'fyi' | 'conversation' | 'automated' | 'marketing' | 'spam'

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low'

export interface TriagedMessage {
  id: string
  orgId: string
  channelType: string
  sender: string
  senderEmail: string | null
  subject: string | null
  bodyPreview: string
  category: MessageCategory
  priority: PriorityLevel
  significance: number
  classification: ClassificationResult
  contactId: string | null
  contactName: string | null
  threadStatus: ThreadStatus | null
  deduplicatedWith: string | null
  receivedAt: string
  processedAt: string
}

export type ThreadStatus = 'waiting_on_you' | 'waiting_on_them' | 'resolved' | 'new'

export interface ThreadInfo {
  contactId: string
  contactName: string
  topic: string
  status: ThreadStatus
  lastMessageAt: string
  lastMessageBy: 'user' | 'contact'
  messageCount: number
}

// ---------------------------------------------------------------------------
// Priority Scoring
// ---------------------------------------------------------------------------

/**
 * Score message priority based on classification signals, entity relationships,
 * financial signals, and deadline proximity.
 */
export function scorePriority(
  classification: ClassificationResult,
  contactMeta?: {
    isClient: boolean
    hasOutstanding: boolean
    overdueCount: number
    upcomingDeadlines: number
  }
): PriorityLevel {
  let score = classification.significance

  // Boost for known clients
  if (contactMeta?.isClient) score += 1

  // Boost for financial signals
  if (contactMeta?.hasOutstanding) score += 1
  if (contactMeta?.overdueCount && contactMeta.overdueCount > 0) score += 1

  // Boost for upcoming deadlines
  if (contactMeta?.upcomingDeadlines && contactMeta.upcomingDeadlines > 0) score += 1

  // Time sensitivity boost
  if (classification.timeSensitivity === 'immediate') score += 2
  else if (classification.timeSensitivity === 'today') score += 1

  if (score >= 9) return 'critical'
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

/**
 * Map classification + sender type + actionability to inbox category.
 * Uses composite threshold: significance 8+ alone qualifies as action_required,
 * OR 2+ converging signals from: significance >= 6, actionability >= 4,
 * time-sensitive, client/lead sender.
 */
function toMessageCategory(
  classification: ClassificationResult,
  senderType: SenderType,
  actionability: ActionabilitySignals | null,
): MessageCategory {
  // 1. Spam/newsletter — fast exit
  if (classification.category === 'spam') return 'spam'
  if (classification.category === 'newsletter') return 'marketing'
  if (senderType === 'marketing') return 'marketing'

  // 2. Automated/transactional senders
  if (senderType === 'automated' || senderType === 'transactional') return 'automated'

  // 3. Personal/social
  if (classification.category === 'personal') return 'conversation'

  // 4. Action required — composite threshold (2+ signals, OR significance 7+)
  if (classification.significance >= 7) return 'action_required'

  const signals = [
    classification.significance >= 6,
    (actionability?.score ?? 0) >= 4,
    classification.timeSensitivity === 'immediate' || classification.timeSensitivity === 'today',
    classification.category === 'client' || classification.category === 'lead',
  ].filter(Boolean).length

  if (signals >= 2) return 'action_required'

  // 5. Everything else
  return 'fyi'
}

// ---------------------------------------------------------------------------
// Cross-Channel Deduplication
// ---------------------------------------------------------------------------

interface DedupeKey {
  senderNormalized: string
  topicNormalized: string
}

function buildDedupeKey(msg: Record<string, unknown>): DedupeKey {
  const sender = String(msg.sender_email || msg.sender || '').toLowerCase().trim()
  const topic = String(msg.subject || (msg.body as string || '').slice(0, 60)).toLowerCase().trim()
    .replace(/^(re|fw|fwd):\s*/gi, '')
    .replace(/\s+/g, ' ')
  return { senderNormalized: sender, topicNormalized: topic }
}

function dedupeKeyString(key: DedupeKey): string {
  return `${key.senderNormalized}::${key.topicNormalized}`
}

/**
 * Find cross-channel duplicates in a batch of messages.
 * Returns a map of message ID -> canonical message ID it duplicates.
 */
function findDuplicates(messages: Record<string, unknown>[]): Map<string, string> {
  const seen = new Map<string, string>() // dedupeKey -> first message id
  const duplicates = new Map<string, string>() // duplicate id -> canonical id

  for (const msg of messages) {
    const key = dedupeKeyString(buildDedupeKey(msg))
    const existing = seen.get(key)
    if (existing && existing !== msg.id) {
      duplicates.set(msg.id as string, existing)
    } else {
      seen.set(key, msg.id as string)
    }
  }

  return duplicates
}

// ---------------------------------------------------------------------------
// Existing Classification Parser
// ---------------------------------------------------------------------------

/**
 * Safely parse an existing classification from the DB.
 * Handles: raw object, JSON string, or double-stringified JSON.
 * Returns null if the value isn't a valid ClassificationResult.
 */
function parseExistingClassification(raw: unknown): ClassificationResult | null {
  if (!raw) return null

  let obj: unknown = raw

  // Unwrap JSON strings (handle double-stringification)
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return null }
    // Double-stringified case
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj) } catch { return null }
    }
  }

  // Validate it has the required shape
  if (
    typeof obj === 'object' && obj !== null &&
    'significance' in obj && 'category' in obj &&
    typeof (obj as ClassificationResult).significance === 'number' &&
    typeof (obj as ClassificationResult).category === 'string'
  ) {
    return obj as ClassificationResult
  }

  return null
}

// ---------------------------------------------------------------------------
// Pre-Classification: Header Analysis
// ---------------------------------------------------------------------------

/**
 * Extract email headers from message metadata.
 * Expects headers to be stored in metadata.headers or metadata.email_headers.
 */
function extractHeadersFromMessage(msg: Record<string, unknown>): Record<string, string> {
  const meta = (msg.metadata || {}) as Record<string, unknown>
  const headers = (meta.headers || meta.email_headers || {}) as Record<string, string>
  return headers
}

/**
 * Pre-classify message using deterministic header rules.
 * Returns sender type to be stored in metadata.
 */
function preClassifyByHeaders(msg: Record<string, unknown>): SenderType {
  const headers = extractHeadersFromMessage(msg)
  return classifyByHeaders(headers)
}

// ---------------------------------------------------------------------------
// Entity Resolution on Inbound
// ---------------------------------------------------------------------------

/**
 * Resolve sender to a known contact. Returns contact ID and name if found.
 */
async function resolveMessageSender(
  supabase: SupabaseClient,
  orgId: string,
  senderEmail: string | null,
  senderName: string | null,
): Promise<{ contactId: string; contactName: string } | null> {
  // Try email first (highest confidence), then name
  const queries = [senderEmail, senderName].filter(Boolean) as string[]

  for (const query of queries) {
    const ranked = await resolveEntityRanked(supabase, query, orgId)
    if (ranked.length > 0 && ranked[0].matchConfidence >= 0.6) {
      return {
        contactId: ranked[0].contact.id,
        contactName: ranked[0].contact.name,
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Auto-Create Tasks
// ---------------------------------------------------------------------------

/**
 * Synthesize a concise task title from a message.
 * Aims for 8 words or fewer — no channel prefix, no email cruft.
 */
function synthesizeTaskTitle(msg: Record<string, unknown>): string {
  let subject = ((msg.subject as string) || '').trim()

  // Strip Re:/Fwd:/FW: prefixes
  subject = subject.replace(/^(re|fw|fwd)\s*:\s*/gi, '').trim()

  // If no subject, derive from sender
  if (!subject) {
    const sender = (msg.sender as string) || 'Unknown'
    const firstName = sender.split(/\s+/)[0]
    return `Review message from ${firstName}`
  }

  // Truncate to ~8 words
  const words = subject.split(/\s+/)
  if (words.length > 8) {
    subject = words.slice(0, 8).join(' ')
  }

  return subject
}

/**
 * Create a structured task description — synthesized context, not verbatim email.
 */
function synthesizeTaskDescription(
  msg: Record<string, unknown>,
  classification: ClassificationResult,
): string {
  const parts: string[] = []

  const sender = msg.sender as string | undefined
  const senderEmail = msg.sender_email as string | undefined
  if (sender) {
    parts.push(`**From**: ${sender}${senderEmail ? ` (${senderEmail})` : ''}`)
  }

  if (classification.recommendedActions?.length) {
    parts.push(`**Action**: ${classification.recommendedActions.join(', ')}`)
  }

  // Prefer AI summary over raw body
  if (classification.summary) {
    parts.push('')
    parts.push(classification.summary)
  } else {
    const body = String(msg.body || '').trim()
    if (body) {
      parts.push('')
      parts.push(body.length > 200 ? body.slice(0, 200) + '...' : body)
    }
  }

  return parts.join('\n')
}

/**
 * Create a task for a high-significance actionable message.
 */
async function createTaskForMessage(
  supabase: SupabaseClient,
  orgId: string,
  msg: Record<string, unknown>,
  classification: ClassificationResult,
  priority: PriorityLevel,
  contactId: string | null,
): Promise<boolean> {
  const title = synthesizeTaskTitle(msg)

  // Check for existing task with same title to avoid duplicates
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .ilike('title', title) as { count: number | null }

  if ((count ?? 0) > 0) return false

  // Find "To Do" column
  const { data: column } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('org_id', orgId)
    .ilike('title', 'To Do')
    .limit(1)
    .single() as { data: { id: string } | null }

  if (!column) return false

  const description = synthesizeTaskDescription(msg, classification)

  const { error } = await supabase
    .from('tasks')
    .insert({
      org_id: orgId,
      title,
      description,
      priority,
      column_id: column.id,
      position: 0,
      status: 'pending',
      metadata: {
        source: 'bitbit',
        source_channel: msg.channel,
        source_message_id: msg.id,
        sender: msg.sender,
        sender_email: msg.sender_email,
        contact_id: contactId,
        classification_category: classification.category,
        significance: classification.significance,
        recommended_actions: classification.recommendedActions,
        triaged_at: new Date().toISOString(),
      },
    })

  return !error
}

// ---------------------------------------------------------------------------
// Thread Tracking
// ---------------------------------------------------------------------------

/**
 * Determine thread status for a conversation with a contact.
 * "waiting_on_you" = last message was from them (you need to reply).
 * "waiting_on_them" = last message was from you (they need to reply).
 */
async function resolveThreadStatus(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<ThreadStatus> {
  // Check entity timeline for latest message in either direction
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, event_data, occurred_at')
    .eq('org_id', orgId)
    .eq('entity_type', 'contact')
    .eq('entity_id', contactId)
    .in('event_type', ['message_received', 'message_sent'])
    .order('occurred_at', { ascending: false })
    .limit(1)

  if (!events || events.length === 0) return 'new'

  const lastEvent = events[0]
  if (lastEvent.event_type === 'message_received') return 'waiting_on_you'
  return 'waiting_on_them'
}

/**
 * Get thread info for all active conversations.
 */
export async function getActiveThreads(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ThreadInfo[]> {
  // Get contacts with recent message activity
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentMessages } = await supabase
    .from('channel_messages')
    .select('sender_email, sender, subject, received_at, metadata')
    .eq('org_id', orgId)
    .gte('received_at', since)
    .order('received_at', { ascending: false })

  if (!recentMessages || recentMessages.length === 0) return []

  // Group by contact (contact_id lives in metadata)
  const contactThreads = new Map<string, {
    contactId: string
    contactName: string
    topic: string
    lastMessageAt: string
    messageCount: number
  }>()

  for (const msg of recentMessages) {
    const meta = (msg.metadata || {}) as Record<string, unknown>
    const cId = meta.contact_id as string | undefined
    if (!cId) continue
    const existing = contactThreads.get(cId)
    if (!existing) {
      contactThreads.set(cId, {
        contactId: cId,
        contactName: (meta.contact_name as string) || (msg.sender as string) || 'Unknown',
        topic: msg.subject || 'General conversation',
        lastMessageAt: msg.received_at,
        messageCount: 1,
      })
    } else {
      existing.messageCount++
    }
  }

  // Resolve thread status for each contact
  const threads: ThreadInfo[] = []
  for (const [, thread] of contactThreads) {
    const status = await resolveThreadStatus(supabase, orgId, thread.contactId)
    threads.push({
      ...thread,
      status,
      lastMessageBy: status === 'waiting_on_you' ? 'contact' : 'user',
    })
  }

  return threads
}

// ---------------------------------------------------------------------------
// Main Triage Runner
// ---------------------------------------------------------------------------

/**
 * Triage all unprocessed channel messages for an org.
 * Classifies each message, resolves entities, deduplicates cross-channel,
 * creates tasks for actionable items, and routes to appropriate agents.
 */
export async function runTriage(
  supabase: SupabaseClient,
  orgId: string
): Promise<TriageResult> {
  const { data: messages, error } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('processed', false)
    .order('received_at', { ascending: true })
    .limit(25)

  if (error || !messages?.length) {
    return {
      processed: 0, actionable: 0, informational: 0, spam: 0,
      tasksCreated: 0, deduplicated: 0, entitiesLinked: 0, routed: [],
    }
  }

  const result: TriageResult = {
    processed: messages.length,
    actionable: 0,
    informational: 0,
    spam: 0,
    tasksCreated: 0,
    deduplicated: 0,
    entitiesLinked: 0,
    routed: [],
  }

  // 0. Load standing orders once for the entire batch
  let activeOrders: StandingOrder[] = []
  try {
    activeOrders = await getActiveOrders(supabase, orgId)
  } catch {
    // Non-critical: triage proceeds without standing orders
  }

  // 1. Cross-channel deduplication
  const duplicates = findDuplicates(messages)
  result.deduplicated = duplicates.size

  for (const msg of messages) {
    const isDuplicate = duplicates.has(msg.id)

    // 2a. Pre-classify by headers (deterministic, fast)
    const senderType = preClassifyByHeaders(msg)

    // 2b. Classify (use LLM classifier or existing classification)
    let classification: ClassificationResult
    const existingClassification = parseExistingClassification(msg.classification)
    if (existingClassification && msg.significance) {
      classification = existingClassification
    } else {
      const channelMsg: ChannelMessage = {
        id: msg.id,
        channel: msg.channel as ChannelMessage['channel'],
        externalId: msg.external_id || msg.id,
        sender: (msg.sender as string) || 'Unknown',
        senderEmail: msg.sender_email,
        subject: msg.subject,
        body: msg.body || '',
        receivedAt: new Date(msg.received_at),
        isActionable: false,
        priority: 'medium',
        metadata: msg.metadata || {},
      }
      classification = await classifyMessage(supabase, channelMsg, orgId)
    }

    // 2c. Score actionability for human messages
    let actionabilitySignals: ActionabilitySignals | null = null
    if (senderType === 'human') {
      actionabilitySignals = scoreActionability(msg.body as string | null, {
        isClient: classification.category === 'client',
        isReply: false, // would need to be determined from thread state
        userName: undefined, // would need user's name for mention detection
      })
    }

    // 3. Entity resolution on inbound
    let contactId: string | null = null
    let contactName: string | null = null
    let isTransientSender = false

    // Determine if we should create a contact for this sender
    const messageCount = (msg.metadata as any)?.message_count as number | undefined
    const shouldCreate = shouldCreateContact({
      senderType,
      senderEmail: msg.sender_email as string | null,
      messageCount,
      userReplied: (msg.metadata as any)?.user_initiated as boolean | undefined,
      isNoReplyAddress: (msg.metadata as any)?.is_noreply as boolean | undefined,
    })

    // Resolve sender to existing contact, or auto-create if criteria met
    const resolved = await resolveMessageSender(
      supabase, orgId, msg.sender_email, msg.sender as string | null,
    )
    if (resolved) {
      contactId = resolved.contactId
      contactName = resolved.contactName
      result.entitiesLinked++
    } else if (senderType === 'human' && shouldCreate) {
      // Auto-create contact for human senders meeting criteria (2+ messages or user replied)
      try {
        const senderName = (msg.sender as string) || 'Unknown'
        const senderEmail = msg.sender_email as string | null
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            org_id: orgId,
            name: senderName,
            type: 'person',
            emails: senderEmail ? [senderEmail] : [],
            profile_data: { source: 'auto_triage' },
          })
          .select('id, name')
          .single()

        if (newContact) {
          contactId = newContact.id
          contactName = newContact.name
          result.entitiesLinked++
          logger.info('[triage] Auto-created contact', { name: senderName, email: senderEmail, orgId })
        }
      } catch {
        // Contact creation failed (duplicate, etc.) — not critical
      }
    } else if (senderType === 'human') {
      // Human but doesn't meet contact creation criteria yet
      isTransientSender = true
    }

    // 4. Priority scoring via temporal urgency scorer
    const msgCategory = toMessageCategory(classification, senderType, actionabilitySignals)

    // Compute multi-signal urgency score
    const urgencyResult: UrgencyResult = await computeUrgency(supabase, orgId, {
      sender: (msg.sender as string) || 'Unknown',
      sender_email: msg.sender_email as string | null,
      subject: msg.subject as string | null,
      body: String(msg.body || ''),
      channel: msg.channel as string,
      received_at: msg.received_at as string,
    })

    let priority: PriorityLevel = urgencyResult.level
    const routing = routeMessage(classification)

    // 4b. Apply standing orders — boost significance/priority if a directive matches
    if (activeOrders.length > 0) {
      const matchedOrders = matchOrdersToContext(activeOrders, {
        sender: msg.sender as string | undefined,
        senderEmail: msg.sender_email as string | undefined,
        channel: msg.channel as string | undefined,
        subject: msg.subject as string | undefined,
      })
      if (matchedOrders.length > 0) {
        // Boost significance by 2 per matched order (capped at 10)
        classification.significance = Math.min(10, classification.significance + matchedOrders.length * 2)

        // If any matched order is in triage category, escalate priority
        const hasTriageOrder = matchedOrders.some(o => o.category === 'triage')
        if (hasTriageOrder && (priority === 'low' || priority === 'medium')) {
          priority = 'high'
        }

        logger.info('[triage] Standing orders matched', {
          messageId: msg.id,
          matchedCount: matchedOrders.length,
          directives: matchedOrders.map(o => o.directive),
          boostedPriority: priority,
        })
      }
    }

    // 5. Count by category
    if (msgCategory === 'spam') {
      result.spam++
    } else if (msgCategory === 'action_required') {
      result.actionable++
    } else {
      result.informational++
    }

    // 6. Route to agent if actionable — tag with routed_to for downstream pickup
    if (routing.decision !== 'skip' && routing.targetAgent) {
      result.routed.push({
        agent: routing.targetAgent,
        messageId: msg.id,
        priority: routing.priority,
      })

      // Tag message so the target agent's tick can find it
      await supabase
        .from('channel_messages')
        .update({
          metadata: {
            ...(msg.metadata || {}),
            routed_to: routing.targetAgent,
            routing_decision: routing.decision,
            routing_priority: routing.priority,
            routed_at: new Date().toISOString(),
          },
        })
        .eq('id', msg.id)
    } else if (msgCategory === 'action_required' && !routing.targetAgent) {
      // Actionable but no specific agent — route to client-comms as fallback
      result.routed.push({
        agent: 'client-comms',
        messageId: msg.id,
        priority: routing.priority,
      })

      await supabase
        .from('channel_messages')
        .update({
          metadata: {
            ...(msg.metadata || {}),
            routed_to: 'client-comms',
            routing_decision: routing.decision || 'queue',
            routing_priority: routing.priority,
            routed_at: new Date().toISOString(),
          },
        })
        .eq('id', msg.id)
    }

    // 7. Auto-create tasks for actionable EMAIL messages from human senders only.
    // Filter out automated/transactional emails that shouldn't become tasks:
    // password resets, login confirmations, shipping notifications, newsletters, test emails,
    // AND BitBit's own notification emails (approval, alert, digest, report).
    const isEmailChannel = (msg.channel as string) === 'gmail' || (msg.channel as string) === 'outlook'
    const subjectLower = ((msg.subject as string) ?? '').toLowerCase()
    const senderEmailLower = ((msg.sender_email as string) ?? '').toLowerCase()
    const notificationFromEmail = (process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat').toLowerCase()
    const isSelfEmail = senderEmailLower === notificationFromEmail || senderEmailLower.includes('bitbit')
    const isTransactional = /(?:password|reset|confirm|verify|sign.?in|log.?in|unsubscribe|no.?reply|noreply|delivery|shipped|tracking|newsletter|bridge test|test from|account.?activ|welcome.?to|receipt|order.?confirm|email.?verif|security.?alert|two.?factor|2fa|otp|one.?time|subscription|billing.?statement|approval.?needed|alert.?escalation|daily.?digest|weekly.?report|bitbit.?digest|bitbit.?alert)/i.test(subjectLower)
    if (msgCategory === 'action_required' && !isDuplicate && senderType === 'human' && isEmailChannel && !isTransactional && !isSelfEmail && classification.significance >= 7) {
      const created = await createTaskForMessage(
        supabase, orgId, msg, classification, priority, contactId,
      )
      if (created) result.tasksCreated++
    }

    // 8. Resolve thread status
    let threadStatus: ThreadStatus | null = null
    if (contactId) {
      threadStatus = await resolveThreadStatus(supabase, orgId, contactId)
    }

    // 9. Write timeline event for this message
    await writeMessageEvent(
      supabase, orgId, msg.id, 'inbound', msg.channel as string,
      { sender: msg.sender, subject: msg.subject, priority, category: msgCategory },
      contactId ?? undefined,
    )

    // 10. Link entity relationship (message sender → contact)
    if (contactId) {
      await linkRelationship(
        supabase, orgId,
        { type: 'channel_message', id: msg.id },
        { type: 'contact', id: contactId },
        'related_to',
        { channel: msg.channel, sender_email: msg.sender_email },
      )
    }

    // 11. Reflect on significant messages (extract learnable facts)
    if (classification.significance >= 6 && !isDuplicate) {
      reflectOnEvent(supabase, orgId, {
        eventType: 'channel_message',
        eventData: {
          channel: msg.channel,
          sender: msg.sender,
          subject: msg.subject,
          body: String(msg.body || '').slice(0, 500),
          category: classification.category,
          significance: classification.significance,
        },
        entityType: contactId ? 'contact' : undefined,
        entityId: contactId ?? undefined,
        entityName: contactName ?? undefined,
      }).catch(() => {}) // fire-and-forget, never block triage
    }

    // 12. Update message with full triage data (only columns that exist in DB)
    const isActionable = msgCategory === 'action_required'
    await supabase
      .from('channel_messages')
      .update({
        processed: true,
        is_actionable: isActionable,
        classification: JSON.stringify(classification),
        significance: classification.significance,
        priority,
        metadata: {
          ...(msg.metadata || {}),
          sender_type: senderType,
          actionability_signals: actionabilitySignals || undefined,
          is_transient_sender: isTransientSender,
          // Store transient sender info even if not creating contact
          transient_sender_info: isTransientSender ? {
            name: msg.sender,
            email: msg.sender_email,
            channel: msg.channel,
          } : undefined,
          category: msgCategory,
          ai_summary: classification.summary || null,
          contact_id: contactId,
          contact_name: contactName,
          thread_status: threadStatus,
          deduplicated_with: isDuplicate ? duplicates.get(msg.id) : null,
          urgency: urgencyResult,
          processed_at: new Date().toISOString(),
        },
      })
      .eq('id', msg.id)
  }

  return result
}

// ---------------------------------------------------------------------------
// Unified Inbox Query
// ---------------------------------------------------------------------------

export interface InboxFilters {
  channel?: string
  priority?: PriorityLevel
  category?: MessageCategory
  status?: 'unread' | 'actioned' | 'archived'
  threadStatus?: ThreadStatus
  limit?: number
  offset?: number
}

export interface InboxMessage {
  id: string
  channelType: string
  senderName: string | null
  senderEmail: string | null
  subject: string | null
  bodyPreview: string
  fullBody: string
  aiSummary: string | null
  category: MessageCategory
  priority: PriorityLevel
  significance: number
  contactId: string | null
  contactName: string | null
  threadStatus: ThreadStatus | null
  deduplicatedWith: string | null
  receivedAt: string
  processedAt: string | null
  status: string
}

/**
 * Normalize category labels — the triage pipeline has used different naming
 * conventions over time. Map them all to the canonical set the UI expects.
 */
const CATEGORY_ALIASES: Record<string, MessageCategory> = {
  actionable: 'action_required',
  action: 'action_required',
  personal: 'conversation',
  informational: 'fyi',
  info: 'fyi',
  notification: 'automated',
  newsletter: 'marketing',
  // Canonical names pass through
  action_required: 'action_required',
  fyi: 'fyi',
  conversation: 'conversation',
  automated: 'automated',
  marketing: 'marketing',
  spam: 'spam',
}

function normalizeCategoryLabel(raw: string | null | undefined): MessageCategory | null {
  if (!raw) return null
  return CATEGORY_ALIASES[raw.toLowerCase()] ?? null
}

/**
 * Query the unified inbox across all channels with filters.
 */
export async function queryInbox(
  supabase: SupabaseClient,
  orgId: string,
  filters: InboxFilters = {},
): Promise<{ messages: InboxMessage[]; total: number }> {
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  let query = supabase
    .from('channel_messages')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('received_at', { ascending: false })

  if (filters.channel) {
    query = query.eq('channel', filters.channel)
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority)
  }
  // category, threadStatus, and archived live in metadata — filter in JS after fetch
  if (filters.status === 'unread') {
    query = query.eq('processed', false)
  } else if (filters.status === 'actioned') {
    query = query.eq('processed', true)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error || !data) {
    return { messages: [], total: 0 }
  }

  let mapped: InboxMessage[] = data.map((msg: Record<string, unknown>) => {
    const meta = (msg.metadata || {}) as Record<string, unknown>
    return {
      id: msg.id as string,
      channelType: msg.channel as string,
      senderName: (msg.sender as string) || null,
      senderEmail: (msg.sender_email as string) || null,
      subject: (msg.subject as string) || null,
      bodyPreview: String(msg.body || '').slice(0, 200),
      fullBody: String(msg.body || ''),
      aiSummary: (meta.ai_summary as string) || null,
      category: normalizeCategoryLabel(meta.category as string)
        || (['whatsapp', 'imessage', 'sms'].includes(msg.channel as string) ? 'conversation' : 'fyi'),
      priority: (msg.priority as PriorityLevel) || 'medium',
      significance: (msg.significance as number) || 0,
      contactId: (meta.contact_id as string) || null,
      contactName: (meta.contact_name as string) || null,
      threadStatus: (meta.thread_status as ThreadStatus) || null,
      deduplicatedWith: (meta.deduplicated_with as string) || null,
      receivedAt: msg.received_at as string,
      processedAt: (meta.processed_at as string) || null,
      status: msg.processed ? 'processed' : 'unread',
    }
  })

  // Filter out duplicates and apply metadata-based filters in JS
  mapped = mapped.filter(m => !m.deduplicatedWith)
  if (filters.category) {
    mapped = mapped.filter(m => m.category === filters.category)
  }
  if (filters.threadStatus) {
    mapped = mapped.filter(m => m.threadStatus === filters.threadStatus)
  }
  if (filters.status === 'archived') {
    // archived messages have category 'spam' or explicit archived flag in metadata
    mapped = mapped.filter(m => m.category === 'spam')
  }

  return { messages: mapped, total: count ?? 0 }
}

// ---------------------------------------------------------------------------
// Daily Digest (enhanced)
// ---------------------------------------------------------------------------

/**
 * Generate a daily digest of channel activity.
 */
export async function generateDigest(
  supabase: SupabaseClient,
  orgId: string,
  hoursBack: number = 24
): Promise<DigestEntry[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

  const { data: messages } = await supabase
    .from('channel_messages')
    .select('channel, classification, body, sender, metadata, priority, significance')
    .eq('org_id', orgId)
    .gte('received_at', since)
    .order('received_at', { ascending: false })

  if (!messages?.length) {
    return [{ category: 'summary', count: 0, highlights: ['No new messages in the last 24 hours.'] }]
  }

  const categories: Record<string, { count: number; highlights: string[] }> = {}

  for (const msg of messages) {
    const meta = (msg.metadata || {}) as Record<string, unknown>
    const classObj = typeof msg.classification === 'string'
      ? (() => { try { return JSON.parse(msg.classification) } catch { return null } })()
      : msg.classification
    const cat = (meta.category as string) || classObj?.category || 'uncategorized'
    if (!categories[cat]) categories[cat] = { count: 0, highlights: [] }
    categories[cat].count++
    if (categories[cat].highlights.length < 3) {
      const preview = (msg.body || '').slice(0, 80)
      categories[cat].highlights.push(`${msg.sender || 'Unknown'}: ${preview}`)
    }
  }

  return Object.entries(categories).map(([category, data]) => ({
    category,
    count: data.count,
    highlights: data.highlights,
  }))
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const channelTriage = {
  run: runTriage,
  generateDigest,
  queryInbox,
  getActiveThreads,
  scorePriority,
}
