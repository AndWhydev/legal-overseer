import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler } from '../tools'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool_use format)
// ---------------------------------------------------------------------------

export const superpowerToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description:
      'Search the web for current, real-time information using Brave Search. Use when the user asks about recent events, needs research, or when your training data may be outdated. Write specific search queries — include names, dates, and context for better results. Do NOT use for information you already have from memory or context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query — be specific and include relevant context',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description:
      'Fetch and extract readable text from a URL. Use when the user shares a link or when web_search returns a result that needs deeper reading. Handles HTML (extracts article text), JSON (returns raw), and plain text. Do NOT use for private/authenticated URLs — they will fail.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to fetch (must start with http:// or https://)',
        },
        max_chars: {
          type: 'number',
          description: 'Maximum characters to return (default: 8000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'send_email',
    description:
      'Send an email via Resend on behalf of the user. IMPORTANT: Always confirm the recipient, subject, and body with the user before sending. Supports plain text and HTML. Do NOT send without explicit user approval.',
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
          description: 'Email body (plain text or HTML)',
        },
        reply_to: {
          type: 'string',
          description: 'Optional reply-to address',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_sms',
    description:
      'Send an SMS text message via Telnyx. IMPORTANT: Always confirm the recipient and message with the user before sending. Use E.164 phone format (e.g. +61400123456). Messages over 160 chars are split into segments. Do NOT send without explicit user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number (E.164 format preferred, e.g. +61400123456)',
        },
        message: {
          type: 'string',
          description: 'SMS message text (will be split into segments if >160 chars)',
        },
      },
      required: ['to', 'message'],
    },
  },
]

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const superpowerToolHandlers: Record<string, AgentToolHandler> = {
  async web_search(input) {
    const query = input.query as string
    const count = Math.min((input.count as number) || 5, 10)

    const apiKey = process.env.BRAVE_SEARCH_API_KEY
    if (!apiKey) {
      return { success: false, error: 'Web search not configured: BRAVE_SEARCH_API_KEY not set' }
    }

    try {
      const params = new URLSearchParams({
        q: query,
        count: String(count),
        text_decorations: 'false',
      })

      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      })

      if (!response.ok) {
        const text = await response.text()
        logger.warn('[web_search] Brave API error:', { status: response.status, body: text })
        return { success: false, error: `Search failed: ${response.status}` }
      }

      const data = (await response.json()) as {
        web?: {
          results?: Array<{
            title?: string
            url?: string
            description?: string
            extra_snippets?: string[]
          }>
        }
        query?: { original?: string }
      }

      const results = (data.web?.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.description ?? '',
        extra: r.extra_snippets?.slice(0, 2),
      }))

      return {
        success: true,
        data: {
          query: data.query?.original ?? query,
          results,
          total: results.length,
        },
      }
    } catch (err) {
      logger.error('[web_search] Error:', err)
      return { success: false, error: `Search error: ${String(err)}` }
    }
  },

  async fetch_url(input) {
    const url = input.url as string
    const maxChars = (input.max_chars as number) || 8000

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'URL must start with http:// or https://' }
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'BitBit-Agent/1.0 (https://bitbit.chat)',
          Accept: 'text/html, application/json, text/plain, */*',
        },
        redirect: 'follow',
      })

      clearTimeout(timeout)

      if (!response.ok) {
        return { success: false, error: `Fetch failed: ${response.status} ${response.statusText}` }
      }

      const contentType = response.headers.get('content-type') ?? ''

      // JSON response — return raw
      if (contentType.includes('application/json')) {
        const json = await response.json()
        const text = JSON.stringify(json, null, 2)
        return {
          success: true,
          data: {
            url,
            content_type: 'json',
            content: text.slice(0, maxChars),
            truncated: text.length > maxChars,
          },
        }
      }

      // HTML — extract readable text
      const html = await response.text()
      const text = extractReadableText(html)

      // Try to extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : undefined

      return {
        success: true,
        data: {
          url,
          title,
          content_type: contentType.includes('text/html') ? 'html' : 'text',
          content: text.slice(0, maxChars),
          truncated: text.length > maxChars,
          char_count: text.length,
        },
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: 'Request timed out (15s)' }
      }
      logger.error('[fetch_url] Error:', err)
      return { success: false, error: `Fetch error: ${String(err)}` }
    }
  },

  async send_email(input, orgId) {
    const to = input.to as string
    const subject = input.subject as string
    const body = input.body as string
    const replyTo = input.reply_to as string | undefined

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return { success: false, error: 'Email not configured: RESEND_API_KEY not set' }
    }

    const from = process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat'

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(apiKey)

      // Determine if body is HTML or plain text
      const isHtml = body.includes('<') && body.includes('>')

      const { data, error } = await resend.emails.send({
        from,
        to: [to],
        subject,
        ...(isHtml ? { html: body } : { text: body }),
        ...(replyTo ? { replyTo } : {}),
      })

      if (error) {
        logger.warn('[send_email] Resend error:', error)
        return { success: false, error: `Email send failed: ${error.message}` }
      }

      logger.info('[send_email] Sent email', { to, subject, org: orgId, id: data?.id })

      return {
        success: true,
        data: {
          message_id: data?.id,
          to,
          subject,
          from,
        },
      }
    } catch (err) {
      logger.error('[send_email] Error:', err)
      return { success: false, error: `Email error: ${String(err)}` }
    }
  },

  async send_sms(input, orgId) {
    const to = input.to as string
    const message = input.message as string

    try {
      const { sendSMS } = await import('@/lib/channels/sms')
      const result = await sendSMS(to, message)

      if (!result.success) {
        return { success: false, error: result.error || 'SMS send failed' }
      }

      logger.info('[send_sms] Sent SMS', { to, org: orgId, id: result.messageId })

      return {
        success: true,
        data: {
          message_id: result.messageId,
          to,
        },
      }
    } catch (err) {
      logger.error('[send_sms] Error:', err)
      return { success: false, error: `SMS error: ${String(err)}` }
    }
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract readable text from HTML by stripping tags, scripts, styles, and
 * collapsing whitespace. Lightweight — no external dependency needed.
 */
function extractReadableText(html: string): string {
  let text = html

  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // Remove nav, header, footer elements (usually boilerplate)
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')

  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|article|section)>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n')

  // Convert links to text with URL
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#039;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n\s*\n/g, '\n\n')
  text = text.trim()

  return text
}
