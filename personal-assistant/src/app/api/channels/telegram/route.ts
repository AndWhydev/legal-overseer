import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeCompare } from '@/lib/security/webhook-verification'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'
import { resolveChannelIdentity } from '@/lib/conversation/identity-resolver'
import { handleGatewayMessage } from '@/lib/channels/gateway-handler'
import { sendTelegramMessage } from '@/lib/channels/telegram'
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
  const senderName = message.from?.first_name || message.from?.username || chatId

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    logger.error('[webhook/telegram] Missing Supabase env vars')
    return NextResponse.json({ ok: true })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Try resolving via channel_identities first
  let identity: { userId: string; orgId: string; displayName?: string } | null = null

  const channelIdentity = await resolveChannelIdentity(supabase, {
    channelType: 'telegram' as never,
    channelIdentifier: chatId,
  })

  if (channelIdentity) {
    identity = {
      userId: channelIdentity.userId,
      orgId: channelIdentity.orgId,
      displayName: channelIdentity.displayName,
    }
  } else {
    // Fallback: try resolving org from legacy webhook credentials
    const orgId = await resolveOrgFromWebhook('telegram', chatId)
    if (orgId) {
      identity = {
        userId: 'system',
        orgId,
        displayName: senderName,
      }
    }
  }

  if (!identity) {
    logger.warn(`[webhook/telegram] No identity resolved for chat_id=${chatId}`)
    after(async () => {
      await sendTelegramMessage(
        chatId,
        "I don't recognize this chat yet — link your Telegram in BitBit settings to get started",
      )
    })
    return NextResponse.json({ ok: true })
  }

  const resolvedIdentity = identity

  // Use next/server after() to keep the function alive after returning 200.
  // This lets Telegram get a fast response while the pipeline runs.
  after(async () => {
    try {
      await handleGatewayMessage({
        channel: 'telegram',
        text,
        identity: {
          userId: resolvedIdentity.userId,
          orgId: resolvedIdentity.orgId,
          displayName: resolvedIdentity.displayName,
        },
        replyTo: chatId,
      })
    } catch (err) {
      logger.error('[telegram] Gateway handler background error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return NextResponse.json({ ok: true })
}
