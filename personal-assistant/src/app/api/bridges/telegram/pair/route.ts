import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/bridges/telegram/pair
 *
 * Mints a one-time pairing code for the current user's org, records it on an
 * `org_connections` row (provider=telegram, status=provisioning), and returns
 * a `t.me/<bot>?start=<code>` deep-link. The Telegram webhook at
 * /api/webhooks/telegram consumes the code and flips status to connected.
 *
 * Telegram is intentionally not part of the Fly-machine bridge flow — it has
 * no per-user infra, just a shared bot. That keeps cost at zero but means we
 * need our own pairing endpoint rather than `/api/bridges/provision`.
 */
export async function POST() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 5 pair requests per 5 min per user — prevents UI retry storms from
  // blowing up org_connections writes + locks the user out gracefully.
  const rateLimited = checkUserEndpointLimit(user.id, '/api/bridges/telegram/pair')
  if (rateLimited) return rateLimited

  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  if (!botUsername) {
    logger.error('[telegram-pair] TELEGRAM_BOT_USERNAME not configured')
    return NextResponse.json(
      { error: 'Telegram pairing not configured on this environment' },
      { status: 503 },
    )
  }

  const orgId = await getActiveOrgId(supabase, user.id)
  // Short, URL-safe, unambiguous code: 10 chars of base32-ish alphabet.
  // Case-insensitive when consumed (see webhook), so letters-only is fine.
  const code = crypto
    .randomBytes(8)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 10)
    .toUpperCase()

  // Reuse an existing telegram connection row if one is mid-provisioning —
  // we just refresh the pairing code and timestamp.
  const { data: existing } = await supabase
    .from('org_connections')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('provider', 'telegram')
    .maybeSingle()

  if (existing?.status === 'connected') {
    return NextResponse.json({ error: 'Telegram is already connected' }, { status: 409 })
  }

  const connectionConfig = {
    pairing_code: code,
    pairing_code_issued_at: new Date().toISOString(),
    // Codes expire after 10 minutes — matches mautrix QR expiry so the UX is
    // consistent across surfaces.
    pairing_code_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    user_id: user.id,
    linked_at: null as string | null,
  }

  let connectionId: string

  if (existing) {
    connectionId = existing.id
    await supabase
      .from('org_connections')
      .update({
        status: 'provisioning',
        config: connectionConfig,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
  } else {
    const { data: inserted, error } = await supabase
      .from('org_connections')
      .insert({
        org_id: orgId,
        provider: 'telegram',
        display_name: 'Telegram',
        transport: 'webhook',
        capabilities: ['push', 'send', 'webhook'],
        status: 'provisioning',
        config: connectionConfig,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      logger.error('[telegram-pair] Failed to create connection', { error: error?.message })
      return NextResponse.json({ error: error?.message ?? 'Failed to create connection' }, { status: 500 })
    }
    connectionId = inserted.id
  }

  return NextResponse.json({
    connection_id: connectionId,
    code,
    bot_url: `https://t.me/${botUsername}?start=${code}`,
  })
}
