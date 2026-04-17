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

/**
 * Composio v3's `toolkit` field on connected_accounts is an object `{slug, name}`,
 * but older v2 responses returned a plain string. Normalize both shapes to a slug.
 */
function toolkitSlug(toolkit: string | { slug?: string } | undefined | null): string {
  if (!toolkit) return ''
  if (typeof toolkit === 'string') return toolkit
  return toolkit.slug ?? ''
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
// Auth config resolution (lookup → auto-provision Composio-managed)
// ---------------------------------------------------------------------------

/**
 * Resolve an auth_config for a toolkit slug. Returns its ID if one already
 * exists (ENABLED); otherwise auto-provisions a new one using Composio's
 * managed OAuth credentials and returns that.
 *
 * This is the whole point of using Composio — one integration, no per-app
 * dashboard setup. For toolkits that support `composio_managed_auth_schemes`
 * (most OAuth apps), this works with zero operator effort.
 *
 * For toolkits that only accept user-provided credentials (e.g. some API-key
 * services), the auto-create call will fail and we return null. Caller
 * surfaces that as a clear error so the user knows the app needs manual
 * setup in the Composio dashboard.
 */
async function resolveOrCreateAuthConfig(toolkit: string): Promise<string | null> {
  const headers = composioHeaders()

  // 1. Look for an existing ENABLED auth_config matching this toolkit
  try {
    const cfgRes = await fetch(
      `${COMPOSIO_BASE}/api/v3/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}&status=ENABLED&limit=10`,
      { headers },
    )
    if (cfgRes.ok) {
      const cfgData = (await cfgRes.json()) as {
        items?: Array<{ id: string; toolkit?: { slug?: string }; status?: string }>
      }
      const existing = (cfgData.items || []).find(
        (c) => c.toolkit?.slug?.toLowerCase() === toolkit.toLowerCase() && c.status === 'ENABLED',
      )
      if (existing) return existing.id
    } else {
      const body = await cfgRes.text()
      logger.warn('[composio/auth] auth_configs lookup non-OK', {
        toolkit, status: cfgRes.status, body: body.slice(0, 200),
      })
    }
  } catch (err) {
    logger.warn('[composio/auth] auth_configs lookup threw', {
      toolkit, error: err instanceof Error ? err.message : String(err),
    })
    // fall through to auto-create — network flakes shouldn't block the user
  }

  // 2. None found — auto-provision using Composio-managed OAuth
  try {
    const createRes = await fetch(`${COMPOSIO_BASE}/api/v3/auth_configs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        toolkit: { slug: toolkit },
        auth_config: { type: 'use_composio_managed_auth' },
      }),
    })

    if (!createRes.ok) {
      const body = await createRes.text()
      logger.error('[composio/auth] auth_config auto-provision failed', {
        toolkit, status: createRes.status, body: body.slice(0, 300),
      })
      return null
    }

    const created = (await createRes.json()) as { auth_config?: { id?: string } }
    const newId = created.auth_config?.id ?? null
    if (newId) {
      logger.info('[composio/auth] Auto-provisioned managed auth_config', { toolkit, authConfigId: newId })
    }
    return newId
  } catch (err) {
    logger.error('[composio/auth] auth_config auto-provision threw', {
      toolkit, error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Options for the v3 connected_accounts init payload.
 *
 * - `callbackUrl` / `authParams`: OAuth flow — sets `connection.callback_url`
 *   and optionally forwards auth_params (e.g. `{prompt:"select_account"}`)
 *   down to the upstream provider so the user can pick a different account.
 * - `state`: BYOK / API_KEY flow — populates `connection.state` with the
 *   credentials the user provided, completing the connection immediately.
 */
interface PostInitOptions {
  callbackUrl?: string
  authParams?: Record<string, string>
  state?: Record<string, unknown>
}

/**
 * POST /api/v3/connected_accounts with the v3 nested payload shape.
 * Returns the connection request ID + hosted redirect URL (empty for
 * credentials flows which activate instantly).
 */
async function postInitConnection(
  authConfigId: string,
  userId: string,
  opts: PostInitOptions,
): Promise<ComposioConnectionRequest | null> {
  const connection: Record<string, unknown> = { user_id: userId }
  if (opts.callbackUrl) connection.callback_url = opts.callbackUrl
  if (opts.authParams) connection.auth_params = opts.authParams
  if (opts.state) connection.state = opts.state

  const res = await fetch(`${COMPOSIO_BASE}/api/v3/connected_accounts`, {
    method: 'POST',
    headers: composioHeaders(),
    body: JSON.stringify({
      auth_config: { id: authConfigId },
      connection,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    logger.error('[composio/auth] connected_accounts.init failed', {
      authConfigId, userId, status: res.status, body: body.slice(0, 300),
    })
    return null
  }

  const data = (await res.json()) as {
    id?: string
    status?: string
    redirect_url?: string
    redirect_uri?: string
    redirectUrl?: string
  }

  return {
    connectionRequestId: data.id || '',
    redirectUrl: data.redirect_url || data.redirect_uri || data.redirectUrl || '',
  }
}

/**
 * Create a `use_custom_auth` auth_config for a BYOK toolkit.
 * Credentials themselves are passed later at connect time via the
 * `connection.state` field — see Composio's auth_config_details shape.
 */
async function createCustomAuthConfig(
  toolkit: string,
  authScheme: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${COMPOSIO_BASE}/api/v3/auth_configs`, {
      method: 'POST',
      headers: composioHeaders(),
      body: JSON.stringify({
        toolkit: { slug: toolkit },
        auth_config: {
          type: 'use_custom_auth',
          authScheme,
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error('[composio/auth] custom auth_config create failed', {
        toolkit, authScheme, status: res.status, body: body.slice(0, 300),
      })
      return null
    }

    const data = (await res.json()) as { auth_config?: { id?: string } }
    return data.auth_config?.id ?? null
  } catch (err) {
    logger.error('[composio/auth] custom auth_config create threw', {
      toolkit, authScheme, error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Connection initiation
// ---------------------------------------------------------------------------

/**
 * Initiate a Composio OAuth connection for a user+app via channel type.
 *
 * `authParams` forwards arbitrary OAuth params to the upstream provider
 * (e.g. `{prompt:'select_account'}` to let the user pick a different
 * Google account on reconnect).
 */
export async function initiateConnection(
  userId: string,
  channel: ChannelType,
  callbackUrl: string,
  authConfigId?: string,
  authParams?: Record<string, string>,
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
    const resolvedId = authConfigId || (await resolveOrCreateAuthConfig(toolkit))
    if (!resolvedId) {
      logger.error('[composio/auth] No auth config resolvable for channel', { userId, channel, toolkit })
      return null
    }

    const result = await postInitConnection(resolvedId, userId, { callbackUrl, authParams })
    if (!result) return null

    logger.info('[composio/auth] Connection initiated', {
      userId, channel, toolkit, authConfigId: resolvedId, connectionRequestId: result.connectionRequestId,
    })
    return result
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
 * Auto-provisions a managed auth_config on first use if none exists.
 */
export async function initiateConnectionByAppKey(
  userId: string,
  appKey: string,
  callbackUrl: string,
  authParams?: Record<string, string>,
): Promise<ComposioConnectionRequest | null> {
  if (!process.env.COMPOSIO_API_KEY) {
    logger.warn('[composio/auth] Cannot initiate connection — COMPOSIO_API_KEY not set')
    return null
  }

  try {
    const authConfigId = await resolveOrCreateAuthConfig(appKey)
    if (!authConfigId) {
      logger.error('[composio/auth] Could not resolve or create auth_config', { appKey })
      return null
    }

    const result = await postInitConnection(authConfigId, userId, { callbackUrl, authParams })
    if (!result) return null

    logger.info('[composio/auth] Connection initiated by appKey', {
      userId, appKey, authConfigId, connectionRequestId: result.connectionRequestId,
    })
    return result
  } catch (err) {
    logger.error('[composio/auth] Failed to initiate connection by appKey', {
      userId, appKey,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// BYOK connection (API_KEY / custom credentials toolkits)
// ---------------------------------------------------------------------------

export interface ToolkitAuthSchemeField {
  name: string
  displayName: string
  type: string
  description: string
  required: boolean
}

export interface ToolkitAuthScheme {
  mode: string
  fields: ToolkitAuthSchemeField[]
  authGuideUrl: string | null
  supportsCustomAuth: boolean
}

/**
 * Fetch the primary auth scheme spec for a toolkit — used by the BYOK
 * dialog to know which input fields to render (API key, client_id, etc).
 */
export async function getToolkitAuthScheme(
  appKey: string,
): Promise<ToolkitAuthScheme | null> {
  if (!process.env.COMPOSIO_API_KEY) return null

  try {
    const res = await fetch(
      `${COMPOSIO_BASE}/api/v3/toolkits/${encodeURIComponent(appKey)}`,
      { headers: composioHeaders() },
    )
    if (!res.ok) {
      logger.warn('[composio/auth] getToolkitAuthScheme non-OK', { appKey, status: res.status })
      return null
    }

    const data = (await res.json()) as {
      auth_config_details?: Array<{
        mode?: string
        fields?: {
          connected_account_initiation?: {
            required?: ToolkitAuthSchemeField[]
            optional?: ToolkitAuthSchemeField[]
          }
        }
        auth_hint_url?: string | null
      }>
      composio_managed_auth_schemes?: string[] | null
    }

    const primary = data.auth_config_details?.[0]
    if (!primary) return null

    const required = primary.fields?.connected_account_initiation?.required ?? []
    const optional = primary.fields?.connected_account_initiation?.optional ?? []
    const supportsCustomAuth = !(data.composio_managed_auth_schemes?.length ?? 0)

    return {
      mode: primary.mode || 'UNKNOWN',
      fields: [...required, ...optional],
      authGuideUrl: primary.auth_hint_url ?? null,
      supportsCustomAuth,
    }
  } catch (err) {
    logger.error('[composio/auth] getToolkitAuthScheme threw', {
      appKey, error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Connect a BYOK toolkit using user-provided credentials.
 *
 * For API_KEY / custom-auth toolkits, the credentials are passed at
 * connection-init time in `connection.state.val`. Composio returns
 * `status: ACTIVE` immediately — no OAuth redirect needed.
 */
export async function connectWithCredentials(
  userId: string,
  appKey: string,
  credentials: Record<string, string>,
  authScheme = 'API_KEY',
): Promise<{ connectedAccountId: string; toolkit: string; status: string } | null> {
  if (!process.env.COMPOSIO_API_KEY) {
    logger.warn('[composio/auth] Cannot connect with credentials — COMPOSIO_API_KEY not set')
    return null
  }

  try {
    // A fresh use_custom_auth config per connect is fine — Composio keeps
    // them lightweight and this avoids cross-user credential bleed.
    const authConfigId = await createCustomAuthConfig(appKey, authScheme)
    if (!authConfigId) return null

    const state = {
      authScheme,
      val: { status: 'ACTIVE', ...credentials },
    }

    const res = await fetch(`${COMPOSIO_BASE}/api/v3/connected_accounts`, {
      method: 'POST',
      headers: composioHeaders(),
      body: JSON.stringify({
        auth_config: { id: authConfigId },
        connection: { user_id: userId, state },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error('[composio/auth] connectWithCredentials init failed', {
        userId, appKey, status: res.status, body: body.slice(0, 300),
      })
      return null
    }

    const data = (await res.json()) as { id?: string; status?: string }
    if (!data.id || data.status !== 'ACTIVE') {
      logger.warn('[composio/auth] Unexpected BYOK init response', {
        userId, appKey, id: data.id, status: data.status,
      })
      return null
    }

    logger.info('[composio/auth] BYOK connection active', {
      userId, appKey, connectedAccountId: data.id,
    })

    return { connectedAccountId: data.id, toolkit: appKey, status: data.status }
  } catch (err) {
    logger.error('[composio/auth] connectWithCredentials threw', {
      userId, appKey, error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Connection polling
// ---------------------------------------------------------------------------

/**
 * Wait for a pending Composio connection to complete (user finished OAuth).
 * Polls the connected_accounts endpoint until status is ACTIVE or timeout.
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
        `${COMPOSIO_BASE}/api/v3/connected_accounts?connection_request_id=${encodeURIComponent(connectionRequestId)}&limit=1`,
        { headers },
      )
      if (res.ok) {
        const data = await res.json() as {
          items?: Array<{ id: string; status: string; appName?: string; toolkit?: string | { slug?: string } }>
        }
        const account = data.items?.[0]
        if (account && account.status === 'ACTIVE') {
          return {
            id: account.id,
            status: account.status,
            toolkit: toolkitSlug(account.toolkit) || account.appName || '',
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
      `${COMPOSIO_BASE}/api/v3/connected_accounts?user_ids=${encodeURIComponent(userId)}&status=ACTIVE&limit=100`,
      { headers: composioHeaders() },
    )
    if (!res.ok) return []

    const data = await res.json() as {
      items?: Array<{ id: string; status: string; appName?: string; toolkit?: string | { slug?: string } }>
    }
    return (data.items || []).map(item => ({
      id: item.id,
      status: item.status,
      toolkit: toolkitSlug(item.toolkit) || item.appName || '',
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
      `${COMPOSIO_BASE}/api/v3/connected_accounts/${encodeURIComponent(accountId)}`,
      { headers: composioHeaders() },
    )
    if (!res.ok) return null

    const account = await res.json() as { id: string; status: string; appName?: string; toolkit?: string | { slug?: string } }
    return {
      id: account.id,
      status: account.status,
      toolkit: toolkitSlug(account.toolkit) || account.appName || '',
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
      `${COMPOSIO_BASE}/api/v3/connected_accounts/${encodeURIComponent(accountId)}`,
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
