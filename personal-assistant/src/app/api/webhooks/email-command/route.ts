import { NextRequest, NextResponse } from 'next/server'
import { isCommandEmail, formatEmailResponse } from '@/lib/channels/email-command'
import { sendCommandReplyEmail } from '@/lib/email/email-transport'
import type { ChannelMessage } from '@/lib/channels/types'
import { logger } from '@/lib/core/logger'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'
import { verifyEmailWebhookSignature } from '@/lib/channels/email-command-verify'
import { getServiceClient } from '@/lib/supabase/service-client'
import { runPipelineToCompletion } from '@/lib/conversation/pipeline-helpers'

/**
 * Email command webhook endpoint.
 *
 * Inbound email → unified conversation pipeline → agent response → reply email.
 * Thread persistence, memory extraction, and RAG embedding all handled by pipeline.
 */
export async function POST(request: NextRequest) {
  try {
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

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      logger.error('[webhook/email-command] Failed to parse JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

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

    let orgId = String(payload.orgId || '').trim()

    if (!orgId) {
      const emailDomain = senderEmail.split('@')[1]
      orgId = (await resolveOrgFromWebhook('email', emailDomain)) || ''
    }

    if (!orgId) {
      logger.warn(`[webhook/email-command] Could not resolve org for sender ${senderEmail}`)
      return NextResponse.json(
        { error: 'Could not resolve organization for this email address' },
        { status: 400 }
      )
    }

    // Check if this is a command email
    const email: ChannelMessage = {
      id: `email-cmd-${messageId}`,
      channel: 'gmail',
      externalId: messageId,
      sender,
      senderEmail,
      subject,
      body,
      receivedAt: payload.receivedAt ? new Date(String(payload.receivedAt)) : new Date(),
      isActionable: true,
      priority: 'high',
      metadata: { provider: payload.provider || 'webhook', messageId },
    }

    if (!isCommandEmail(email)) {
      return NextResponse.json(
        { error: 'Email does not appear to be a command (missing command prefix)' },
        { status: 400 }
      )
    }

    logger.info('[webhook/email-command] Processing command from', senderEmail, `(${subject.slice(0, 50)})`)

    const supabase = getServiceClient()

    // Construct command text from subject + body
    const commandText = [subject.replace(/^\[BitBit\]\s*/i, '').replace(/^!\s*/, ''), body]
      .filter(Boolean)
      .join('\n\n')

    // Route through unified conversation pipeline
    const result = await runPipelineToCompletion(supabase, {
      content: commandText,
      channel: 'email',
      channelIdentifier: {
        channelType: 'email',
        channelIdentifier: senderEmail,
      },
      orgId,
      channelMetadata: {
        externalId: messageId,
        subject,
      },
    })

    if (!result.success || !result.responseContent) {
      logger.warn('[webhook/email-command] Pipeline produced no response', {
        success: result.success,
        error: result.error,
      })
      return NextResponse.json(
        { error: result.error || 'Agent produced no response', messageId },
        { status: 500 }
      )
    }

    // Format and send reply email
    const emailResponse = formatEmailResponse(result.responseContent, senderEmail)
    const sent = await sendCommandReplyEmail(senderEmail, emailResponse.subject, emailResponse.htmlBody)

    if (!sent) {
      logger.warn('[webhook/email-command] Email send failed, response was generated but not delivered')
    }

    logger.info('[webhook/email-command] Command processed via unified pipeline', {
      threadId: result.threadId,
      emailQueued: sent,
    })

    return NextResponse.json({
      received: true,
      messageId,
      processed: true,
      emailQueued: sent,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[webhook/email-command] Unexpected error:', errorMsg)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
