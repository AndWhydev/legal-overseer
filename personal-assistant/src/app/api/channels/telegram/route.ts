import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleTelegramMessage } from '@/lib/channels/telegram-handler'
import { timingSafeCompare } from '@/lib/security/webhook-verification'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'
import { enrichInboundMessage } from '@/lib/conversation/inbound-enrichment'
import { after } from 'next/server'
import { logger } from '@/lib/core/logger'

// Allow up to 60s for agent engine response
export const maxDuration = 60

interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number }
    from?: { id: number; first_name?: string; username?: string }
    text?: string
  }
}

export async function POST(request: NextRequest) {
  // Verify webhook secret (skip if TELEGRAM_WEBHOOK_SECRET not configured)
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const secret = request.headers.get('x-telegram-bot-api-secret-token')
    if (!secret || !timingSafeCompare(secret, expectedSecret)) {
      logger.warn('[webhook/telegram] secret mismatch')
      return NextResponse.json({ ok: false }, { status: 403 })
    }
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    logger.error('[webhook/telegram] invalid JSON')
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const message = update.message
  if (!message?.text) {
    // Ignore non-text messages (stickers, photos, etc.)
    return NextResponse.json({ ok: true })
  }

  const chatId = String(message.chat.id)
  const text = message.text
  const messageId = String(message.message_id)

  // Resolve org from Telegram webhook credentials
  const orgId = await resolveOrgFromWebhook('telegram', chatId)
  if (!orgId) {
    logger.warn(
      `[webhook/telegram] Could not resolve org for chat_id=${chatId}. Make sure Telegram channel is configured in channel_credentials.`
    )
    // Return 200 to prevent Telegram from retrying, but don't process
    return NextResponse.json({ ok: true })
  }

  // Store in channel_messages
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const senderName = message.from?.first_name || message.from?.username || chatId

    const { data: insertedMsg } = await supabase.from('channel_messages').insert({
      org_id: orgId,
      channel: 'telegram',
      external_id: messageId,
      sender: senderName,
      sender_email: chatId, // used for reply routing
      body: text,
      received_at: new Date().toISOString(),
      metadata: {
        chat_id: chatId,
        from: message.from,
      },
    }).select('id').single()

    // Fire-and-forget: enrich with entity resolution, timeline,
    // relationship linking (unified pipeline intelligence layer)
    if (insertedMsg) {
      enrichInboundMessage(supabase, {
        messageId: insertedMsg.id as string,
        orgId,
        channel: 'telegram',
        senderIdentifier: chatId,
        senderName,
        subject: null,
        body: text,
        priority: 'medium',
      }).catch(err => {
        logger.error('[webhook/telegram] Enrichment failed (non-fatal):', err)
      })
    }
  }

  // Use next/server after() to keep the function alive after returning 200.
  // This lets Telegram get a fast response while the agent engine runs.
  after(async () => {
    try {
      await handleTelegramMessage(orgId, chatId, text)
    } catch (err) {
      logger.error('[telegram] Handler background error', { error: err instanceof Error ? err.message : String(err) })
    }
  })

  return NextResponse.json({ ok: true })
}
