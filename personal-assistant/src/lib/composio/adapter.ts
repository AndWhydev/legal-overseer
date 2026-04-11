import { getComposioClient } from './client'
import { getToolkitId, isComposioChannel } from './mapping'
import type { ChannelAdapter, ChannelMessage, ChannelType } from '../channels/types'
import { logger } from '../core/logger'

/**
 * Feature flag: set per-channel to enable Composio adapter instead of legacy.
 * Reads from env: COMPOSIO_ENABLE_GMAIL=1, COMPOSIO_ENABLE_OUTLOOK=1, etc.
 */
export function isComposioEnabledForChannel(channel: ChannelType): boolean {
  if (!isComposioChannel(channel)) return false
  if (!process.env.COMPOSIO_API_KEY) return false

  // Global kill switch
  if (process.env.COMPOSIO_DISABLE_ALL === '1') return false

  // Per-channel flag: COMPOSIO_ENABLE_GMAIL=1
  const envKey = `COMPOSIO_ENABLE_${channel.toUpperCase().replace(/-/g, '_')}`
  return process.env[envKey] === '1'
}

interface ComposioActionResult {
  data?: Record<string, unknown>
  error?: string
  successfull?: boolean
}

/**
 * Execute a Composio action for a user session.
 */
async function executeAction(
  orgId: string,
  actionName: string,
  params: Record<string, unknown> = {},
): Promise<ComposioActionResult | null> {
  const composio = getComposioClient()
  if (!composio) return null

  try {
    // Execute action via Composio's tools API
    // The SDK handles auth, token refresh, connected account resolution
    const result = await (composio as unknown as {
      tools: {
        execute: (opts: { actionName: string; params: Record<string, unknown>; entityId?: string }) => Promise<ComposioActionResult>
      }
    }).tools.execute({
      actionName,
      params,
      entityId: orgId,
    })

    return result
  } catch (err) {
    logger.error(`[composio/adapter] executeAction failed`, {
      orgId,
      actionName,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Transform a Composio Gmail message response into a BitBit ChannelMessage.
 */
function transformGmailMessage(raw: Record<string, unknown>, index: number): ChannelMessage {
  const messageId = (raw.messageId as string) || (raw.id as string) || `composio-gmail-${index}`
  const from = (raw.sender as string) || (raw.from as string) || 'Unknown'
  const subject = (raw.subject as string) || '(no subject)'
  const body = (raw.messageText as string) || (raw.body as string) || (raw.snippet as string) || ''
  const date = (raw.date as string) || (raw.receivedAt as string)

  // Parse "Name <email>" format
  const emailMatch = from.match(/<([^>]+)>/)
  const senderEmail = emailMatch?.[1] || (from.includes('@') ? from : '')
  const senderName = from.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || senderEmail || 'Unknown'

  return {
    id: `composio-gmail-${messageId}`,
    channel: 'gmail',
    externalId: messageId,
    sender: senderName,
    senderEmail,
    subject,
    body: body.slice(0, 2000),
    bodyFull: body || undefined,
    receivedAt: date ? new Date(date) : new Date(),
    isActionable: false,
    priority: 'medium',
    metadata: {
      source: 'composio',
      threadId: raw.threadId,
      labelIds: raw.labelIds,
    },
  }
}

/**
 * Generic Composio message transformer — maps common fields across toolkits.
 */
function transformGenericMessage(
  raw: Record<string, unknown>,
  channel: ChannelType,
  index: number,
): ChannelMessage {
  const id = (raw.id as string) || (raw.messageId as string) || `composio-${channel}-${index}`
  const sender = (raw.sender as string) || (raw.from as string) || (raw.author as string) || (raw.user as string) || 'Unknown'
  const subject = (raw.subject as string) || (raw.title as string) || (raw.name as string)
  const body = (raw.body as string) || (raw.text as string) || (raw.content as string) || (raw.message as string) || (raw.description as string) || ''
  const date = (raw.date as string) || (raw.created_at as string) || (raw.timestamp as string) || (raw.receivedAt as string)

  return {
    id: `composio-${channel}-${id}`,
    channel,
    externalId: id,
    sender: typeof sender === 'string' ? sender : 'Unknown',
    senderEmail: (raw.email as string) || (raw.senderEmail as string) || undefined,
    subject: subject || undefined,
    body: (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 2000),
    bodyFull: typeof body === 'string' ? body : JSON.stringify(body),
    receivedAt: date ? new Date(date) : new Date(),
    isActionable: false,
    priority: 'medium',
    metadata: {
      source: 'composio',
      raw_keys: Object.keys(raw),
    },
  }
}

// ---------------------------------------------------------------------------
// Per-channel transformers
// ---------------------------------------------------------------------------

function transformOutlookMessage(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-outlook-${index}`
  const from = (raw.from as Record<string, unknown>)
  const emailAddress = from?.emailAddress as Record<string, unknown> | undefined
  const senderName = (emailAddress?.name as string) || (raw.sender as string) || 'Unknown'
  const senderEmail = (emailAddress?.address as string) || ''
  const subject = (raw.subject as string) || '(no subject)'
  const body = (raw.bodyPreview as string) || ((raw.body as Record<string, unknown>)?.content as string) || ''

  return {
    id: `composio-outlook-${id}`,
    channel: 'outlook',
    externalId: id,
    sender: senderName,
    senderEmail,
    subject,
    body: body.slice(0, 2000),
    bodyFull: body,
    receivedAt: raw.receivedDateTime ? new Date(raw.receivedDateTime as string) : new Date(),
    isActionable: false,
    priority: (raw.importance as string) === 'high' ? 'high' : 'medium',
    metadata: { source: 'composio', conversationId: raw.conversationId },
  }
}

function transformCalendarEvent(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-calendar-${index}`
  const summary = (raw.summary as string) || (raw.title as string) || '(untitled event)'
  const organizer = (raw.organizer as Record<string, unknown>)
  const senderEmail = (organizer?.email as string) || ''
  const senderName = (organizer?.displayName as string) || senderEmail || 'Calendar'
  const start = (raw.start as Record<string, unknown>)
  const startDate = (start?.dateTime as string) || (start?.date as string)
  const description = (raw.description as string) || ''
  const location = (raw.location as string) || ''

  return {
    id: `composio-calendar-${id}`,
    channel: 'calendar',
    externalId: id,
    sender: senderName,
    senderEmail,
    subject: summary,
    body: [description, location ? `Location: ${location}` : ''].filter(Boolean).join('\n').slice(0, 2000),
    receivedAt: startDate ? new Date(startDate) : new Date(),
    isActionable: true,
    priority: 'medium',
    metadata: { source: 'composio', location, status: raw.status },
  }
}

function transformAsanaTask(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.gid as string) || (raw.id as string) || `composio-asana-${index}`
  const name = (raw.name as string) || '(untitled task)'
  const assignee = (raw.assignee as Record<string, unknown>)
  const sender = (assignee?.name as string) || 'Asana'
  const notes = (raw.notes as string) || (raw.html_notes as string) || ''

  return {
    id: `composio-asana-${id}`,
    channel: 'asana',
    externalId: id,
    sender,
    subject: name,
    body: notes.replace(/<[^>]*>/g, '').slice(0, 2000),
    receivedAt: raw.modified_at ? new Date(raw.modified_at as string) : new Date(),
    isActionable: !(raw.completed as boolean),
    priority: 'medium',
    metadata: { source: 'composio', completed: raw.completed, due_on: raw.due_on, projects: raw.projects },
  }
}

function transformStripePayment(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-stripe-${index}`
  const amount = (raw.amount as number) || 0
  const currency = ((raw.currency as string) || 'aud').toUpperCase()
  const status = (raw.status as string) || 'unknown'
  const customer = (raw.customer as string) || (raw.customer_email as string) || 'Unknown customer'
  const description = (raw.description as string) || ''
  const formatted = `${currency} ${(amount / 100).toFixed(2)}`

  return {
    id: `composio-stripe-${id}`,
    channel: 'stripe',
    externalId: id,
    sender: customer,
    senderEmail: (raw.customer_email as string) || (raw.receipt_email as string),
    subject: `Payment ${status}: ${formatted}`,
    body: [description, `Amount: ${formatted}`, `Status: ${status}`].join('\n').slice(0, 2000),
    receivedAt: raw.created ? new Date((raw.created as number) * 1000) : new Date(),
    isActionable: status === 'requires_action' || status === 'requires_payment_method',
    priority: status === 'failed' ? 'high' : 'medium',
    metadata: { source: 'composio', amount, currency: raw.currency, status, payment_intent: raw.payment_intent },
  }
}

function transformSlackMessage(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.ts as string) || (raw.id as string) || `composio-slack-${index}`
  const text = (raw.text as string) || ''
  const user = (raw.user as string) || (raw.username as string) || 'Unknown'
  const channel = (raw.channel as string) || ''

  return {
    id: `composio-slack-${id}`,
    channel: 'slack',
    externalId: id,
    sender: user,
    subject: channel ? `#${channel}` : undefined,
    body: text.slice(0, 2000),
    bodyFull: text,
    receivedAt: raw.ts ? new Date(parseFloat(raw.ts as string) * 1000) : new Date(),
    isActionable: false,
    priority: 'medium',
    metadata: { source: 'composio', slack_channel: channel, thread_ts: raw.thread_ts },
  }
}

function transformXeroInvoice(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.InvoiceID as string) || (raw.id as string) || `composio-xero-${index}`
  const contact = (raw.Contact as Record<string, unknown>)
  const contactName = (contact?.Name as string) || 'Unknown'
  const total = (raw.Total as number) || (raw.AmountDue as number) || 0
  const currency = (raw.CurrencyCode as string) || 'AUD'
  const status = (raw.Status as string) || 'UNKNOWN'
  const invoiceNumber = (raw.InvoiceNumber as string) || ''

  return {
    id: `composio-xero-${id}`,
    channel: 'xero',
    externalId: id,
    sender: contactName,
    subject: `Invoice ${invoiceNumber}: ${currency} ${total.toFixed(2)} (${status})`,
    body: `Invoice ${invoiceNumber} for ${contactName}\nTotal: ${currency} ${total.toFixed(2)}\nStatus: ${status}`,
    receivedAt: raw.DateString ? new Date(raw.DateString as string) : new Date(),
    isActionable: status === 'AUTHORISED' || status === 'SUBMITTED',
    priority: status === 'OVERDUE' ? 'high' : 'medium',
    metadata: { source: 'composio', invoiceNumber, status, total, currency },
  }
}

function transformClickUpTask(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-clickup-${index}`
  const name = (raw.name as string) || '(untitled)'
  const assignees = (raw.assignees as Array<Record<string, unknown>>) || []
  const sender = assignees[0]?.username as string || 'ClickUp'
  const description = (raw.description as string) || (raw.text_content as string) || ''

  return {
    id: `composio-clickup-${id}`,
    channel: 'clickup',
    externalId: id,
    sender,
    subject: name,
    body: description.slice(0, 2000),
    receivedAt: raw.date_updated ? new Date(parseInt(raw.date_updated as string)) : new Date(),
    isActionable: true,
    priority: (raw.priority as Record<string, unknown>)?.priority === 'urgent' ? 'critical' : 'medium',
    metadata: { source: 'composio', status: (raw.status as Record<string, unknown>)?.status, list: raw.list },
  }
}

function transformInstagramMedia(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-instagram-${index}`
  const caption = (raw.caption as string) || ''
  const username = (raw.username as string) || 'Instagram'
  const mediaType = (raw.media_type as string) || 'IMAGE'

  return {
    id: `composio-instagram-${id}`,
    channel: 'instagram',
    externalId: id,
    sender: username,
    subject: `${mediaType}: ${caption.slice(0, 80)}`,
    body: caption.slice(0, 2000),
    receivedAt: raw.timestamp ? new Date(raw.timestamp as string) : new Date(),
    isActionable: false,
    priority: 'low',
    metadata: { source: 'composio', mediaType, permalink: raw.permalink, mediaUrl: raw.media_url },
  }
}

function transformFacebookPost(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-facebook-${index}`
  const message = (raw.message as string) || (raw.story as string) || ''
  const from = (raw.from as Record<string, unknown>)
  const sender = (from?.name as string) || 'Facebook'

  return {
    id: `composio-facebook-${id}`,
    channel: 'facebook',
    externalId: id,
    sender,
    body: message.slice(0, 2000),
    receivedAt: raw.created_time ? new Date(raw.created_time as string) : new Date(),
    isActionable: false,
    priority: 'low',
    metadata: { source: 'composio', type: raw.type, permalink_url: raw.permalink_url },
  }
}

function transformWordPressPost(raw: Record<string, unknown>, index: number): ChannelMessage {
  const id = (raw.id as string) || `composio-wordpress-${index}`
  const title = ((raw.title as Record<string, unknown>)?.rendered as string) || (raw.title as string) || '(untitled)'
  const content = ((raw.content as Record<string, unknown>)?.rendered as string) || ''
  const author = (raw.author_name as string) || 'WordPress'

  return {
    id: `composio-wordpress-${id}`,
    channel: 'wordpress',
    externalId: String(id),
    sender: author,
    subject: title,
    body: content.replace(/<[^>]*>/g, '').slice(0, 2000),
    receivedAt: raw.date ? new Date(raw.date as string) : new Date(),
    isActionable: (raw.status as string) === 'draft',
    priority: 'low',
    metadata: { source: 'composio', status: raw.status, slug: raw.slug, link: raw.link },
  }
}

/**
 * Channel-specific action names for pulling messages/data.
 */
const PULL_ACTIONS: Partial<Record<ChannelType, string>> = {
  gmail: 'GMAIL_LIST_EMAILS',
  outlook: 'OUTLOOK_LIST_EMAILS',
  calendar: 'GOOGLECALENDAR_LIST_EVENTS',
  asana: 'ASANA_LIST_TASKS',
  calendly: 'CALENDLY_LIST_EVENTS',
  stripe: 'STRIPE_LIST_PAYMENTS',
  slack: 'SLACK_LIST_MESSAGES',
  clickup: 'CLICKUP_LIST_TASKS',
  instagram: 'INSTAGRAM_LIST_MEDIA',
  facebook: 'FACEBOOKPAGES_LIST_POSTS',
  telegram: 'TELEGRAM_GET_UPDATES',
  xero: 'XERO_LIST_INVOICES',
  wordpress: 'WORDPRESS_LIST_POSTS',
  ga4: 'GOOGLEANALYTICS_GET_REPORT',
  gsc: 'GOOGLESEARCHCONSOLE_GET_SEARCH_ANALYTICS',
}

/**
 * Channel-specific send action names.
 */
export const SEND_ACTIONS: Partial<Record<ChannelType, string>> = {
  gmail: 'GMAIL_SEND_EMAIL',
  outlook: 'OUTLOOK_SEND_EMAIL',
  slack: 'SLACK_SEND_MESSAGE',
  telegram: 'TELEGRAM_SEND_MESSAGE',
  facebook: 'FACEBOOKPAGES_CREATE_POST',
  wordpress: 'WORDPRESS_CREATE_POST',
}

/**
 * Channel-specific transformers.
 */
const TRANSFORMERS: Partial<Record<ChannelType, (raw: Record<string, unknown>, i: number) => ChannelMessage>> = {
  gmail: transformGmailMessage,
  outlook: transformOutlookMessage,
  calendar: transformCalendarEvent,
  asana: transformAsanaTask,
  stripe: transformStripePayment,
  slack: transformSlackMessage,
  xero: transformXeroInvoice,
  clickup: transformClickUpTask,
  instagram: transformInstagramMedia,
  facebook: transformFacebookPost,
  wordpress: transformWordPressPost,
}

/**
 * Create a Composio-backed ChannelAdapter for a given channel type.
 * Falls through to the generic transformer if no specific one exists.
 */
export function createComposioAdapter(channel: ChannelType): ChannelAdapter | null {
  const toolkit = getToolkitId(channel)
  if (!toolkit) return null

  const pullAction = PULL_ACTIONS[channel]
  const transformer = TRANSFORMERS[channel] || ((raw: Record<string, unknown>, i: number) => transformGenericMessage(raw, channel, i))

  return {
    type: channel,
    name: `${toolkit} (Composio)`,
    description: `${toolkit} via Composio managed integration`,
    icon: channel.charAt(0).toUpperCase() + channel.slice(1),

    async pull(config, since) {
      const orgId = (config.orgId as string) || (config.org_id as string)
      if (!orgId) {
        logger.warn(`[composio/adapter] No orgId in config for ${channel} pull`)
        return []
      }

      if (!pullAction) {
        logger.warn(`[composio/adapter] No pull action defined for ${channel}`)
        return []
      }

      const params: Record<string, unknown> = {}
      if (since) {
        params.after = since.toISOString()
        params.since = since.toISOString()
      }

      const result = await executeAction(orgId, pullAction, params)
      if (!result?.data) return []

      // Composio typically returns results in a data array
      const items = Array.isArray(result.data)
        ? result.data
        : (result.data.messages as Record<string, unknown>[])
          || (result.data.items as Record<string, unknown>[])
          || (result.data.results as Record<string, unknown>[])
          || (result.data.data as Record<string, unknown>[])
          || []

      if (!Array.isArray(items)) {
        logger.warn(`[composio/adapter] Unexpected response shape for ${channel}`, {
          keys: Object.keys(result.data),
        })
        return []
      }

      return items.map((item, i) => transformer(item as Record<string, unknown>, i))
    },

    async isAvailable() {
      // Check if Composio is configured and user has an active connection
      return Boolean(process.env.COMPOSIO_API_KEY)
    },
  }
}
