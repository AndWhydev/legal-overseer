import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleTelegramMessage } from '@/lib/channels/telegram-handler'
import { timingSafeCompare } from '@/lib/security/webhook-verification'
import { after } from 'next/server'

const DEFAULT_ORG_ID = '289083e9-2143-44eb-9b6a-cfc615f1e81c'

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
      console.warn('Telegram webhook: secret mismatch')
      return NextResponse.json({ ok: false }, { status: 403 })
    }
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
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
  const orgId = process.env.DEFAULT_ORG_ID || DEFAULT_ORG_ID

  // Store in channel_messages
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey)
    await supabase.from('channel_messages').insert({
      org_id: orgId,
      channel: 'telegram',
      external_id: messageId,
      sender: message.from?.first_name || message.from?.username || chatId,
      sender_email: chatId, // used for reply routing
      body: text,
      received_at: new Date().toISOString(),
      metadata: {
        chat_id: chatId,
        from: message.from,
      },
    })
  }

  // Use next/server after() to keep the function alive after returning 200.
  // This lets Telegram get a fast response while the agent engine runs.
  after(async () => {
    try {
      await handleTelegramMessage(orgId, chatId, text)
    } catch (err) {
      console.error('Telegram handler background error:', err)
    }
  })

  return NextResponse.json({ ok: true })
}
