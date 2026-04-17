import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import { connectWithCredentials, disconnectAccount, isComposioEnabled } from '@/lib/composio'
import { createConnectorManager } from '@/lib/connectors'
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

  // Pre-clean any stale connection — same pattern as the OAuth route.
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
      { error: 'Could not verify those credentials. Double-check them and try again.' },
      { status: 400 },
    )
  }

  // Upsert the org_connection row — mirrors the OAuth callback path so the
  // agent side sees the connection through the usual ConnectorManager flow.
  const displayName = appKey.charAt(0).toUpperCase() + appKey.slice(1)
  const { data: row, error: upsertErr } = await supabase
    .from('org_connections')
    .upsert(
      {
        org_id: ctx.orgId,
        provider: appKey,
        display_name: displayName,
        transport: 'composio',
        status: 'provisioning',
        capabilities: ['pull', 'send'],
        connected_account_id: result.connectedAccountId,
        config: {
          composio_connected_account_id: result.connectedAccountId,
          composio_toolkit: appKey,
          auth_scheme: authScheme,
        },
      },
      { onConflict: 'org_id,provider' },
    )
    .select()
    .single()

  if (upsertErr || !row) {
    logger.error('[composio/connect-byok] Failed to upsert org_connection', {
      orgId: ctx.orgId, appKey, error: upsertErr?.message,
    })
    // Best-effort cleanup of the upstream account so we don't leak it.
    try { await disconnectAccount(result.connectedAccountId) } catch { /* noop */ }
    return NextResponse.json(
      { error: 'We saved your credentials but couldn\'t finish setting up the connection. Try again in a moment.' },
      { status: 500 },
    )
  }

  try {
    const manager = createConnectorManager(supabase, { skipBridge: true })
    await manager.activate(row as never, {
      accountId: result.connectedAccountId,
      metadata: { toolkit: appKey, status: result.status } as Record<string, unknown>,
    })
  } catch (err) {
    logger.warn('[composio/connect-byok] activate() failed — row still persisted', {
      connectionId: row.id, error: err instanceof Error ? err.message : String(err),
    })
  }

  logger.info('[composio/connect-byok] Connected', {
    orgId: ctx.orgId, appKey, connectionId: row.id, accountId: result.connectedAccountId,
  })

  return NextResponse.json({ connectionId: row.id, status: 'connected' })
}
