/**
 * ComposioLifecycle — wraps the Composio SDK behind the
 * ConnectorLifecycle contract.
 *
 * Responsibilities:
 *   - provision()   : kicks off OAuth via initiateConnectionByAppKey,
 *                     creates an org_connections row in 'provisioning'
 *   - activate()    : called from the OAuth callback once Composio says
 *                     the account is ACTIVE — registers triggers, stores
 *                     auth_expires_at, dispatches the crawl job
 *   - refresh()     : polls Composio for the current account status and
 *                     updates auth_expires_at / flips to 'auth_expired'
 *   - disconnect()  : deletes any registered triggers, calls
 *                     composio.connectedAccounts.delete, then hard- or
 *                     soft-removes the local row
 *   - healthCheck() : maps Composio account status → HealthReport
 *
 * All remote SDK calls are guarded with isComposioEnabled(); when the
 * key isn't set, the lifecycle degrades gracefully so tests and local
 * dev don't need a real Composio account.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../../core/logger'
import {
  disconnectAccount,
  getConnectedAccount,
  initiateConnectionByAppKey,
  isComposioEnabled,
  invalidateComposioToolCache,
} from '../../composio'
import { deleteTrigger, setupChannelTrigger } from '../../composio/triggers'
import { dispatchConnectionCrawl } from '../../composio/dispatch-crawl'
import type { ChannelType } from '../../channels/types'
import type { OrgConnection } from '../../connections/types'
import {
  ConnectorLifecycle,
  DisconnectOptions,
  HealthReport,
  ProvisionInput,
  ProvisionResult,
  RefreshResult,
  SuspendReason,
} from '../lifecycle'
import { ConnectionHealthReporter } from '../health-reporter'

export interface ComposioLifecycleDeps {
  supabase: SupabaseClient
  /** Base URL used to build Composio callback / webhook URLs. */
  appUrl: string
}

export class ComposioLifecycle implements ConnectorLifecycle {
  readonly transport = 'composio' as const

  private readonly health: ConnectionHealthReporter

  constructor(private deps: ComposioLifecycleDeps) {
    this.health = new ConnectionHealthReporter(deps.supabase)
  }

  // ─── provision ────────────────────────────────────────────────────────────

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    if (!isComposioEnabled()) {
      throw new Error('[composio-lifecycle] COMPOSIO_API_KEY not configured')
    }

    const appKey = (input.options?.appKey as string | undefined) ?? input.providerId
    const callbackUrl =
      input.callbackUrl ?? `${this.deps.appUrl}/api/connections/composio/callback`

    // Create a pending row first so we can surface a UI state before
    // the user returns from Composio.
    const { data: conn, error } = await this.deps.supabase
      .from('org_connections')
      .upsert(
        {
          org_id: input.orgId,
          provider: appKey,
          display_name: `${capitalize(appKey)} (Composio)`,
          transport: 'composio',
          status: 'provisioning',
          capabilities: ['pull', 'send'],
          config: { composio_app_key: appKey },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,provider' },
      )
      .select()
      .single()

    if (error || !conn) {
      throw new Error(`[composio-lifecycle] provision upsert failed: ${error?.message}`)
    }

    const req = await initiateConnectionByAppKey(input.orgId, appKey, callbackUrl)
    if (!req || !req.redirectUrl) {
      // Roll back row to 'error' so the UI surfaces the issue.
      await this.health.setStatus(conn.id as string, 'error', {
        error: 'Failed to initiate Composio connection',
      })
      throw new Error('[composio-lifecycle] initiateConnectionByAppKey returned no redirect')
    }

    return {
      kind: 'oauth_redirect',
      redirectUrl: req.redirectUrl,
      connectionRequestId: req.connectionRequestId,
      connectionId: conn.id as string,
    }
  }

  // ─── activate ─────────────────────────────────────────────────────────────

  async activate(
    conn: OrgConnection,
    ctx: { accountId?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<void> {
    const accountId =
      ctx.accountId ??
      (conn.config as Record<string, string | undefined>)?.composio_connected_account_id ??
      conn.connected_account_id ??
      undefined

    if (!accountId) {
      const lastError =
        'Activation failed: missing Composio connected account id. Reauthenticate and retry.'

      logger.warn('[composio-lifecycle] activate called without accountId', {
        connectionId: conn.id,
        error: lastError,
      })

      await this.health.setStatus(conn.id, 'needs_reauth', { error: lastError })
      return
    }

    // Pull fresh account state (captures expiry if Composio reports it).
    const account = isComposioEnabled() ? await getConnectedAccount(accountId) : null
    const authExpiresAt = extractExpiry(account) ?? extractExpiry(ctx.metadata) ?? null
    if (!authExpiresAt) {
      logExpiryMiss(accountId, account ?? ctx.metadata)
    }

    // Register trigger (best-effort — not every toolkit has one).
    const triggerIds: string[] = []
    try {
      const trigger = await setupChannelTrigger(
        conn.provider as ChannelType,
        accountId,
        this.deps.appUrl,
      )
      if (trigger?.id) triggerIds.push(trigger.id)
    } catch (err) {
      logger.warn('[composio-lifecycle] trigger setup failed (non-fatal)', {
        connectionId: conn.id,
        provider: conn.provider,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    const { error: updateError } = await this.deps.supabase
      .from('org_connections')
      .update({
        status: 'connected',
        connected_account_id: accountId,
        auth_expires_at: authExpiresAt,
        trigger_ids: triggerIds,
        last_sync_at: new Date().toISOString(),
        consecutive_failures: 0,
        last_error: null,
        config: {
          ...(conn.config ?? {}),
          composio_connected_account_id: accountId,
          composio_toolkit: account?.toolkit ?? (conn.config as Record<string, string>)?.composio_toolkit,
          connected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id)

    if (updateError) {
      // Row didn't update — avoid split-brain where triggers are registered
      // remotely but the local row still says 'provisioning'. Surface a
      // status the UI can act on and let the caller fail the callback.
      logger.error('[composio-lifecycle] activate row update failed', {
        connectionId: conn.id,
        error: updateError.message,
      })
      await this.health.setStatus(conn.id, 'error', { error: updateError.message })
      throw new Error(`[composio-lifecycle] activate update failed: ${updateError.message}`)
    }

    // Fire-and-forget crawl dispatch — idempotent so re-activation is safe.
    dispatchConnectionCrawl({
      orgId: conn.org_id,
      appKey: conn.provider,
      connectedAccountId: accountId,
    }).catch((err) => {
      logger.error('[composio-lifecycle] crawl dispatch failed', {
        connectionId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  // ─── refresh ──────────────────────────────────────────────────────────────

  async refresh(conn: OrgConnection): Promise<RefreshResult> {
    const accountId =
      conn.connected_account_id ??
      (conn.config as Record<string, string | undefined>)?.composio_connected_account_id
    if (!accountId) return { kind: 'noop' }
    if (!isComposioEnabled()) return { kind: 'noop' }

    const account = await getConnectedAccount(accountId)
    if (!account) {
      await this.health.setStatus(conn.id, 'needs_reauth', {
        error: 'Composio account lookup failed',
      })
      return { kind: 'expired', error: 'account_lookup_failed' }
    }

    const authExpiresAt = extractExpiry(account)

    if (account.status === 'ACTIVE') {
      return { kind: 'refreshed', authExpiresAt: authExpiresAt ?? null }
    }

    if (account.status === 'EXPIRED' || account.status === 'INACTIVE') {
      await this.health.setStatus(conn.id, 'auth_expired', {
        error: `Composio status: ${account.status}`,
      })
      return { kind: 'expired', error: account.status }
    }

    return { kind: 'noop' }
  }

  // ─── suspend ──────────────────────────────────────────────────────────────

  async suspend(conn: OrgConnection, reason: SuspendReason): Promise<void> {
    // Composio connections don't consume paid resources while idle, so
    // suspension is purely a state marker. We keep triggers active.
    await this.health.setStatus(conn.id, 'suspended', { error: `suspended: ${reason}` })
  }

  // ─── disconnect ───────────────────────────────────────────────────────────

  async disconnect(conn: OrgConnection, opts: DisconnectOptions): Promise<void> {
    // CAS: claim the disconnect so concurrent callers no-op cleanly.
    // For hard deletes we want to run cleanup even if the row was
    // already 'disabled' (it may have been soft-disabled earlier but
    // the external account wasn't actually revoked).
    if (!opts.hard) {
      const claimed = await this.health.claimForDisconnect(conn.id)
      if (!claimed) {
        logger.info('[composio-lifecycle] disconnect already claimed — noop', {
          connectionId: conn.id,
        })
        return
      }
    }

    const accountId =
      conn.connected_account_id ??
      (conn.config as Record<string, string | undefined>)?.composio_connected_account_id

    // Delete triggers (best-effort, idempotent).
    for (const triggerId of conn.trigger_ids ?? []) {
      try {
        await deleteTrigger(triggerId)
      } catch (err) {
        logger.warn('[composio-lifecycle] deleteTrigger failed', {
          connectionId: conn.id,
          triggerId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Delete the Composio connected account so it doesn't orphan.
    if (accountId && isComposioEnabled()) {
      try {
        await disconnectAccount(accountId)
        invalidateComposioToolCache(conn.org_id)
      } catch (err) {
        logger.warn('[composio-lifecycle] disconnectAccount failed', {
          connectionId: conn.id,
          accountId,
          error: err instanceof Error ? err.message : String(err),
        })
        // Don't throw — we still want to clean up the local row.
      }
    }

    if (opts.hard) {
      const { error } = await this.deps.supabase
        .from('org_connections')
        .delete()
        .eq('id', conn.id)
      if (error) {
        logger.error('[composio-lifecycle] delete row failed', {
          connectionId: conn.id,
          error: error.message,
        })
      }
    } else {
      await this.health.setStatus(conn.id, 'disabled', { error: null })
    }

    await this.deps.supabase.from('connection_sync_logs').insert({
      connection_id: conn.id,
      status: 'success',
      messages_found: 0,
      messages_inserted: 0,
      duplicates: 0,
      error_message: `disconnected (${opts.initiator ?? 'unknown'}${opts.reason ? `: ${opts.reason}` : ''})`,
    }).then(() => {/* best-effort */}, () => {/* swallow */})
  }

  // ─── healthCheck ──────────────────────────────────────────────────────────

  async healthCheck(conn: OrgConnection): Promise<HealthReport> {
    const accountId =
      conn.connected_account_id ??
      (conn.config as Record<string, string | undefined>)?.composio_connected_account_id
    if (!accountId) {
      return {
        healthy: false,
        nextStatus: 'needs_reauth',
        error: 'missing connected_account_id',
      }
    }

    if (!isComposioEnabled()) {
      return { healthy: true, details: { skipped: 'composio_disabled' } }
    }

    try {
      const account = await getConnectedAccount(accountId)
      if (!account) {
        return { healthy: false, nextStatus: 'needs_reauth', error: 'not_found' }
      }
      const authExpiresAt = extractExpiry(account) ?? null

      if (account.status === 'ACTIVE') {
        return { healthy: true, nextStatus: 'connected', authExpiresAt }
      }
      if (account.status === 'EXPIRED') {
        return { healthy: false, nextStatus: 'auth_expired', authExpiresAt }
      }
      return { healthy: false, nextStatus: 'error', error: account.status }
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Extract an OAuth expiry timestamp from a Composio connected-account
 * payload. The SDK shape isn't officially documented — this scans every
 * field name we've observed in the wild, including nested `data` and
 * `metadata` objects. Any callers who discover new field names should
 * extend this list.
 *
 * Returns an ISO-8601 timestamp or undefined. When undefined + the
 * payload has a non-trivial shape, we emit a warning so we notice
 * Composio SDK drift in prod logs.
 */
function extractExpiry(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined
  const rec = source as Record<string, unknown>

  const candidateKeys = [
    'auth_expires_at',
    'authExpiresAt',
    'expiresAt',
    'expires_at',
    'expiry',
    'expiryDate',
    'tokenExpiresAt',
    'token_expires_at',
    'expiry_time',
  ]

  for (const key of candidateKeys) {
    const v = rec[key]
    if (typeof v === 'string' && v.length > 0) return v
    if (typeof v === 'number') return new Date(v).toISOString()
  }

  // Composio sometimes nests auth details under data / metadata / params.
  for (const nestKey of ['data', 'metadata', 'params', 'credentials']) {
    const nested = rec[nestKey]
    if (nested && typeof nested === 'object') {
      const recursive = extractExpiry(nested)
      if (recursive) return recursive
    }
  }

  return undefined
}

function logExpiryMiss(accountId: string, source: unknown): void {
  // Only warn when the payload is structured enough that an expiry
  // probably should have been present.
  if (!source || typeof source !== 'object') return
  const keys = Object.keys(source as Record<string, unknown>)
  if (keys.length === 0) return
  logger.warn('[composio-lifecycle] no expiry extracted — Composio payload drift?', {
    accountId,
    sample_keys: keys.slice(0, 15),
  })
}
