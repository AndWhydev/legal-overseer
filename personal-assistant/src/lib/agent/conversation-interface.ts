import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgentChat, type AgentEvent, type EngineConfig } from './engine'
import { sendSMS } from '@/lib/channels/sms'
import { sendSlackMessage } from '@/lib/channels/slack'
import { sendApprovalEmail } from '@/lib/email/email-transport'
import { logger } from '@/lib/core/logger';

/**
 * Attachment metadata for messages from channels that support file uploads
 */
export interface MessageAttachment {
  type: string
  url: string
  name: string
}

/**
 * Normalized message interface used across all channels
 */
export interface ConversationMessage {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  channel: 'web' | 'email' | 'sms' | 'whatsapp' | 'slack'
  metadata: {
    userId: string
    orgId: string
    threadId?: string
    replyTo?: string
    attachments?: MessageAttachment[]
  }
  timestamp: Date
}

/**
 * Send options for transport-specific behavior
 */
export interface SendOptions {
  threadId?: string
  formatting?: 'plain' | 'markdown' | 'html'
}

/**
 * Agent response wrapper for channel-agnostic formatting
 */
export interface AgentResponse {
  type: 'text' | 'action' | 'error' | 'thinking'
  content: string
  metadata?: {
    toolsCalled?: string[]
    confidence?: number
    approvalId?: string
  }
}

/**
 * Transport interface for sending responses back to channels
 */
export interface ConversationTransport {
  channel: ConversationMessage['channel']
  /**
   * Send a message through this transport
   */
  sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void>
  /**
   * Format agent response in channel-specific way
   */
  formatResponse(agentResponse: AgentResponse): string
}

/**
 * Web transport for server-sent events (existing chat API pattern)
 */
export class WebTransport implements ConversationTransport {
  channel: ConversationMessage['channel'] = 'web'
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null

  constructor(controller?: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller || null
  }

  async sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void> {
    if (!this.controller) {
      logger.warn('[WebTransport] No controller available, message not sent')
      return
    }
    const encoder = new TextEncoder()
    const message = { type: 'message', data: content }
    this.controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`))
  }

  formatResponse(agentResponse: AgentResponse): string {
    if (agentResponse.type === 'error') {
      return `Error: ${agentResponse.content}`
    }
    if (agentResponse.type === 'thinking') {
      return `Thinking: ${agentResponse.content}`
    }
    return agentResponse.content
  }
}

/**
 * WhatsApp transport using Supabase bridge or Meta Graph API
 */
export class WhatsAppTransport implements ConversationTransport {
  channel: ConversationMessage['channel'] = 'whatsapp'
  private supabase: SupabaseClient
  private orgId: string

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase
    this.orgId = orgId
  }

  async sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void> {
    try {
      // Try Baileys bridge first
      const { data: session } = await this.supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('org_id', this.orgId)
        .eq('status', 'connected')
        .limit(1)
        .single()

      if (session) {
        await this.supabase.from('whatsapp_outbox').insert({
          org_id: this.orgId,
          session_id: session.id,
          recipient: threadId,
          body: content,
          status: 'pending',
        })
      }
    } catch (err) {
      logger.warn('[WhatsAppTransport] Failed to send via bridge:', err)
    }
  }

  formatResponse(agentResponse: AgentResponse): string {
    const lines = []
    if (agentResponse.type === 'error') {
      lines.push(`❌ ${agentResponse.content}`)
    } else if (agentResponse.type === 'thinking') {
      lines.push(`🤔 Thinking: ${agentResponse.content.substring(0, 100)}...`)
    } else {
      lines.push(agentResponse.content.substring(0, 1000))
    }

    if (agentResponse.metadata?.toolsCalled?.length) {
      lines.push(`\nUsed: ${agentResponse.metadata.toolsCalled.join(', ')}`)
    }

    return lines.join('\n')
  }
}

/**
 * Email transport (Resend)
 */
export class EmailTransport implements ConversationTransport {
  channel: ConversationMessage['channel'] = 'email'

  async sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void> {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('[EmailTransport] RESEND_API_KEY not configured, skipping send')
      return
    }

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || 'noreply@bitbit.app'

      const isHtml = options?.formatting === 'html' || content.includes('<')
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: [threadId],
        subject: 'BitBit Response',
        ...(isHtml ? { html: content } : { text: content }),
      })

      if (error) {
        logger.warn('[EmailTransport] Resend error:', error)
      }
    } catch (err) {
      logger.warn('[EmailTransport] Failed to send email:', err)
    }
  }

  formatResponse(agentResponse: AgentResponse): string {
    return `Subject: BitBit Response\n\n${agentResponse.content}`
  }
}

/**
 * SMS transport (Telnyx)
 */
export class SMSTransport implements ConversationTransport {
  channel: ConversationMessage['channel'] = 'sms'

  async sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void> {
    if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_MESSAGING_PROFILE_ID) {
      logger.warn('[SMSTransport] TELNYX_API_KEY or TELNYX_MESSAGING_PROFILE_ID not configured, skipping send')
      return
    }

    try {
      // threadId is the phone number
      const formatted = this.formatResponse({ type: 'text', content })
      const result = await sendSMS(threadId, formatted)

      if (!result.success) {
        logger.warn(`[SMSTransport] Failed to send SMS to ${threadId}:`, result.error)
      }
    } catch (err) {
      logger.warn('[SMSTransport] Failed to send SMS:', err)
    }
  }

  formatResponse(agentResponse: AgentResponse): string {
    return agentResponse.content.substring(0, 160)
  }
}

/**
 * Slack transport (Slack Events API)
 */
export class SlackTransport implements ConversationTransport {
  channel: ConversationMessage['channel'] = 'slack'
  private token?: string

  constructor(token?: string) {
    this.token = token
  }

  async sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void> {
    if (!process.env.SLACK_BOT_TOKEN && !this.token) {
      logger.warn('[SlackTransport] SLACK_BOT_TOKEN not configured, skipping send')
      return
    }

    try {
      // threadId is the channel ID
      const formatted = this.formatResponse({ type: 'text', content })
      const result = await sendSlackMessage(threadId, formatted, this.token)

      if (!result) {
        logger.warn(`[SlackTransport] Failed to send Slack message to ${threadId}`)
      }
    } catch (err) {
      logger.warn('[SlackTransport] Failed to send Slack message:', err)
    }
  }

  formatResponse(agentResponse: AgentResponse): string {
    return `>>> ${agentResponse.content}`
  }
}

/**
 * Main router for handling messages from any channel and delegating to agent engine
 */
export class ConversationRouter {
  private transports: Map<ConversationMessage['channel'], ConversationTransport>
  private supabase: SupabaseClient

  constructor(
    transports: Map<ConversationMessage['channel'], ConversationTransport>,
    supabase: SupabaseClient
  ) {
    this.transports = transports
    this.supabase = supabase
  }

  /**
   * Register a transport for a specific channel
   */
  registerTransport(channel: ConversationMessage['channel'], transport: ConversationTransport): void {
    this.transports.set(channel, transport)
  }

  /**
   * Load conversation history from Supabase
   */
  private async loadConversationHistory(threadId: string): Promise<ConversationMessage[]> {
    try {
      const { data, error } = await this.supabase
        .from('conversation_threads')
        .select('*')
        .eq('thread_id', threadId)
        .order('timestamp', { ascending: true })

      if (error) {
        logger.warn('[ConversationRouter] Failed to load history:', error.message)
        return []
      }

      return (data || []).map(row => ({
        id: row.id,
        content: row.content,
        role: row.role,
        channel: row.channel,
        metadata: row.metadata || {},
        timestamp: new Date(row.timestamp),
      }))
    } catch (err) {
      logger.warn('[ConversationRouter] History load error:', err)
      return []
    }
  }

  /**
   * Handle incoming message from any channel
   */
  async handleMessage(
    message: ConversationMessage,
    engineConfig?: Partial<EngineConfig>
  ): Promise<void> {
    const transport = this.transports.get(message.channel)
    if (!transport) {
      logger.error(`[ConversationRouter] No transport registered for channel: ${message.channel}`)
      return
    }

    const threadId = message.metadata.threadId || `thread_${message.metadata.userId}_${Date.now()}`

    try {
      // Load conversation history
      const history = await this.loadConversationHistory(threadId)

      // Build config
      const config: EngineConfig = {
        orgId: message.metadata.orgId,
        supabase: this.supabase,
        skipCostGuard: true, // Multi-channel flows skip cost guard by default
        ...engineConfig,
      }

      // Build context with history
      let contextMessage = message.content
      if (history.length > 2) {
        const historyPreview = history
          .slice(-4)
          .map(m => `${m.role}: ${m.content.substring(0, 100)}`)
          .join('\n')
        contextMessage = `[Conversation Context]\n${historyPreview}\n\n[New Message]\n${message.content}`
      }

      // Run agent and stream responses
      let textBuffer = ''
      const agentStream = runAgentChat(contextMessage, config)

      for await (const event of agentStream) {
        if (event.type === 'content_delta') {
          textBuffer += event.data
        } else if (event.type === 'message') {
          textBuffer = event.data
        } else if (event.type === 'error' || event.type === 'done') {
          if (textBuffer) {
            const agentResponse: AgentResponse = {
              type: event.type === 'error' ? 'error' : 'text',
              content: textBuffer,
            }
            const formatted = transport.formatResponse(agentResponse)
            await transport.sendMessage(threadId, formatted)

            // Store in conversation history
            await this.storeMessage(threadId, {
              id: `msg_${Date.now()}`,
              content: formatted,
              role: 'assistant',
              channel: message.channel,
              metadata: {
                userId: message.metadata.userId,
                orgId: message.metadata.orgId,
                threadId,
              },
              timestamp: new Date(),
            })
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const errorResponse: AgentResponse = {
        type: 'error',
        content: `Failed to process message: ${errorMsg}`,
      }
      await transport.sendMessage(threadId, transport.formatResponse(errorResponse))
    }
  }

  /**
   * Store message in conversation history
   */
  private async storeMessage(threadId: string, message: ConversationMessage): Promise<void> {
    try {
      await this.supabase.from('conversation_threads').insert({
        thread_id: threadId,
        id: message.id,
        content: message.content,
        role: message.role,
        channel: message.channel,
        metadata: message.metadata,
        timestamp: message.timestamp.toISOString(),
        user_id: message.metadata.userId,
        org_id: message.metadata.orgId,
      })
    } catch (err) {
      logger.warn('[ConversationRouter] Failed to store message:', err)
    }
  }
}

/**
 * Create a conversation router with default transports
 */
export function createConversationRouter(
  supabase: SupabaseClient,
  webController?: ReadableStreamDefaultController<Uint8Array>,
  slackToken?: string
): ConversationRouter {
  const transports = new Map<ConversationMessage['channel'], ConversationTransport>([
    ['web', new WebTransport(webController)],
    ['whatsapp', new WhatsAppTransport(supabase, '')],
    ['email', new EmailTransport()],
    ['sms', new SMSTransport()],
    ['slack', new SlackTransport(slackToken)],
  ])

  return new ConversationRouter(transports, supabase)
}
