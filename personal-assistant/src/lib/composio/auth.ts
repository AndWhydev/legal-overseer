import { getComposioClient } from './client'
import { getToolkitId } from './mapping'
import type { ChannelType } from '../channels/types'
import { logger } from '../core/logger'

export interface ComposioConnectionRequest {
  redirectUrl: string
  connectionRequestId: string
}

export interface ComposioConnectedAccount {
  id: string
  status: string
  toolkit: string
}

/**
 * Initiate a Composio OAuth connection for a user+app.
 *
 * @param userId   BitBit org_id (used as Composio entity/user ID)
 * @param channel  BitBit channel type to connect
 * @param callbackUrl  URL to redirect after auth (e.g. /connections?composio=callback)
 * @param authConfigId  Optional Composio auth config ID (for white-label OAuth)
 * @returns Redirect URL to send the user to, plus the connection request ID
 */
export async function initiateConnection(
  userId: string,
  channel: ChannelType,
  callbackUrl: string,
  authConfigId?: string,
): Promise<ComposioConnectionRequest | null> {
  const composio = getComposioClient()
  if (!composio) {
    logger.warn('[composio/auth] Cannot initiate connection — COMPOSIO_API_KEY not set')
    return null
  }

  const toolkit = getToolkitId(channel)
  if (!toolkit) {
    logger.warn(`[composio/auth] Channel ${channel} has no Composio toolkit mapping`)
    return null
  }

  try {
    // If no explicit authConfigId, Composio uses its default config for the toolkit
    const configId = authConfigId || toolkit

    const connRequest = await composio.connectedAccounts.initiate(
      userId,
      configId,
      { callbackUrl },
    )

    logger.info('[composio/auth] Connection initiated', {
      userId,
      channel,
      toolkit,
      connectionRequestId: connRequest.id,
    })

    return {
      redirectUrl: connRequest.redirectUrl || '',
      connectionRequestId: connRequest.id,
    }
  } catch (err) {
    logger.error('[composio/auth] Failed to initiate connection', {
      userId,
      channel,
      toolkit,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Wait for a pending Composio connection to complete (user finished OAuth).
 *
 * @param connectionRequestId  The ID returned from initiateConnection
 * @param timeoutMs  Maximum time to wait (default 60s)
 */
export async function waitForConnection(
  connectionRequestId: string,
  timeoutMs = 60_000,
): Promise<ComposioConnectedAccount | null> {
  const composio = getComposioClient()
  if (!composio) return null

  try {
    const account = await composio.connectedAccounts.waitForConnection(
      connectionRequestId,
      timeoutMs,
    )
    return {
      id: account.id,
      status: account.status,
      toolkit: (account as Record<string, unknown>).appName as string || '',
    }
  } catch (err) {
    logger.error('[composio/auth] waitForConnection failed', {
      connectionRequestId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * List active Composio connected accounts for a user.
 */
export async function listConnectedAccounts(
  userId: string,
): Promise<ComposioConnectedAccount[]> {
  const composio = getComposioClient()
  if (!composio) return []

  try {
    const result = await composio.connectedAccounts.list({
      userIds: [userId],
      statuses: ['ACTIVE'],
    })

    return result.items.map(item => ({
      id: item.id,
      status: item.status,
      toolkit: (item as Record<string, unknown>).appName as string || '',
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
  const composio = getComposioClient()
  if (!composio) return null

  try {
    const account = await composio.connectedAccounts.get(accountId)
    return {
      id: account.id,
      status: account.status,
      toolkit: (account as Record<string, unknown>).appName as string || '',
    }
  } catch (err) {
    logger.error('[composio/auth] getConnectedAccount failed', {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Disconnect a Composio connected account.
 */
/**
 * Initiate a Composio OAuth connection using a Composio app key directly.
 * Unlike initiateConnection(), this bypasses the BitBit channel-type mapping
 * and works with any app in the Composio catalog.
 */
export async function initiateConnectionByAppKey(
  userId: string,
  appKey: string,
  callbackUrl: string,
): Promise<ComposioConnectionRequest | null> {
  const composio = getComposioClient()
  if (!composio) {
    logger.warn('[composio/auth] Cannot initiate connection — COMPOSIO_API_KEY not set')
    return null
  }

  try {
    const connRequest = await composio.connectedAccounts.initiate(
      userId,
      appKey,
      { callbackUrl },
    )

    logger.info('[composio/auth] Connection initiated by appKey', {
      userId,
      appKey,
      connectionRequestId: connRequest.id,
    })

    return {
      redirectUrl: connRequest.redirectUrl || '',
      connectionRequestId: connRequest.id,
    }
  } catch (err) {
    logger.error('[composio/auth] Failed to initiate connection by appKey', {
      userId,
      appKey,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function disconnectAccount(accountId: string): Promise<boolean> {
  const composio = getComposioClient()
  if (!composio) return false

  try {
    await composio.connectedAccounts.delete(accountId)
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
