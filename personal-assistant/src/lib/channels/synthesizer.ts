import type { ChannelMessage, ChannelType, SyncResult, ChannelAdapter } from './types'
import { writeMessageEvent } from '@/lib/context/timeline-writer'
import { gmailAdapter } from './gmail'
import { outlookAdapter } from './outlook'
import { imessageAdapter } from './imessage'
import { calendarAdapter } from './calendar'
import { remindersAdapter } from './reminders'
import { whatsappAdapter } from './whatsapp'
import { gscAdapter } from './gsc'
import { asanaAdapter } from './asana'
import { calendlyAdapter } from './calendly'
import { stripeAdapter } from './stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {
  gmail: gmailAdapter,
  outlook: outlookAdapter,
  imessage: imessageAdapter,
  calendar: calendarAdapter,
  reminders: remindersAdapter,
  whatsapp: whatsappAdapter,
  gsc: gscAdapter,
  asana: asanaAdapter,
  calendly: calendlyAdapter,
  stripe: stripeAdapter,
}

export function getAdapter(type: ChannelType): ChannelAdapter | undefined {
  return adapters[type]
}

export function getAllAdapters(): ChannelAdapter[] {
  return Object.values(adapters).filter((a): a is ChannelAdapter => !!a)
}

function createDirectSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key)
}

const ACTION_KEYWORDS = [
  'please', 'need', 'urgent', 'asap', 'deadline', 'action required',
  'todo', 'follow up', 'review', 'rsvp', 'respond', 'reply',
  'update', 'fix', 'schedule', 'complete', 'submit', 'approve',
  'can you', 'can u', 'pls',
]

const NOISE_KEYWORDS = [
  'unsubscribe', 'no-reply', 'noreply', 'newsletter', 'marketing',
  'promotional', 'digest', 'notification preferences',
]

// Sanitize text for Postgres JSONB — removes unsupported Unicode escape sequences
function sanitizeForJson(text: string): string {
  // Remove null bytes and surrogate pairs that Postgres JSONB can't handle
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
}

function classifyMessage(msg: ChannelMessage): ChannelMessage {
  const text = ((msg.body || '') + ' ' + (msg.subject || '')).toLowerCase()

  // Noise detection
  const isNoise = NOISE_KEYWORDS.some(kw => text.includes(kw))
  if (isNoise) {
    return { ...msg, isActionable: false, priority: 'low' }
  }

  // Actionability
  const actionScore = ACTION_KEYWORDS.filter(kw => text.includes(kw)).length
  const hasQuestion = text.includes('?')
  const isActionable = actionScore >= 1 || hasQuestion || msg.isActionable

  // Priority
  let priority: ChannelMessage['priority'] = 'medium'
  if (text.includes('urgent') || text.includes('asap') || text.includes('critical') || text.includes('immediately')) {
    priority = 'critical'
  } else if (text.includes('important') || text.includes('deadline') || text.includes('action required')) {
    priority = 'high'
  } else if (text.includes('when you get a chance') || text.includes('low priority') || text.includes('fyi')) {
    priority = 'low'
  }

  return { ...msg, isActionable, priority }
}

function deduplicateMessages(messages: ChannelMessage[]): ChannelMessage[] {
  const seen = new Map<string, ChannelMessage>()

  for (const msg of messages) {
    const key = `${msg.sender}:${(msg.subject || msg.body.slice(0, 50)).toLowerCase().trim()}`
    const existing = seen.get(key)

    if (!existing || msg.receivedAt > existing.receivedAt) {
      seen.set(key, msg)
    }
  }

  return Array.from(seen.values())
}

async function resolveColumnId(supabase: SupabaseClient, orgId: string, columnName: string): Promise<string | null> {
  const { data } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('org_id', orgId)
    .ilike('title', columnName)
    .limit(1)
    .single() as { data: { id: string } | null }
  return data?.id ?? null
}

async function taskExistsWithTitle(supabase: SupabaseClient, orgId: string, title: string): Promise<boolean> {
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .ilike('title', title) as { count: number | null }
  return (count ?? 0) > 0
}

export interface SynthesisOptions {
  channels: ChannelType[]
  since?: Date
  orgId: string
  supabase?: SupabaseClient
}

export async function synthesize(options: SynthesisOptions): Promise<SyncResult[]> {
  const results: SyncResult[] = []

  // Use provided Supabase client or create direct one (no cookie auth needed)
  const supabase = options.supabase ?? createDirectSupabase()
  let toDoColumnId: string | null = null

  if (supabase) {
    toDoColumnId = await resolveColumnId(supabase, options.orgId, 'To Do')
  }

  for (const channelType of options.channels) {
    const adapter = adapters[channelType]
    if (!adapter) continue

    const start = Date.now()
    const result: SyncResult = {
      channel: channelType,
      messagesFound: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      errors: [],
      duration: 0,
    }

    try {
      const available = await adapter.isAvailable()
      if (!available) {
        result.errors.push(`${adapter.name} is not available`)
        results.push(result)
        continue
      }

      const messages = await adapter.pull({}, options.since)
      result.messagesFound = messages.length

      // Classify messages
      const classified = messages.map(classifyMessage)

      // Deduplicate
      const unique = deduplicateMessages(classified)

      // Filter actionable items
      const actionable = unique.filter(m => m.isActionable)

      // Create tasks in Supabase for actionable messages
      if (supabase && toDoColumnId && actionable.length > 0) {
        // Get current task count for positioning
        const { count: existingCount } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', options.orgId)
          .eq('column_id', toDoColumnId) as { count: number | null }

        let position = existingCount ?? 0

        for (const msg of actionable) {
          const title = sanitizeForJson(msg.subject
            ? `[${msg.channel}] ${msg.subject}`
            : `[${msg.channel}] ${msg.sender}: ${msg.body.slice(0, 80)}`)

          // Skip if task with same title already exists
          const exists = await taskExistsWithTitle(supabase, options.orgId, title)
          if (exists) {
            result.tasksUpdated++
            continue
          }

          const description = sanitizeForJson([
            `From: ${msg.sender}${msg.senderEmail ? ` <${msg.senderEmail}>` : ''}`,
            `Channel: ${msg.channel}`,
            `Received: ${msg.receivedAt.toLocaleString()}`,
            '',
            msg.body.slice(0, 500),
          ].join('\n'))

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('tasks')
            .insert({
              org_id: options.orgId,
              title,
              description,
              priority: msg.priority,
              column_id: toDoColumnId,
              position: position++,
              status: 'pending',
              metadata: {
                source_channel: msg.channel,
                source_id: msg.externalId,
                sender: sanitizeForJson(msg.sender),
                sender_email: msg.senderEmail,
                synced_at: new Date().toISOString(),
              },
            })

          if (error) {
            result.errors.push(`Failed to create task: ${error.message}`)
          } else {
            result.tasksCreated++
          }
        }
      } else if (!supabase) {
        // No Supabase — just count what would be created
        result.tasksCreated = actionable.length
      } else if (supabase && !toDoColumnId) {
        result.errors.push('No "To Do" column found for this organization')
        result.tasksCreated = actionable.length // Report what would have been created
      }
      // Write timeline events for ALL deduplicated messages (not just actionable)
      if (supabase) {
        for (const msg of unique) {
          try {
            writeMessageEvent(
              supabase,
              options.orgId,
              msg.externalId || crypto.randomUUID(),
              'inbound',
              msg.channel,
              {
                sender: msg.sender,
                subject: msg.subject,
                bodyPreview: msg.body.slice(0, 200),
              },
              undefined
            )
          } catch (timelineErr) {
            console.error('[synthesizer] Failed to write timeline event:', timelineErr)
          }
        }
      }
    } catch (err) {
      result.errors.push(String(err))
    }

    result.duration = Date.now() - start
    results.push(result)
  }

  return results
}
