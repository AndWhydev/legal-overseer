import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getServiceClient } from '@/lib/supabase/service-client'
import { waitForConnection, getConnectedAccount } from '@/lib/composio'
import { dispatchConnectionCrawl } from '@/lib/composio/dispatch-crawl'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/composio/callback
 *
 * Composio redirects here after OAuth completion.
 * Query params from Composio:
 *   - user_id: the org_id we passed during initiate
 *   - status: 'success' | 'failed'
 *   - connectedAccountId: the Composio connected account ID
 *   - appName: the toolkit name (e.g., 'gmail')
 *
 * NOTE: Cookie auth often fails on this callback because the redirect comes
 * from Composio's domain (cross-site). We fall back to the service-role client
 * using the user_id param (which we set during initiate) as the org_id.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const connectedAccountId = searchParams.get('connectedAccountId')
  const appName = searchParams.get('appName')
  const userId = searchParams.get('user_id')
  const connectionRequestId = searchParams.get('connection_request_id')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'

  if (status === 'failed' || (!connectedAccountId && !connectionRequestId)) {
    logger.warn('[composio/callback] OAuth failed or missing params', {
      status, connectedAccountId, appName, userId,
    })
    return NextResponse.redirect(
      `${appUrl}/dashboard?composio_error=auth_failed&app=${appName || 'unknown'}`
    )
  }

  // Determine the org_id: prefer cookie auth, fall back to Composio's user_id param
  let orgId: string | null = null
  let supabase = getServiceClient()

  try {
    const ctx = await getAuthContext(request)
    if (ctx) {
      orgId = ctx.orgId
      supabase = ctx.supabase
    }
  } catch {
    // Cookie auth failed (expected — cross-site redirect from Composio)
  }

  if (!orgId && userId) {
    orgId = userId
    logger.info('[composio/callback] Cookie auth unavailable, using user_id param as orgId', { orgId })
  }

  if (!orgId) {
    logger.error('[composio/callback] No orgId from auth or user_id param')
    return NextResponse.redirect(
      `${appUrl}/dashboard?composio_error=auth_failed&app=${appName || 'unknown'}`
    )
  }

  try {
    let accountId = connectedAccountId
    if (!accountId && connectionRequestId) {
      const account = await waitForConnection(connectionRequestId, 10_000)
      if (account) accountId = account.id
    }

    if (accountId) {
      const account = await getConnectedAccount(accountId)

      if (account && account.status === 'ACTIVE') {
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

          dispatchConnectionCrawl({
            orgId,
            appKey: provider,
            connectedAccountId: accountId,
          }).then((r) => {
            logger.info('[composio/callback] Crawler dispatch', {
              orgId, provider, enqueued: r.enqueued, skipped: r.skipped, jobId: r.jobId,
            })
          }).catch((err) => {
            logger.error('[composio/callback] Crawler dispatch failed', {
              error: err instanceof Error ? err.message : String(err),
            })
          })
        }
      } else {
        logger.warn('[composio/callback] Account not ACTIVE', {
          accountId, status: account?.status,
        })
      }
    }
  } catch (err) {
    logger.error('[composio/callback] Processing error', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return NextResponse.redirect(
    `${appUrl}/dashboard?composio_success=true&app=${appName || 'unknown'}`
  )
}
