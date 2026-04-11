import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { waitForConnection, getConnectedAccount } from '@/lib/composio'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/composio/callback
 *
 * Composio redirects here after OAuth completion.
 * Query params from Composio:
 *   - user_id: the org_id we passed
 *   - status: 'success' | 'failed'
 *   - connectedAccountId: the Composio connected account ID
 *   - appName: the toolkit name (e.g., 'gmail')
 *
 * We store the connectedAccountId in org_connections.config and redirect
 * the user back to the connections page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const connectedAccountId = searchParams.get('connectedAccountId')
  const appName = searchParams.get('appName')
  const userId = searchParams.get('user_id')

  // Also check for connection_request_id if callback is from waitForConnection pattern
  const connectionRequestId = searchParams.get('connection_request_id')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'

  if (status === 'failed' || (!connectedAccountId && !connectionRequestId)) {
    logger.warn('[composio/callback] OAuth failed or missing params', {
      status, connectedAccountId, appName, userId,
    })
    return NextResponse.redirect(
      `${appUrl}/connections?composio_error=auth_failed&app=${appName || 'unknown'}`
    )
  }

  // Verify the user is authenticated
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch {
    // If not authenticated via cookie, still process but redirect to login
    return NextResponse.redirect(
      `${appUrl}/connections?composio_success=true&app=${appName}&account=${connectedAccountId}`
    )
  }

  if (!ctx) {
    return NextResponse.redirect(
      `${appUrl}/connections?composio_success=true&app=${appName}&account=${connectedAccountId}`
    )
  }

  const { supabase } = ctx
  const orgId = ctx.orgId

  try {
    // Verify the connected account is active
    let accountId = connectedAccountId
    if (!accountId && connectionRequestId) {
      const account = await waitForConnection(connectionRequestId, 10_000)
      if (account) accountId = account.id
    }

    if (accountId) {
      const account = await getConnectedAccount(accountId)

      if (account && account.status === 'ACTIVE') {
        // Upsert org_connection with Composio metadata
        const provider = appName || account.toolkit || 'unknown'

        const { error } = await supabase
          .from('org_connections')
          .upsert({
            org_id: orgId,
            provider,
            display_name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} (Composio)`,
            transport: 'composio',
            status: 'connected',
            capabilities: ['pull', 'send'],
            config: {
              composio_connected_account_id: accountId,
              composio_toolkit: account.toolkit,
              connected_at: new Date().toISOString(),
            },
            last_sync_at: new Date().toISOString(),
          }, {
            onConflict: 'org_id,provider',
          })

        if (error) {
          logger.error('[composio/callback] Failed to upsert org_connection', {
            orgId, provider, error: error.message,
          })
        } else {
          logger.info('[composio/callback] Connected account stored', {
            orgId, provider, accountId,
          })
        }
      }
    }
  } catch (err) {
    logger.error('[composio/callback] Processing error', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return NextResponse.redirect(
    `${appUrl}/connections?composio_success=true&app=${appName || 'unknown'}`
  )
}
