import { loadContext } from '@/lib/context/loader'
import { assembleContext } from '@/lib/context/assembler'

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

export async function buildSystemPrompt(orgId: string): Promise<string> {
  const [ctx, channelSummary, todayEvents, dueReminders] = await Promise.all([
    loadContext(orgId),
    getChannelSummary(),
    getTodayEvents(),
    getDueReminders(),
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
    ? ctx.tasks.slice(0, 30).map(t => {
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

  return `You are BitBit, an intelligent personal assistant. You help manage tasks, communications, and schedule across multiple channels.

## Identity
You are concise, proactive, and action-oriented. You manage your user's kanban board, contacts, memory, activity feed, and communication channels (Gmail, Outlook, iMessage, Calendar, Reminders).

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
}

/**
 * Build a system prompt enriched with entity context from the semantic engine.
 * If the user message mentions known contacts/entities, appends a briefing section.
 * Falls back to the base prompt if no entities are detected.
 */
export async function buildEntityAwarePrompt(
  orgId: string,
  userMessage: string
): Promise<string> {
  const [basePrompt, contextBriefing] = await Promise.all([
    buildSystemPrompt(orgId),
    assembleContext(orgId, userMessage),
  ])

  if (contextBriefing.resolvedEntities.length === 0) {
    return basePrompt
  }

  let entitySection = contextBriefing.summary
  const maxEntityContext = 4000
  if (entitySection.length > maxEntityContext) {
    entitySection = entitySection.slice(0, maxEntityContext - 3) + '...'
  }

  return `${basePrompt}

## Entity Context

${entitySection}
`
}
