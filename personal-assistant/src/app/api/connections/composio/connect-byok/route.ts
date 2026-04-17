import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import {
  connectWithCredentials,
  disconnectAccount,
  invalidateComposioToolCache,
  isComposioEnabled,
} from '@/lib/composio'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/composio/connect-byok
 *
 * Connect a Composio toolkit using user-supplied credentials (API key,
 * client_id + client_secret, etc.). Unlike the OAuth flow there's no
 * redirect — on success the connected_account is created + ACTIVE
 * immediately and we persist the org_connection row inline.
 *
 * Body:
 *   {
 *     appKey: string                          e.g. "perplexityai"
 *     credentials: Record<string, string>     whatever fields the scheme requires
 *     authScheme?: string                     optional override, defaults to 'API_KEY'
 *   }
 * Returns: { connectionId: string }
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
    return NextResponse.json({ error: 'Composio not configured' }, { status: 503 })
  }

  let body: {
    appKey?: string
    credentials?: Record<string, string>
    authScheme?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const appKey = body.appKey
  const credentials = body.credentials
  const authScheme = body.authScheme || 'API_KEY'

  if (!appKey || typeof appKey !== 'string') {
    return NextResponse.json({ error: 'appKey is required' }, { status: 400 })
  }
  if (!credentials || typeof credentials !== 'object' || Object.keys(credentials).length === 0) {
    return NextResponse.json({ error: 'credentials is required' }, { status: 400 })
  }

  // Use the service-role client for writes (same pattern as the OAuth
  // callback). RLS would otherwise block the row upsert from a
  // user-bound client.
  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }
  const supabase = getServiceClient()

  // Look up any existing row (connected, disabled, whatever). We'll
  // update it in place if found, insert otherwise. The table doesn't
  // have a UNIQUE(org_id, provider) constraint so upsert+onConflict
  // breaks — a plain SELECT→UPDATE/INSERT works regardless.
  const { data: existing } = await supabase
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
      try { await disconnectAccount(staleAccountId) } catch { /* best-effort */ }
    }
  }

  const result = await connectWithCredentials(ctx.orgId, appKey, credentials, authScheme)
  if (!result) {
    return NextResponse.json(
      { error: 'Those credentials didn\'t work. Double-check and try again.' },
      { status: 400 },
    )
  }

  const displayName = appKey.charAt(0).toUpperCase() + appKey.slice(1)
  const nowIso = new Date().toISOString()

  // BYOK connections (API_KEY, BASIC, BEARER, etc.) return status=ACTIVE
  // from Composio immediately — no OAuth redirect, no webhook callback,
  // no trigger to register. So we land `status='connected'` inline
  // instead of going through ConnectorManager.activate(), which is built
  // around the OAuth-callback control flow and expects a full row.
  const rowData = {
    org_id: ctx.orgId,
    provider: appKey,
    display_name: displayName,
    transport: 'composio',
    status: 'connected',
    capabilities: ['pull', 'send'],
    connected_account_id: result.connectedAccountId,
    config: {
      composio_connected_account_id: result.connectedAccountId,
      composio_toolkit: appKey,
      auth_scheme: authScheme,
      connected_at: nowIso,
    },
    last_sync_at: nowIso,
    consecutive_failures: 0,
    last_error: null,
    trigger_ids: [],
    updated_at: nowIso,
  }

  const writeOp = existing
    ? supabase.from('org_connections').update(rowData).eq('id', existing.id)
    : supabase.from('org_connections').insert(rowData)

  const { data: row, error: writeErr } = await writeOp.select('id').single()

  if (writeErr || !row) {
    logger.error('[composio/connect-byok] Write failed', {
      orgId: ctx.orgId, appKey, error: writeErr?.message,
    })
    // Best-effort cleanup of the upstream account so we don't leak it.
    try { await disconnectAccount(result.connectedAccountId) } catch { /* noop */ }
    return NextResponse.json(
      { error: `Couldn't connect ${displayName}. Try again.` },
      { status: 500 },
    )
  }

  // Invalidate the tool cache so the agent picks up the new connection
  // on its next turn without waiting for the 5-minute TTL.
  invalidateComposioToolCache(ctx.orgId)

  logger.info('[composio/connect-byok] Connected', {
    orgId: ctx.orgId, appKey, connectionId: row.id, accountId: result.connectedAccountId,
  })

  return NextResponse.json({ connectionId: row.id, status: 'connected' })
}
