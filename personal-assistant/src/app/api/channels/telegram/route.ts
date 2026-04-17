import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { timingSafeCompare } from '@/lib/security/webhook-verification'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'
import { resolveChannelIdentity, linkChannelIdentity } from '@/lib/conversation/identity-resolver'
import { handleGatewayMessage } from '@/lib/channels/gateway-handler'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { after } from 'next/server'
import { logger } from '@/lib/core/logger'

/**
 * `/start <code>` payload from our onboarding pairing flow. The code is minted
 * by /api/bridges/telegram/pair and stored on `org_connections.config.pairing_code`.
 */
async function consumePairingCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any, any, any>,
  chatId: string,
  code: string,
  senderName: string,
): Promise<{ orgId: string; userId: string } | null> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, org_id, config, status')
    .eq('provider', 'telegram')
    .eq('status', 'provisioning')
    .filter('config->>pairing_code', 'eq', normalized)
    .maybeSingle()

  if (!conn) return null

  const config = conn.config as {
    pairing_code_expires_at?: string
    user_id?: string
  }

  if (config.pairing_code_expires_at && new Date(config.pairing_code_expires_at) < new Date()) {
    await supabase
      .from('org_connections')
      .update({ status: 'error', last_error: 'Pairing code expired' })
      .eq('id', conn.id)
    return null
  }

  const userId = config.user_id ?? 'system'

  // Link the telegram chat_id to this org for future messages, then mark the
  // connection as connected so /api/bridges/telegram/status returns `linked`.
  await linkChannelIdentity(
    supabase,
    userId,
    conn.org_id,
    { channelType: 'telegram', channelIdentifier: chatId } as never,
    { displayName: senderName, verified: true },
  )

  const linkedAt = new Date().toISOString()
  await supabase
    .from('org_connections')
    .update({
      status: 'connected',
      config: {
        ...config,
        chat_id: chatId,
        linked_at: linkedAt,
        // Scrub the used code so it can't be replayed.
        pairing_code: null,
        pairing_code_expires_at: null,
      },
      last_error: null,
      updated_at: linkedAt,
    })
    .eq('id', conn.id)

  return { orgId: conn.org_id, userId }
}

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

  // Pairing handshake: `/start <CODE>` from our onboarding pairing flow.
  // Must run before identity resolution — the chat_id has no identity yet,
  // that's the whole point of the code. Consuming it creates the link.
  const startMatch = text.match(/^\/start\s+([A-Z0-9]{4,20})\s*$/i)
  if (startMatch) {
    const paired = await consumePairingCode(supabase, chatId, startMatch[1], senderName)
    if (paired) {
      logger.info('[webhook/telegram] Pairing consumed', { chatId, orgId: paired.orgId })
      after(async () => {
        await sendTelegramMessage(
          chatId,
          "You're all set! Your BitBit is listening — send me anything and I'll get to work.",
        )
      })
      return NextResponse.json({ ok: true })
    }
    // Fall through if code was invalid/expired — treat as an unknown chat and
    // let the default unrecognised-chat reply fire below.
  }

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
