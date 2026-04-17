import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { initiateConnectionByAppKey, disconnectAccount, isComposioEnabled } from '@/lib/composio'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/composio/connect
 *
 * Initiate a Composio OAuth flow for any app in the Composio catalog.
 * Body: { appKey: string }
 * Returns: { redirectUrl: string, connectionRequestId: string }
 *
 * Reconnect behavior: if a row already exists for (org_id, appKey) we first
 * revoke the upstream Composio account and disable the local row, so the
 * new OAuth flow starts clean and the user can pick a different account.
 * Combined with `auth_params.prompt=select_account`, this forces Google
 * (and other providers that honor the OIDC `prompt` parameter) to re-show
 * the account picker instead of auto-approving from an existing session.
 */
export async function POST(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isComposioEnabled()) {
    return NextResponse.json(
      { error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' },
      { status: 503 },
    )
  }

  let body: { appKey: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { appKey } = body
  if (!appKey || typeof appKey !== 'string') {
    return NextResponse.json({ error: 'appKey is required' }, { status: 400 })
  }

  // Pre-clean stale connection so the user can actually switch accounts.
  // The old Composio connected_account is revoked remotely; the local row
  // is disabled and will be replaced by the callback with a fresh one.
  const { data: existing } = await ctx.supabase
    .from('org_connections')
    .select('id, connected_account_id, config')
    .eq('org_id', ctx.orgId)
    .eq('provider', appKey)
    .eq('transport', 'composio')
    .maybeSingle()

  if (existing) {
    const staleAccountId =
      (existing.connected_account_id as string | null) ??
      ((existing.config as Record<string, string | undefined> | null)?.composio_connected_account_id ?? null)

    if (staleAccountId) {
      try {
        await disconnectAccount(staleAccountId)
      } catch (err) {
        // Non-fatal — we still want to issue the new connect.
        logger.warn('[composio/connect] Pre-clean disconnectAccount failed', {
          appKey, staleAccountId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    await ctx.supabase
      .from('org_connections')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'
  const callbackUrl = `${appUrl}/api/connections/composio/callback`

  // OIDC `prompt=select_account` forces Google / Microsoft / etc. to
  // re-show the account picker on reconnect. Composio forwards this via
  // `connection.auth_params` to the upstream OAuth URL.
  const result = await initiateConnectionByAppKey(
    ctx.orgId,
    appKey,
    callbackUrl,
    { prompt: 'select_account' },
  )

  if (!result) {
    return NextResponse.json(
      { error: `Failed to initiate connection for "${appKey}".` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    redirectUrl: result.redirectUrl,
    connectionRequestId: result.connectionRequestId,
  })
}
