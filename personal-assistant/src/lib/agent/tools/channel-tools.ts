import Anthropic from '@anthropic-ai/sdk'
import {
  getAllAdapters,
  getAdapter,
  synthesize,
} from '@/lib/channels'
import type { ChannelAdapter, ChannelMessage, ChannelType } from '@/lib/channels'
import type { AgentToolHandler } from '../tools'

export const channelToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'sync_channels',
    description: 'Pull new messages from all connected channels (Gmail, Outlook, iMessage, Calendar, Reminders) and create tasks from actionable items. Use when the user says \'check my messages\', \'sync channels\', or \'what\'s new\'. Defaults to last 24 hours.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hours_back: {
          type: 'number',
          description: 'How many hours back to sync (default: 24)',
        },
      },
    },
  },
  {
    name: 'search_messages',
    description: 'Search across all channel messages by keyword, sender, or channel type. Searches subject and body text. Use when the user asks about a specific email, message, or conversation. Only searches the last 7 days of cached messages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword (matches subject and body)' },
        channel: {
          type: 'string',
          enum: ['gmail', 'outlook', 'imessage', 'calendar', 'reminders'],
          description: 'Filter by channel type',
        },
        sender: { type: 'string', description: 'Filter by sender name' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_upcoming',
    description: 'List upcoming calendar events and due reminders within a specified number of days. Use when the user asks about their schedule, upcoming meetings, or what\'s due. Includes overdue items. Default: 7 days ahead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look ahead (default: 7)',
        },
      },
    },
  },
  {
    name: 'create_reminder',
    description: 'Create an Apple Reminder item. Use when the user explicitly asks to set a reminder. Requires macOS. Do NOT use for tasks — use create_task for work items on the kanban board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Reminder title' },
        notes: { type: 'string', description: 'Reminder notes' },
        due_date: { type: 'string', description: 'Due date in ISO format' },
        list: { type: 'string', description: 'Reminder list name. Defaults to "Reminders".' },
      },
      required: ['title'],
    },
  },
  {
    name: 'schedule_event',
    description: 'Create a calendar event on Apple Calendar. Use when the user wants to schedule a meeting, appointment, or block time. Requires macOS. Requires at least a title and start time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start date/time in ISO format' },
        end: { type: 'string', description: 'End date/time in ISO format' },
        location: { type: 'string', description: 'Event location' },
        notes: { type: 'string', description: 'Event notes' },
      },
      required: ['title', 'start'],
    },
  },
]

async function readJsonCache<T>(filename: string): Promise<T[]> {
  const { readFileSync, existsSync } = await import('fs')
  const { join } = await import('path')
  const cachePath = join(process.env.HOME || '', '.agent', 'cache', filename)
  if (!existsSync(cachePath)) return []
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as T[]
  } catch {
    return []
  }
}

export const channelToolHandlers: Record<string, AgentToolHandler> = {
  async get_upcoming(input, _orgId) {
    const days = (input.days as number) || 7
    const now = new Date()
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    interface CalendarEvent { title: string; startDate: string; location: string; notes: string; calendar: string }
    interface ReminderItem { name: string; body: string; list: string; priority: number; dueDate: string }

    const [events, reminders] = await Promise.all([
      readJsonCache<CalendarEvent>('calendar-events.json'),
      readJsonCache<ReminderItem>('reminders.json'),
    ])

    const upcomingEvents = events
      .filter(e => {
        const d = new Date(e.startDate)
        return d >= now && d <= cutoff
      })
      .map(e => ({
        type: 'event' as const,
        title: e.title,
        date: e.startDate,
        location: e.location || null,
        notes: e.notes || null,
        calendar: e.calendar,
      }))

    const upcomingReminders = reminders
      .filter(r => {
        if (!r.dueDate) return true // no due date = always show
        const d = new Date(r.dueDate)
        return d <= cutoff
      })
      .map(r => ({
        type: 'reminder' as const,
        title: r.name,
        date: r.dueDate || null,
        list: r.list,
        overdue: r.dueDate ? new Date(r.dueDate) < now : false,
      }))

    const combined = [
      ...upcomingEvents.map(e => ({ ...e, sortDate: new Date(e.date) })),
      ...upcomingReminders.map(r => ({ ...r, sortDate: r.date ? new Date(r.date) : cutoff })),
    ].sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
      .map(({ sortDate: _, ...rest }) => rest)

    return {
      success: true,
      data: {
        events: upcomingEvents.length,
        reminders: upcomingReminders.length,
        overdue: upcomingReminders.filter(r => r.overdue).length,
        items: combined,
      },
    }
  },

  async sync_channels(input, orgId) {
    const hoursBack = (input.hours_back as number) || 24
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

    const channels: ChannelType[] = ['gmail', 'outlook', 'imessage', 'calendar', 'reminders']
    const results = await synthesize({ channels, since, orgId })

    const totalMessages = results.reduce((sum, r) => sum + r.messagesFound, 0)
    const totalTasks = results.reduce((sum, r) => sum + r.tasksCreated, 0)
    const totalUpdated = results.reduce((sum, r) => sum + r.tasksUpdated, 0)
    const allErrors = results.flatMap(r => r.errors)

    return {
      success: true,
      data: {
        results,
        summary: `Processed ${totalMessages} messages across ${channels.length} channels. Created ${totalTasks} new tasks, updated ${totalUpdated} existing tasks.${allErrors.length > 0 ? ` Errors: ${allErrors.join(', ')}` : ''}`,
      },
    }
  },

  async search_messages(input, _orgId) {
    const query = ((input.query as string) || '').toLowerCase()
    const channelFilter = input.channel as ChannelType | undefined
    const senderFilter = ((input.sender as string) || '').toLowerCase()

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const allMessages: ChannelMessage[] = []

    const targetAdapters: ChannelAdapter[] = channelFilter
      ? [getAdapter(channelFilter)].filter((a): a is ChannelAdapter => !!a)
      : getAllAdapters()

    for (const adapter of targetAdapters) {
      try {
        const available = await adapter.isAvailable()
        if (!available) continue
        const messages = await adapter.pull({}, since)
        allMessages.push(...messages)
      } catch {
        // Skip failed adapters
      }
    }

    const filtered = allMessages.filter(m => {
      const subject = (m.subject || '').toLowerCase()
      const matchesQuery = subject.includes(query) || m.body.toLowerCase().includes(query)
      const matchesSender = !senderFilter || m.sender.toLowerCase().includes(senderFilter)
      return matchesQuery && matchesSender
    })

    return {
      success: true,
      data: {
        results: filtered.slice(0, 20),
        total: filtered.length,
      },
    }
  },

  async create_reminder(input, _orgId) {
    const title = input.title as string
    const notes = (input.notes as string) || ''
    const dueDate = input.due_date as string | undefined
    const list = (input.list as string) || 'Reminders'

    let script = `tell application "Reminders"
  tell list "${list}"
    set newReminder to make new reminder with properties {name:"${title.replace(/"/g, '\\"')}"}`
    if (notes) {
      script += `\n    set body of newReminder to "${notes.replace(/"/g, '\\"')}"`
    }
    if (dueDate) {
      script += `\n    set due date of newReminder to date "${new Date(dueDate).toLocaleString()}"`
    }
    script += `\n  end tell\nend tell`

    try {
      const { execSync } = await import('child_process')
      execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
      return {
        success: true,
        data: { created: true, title, list, due_date: dueDate || null },
      }
    } catch (err) {
      return { success: false, error: `Failed to create reminder: ${String(err)}` }
    }
  },

  async schedule_event(input, _orgId) {
    const title = input.title as string
    const start = input.start as string
    const end = (input.end as string) || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
    const location = (input.location as string) || ''
    const notes = (input.notes as string) || ''

    const startDate = new Date(start)
    const endDate = new Date(end)

    let script = `tell application "Calendar"
  tell calendar "Calendar"
    set newEvent to make new event with properties {summary:"${title.replace(/"/g, '\\"')}", start date:date "${startDate.toLocaleString()}", end date:date "${endDate.toLocaleString()}"}`
    if (location) {
      script += `\n    set location of newEvent to "${location.replace(/"/g, '\\"')}"`
    }
    if (notes) {
      script += `\n    set description of newEvent to "${notes.replace(/"/g, '\\"')}"`
    }
    script += `\n  end tell\nend tell`

    try {
      const { execSync } = await import('child_process')
      execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
      return {
        success: true,
        data: { created: true, title, start, end, location: location || null },
      }
    } catch (err) {
      return { success: false, error: `Failed to create event: ${String(err)}` }
    }
  },
}
