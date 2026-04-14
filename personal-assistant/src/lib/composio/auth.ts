/**
 * Composio OAuth lifecycle — raw HTTP (no SDK).
 *
 * The Composio SDK (@composio/core) crashes under Turbopack bundling on
 * Vercel. All functions here use raw fetch against the Composio REST API.
 */

import { getToolkitId } from './mapping'
import type { ChannelType } from '../channels/types'
import { logger } from '../core/logger'

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const COMPOSIO_BASE = 'https://backend.composio.dev'

function composioHeaders(): Record<string, string> {
  return { 'x-api-key': process.env.COMPOSIO_API_KEY!, 'Content-Type': 'application/json' }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposioConnectionRequest {
  redirectUrl: string
  connectionRequestId: string
}

export interface ComposioConnectedAccount {
  id: string
  status: string
  toolkit: string
}

// ---------------------------------------------------------------------------
// Connection initiation
// ---------------------------------------------------------------------------

/**
 * Initiate a Composio OAuth connection for a user+app via channel type.
 */
export async function initiateConnection(
  userId: string,
  channel: ChannelType,
  callbackUrl: string,
  authConfigId?: string,
): Promise<ComposioConnectionRequest | null> {
  if (!process.env.COMPOSIO_API_KEY) {
    logger.warn('[composio/auth] Cannot initiate connection — COMPOSIO_API_KEY not set')
    return null
  }

  const toolkit = getToolkitId(channel)
  if (!toolkit) {
    logger.warn(`[composio/auth] Channel ${channel} has no Composio toolkit mapping`)
    return null
  }

  try {
    const configId = authConfigId || toolkit
    const res = await fetch(`${COMPOSIO_BASE}/api/v3/connected-accounts`, {
      method: 'POST',
      headers: composioHeaders(),
      body: JSON.stringify({
        auth_config_id: configId,
        user_id: userId,
        redirect_url: callbackUrl,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error('[composio/auth] initiateConnection failed', {
        userId, channel, toolkit, status: res.status, body: body.slice(0, 300),
      })
      return null
    }

    const data = await res.json() as { id?: string; redirect_url?: string; redirectUrl?: string }
    logger.info('[composio/auth] Connection initiated', {
      userId, channel, toolkit, connectionRequestId: data.id,
    })

    return {
      redirectUrl: data.redirect_url || data.redirectUrl || '',
      connectionRequestId: data.id || '',
    }
  } catch (err) {
    logger.error('[composio/auth] Failed to initiate connection', {
      userId, channel, toolkit,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Initiate a Composio OAuth connection by app key directly.
 * Bypasses the BitBit channel-type mapping — works with any Composio toolkit.
 */
export async function initiateConnectionByAppKey(
  userId: string,
  appKey: string,
  callbackUrl: string,
): Promise<ComposioConnectionRequest | null> {
  if (!process.env.COMPOSIO_API_KEY) {
    logger.warn('[composio/auth] Cannot initiate connection — COMPOSIO_API_KEY not set')
    return null
  }

  const headers = composioHeaders()

  try {
    // Step 1: resolve auth config ID for this toolkit slug
    const cfgRes = await fetch(
      `${COMPOSIO_BASE}/api/v3/auth-configs?toolkit_slug=${encodeURIComponent(appKey)}&status=ENABLED&limit=10`,
      { headers },
    )
    if (!cfgRes.ok) {
      const body = await cfgRes.text()
      logger.error('[composio/auth] authConfigs lookup failed', {
        appKey, status: cfgRes.status, body: body.slice(0, 300),
      })
      return null
    }

    const cfgData = await cfgRes.json() as {
      items?: Array<{ id: string; toolkit?: { slug?: string }; status?: string }>
    }
    const configs = cfgData.items || []
    const authConfig = configs.find(
      c => c.toolkit?.slug?.toLowerCase() === appKey.toLowerCase() && c.status === 'ENABLED',
    ) || configs[0]

    if (!authConfig) {
      logger.error('[composio/auth] No enabled auth config found', { appKey, configCount: configs.length })
      return null
    }

    // Step 2: initiate the connection
    const initRes = await fetch(`${COMPOSIO_BASE}/api/v3/connected-accounts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        auth_config_id: authConfig.id,
        user_id: userId,
        redirect_url: callbackUrl,
      }),
    })

    if (!initRes.ok) {
      const body = await initRes.text()
      logger.error('[composio/auth] connectedAccounts.initiate failed', {
        appKey, status: initRes.status, body: body.slice(0, 300),
      })
      return null
    }

    const data = await initRes.json() as { id?: string; redirect_url?: string; redirectUrl?: string }
    logger.info('[composio/auth] Connection initiated by appKey', {
      userId, appKey, authConfigId: authConfig.id, connectionRequestId: data.id,
    })

    return {
      redirectUrl: data.redirect_url || data.redirectUrl || '',
      connectionRequestId: data.id || '',
    }
  } catch (err) {
    logger.error('[composio/auth] Failed to initiate connection by appKey', {
      userId, appKey,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Connection polling
// ---------------------------------------------------------------------------

/**
 * Wait for a pending Composio connection to complete (user finished OAuth).
 * Polls the connected-accounts endpoint until status is ACTIVE or timeout.
 */
export async function waitForConnection(
  connectionRequestId: string,
  timeoutMs = 60_000,
): Promise<ComposioConnectedAccount | null> {
  if (!process.env.COMPOSIO_API_KEY) return null

  const headers = composioHeaders()
  const deadline = Date.now() + timeoutMs
  const pollInterval = 2_000

  try {
    while (Date.now() < deadline) {
      const res = await fetch(
        `${COMPOSIO_BASE}/api/v3/connected-accounts?connection_request_id=${encodeURIComponent(connectionRequestId)}&limit=1`,
        { headers },
      )
      if (res.ok) {
        const data = await res.json() as {
          items?: Array<{ id: string; status: string; appName?: string; toolkit?: string }>
        }
        const account = data.items?.[0]
        if (account && account.status === 'ACTIVE') {
          return {
            id: account.id,
            status: account.status,
            toolkit: account.toolkit || account.appName || '',
          }
        }
      }
      await new Promise(r => setTimeout(r, pollInterval))
    }
    logger.warn('[composio/auth] waitForConnection timed out', { connectionRequestId, timeoutMs })
    return null
  } catch (err) {
    logger.error('[composio/auth] waitForConnection failed', {
      connectionRequestId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Account queries
// ---------------------------------------------------------------------------

/**
 * List active Composio connected accounts for a user.
 */
export async function listConnectedAccounts(
  userId: string,
): Promise<ComposioConnectedAccount[]> {
  if (!process.env.COMPOSIO_API_KEY) return []

  try {
    const res = await fetch(
      `${COMPOSIO_BASE}/api/v3/connected-accounts?user_ids=${encodeURIComponent(userId)}&status=ACTIVE&limit=100`,
      { headers: composioHeaders() },
    )
    if (!res.ok) return []

    const data = await res.json() as {
      items?: Array<{ id: string; status: string; appName?: string; toolkit?: string }>
    }
    return (data.items || []).map(item => ({
      id: item.id,
      status: item.status,
      toolkit: item.toolkit || item.appName || '',
    }))
  } catch (err) {
    logger.error('[composio/auth] listConnectedAccounts failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Get a specific connected account by ID.
 */
export async function getConnectedAccount(
  accountId: string,
): Promise<ComposioConnectedAccount | null> {
  if (!process.env.COMPOSIO_API_KEY) return null

  try {
    const res = await fetch(
      `${COMPOSIO_BASE}/api/v3/connected-accounts/${encodeURIComponent(accountId)}`,
      { headers: composioHeaders() },
    )
    if (!res.ok) return null

    const account = await res.json() as { id: string; status: string; appName?: string; toolkit?: string }
    return {
      id: account.id,
      status: account.status,
      toolkit: account.toolkit || account.appName || '',
    }
  } catch (err) {
    logger.error('[composio/auth] getConnectedAccount failed', {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

/**
 * Disconnect a Composio connected account (revokes remotely).
 */
export async function disconnectAccount(accountId: string): Promise<boolean> {
  if (!process.env.COMPOSIO_API_KEY) return false

  try {
    const res = await fetch(
      `${COMPOSIO_BASE}/api/v3/connected-accounts/${encodeURIComponent(accountId)}`,
      { method: 'DELETE', headers: composioHeaders() },
    )
    if (!res.ok) {
      const body = await res.text()
      logger.error('[composio/auth] disconnectAccount HTTP failed', {
        accountId, status: res.status, body: body.slice(0, 300),
      })
      return false
    }
    logger.info('[composio/auth] Disconnected account', { accountId })
    return true
  } catch (err) {
    logger.error('[composio/auth] disconnectAccount failed', {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
