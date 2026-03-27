import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, receiveSMS, sendSMS } from '@/lib/channels/sms'
import type { TelnyxWebhookPayload } from '@/lib/channels/sms'
import { logger } from '@/lib/core/logger'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'
import { getServiceClient } from '@/lib/supabase/service-client'
import { runPipelineToCompletion } from '@/lib/conversation/pipeline-helpers'
import { enrichInboundMessage } from '@/lib/conversation/inbound-enrichment'

/**
 * Telnyx SMS webhook endpoint.
 *
 * Inbound SMS → unified conversation pipeline → agent response → reply SMS.
 * Returns 200 immediately to prevent Telnyx retries, then processes async.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.warn('[webhook/sms] TELNYX_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  try {
    const rawBody = await request.text()

    const signature = request.headers.get('telnyx-signature-ed25519')
    const timestamp = request.headers.get('telnyx-timestamp')

    if (!timestamp || !signature) {
      logger.warn('[webhook/sms] Missing timestamp or signature headers')
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
    }

    const isValid = await verifyWebhookSignature(rawBody, signature, timestamp)
    if (!isValid) {
      logger.warn('[webhook/sms] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let payload: TelnyxWebhookPayload
    try {
      payload = JSON.parse(rawBody) as TelnyxWebhookPayload
    } catch {
      logger.error('[webhook/sms] Invalid JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (payload.data?.event_type !== 'message.received') {
      logger.info('[webhook/sms] Ignoring event type:', payload.data?.event_type)
      return NextResponse.json({ received: true, event_type: payload.data?.event_type })
    }

    const sms = receiveSMS(payload)
    if (!sms) {
      logger.warn('[webhook/sms] Failed to parse SMS payload')
      return NextResponse.json({ error: 'Failed to parse SMS' }, { status: 400 })
    }

    const orgId = await resolveOrgFromWebhook('sms', sms.to)
    if (!orgId) {
      logger.warn(`[webhook/sms] Could not resolve org for to_number=${sms.to}`)
      return NextResponse.json({ received: true, message_id: sms.id })
    }

    const supabase = getServiceClient()

    // Return 200 immediately to Telnyx, process async
    // (Telnyx retries if no 200 within ~2s; pipeline takes 5-20s)
    processSMSThroughPipeline(supabase, orgId, sms.from, sms.text, sms.id).catch(err => {
      logger.error('[webhook/sms] Async pipeline processing failed', {
        error: err instanceof Error ? err.message : String(err),
        messageId: sms.id,
      })
    })

    return NextResponse.json({ received: true, message_id: sms.id })
  } catch (err) {
    logger.error('[webhook/sms] Unexpected error:', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

/**
 * Process inbound SMS through the unified conversation pipeline,
 * then send the agent's response back as an SMS reply.
 *
 * Also writes to channel_messages for unified inbox visibility
 * and runs intelligence-layer enrichment (entity resolution,
 * timeline writing, relationship linking).
 */
async function processSMSThroughPipeline(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  fromPhone: string,
  text: string,
  messageId: string,
): Promise<void> {
  logger.info('[webhook/sms] Processing through unified pipeline', { fromPhone, orgId, messageId })

  // Write to channel_messages for unified inbox visibility.
  // Use upsert on external_id to prevent duplicates from Telnyx retries.
  const { data: channelMsg } = await supabase
    .from('channel_messages')
    .upsert({
      org_id: orgId,
      channel: 'sms',
      external_id: messageId,
      sender: fromPhone,
      sender_email: fromPhone,
      subject: 'SMS Message',
      body: text,
      received_at: new Date().toISOString(),
      is_actionable: true,
      priority: 'medium',
      metadata: { source: 'telnyx' },
    }, { onConflict: 'org_id,channel,external_id' })
    .select('id')
    .single()

  // Fire-and-forget: enrich with entity resolution, timeline,
  // relationship linking (unified pipeline intelligence layer)
  if (channelMsg) {
    enrichInboundMessage(supabase, {
      messageId: channelMsg.id as string,
      orgId,
      channel: 'sms',
      senderIdentifier: fromPhone,
      senderName: null,
      subject: null,
      body: text,
      priority: 'medium',
    }).catch(err => {
      logger.error('[webhook/sms] Enrichment failed (non-fatal):', err)
    })
  }

  const result = await runPipelineToCompletion(supabase, {
    content: text,
    channel: 'sms',
    channelIdentifier: {
      channelType: 'sms',
      channelIdentifier: fromPhone,
    },
    orgId,
    channelMetadata: { externalId: messageId },
  })

  if (!result.success || !result.responseContent) {
    logger.warn('[webhook/sms] Pipeline produced no response', {
      success: result.success,
      error: result.error,
      messageId,
    })
    return
  }

  // Send response SMS back to sender
  const sendResult = await sendSMS(fromPhone, result.responseContent)
  if (sendResult.success) {
    logger.info('[webhook/sms] Reply SMS sent', {
      to: fromPhone,
      threadId: result.threadId,
      responseLength: result.responseContent.length,
    })
  } else {
    logger.error('[webhook/sms] Reply SMS failed', {
      to: fromPhone,
      error: sendResult.error,
    })
  }
}
