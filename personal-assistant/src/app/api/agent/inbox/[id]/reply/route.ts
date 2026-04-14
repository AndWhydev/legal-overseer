import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelType } from '@/lib/channels/types'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id, userId: user.id }
}

async function sendViaChannel(
  channel: ChannelType,
  to: string,
  body: string,
  subject: string | undefined,
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ success: boolean; error?: string }> {
  switch (channel) {
    case 'gmail': {
      const { getOrgCredential } = await import('@/lib/integrations/credentials')
      const creds = await getOrgCredential(supabase, orgId, 'gmail') as { access_token?: string; refresh_token?: string; client_id?: string; client_secret?: string; token_expires_at?: string } | null
      if (!creds?.access_token) return { success: false, error: 'Gmail not configured' }

      const { refreshGmailToken } = await import('@/lib/channels/gmail')
      const token = await refreshGmailToken(supabase, orgId, creds as Parameters<typeof refreshGmailToken>[2])
      if (!token) return { success: false, error: 'Failed to refresh Gmail token' }

      const rawMessage = [
        `To: ${to}`,
        `Subject: Re: ${subject || ''}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n')

      const encoded = Buffer.from(rawMessage).toString('base64url')

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded }),
      })

      if (!res.ok) {
        const text = await res.text()
        return { success: false, error: `Gmail send failed (${res.status}): ${text}` }
      }
      return { success: true }
    }

    case 'outlook': {
      const { sendOutlookMessage } = await import('@/lib/channels/outlook')
      const result = await sendOutlookMessage(supabase, orgId, to, `Re: ${subject || ''}`, body)
      if ('error' in result) return { success: false, error: result.error }
      return { success: true }
    }

    case 'whatsapp': {
      const { sendMessage } = await import('@/lib/channels/whatsapp')
      const messageId = await sendMessage(to, body)
      return messageId ? { success: true } : { success: false, error: 'WhatsApp send failed' }
    }

    case 'sms': {
      const { sendSMS } = await import('@/lib/channels/sms')
      const result = await sendSMS(to, body)
      return result
    }

    case 'telegram': {
      const { sendTelegramMessage } = await import('@/lib/channels/telegram')
      const ok = await sendTelegramMessage(to, body)
      return ok ? { success: true } : { success: false, error: 'Telegram send failed' }
    }

    case 'facebook': {
      const { sendMessage } = await import('@/lib/channels/facebook-messenger')
      const messageId = await sendMessage(to, body)
      return messageId ? { success: true } : { success: false, error: 'Facebook send failed' }
    }

    case 'instagram': {
      const { sendMessage } = await import('@/lib/channels/instagram')
      const messageId = await sendMessage(to, body)
      return messageId ? { success: true } : { success: false, error: 'Instagram send failed' }
    }

    case 'slack': {
      const { sendSlackMessage } = await import('@/lib/channels/slack')
      const messageId = await sendSlackMessage(to, body)
      return messageId ? { success: true } : { success: false, error: 'Slack send failed' }
    }

    case 'imessage': {
      // Try BlueBubbles provider first (production path)
      const { data: imConn } = await supabase
        .from('org_connections')
        .select('id, config')
        .eq('org_id', orgId)
        .eq('provider', 'imessage')
        .eq('status', 'connected')
        .limit(1)
        .single()

      if (imConn?.config?.bb_server_url) {
        const cfg = imConn.config as { bb_server_url: string; bb_password: string }
        const bbUrl = cfg.bb_server_url.replace(/\/$/, '')
        const chatGuid = `iMessage;-;${to}`
        const tempGuid = `bitbit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        const bbRes = await fetch(
          `${bbUrl}/api/v1/message/text?password=${cfg.bb_password}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatGuid, tempGuid, message: body }),
          },
        )
        return bbRes.ok ? { success: true } : { success: false, error: `iMessage send failed: ${bbRes.status}` }
      }

      // Fallback: legacy macbook-bridge (dev only)
      const { sendIMessage } = await import('@/lib/channels/macbook-bridge')
      const ok = await sendIMessage(to, body)
      return ok ? { success: true } : { success: false, error: 'iMessage send failed' }
    }

    default:
      return { success: false, error: `Reply not supported for channel: ${channel}` }
  }
}

/**
 * POST /api/agent/inbox/[id]/reply — send a reply to an inbox message
 * Body: { body: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const reqBody = await request.json()
  const { body } = reqBody as { body: string }

  if (!body?.trim()) {
    return NextResponse.json({ error: 'Reply body is required' }, { status: 400 })
  }

  // Look up the original message
  const { data: message, error: msgErr } = await ctx.supabase
    .from('channel_messages')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (msgErr || !message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const channel = message.channel as ChannelType
  const replyTo = message.sender_email || message.sender

  logger.info('[inbox-reply] Sending reply', { id, channel, replyTo, bodyLength: body.length })

  const result = await sendViaChannel(channel, replyTo, body, message.subject, ctx.supabase, ctx.orgId)

  if (!result.success) {
    logger.error('[inbox-reply] Send failed', { id, channel, error: result.error })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Record the reply as an outgoing message
  await ctx.supabase.from('channel_messages').insert({
    org_id: ctx.orgId,
    channel,
    external_id: `reply-${id}-${Date.now()}`,
    sender: 'BitBit',
    sender_email: '',
    subject: message.subject ? `Re: ${message.subject}` : undefined,
    body: body.slice(0, 2000),
    received_at: new Date().toISOString(),
    processed: true,
    metadata: { type: 'outgoing', in_reply_to: id, recipient: replyTo },
  })

  logger.info('[inbox-reply] Reply sent successfully', { id, channel })
  return NextResponse.json({ success: true })
}
