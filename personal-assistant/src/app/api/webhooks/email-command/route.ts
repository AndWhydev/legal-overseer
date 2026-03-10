import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processEmailCommand } from '@/lib/channels/email-command'
import type { ChannelMessage } from '@/lib/channels/types'
import { logger } from '@/lib/core/logger'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'
import { verifyEmailWebhookSignature } from '@/lib/channels/email-command-verify'

/**
 * Email command webhook endpoint.
 *
 * Receives inbound email notifications and processes them as agent commands.
 * Supports multiple email providers (Gmail, Outlook, etc.) via unified ChannelMessage format.
 *
 * Expected POST payload (from email provider):
 * {
 *   "sender": "user@example.com",
 *   "senderName": "User Name",
 *   "subject": "[BitBit] Create task for me",
 *   "body": "Please create a task to follow up with Steve about the invoice.",
 *   "messageId": "unique-id",
 *   "receivedAt": "2024-01-15T10:30:00Z"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Read raw body text for signature verification before parsing
    const rawBody = await request.text()

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET
    if (webhookSecret) {
      const signature = request.headers.get('x-webhook-signature') || ''
      if (!verifyEmailWebhookSignature(rawBody, signature, webhookSecret)) {
        logger.warn('[webhook/email-command] Invalid webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Parse request body from raw text
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      logger.error('[webhook/email-command] Failed to parse JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Validate required fields
    const sender = String(payload.sender || payload.senderName || 'Unknown').trim()
    const senderEmail = String(payload.senderEmail || payload.sender || '').trim()
    const subject = String(payload.subject || '(no subject)').trim()
    const body = String(payload.body || '').trim()
    const messageId = String(payload.messageId || `webhook-${Date.now()}`).trim()

    if (!senderEmail) {
      logger.warn('[webhook/email-command] Missing sender email')
      return NextResponse.json({ error: 'Missing sender email' }, { status: 400 })
    }

    if (!subject && !body) {
      logger.warn('[webhook/email-command] Missing both subject and body')
      return NextResponse.json({ error: 'Missing subject and body' }, { status: 400 })
    }

    // Extract orgId from payload, or resolve from email domain
    let orgId = String(payload.orgId || '').trim()

    if (!orgId) {
      // Try to resolve org from email channel credentials using domain
      const emailDomain = senderEmail.split('@')[1]
      orgId = (await resolveOrgFromWebhook('email', emailDomain)) || ''
    }

    if (!orgId) {
      logger.warn(
        `[webhook/email-command] Could not resolve org for sender ${senderEmail}. Either pass orgId in payload or configure email channel in channel_credentials.`
      )
      return NextResponse.json(
        { error: 'Could not resolve organization for this email address' },
        { status: 400 }
      )
    }

    logger.info('[webhook/email-command] Received command from', senderEmail, `(${subject.slice(0, 50)})`)

    // Construct ChannelMessage
    const email: ChannelMessage = {
      id: `email-cmd-${messageId}`,
      channel: 'gmail', // Default to gmail; could be parameterized
      externalId: messageId,
      sender,
      senderEmail,
      subject,
      body,
      receivedAt: payload.receivedAt ? new Date(String(payload.receivedAt)) : new Date(),
      isActionable: true,
      priority: 'high',
      metadata: {
        provider: payload.provider || 'webhook',
        messageId,
      },
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      logger.error('[webhook/email-command] Supabase credentials not configured')
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Process the email command
    const result = await processEmailCommand(supabase, orgId, email)

    if (!result.success) {
      logger.warn('[webhook/email-command] Command processing failed:', result.error)
      return NextResponse.json(
        { error: result.error, messageId },
        { status: result.error?.includes('does not appear') ? 400 : 500 }
      )
    }

    logger.info('[webhook/email-command] Command processed successfully')
    return NextResponse.json({
      received: true,
      messageId,
      processed: result.success,
      emailQueued: result.emailQueued,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[webhook/email-command] Unexpected error:', errorMsg)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
