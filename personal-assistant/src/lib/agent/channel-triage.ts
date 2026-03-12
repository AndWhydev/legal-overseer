import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from '@/lib/channels/types'
import { classifyMessage, type ClassificationResult } from './classifier'
import { routeMessage } from './action-router'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { writeMessageEvent } from '@/lib/context/timeline-writer'
import { linkRelationship } from '@/lib/context/relationship-linker'
import { reflectOnEvent } from './reflection'

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

export type MessageCategory = 'actionable' | 'informational' | 'spam' | 'personal'

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
 * Map classification category to triage category.
 */
function toMessageCategory(classification: ClassificationResult): MessageCategory {
  const { category, significance } = classification
  if (category === 'spam' || category === 'newsletter') return 'spam'
  if (category === 'personal') return 'personal'
  if (significance >= 4 && (category === 'lead' || category === 'client' || category === 'vendor')) {
    return 'actionable'
  }
  return 'informational'
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
 * Create a task for an actionable message.
 */
async function createTaskForMessage(
  supabase: SupabaseClient,
  orgId: string,
  msg: Record<string, unknown>,
  classification: ClassificationResult,
  priority: PriorityLevel,
  contactId: string | null,
): Promise<boolean> {
  const title = msg.subject
    ? `[${msg.channel}] ${msg.subject}`
    : `[${msg.channel}] ${msg.sender || 'Unknown'}: ${String(msg.body || '').slice(0, 80)}`

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

  const { error } = await supabase
    .from('tasks')
    .insert({
      org_id: orgId,
      title,
      description: [
        `From: ${msg.sender || 'Unknown'}${msg.sender_email ? ` <${msg.sender_email}>` : ''}`,
        `Channel: ${msg.channel}`,
        `Priority: ${priority}`,
        `Classification: ${classification.category} (significance ${classification.significance})`,
        '',
        String(msg.body || '').slice(0, 500),
      ].join('\n'),
      priority,
      column_id: column.id,
      position: 0,
      status: 'pending',
      metadata: {
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
    .limit(100)

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

  // 1. Cross-channel deduplication
  const duplicates = findDuplicates(messages)
  result.deduplicated = duplicates.size

  for (const msg of messages) {
    const isDuplicate = duplicates.has(msg.id)

    // 2. Classify (use LLM classifier or existing classification)
    let classification: ClassificationResult
    if (msg.classification && msg.significance) {
      classification = msg.classification as ClassificationResult
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

    // 3. Entity resolution on inbound
    let contactId: string | null = null
    let contactName: string | null = null
    {
      const resolved = await resolveMessageSender(
        supabase, orgId, msg.sender_email, msg.sender as string | null,
      )
      if (resolved) {
        contactId = resolved.contactId
        contactName = resolved.contactName
        result.entitiesLinked++
      }
    }

    // 4. Priority scoring with entity context
    const msgCategory = toMessageCategory(classification)
    let contactMeta: Parameters<typeof scorePriority>[1] | undefined
    if (contactId) {
      // Quick lookup for financial signals
      const { data: invoices } = await supabase
        .from('invoices')
        .select('status, total')
        .eq('org_id', orgId)
        .eq('client_contact_id', contactId)
        .in('status', ['sent', 'viewed', 'overdue'])

      const outstanding = invoices?.reduce((sum, inv) => sum + Number(inv.total || 0), 0) ?? 0
      const overdueCount = invoices?.filter(inv => inv.status === 'overdue').length ?? 0

      // Upcoming deadlines
      const { count: deadlineCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .contains('metadata', { contact_id: contactId })
        .gte('metadata->>target_date', new Date().toISOString())
        .lte('metadata->>target_date', new Date(Date.now() + 7 * 86400000).toISOString()) as { count: number | null }

      contactMeta = {
        isClient: classification.category === 'client',
        hasOutstanding: outstanding > 0,
        overdueCount,
        upcomingDeadlines: deadlineCount ?? 0,
      }
    }

    const priority = scorePriority(classification, contactMeta)
    const routing = routeMessage(classification)

    // 5. Count by category
    if (msgCategory === 'spam') {
      result.spam++
    } else if (msgCategory === 'actionable') {
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
    } else if (msgCategory === 'actionable' && !routing.targetAgent) {
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

    // 7. Auto-create tasks for actionable messages (skip duplicates)
    if (msgCategory === 'actionable' && !isDuplicate) {
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
    await supabase
      .from('channel_messages')
      .update({
        processed: true,
        classification: JSON.stringify(classification),
        significance: classification.significance,
        priority,
        metadata: {
          ...(msg.metadata || {}),
          category: msgCategory,
          contact_id: contactId,
          contact_name: contactName,
          thread_status: threadStatus,
          deduplicated_with: isDuplicate ? duplicates.get(msg.id) : null,
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
      category: (meta.category as MessageCategory) || 'informational',
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
