import Anthropic from '@anthropic-ai/sdk'
import {
  getAllAdapters,
  getAdapter,
  synthesize,
} from '@/lib/channels'
import type { ChannelAdapter, ChannelMessage, ChannelType } from '@/lib/channels'
import type { AgentToolHandler } from '../tools'
import { getOrgCredential } from '@/lib/integrations/credentials'
import { refreshGmailToken } from '@/lib/channels/gmail'
import { logger } from '@/lib/core/logger'

export const channelToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'sync_channels',
    description: 'Pull new messages from all connected channels (Gmail, Outlook, WhatsApp, iMessage, Calendar, Reminders) and create tasks from actionable items. Use when the user says \'check my messages\', \'sync channels\', or \'what\'s new\'. Defaults to last 24 hours.',
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
          enum: ['gmail', 'outlook', 'whatsapp', 'imessage', 'calendar', 'reminders'],
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
  {
    name: 'send_gmail',
    description:
      'Send an email from the user\'s connected Gmail account via Gmail API (OAuth). Unlike send_email (which uses Resend), this sends directly from the user\'s own Gmail address. IMPORTANT: Always confirm the recipient, subject, and body with the user before sending. Requires a connected Gmail OAuth integration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (comma-separated email addresses)',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipients (comma-separated email addresses)',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_whatsapp',
    description:
      'Send a WhatsApp message via the connected Baileys bridge. The message is queued in the outbox and picked up by the bridge for delivery. The recipient should be a phone number with country code and no + prefix (e.g. 61400123456). Use when the user asks to send a WhatsApp message to someone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipient: {
          type: 'string',
          description: 'Recipient phone number with country code, no + prefix (e.g. 61400123456)',
        },
        message: {
          type: 'string',
          description: 'The text message body to send',
        },
        recipient_name: {
          type: 'string',
          description: 'Display name of the recipient (for reference only, not sent)',
        },
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'send_outlook',
    description:
      'Send an email from the user\'s connected Outlook account via Microsoft Graph API (OAuth). Sends directly from the user\'s own Outlook/Microsoft 365 address. IMPORTANT: Always confirm the recipient, subject, and body with the user before sending. Requires a connected Outlook OAuth integration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (comma-separated email addresses)',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipients (comma-separated email addresses)',
        },
      },
      required: ['to', 'subject', 'body'],
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

    const channels: ChannelType[] = ['gmail', 'outlook', 'whatsapp', 'imessage', 'calendar', 'reminders']
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
      .select('channel_type, status, relay_enabled, last_sync, created_at')
      .eq('org_id', orgId)

    if (error) {
      return { success: false, error: `Failed to get channels: ${error.message}` }
    }

    const channels = (data ?? []).map((c: Record<string, unknown>) => ({
      channel: c.channel_type,
      status: c.status,
      relay_enabled: c.relay_enabled,
      last_sync: c.last_sync,
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

  async send_gmail(input, orgId, supabase) {
    const to = input.to as string
    const subject = input.subject as string
    const body = input.body as string
    const cc = input.cc as string | undefined
    const bcc = input.bcc as string | undefined

    try {
      // Retrieve Gmail OAuth credentials from the org's stored integrations
      const creds = await getOrgCredential(supabase, orgId, 'gmail')
      if (!creds) {
        return {
          success: false,
          error: 'Gmail not connected. The user needs to connect their Gmail account via OAuth in Settings > Integrations.',
        }
      }

      const clientId = (creds.client_id as string) || process.env.GOOGLE_CLIENT_ID || ''
      const clientSecret = (creds.client_secret as string) || process.env.GOOGLE_CLIENT_SECRET || ''
      const refreshToken = creds.refresh_token as string | undefined
      let accessToken = creds.access_token as string | undefined
      const tokenExpiresAt = creds.token_expires_at as string | undefined

      if (!accessToken && !refreshToken) {
        return {
          success: false,
          error: 'Gmail OAuth token not available. The user needs to re-connect their Gmail account.',
        }
      }

      // Refresh the token if expired or about to expire
      if (!accessToken || (tokenExpiresAt && new Date(tokenExpiresAt).getTime() - 5 * 60 * 1000 <= Date.now())) {
        if (!refreshToken) {
          return {
            success: false,
            error: 'Gmail access token expired and no refresh token available. The user needs to re-connect Gmail.',
          }
        }
        const refreshed = await refreshGmailToken(supabase, orgId, {
          client_id: clientId,
          client_secret: clientSecret,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
        })
        if (!refreshed) {
          return {
            success: false,
            error: 'Failed to refresh Gmail OAuth token. The user may need to re-connect their Gmail account.',
          }
        }
        accessToken = refreshed
      }

      // Build RFC 2822 message
      const messageParts: string[] = []
      messageParts.push(`To: ${to}`)
      if (cc) {
        messageParts.push(`Cc: ${cc}`)
      }
      if (bcc) {
        messageParts.push(`Bcc: ${bcc}`)
      }
      messageParts.push(`Subject: ${subject}`)
      messageParts.push('MIME-Version: 1.0')
      messageParts.push('Content-Type: text/plain; charset="UTF-8"')
      messageParts.push('')
      messageParts.push(body)

      const rawMessage = messageParts.join('\r\n')

      // Base64url encode the message (Gmail API requirement)
      const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      // Send via Gmail API
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[send_gmail] Gmail API error:', { status: response.status, body: errorText })
        return {
          success: false,
          error: `Gmail API error (${response.status}): ${errorText}`,
        }
      }

      const result = (await response.json()) as { id: string; threadId: string; labelIds?: string[] }

      logger.info('[send_gmail] Email sent successfully', {
        to,
        subject,
        messageId: result.id,
        org: orgId,
      })

      return {
        success: true,
        data: {
          message_id: result.id,
          thread_id: result.threadId,
          to,
          cc: cc || null,
          bcc: bcc || null,
          subject,
        },
      }
    } catch (err) {
      logger.error('[send_gmail] Error:', err)
      return { success: false, error: `Gmail send error: ${String(err)}` }
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

  async send_whatsapp(input, orgId, supabase) {
    const recipient = input.recipient as string
    const message = input.message as string
    const recipientName = input.recipient_name as string | undefined

    // Strip + prefix if provided (normalise to digits-only with country code)
    const normalised = recipient.replace(/^\+/, '').replace(/[\s\-()]/g, '')

    if (!/^\d{7,15}$/.test(normalised)) {
      return {
        success: false,
        error: `Invalid phone number "${recipient}". Provide digits only with country code (e.g. 61400123456).`,
      }
    }

    try {
      const { data, error } = await supabase
        .from('whatsapp_outbox')
        .insert({
          org_id: orgId,
          recipient: normalised,
          body: message,
          status: 'pending',
        })
        .select('id, created_at')
        .single()

      if (error) {
        logger.error('[send_whatsapp] Insert failed:', error)
        return { success: false, error: `Failed to queue WhatsApp message: ${error.message}` }
      }

      const displayRecipient = recipientName
        ? `${recipientName} (${normalised})`
        : normalised

      logger.info('[send_whatsapp] Queued message', {
        org: orgId,
        recipient: normalised,
        outboxId: data.id,
      })

      return {
        success: true,
        data: {
          outbox_id: data.id,
          recipient: displayRecipient,
          message_preview: message.slice(0, 100) + (message.length > 100 ? '...' : ''),
          status: 'pending',
          queued_at: data.created_at,
          note: 'Message queued for delivery via the WhatsApp bridge.',
        },
      }
    } catch (err) {
      logger.error('[send_whatsapp] Error:', err)
      return { success: false, error: `WhatsApp send error: ${String(err)}` }
    }
  },

  async send_outlook(input, orgId, supabase) {
    const to = input.to as string
    const subject = input.subject as string
    const body = input.body as string
    const cc = input.cc as string | undefined
    const bcc = input.bcc as string | undefined

    try {
      const creds = await getOrgCredential(supabase, orgId, 'outlook')
      if (!creds) {
        return {
          success: false,
          error: 'Outlook not connected. The user needs to connect their Outlook account via OAuth in Settings > Integrations.',
        }
      }

      // Resolve access token (handles refresh internally)
      const { resolveAccessToken } = await import('@/lib/channels/outlook')
      const accessToken = await resolveAccessToken(creds, supabase, orgId)

      // Build Graph API message payload with CC/BCC
      const message: Record<string, unknown> = {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      }
      if (cc) {
        message.ccRecipients = cc.split(',').map(e => ({ emailAddress: { address: e.trim() } }))
      }
      if (bcc) {
        message.bccRecipients = bcc.split(',').map(e => ({ emailAddress: { address: e.trim() } }))
      }

      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        logger.error('[send_outlook] Graph API error:', { status: res.status, body: errorText })
        return { success: false, error: `Outlook API error (${res.status}): ${errorText}` }
      }

      logger.info('[send_outlook] Email sent successfully', { to, subject, org: orgId })

      return {
        success: true,
        data: { to, cc: cc || null, bcc: bcc || null, subject },
      }
    } catch (err) {
      logger.error('[send_outlook] Error:', err)
      return { success: false, error: `Outlook send error: ${String(err)}` }
    }
  },
}
