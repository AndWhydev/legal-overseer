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
    name: 'search_inbox',
    description: 'Search the unified inbox for messages matching a query. Can filter by sender, channel, category, date range, and keywords. Use when the user searches their inbox.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (matches subject, body, sender)' },
        channel: { type: 'string', enum: ['gmail', 'outlook', 'whatsapp', 'sms', 'slack'], description: 'Filter by channel' },
        category: { type: 'string', description: 'Filter by category: priority, updates, feed, receipts' },
        from: { type: 'string', description: 'Filter by sender name or email' },
        since: { type: 'string', description: 'ISO date, only messages after this' },
        limit: { type: 'number', description: 'Max results, default 10' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_email',
    description: 'Read the full content of a specific email message by ID. Use when the user wants to read a complete email. Retrieves from database or Gmail API if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message_id: { type: 'string', description: 'The message ID to read (from search results)' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'draft_reply',
    description: 'Create a draft email reply to a message. The draft is saved for user review and approval before sending. Use when the user wants to compose a reply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message_id: { type: 'string', description: 'The message ID to reply to' },
        body: { type: 'string', description: 'Reply message body' },
        tone: { type: 'string', enum: ['professional', 'casual', 'friendly', 'formal'], description: 'Suggested tone (optional)' },
      },
      required: ['message_id', 'body'],
    },
  },
  {
    name: 'summarize_inbox',
    description: 'Generate a natural-language summary of recent inbox messages grouped by category. Use when the user asks for an inbox summary or digest.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hours: { type: 'number', description: 'Look back this many hours (default: 24)' },
      },
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
  {
    name: 'read_recent_emails',
    description: 'Read recent emails from connected Gmail/Outlook channels. Queries the channel_messages database. Use when the user asks to check emails, find messages, or review their inbox. Returns subject, sender, body preview, timestamp, and category.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max emails to return (default: 20, max: 50)' },
        sender: { type: 'string', description: 'Filter by sender email or name' },
        category: { type: 'string', description: 'Filter by category (actionable, informational, personal, spam)' },
        date_from: { type: 'string', description: 'Only emails after this ISO date' },
        date_to: { type: 'string', description: 'Only emails before this ISO date' },
      },
    },
  },
  {
    name: 'search_emails',
    description: 'Full-text search across email subjects and bodies in the channel_messages database. Use when the user asks to find a specific email, search for a topic, or look up correspondence with someone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search text (matches subject and body)' },
        channel: { type: 'string', enum: ['gmail', 'outlook'], description: 'Filter by email channel' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_connected_channels',
    description: 'Check which communication channels are connected and their sync status. Use when the user asks about their integrations, channel status, or when you need to verify email access before reading messages.',
    input_schema: {
      type: 'object' as const,
      properties: {},
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

  async read_recent_emails(input, orgId, supabase) {
    const limit = Math.min((input.limit as number) || 20, 50)
    const sender = input.sender as string | undefined
    const category = input.category as string | undefined
    const dateFrom = input.date_from as string | undefined
    const dateTo = input.date_to as string | undefined

    let query = supabase
      .from('channel_messages')
      .select('id, channel, sender, subject, body, metadata, created_at')
      .eq('org_id', orgId)
      .in('channel', ['gmail', 'outlook'])
      .order('created_at', { ascending: false })
      .limit(limit)

    if (sender) {
      query = query.or(`sender.ilike.%${sender}%,metadata->>sender_email.ilike.%${sender}%`)
    }
    if (category) {
      query = query.eq('metadata->>category', category)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: `Failed to read emails: ${error.message}` }
    }

    const emails = (data ?? []).map((m: Record<string, unknown>) => ({
      id: m.id,
      channel: m.channel,
      sender: m.sender,
      sender_email: (m.metadata as Record<string, unknown>)?.sender_email ?? null,
      subject: m.subject,
      body_preview: typeof m.body === 'string' ? m.body.slice(0, 300) : '',
      category: (m.metadata as Record<string, unknown>)?.category ?? 'unknown',
      timestamp: m.created_at,
    }))

    return {
      success: true,
      data: { emails, total: emails.length },
    }
  },

  async search_emails(input, orgId, supabase) {
    const searchQuery = input.query as string
    const channel = input.channel as string | undefined
    const limit = Math.min((input.limit as number) || 20, 50)

    let query = supabase
      .from('channel_messages')
      .select('id, channel, sender, subject, body, metadata, created_at')
      .eq('org_id', orgId)
      .in('channel', ['gmail', 'outlook'])
      .or(`subject.ilike.%${searchQuery}%,body.ilike.%${searchQuery}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (channel) {
      query = query.eq('channel', channel)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: `Search failed: ${error.message}` }
    }

    const results = (data ?? []).map((m: Record<string, unknown>) => ({
      id: m.id,
      channel: m.channel,
      sender: m.sender,
      subject: m.subject,
      body_preview: typeof m.body === 'string' ? m.body.slice(0, 300) : '',
      category: (m.metadata as Record<string, unknown>)?.category ?? 'unknown',
      timestamp: m.created_at,
    }))

    return {
      success: true,
      data: { results, total: results.length, query: searchQuery },
    }
  },

  async get_connected_channels(_input, orgId, supabase) {
    const { data, error } = await supabase
      .from('channel_connections')
      .select('channel_type, status, relay_enabled, last_sync_at, created_at')
      .eq('org_id', orgId)

    if (error) {
      return { success: false, error: `Failed to get channels: ${error.message}` }
    }

    const channels = (data ?? []).map((c: Record<string, unknown>) => ({
      channel: c.channel_type,
      status: c.status,
      relay_enabled: c.relay_enabled,
      last_sync: c.last_sync_at,
      connected_at: c.created_at,
    }))

    return {
      success: true,
      data: { channels, connected_count: channels.length },
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

  async search_inbox(input, orgId, supabase) {
    const query = input.query as string
    const channel = input.channel as string | undefined
    const category = input.category as string | undefined
    const from = input.from as string | undefined
    const since = input.since as string | undefined
    const limit = Math.min((input.limit as number) || 10, 50)

    let q = supabase
      .from('channel_messages')
      .select('id, channel, sender, subject, body, metadata, created_at')
      .eq('org_id', orgId)
      .or(`subject.ilike.%${query}%,body.ilike.%${query}%,sender.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (channel) {
      q = q.eq('channel', channel)
    }
    if (category) {
      q = q.eq('metadata->>category', category)
    }
    if (from) {
      q = q.or(`sender.ilike.%${from}%,metadata->>sender_email.ilike.%${from}%`)
    }
    if (since) {
      q = q.gte('created_at', since)
    }

    const { data, error } = await q

    if (error) {
      return { success: false, error: `Search failed: ${error.message}` }
    }

    const results = (data ?? []).map((m: Record<string, unknown>) => ({
      id: m.id,
      channel: m.channel,
      sender: m.sender,
      subject: m.subject,
      preview: typeof m.body === 'string' ? m.body.slice(0, 300) : '',
      category: (m.metadata as Record<string, unknown>)?.category ?? 'unknown',
      receivedAt: m.created_at,
    }))

    return {
      success: true,
      data: { results, total: results.length },
    }
  },

  async read_email(input, orgId, supabase) {
    const messageId = input.message_id as string

    const { data, error } = await supabase
      .from('channel_messages')
      .select('id, channel, sender, subject, body, metadata, created_at')
      .eq('id', messageId)
      .eq('org_id', orgId)
      .single()

    if (error || !data) {
      return { success: false, error: `Message not found: ${error?.message || 'Unknown error'}` }
    }

    const metadata = (data.metadata as Record<string, unknown>) || {}
    const senderEmail = (metadata.sender_email as string) || ''

    return {
      success: true,
      data: {
        id: data.id,
        sender: data.sender,
        senderEmail,
        subject: data.subject,
        body: data.body,
        channel: data.channel,
        category: metadata.category ?? 'unknown',
        receivedAt: data.created_at,
      },
    }
  },

  async draft_reply(input, orgId, supabase) {
    const messageId = input.message_id as string
    const body = input.body as string
    const tone = (input.tone as string) || 'professional'

    // Fetch original message
    const { data: original, error: fetchError } = await supabase
      .from('channel_messages')
      .select('id, channel, sender, subject, metadata')
      .eq('id', messageId)
      .eq('org_id', orgId)
      .single()

    if (fetchError || !original) {
      return { success: false, error: `Cannot find message to reply to: ${fetchError?.message || 'Unknown'}` }
    }

    // Create draft record
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const metadata = (original.metadata as Record<string, unknown>) || {}

    // For Gmail, we could call Gmail API to create a draft
    // For now, we'll store in metadata as draft_pending
    const { data: updated, error: updateError } = await supabase
      .from('channel_messages')
      .update({
        metadata: {
          ...metadata,
          draft_id: draftId,
          draft_body: body,
          draft_tone: tone,
          draft_created_at: new Date().toISOString(),
          draft_status: 'pending',
        },
      })
      .eq('id', messageId)
      .select()
      .single()

    if (updateError) {
      return { success: false, error: `Failed to create draft: ${updateError.message}` }
    }

    return {
      success: true,
      data: {
        draft_id: draftId,
        message_id: messageId,
        original_sender: original.sender,
        original_subject: `Re: ${original.subject}`,
        preview: body.slice(0, 200),
        status: 'draft_saved',
        warning: 'This draft requires user approval before sending',
      },
    }
  },

  async summarize_inbox(input, orgId, supabase) {
    const hours = (input.hours as number) || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('channel_messages')
      .select('id, sender, subject, metadata, created_at')
      .eq('org_id', orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: `Failed to summarize inbox: ${error.message}` }
    }

    const messages = data ?? []

    // Group by category
    const categories: Record<string, Array<{ sender: string; subject: string }>> = {
      priority: [],
      updates: [],
      feed: [],
      receipts: [],
      other: [],
    }

    for (const msg of messages) {
      const meta = (msg.metadata as Record<string, unknown>) || {}
      const category = (meta.category as string) || 'other'
      const key = ['priority', 'updates', 'feed', 'receipts'].includes(category) ? category : 'other'

      if (categories[key].length < 5) {
        categories[key].push({
          sender: msg.sender as string,
          subject: msg.subject as string,
        })
      }
    }

    const highlights = []
    for (const [cat, items] of Object.entries(categories)) {
      if (items.length > 0) {
        for (const item of items.slice(0, 2)) {
          highlights.push(`${item.sender}: ${item.subject} (${cat})`)
        }
      }
    }

    const actionItems = categories.priority.map(item => `Reply to ${item.sender} about "${item.subject}"`)

    return {
      success: true,
      data: {
        period: `${hours} hours`,
        total: messages.length,
        categories: {
          priority: { count: categories.priority.length, items: categories.priority },
          updates: { count: categories.updates.length, items: categories.updates },
          feed: { count: categories.feed.length, items: categories.feed },
          receipts: { count: categories.receipts.length, items: categories.receipts },
        },
        highlights,
        actionItems,
      },
    }
  },
}
