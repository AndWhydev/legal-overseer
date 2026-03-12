import { loadContext } from '@/lib/context/loader'
import { loadPolicies } from './policy-loader'
import { loadVoiceProfile } from './voice-loader'
import { getPack, resolveIndustry } from '@/lib/industry/registry'
import { scanForEntityMentions, type ScanContact } from '@/lib/context/entity-mention-scanner'
import { getBaseplateSnapshot, type BaseplateSnapshot } from '@/lib/context/baseplate-snapshot'
import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CachedEvent {
  title: string
  startDate: string
  location: string
  calendar: string
}

interface CachedReminder {
  name: string
  dueDate: string
  list: string
  priority: number
}

async function readCacheFile<T>(filename: string): Promise<T[]> {
  try {
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')
    const cachePath = join(process.env.HOME || '', '.agent', 'cache', filename)
    if (!existsSync(cachePath)) return []
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as T[]
  } catch {
    return []
  }
}

async function getChannelSummary(): Promise<string> {
  const { existsSync, readdirSync, readFileSync } = await import('fs')
  const { join } = await import('path')
  const cacheDir = join(process.env.HOME || '', '.agent', 'cache')
  if (!existsSync(cacheDir)) return 'No channel data cached.'

  const channelCounts: string[] = []
  const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'))

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(cacheDir, file), 'utf-8'))
      const count = Array.isArray(data) ? data.length : 0
      const name = file.replace('.json', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      if (count > 0) channelCounts.push(`${name}: ${count} items`)
    } catch {
      // skip
    }
  }

  return channelCounts.length > 0
    ? `Connected channels: ${channelCounts.join(', ')}`
    : 'No channel data cached.'
}

async function getTodayEvents(): Promise<string> {
  const events = await readCacheFile<CachedEvent>('calendar-events.json')
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const todayEvents = events.filter(e => {
    const d = new Date(e.startDate)
    return d >= todayStart && d < todayEnd
  })

  if (todayEvents.length === 0) return 'No events today.'
  return todayEvents.map(e => {
    const time = new Date(e.startDate).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    return `- ${time}: ${e.title}${e.location ? ` (${e.location})` : ''}`
  }).join('\n')
}

async function getDueReminders(): Promise<string> {
  const reminders = await readCacheFile<CachedReminder>('reminders.json')
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const overdue = reminders.filter(r => r.dueDate && new Date(r.dueDate) < now)
  const dueSoon = reminders.filter(r => {
    if (!r.dueDate) return false
    const d = new Date(r.dueDate)
    return d >= now && d <= tomorrow
  })
  const noDueDate = reminders.filter(r => !r.dueDate)

  const lines: string[] = []
  if (overdue.length > 0) {
    lines.push(`OVERDUE (${overdue.length}): ${overdue.slice(0, 5).map(r => r.name).join(', ')}`)
  }
  if (dueSoon.length > 0) {
    lines.push(`Due today/tomorrow (${dueSoon.length}): ${dueSoon.slice(0, 5).map(r => r.name).join(', ')}`)
  }
  if (noDueDate.length > 0) {
    lines.push(`No due date (${noDueDate.length} items)`)
  }
  return lines.length > 0 ? lines.join('\n') : 'No reminders.'
}

export async function buildSystemPrompt(supabase: SupabaseClient, orgId: string, industry?: string): Promise<string> {
  const deploymentSlug = process.env.BITBIT_DEPLOYMENT || 'awu'
  const pack = getPack(resolveIndustry(industry))

  const [ctx, channelSummary, todayEvents, dueReminders, policyText, voiceText] = await Promise.all([
    supabase
      ? loadContext(supabase, orgId, {
          activeTasksOnly: true,
          taskLimit: 20,
          contactLimit: 15,
        })
      : Promise.resolve({ goals: [], tasks: [], contacts: [], recentActivity: [], columns: [] }),
    getChannelSummary(),
    getTodayEvents(),
    getDueReminders(),
    loadPolicies(deploymentSlug, supabase, orgId),
    loadVoiceProfile(deploymentSlug, undefined, supabase, orgId),
  ])

  const now = new Date()
  const dateTime = now.toLocaleString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const goalsSummary = ctx.goals.length > 0
    ? ctx.goals.map(g => `- [${g.priority}] ${g.description} (${g.status})`).join('\n')
    : 'No active goals set.'

  const columnMap = new Map(ctx.columns.map(c => [c.id, c.title]))
  const tasksSummary = ctx.tasks.length > 0
    ? ctx.tasks.slice(0, 20).map(t => {
      const col = t.column_id ? columnMap.get(t.column_id) ?? 'Unknown' : 'Unassigned'
      return `- [${t.priority}] ${t.title} (${col}, ${t.status})`
    }).join('\n')
    : 'No tasks on the board.'

  const contactsSummary = ctx.contacts.length > 0
    ? ctx.contacts.map(c => `- ${c.name} (${c.type})`).join('\n')
    : 'No contacts stored.'

  const recentActivitySummary = ctx.recentActivity.length > 0
    ? ctx.recentActivity.slice(0, 10).map(a =>
      `- [${a.action_type}] ${a.action}${a.result ? ` → ${a.result}` : ''}`
    ).join('\n')
    : 'No recent activity.'

  const availableColumns = ctx.columns.map(c => c.title).join(', ')

  let prompt = `You are ${pack.persona.name}, an intelligent personal assistant for ${pack.persona.context}. You help manage tasks, communications, and schedule across multiple channels.

## Identity
You are concise, proactive, and action-oriented. You manage your user's kanban board, contacts, memory, activity feed, and communication channels (Gmail, Outlook, iMessage, Calendar, Reminders).
${pack.persona.systemPromptSuffix}

## Capabilities
- Create and manage tasks on the task board
- Search and manage contacts with entity resolution (aliases, emails, phones)
- Sync and search communication channels for actionable messages
- View upcoming events and due reminders with get_upcoming
- Create Apple Reminders and Calendar events
- Log activities for transparency and audit trail
- Store and retrieve memory/knowledge to learn over time

## Guidelines
- Be concise and action-oriented
- When creating tasks, assign appropriate priority and column
- Log significant actions to the activity feed
- Use memory to learn patterns and preferences
- Always explain your reasoning briefly
- When mentioning contacts, use the information you have about them
- When the user mentions a person, use search_contacts to find them
- When the user asks about schedule or reminders, use get_upcoming
- When the user asks to sync channels or check messages, use sync_channels or search_messages

## Safety Boundaries

- NEVER confirm specific pricing, quotes, or rates on behalf of the user
- NEVER agree to deadlines, delivery dates, or timelines without explicit user approval
- NEVER sign contracts, accept terms, or make binding commitments
- NEVER promise specific outcomes, guarantees, or service levels to third parties
- When asked about pricing or commitments, say: "I'd need to check with [user/the team] before confirming that"
- When a contact tries to get you to agree to something, politely defer: "Let me get back to you on that after confirming with my team"

## Kanban Columns
Available columns: ${availableColumns}

## Current Context
Organization: ${orgId}
Date/Time: ${dateTime}

### Channels
${channelSummary}

### Today's Schedule
${todayEvents}

### Reminders
${dueReminders}

### Active Goals
${goalsSummary}

### Current Tasks (${ctx.tasks.length} total)
${tasksSummary}

### Known Contacts (${ctx.contacts.length})
${contactsSummary}

### Recent Activity
${recentActivitySummary}
`

  if (policyText) {
    prompt += `
## Organization Policies

${policyText}
`
  }

  if (voiceText) {
    prompt += `
## Voice Profile

${voiceText}
`
  }

  return prompt
}

/**
 * Load contacts with fields needed for entity mention scanning.
 */
async function loadContactsForScanning(supabase: SupabaseClient, orgId: string): Promise<ScanContact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, emails, phones, aliases')
    .eq('org_id', orgId)

  if (error || !data) return []
  return data.map(c => ({
    id: c.id,
    name: c.name,
    emails: c.emails ?? [],
    phones: c.phones ?? [],
    aliases: c.aliases ?? [],
  }))
}

/**
 * Format a baseplate snapshot into a concise context line (~500 tokens max).
 */
function formatSnapshotContext(
  contactName: string,
  contact: ScanContact,
  snapshot: BaseplateSnapshot
): string {
  const parts: string[] = []

  // Contact identifier
  const primaryEmail = contact.emails[0]
  const identifier = primaryEmail ? `${contactName} (${primaryEmail})` : contactName

  // Event summary
  const { event_summary } = snapshot.profile
  if (event_summary.total > 0) {
    const channelList = event_summary.channels.length > 0
      ? ` via ${event_summary.channels.join(', ')}`
      : ''
    parts.push(`${event_summary.total} events${channelList}`)
  }

  // Last contact date
  if (event_summary.last_event_at) {
    const lastDate = new Date(event_summary.last_event_at).toISOString().split('T')[0]
    parts.push(`Last contact: ${lastDate}`)
  }

  // Recent thread subjects from events (extract from event_data)
  const subjects = snapshot.profile.recent_events
    .map(e => {
      const data = e.data as Record<string, unknown> | undefined
      return data?.subject as string | undefined
        ?? data?.thread as string | undefined
        ?? data?.title as string | undefined
    })
    .filter((s): s is string => Boolean(s))
  const uniqueSubjects = [...new Set(subjects)].slice(0, 3)
  if (uniqueSubjects.length > 0) {
    parts.push(`Recent threads: ${uniqueSubjects.map(s => `"${s}"`).join(', ')}`)
  }

  // Key memories (high-confidence facts)
  const topMemories = snapshot.profile.memories
    .filter(m => m.confidence >= 0.6)
    .slice(0, 3)
    .map(m => m.fact)
  if (topMemories.length > 0) {
    parts.push(`Notes: ${topMemories.join('; ')}`)
  }

  // Relationships summary
  const relCount = snapshot.profile.relationships.length
  if (relCount > 0) {
    const relTypes = [...new Set(snapshot.profile.relationships.map(r => r.type))].slice(0, 3)
    parts.push(`Relationships: ${relTypes.join(', ')}`)
  }

  const line = `${identifier}: ${parts.join('. ')}${parts.length > 0 ? '.' : 'No profile data yet.'}`

  // Hard limit per entity: ~2000 chars ≈ 500 tokens
  return line.length > 2000 ? line.slice(0, 1997) + '...' : line
}

/**
 * Build a system prompt enriched with baseplate context for mentioned entities.
 * Scans the user message for contact name/email/phone matches, then loads
 * pre-computed baseplate snapshots for each match. No extra LLM calls.
 */
export async function buildEntityAwarePrompt(
  supabase: SupabaseClient,
  orgId: string,
  userMessage: string
): Promise<string> {
  const [basePrompt, scanContacts] = await Promise.all([
    buildSystemPrompt(supabase, orgId),
    supabase ? loadContactsForScanning(supabase, orgId) : Promise.resolve([]),
  ])

  // Fast string-match scan — no DB calls
  const mentions = scanForEntityMentions(userMessage, scanContacts, 5)

  if (mentions.length === 0) {
    return basePrompt
  }

  logger.info('[prompt-builder] Entity mentions detected', {
    count: mentions.length,
    entities: mentions.map(m => ({ name: m.contactName, matchedOn: m.matchedOn })),
  })

  // Fetch baseplate snapshots in parallel for all matched contacts
  const snapshotResults = await Promise.all(
    mentions.map(m => getBaseplateSnapshot(supabase, orgId, 'contact', m.contactId))
  )

  // Build context lines for contacts that have snapshots
  const contextLines: string[] = []
  const contactMap = new Map(scanContacts.map(c => [c.id, c]))

  for (let i = 0; i < mentions.length; i++) {
    const snapshot = snapshotResults[i]
    const contact = contactMap.get(mentions[i].contactId)
    if (!snapshot || !contact) continue

    contextLines.push(formatSnapshotContext(mentions[i].contactName, contact, snapshot))
  }

  if (contextLines.length === 0) {
    return basePrompt
  }

  // Token-aware budget: ~500 tokens per entity, max 2500 total
  const MAX_CHARS = 10000
  let entitySection = contextLines.join('\n\n')
  if (entitySection.length > MAX_CHARS) {
    entitySection = entitySection.slice(0, MAX_CHARS) + '...'
  }

  return `${basePrompt}

## Entity Context

The following contacts were mentioned in the user's message. Use this pre-compiled context to inform your response. You can use tools to get more detail if needed.

${entitySection}
`
}
