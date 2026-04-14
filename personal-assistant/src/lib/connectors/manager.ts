/**
 * ConnectorManager — the single entry point every API route, cron, and
 * UI action goes through for connection lifecycle operations. Routes
 * calls to the right ConnectorLifecycle based on the row's `transport`.
 *
 * Shape inspired by the Claude Code QueryEngine: one dispatcher with
 * uniform ops, permission/logging around it, no branching inside call
 * sites.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  OrgConnection,
  TransportType,
} from '../connections/types'
import { logger } from '../core/logger'
import {
  ConnectorLifecycle,
  DisconnectOptions,
  ProvisionInput,
  ProvisionResult,
  RefreshResult,
  SuspendReason,
} from './lifecycle'
import { ConnectionHealthReporter } from './health-reporter'

export interface ConnectorManagerDeps {
  supabase: SupabaseClient
  /** Lifecycles indexed by their TransportType. */
  lifecycles: Partial<Record<TransportType, ConnectorLifecycle>>
}

export interface HealthSweepOptions {
  /** Restrict sweep to these transports. Empty = all. */
  transports?: TransportType[]
  /** Skip rows whose last_health_at is newer than maxAge ms. */
  maxAgeMs?: number
  /** Upper bound on rows processed per sweep. */
  limit?: number
}

export interface HealthSweepResult {
  checked: number
  healthy: number
  unhealthy: number
  errors: string[]
}

export class ConnectorManager {
  private readonly reporter: ConnectionHealthReporter

  constructor(private deps: ConnectorManagerDeps) {
    this.reporter = new ConnectionHealthReporter(deps.supabase)
  }

  /** Accessor in case callers want direct health-reporter access. */
  get health(): ConnectionHealthReporter {
    return this.reporter
  }

  /** Resolve the lifecycle for a transport or throw if not registered. */
  for(transport: TransportType): ConnectorLifecycle {
    const lc = this.deps.lifecycles[transport]
    if (!lc) {
      throw new Error(`[connector-manager] no lifecycle registered for transport="${transport}"`)
    }
    return lc
  }

  // ─── Lifecycle ops ─────────────────────────────────────────────────────────

  async provision(
    transport: TransportType,
    input: ProvisionInput,
  ): Promise<ProvisionResult> {
    logger.info('[connector-manager] provision', { transport, providerId: input.providerId })
    return this.for(transport).provision(input)
  }

  async activate(conn: OrgConnection, ctx: { accountId?: string; metadata?: Record<string, unknown> } = {}): Promise<void> {
    logger.info('[connector-manager] activate', {
      connectionId: conn.id,
      transport: conn.transport,
    })
    await this.for(conn.transport).activate(conn, ctx)
  }

  async refresh(conn: OrgConnection): Promise<RefreshResult> {
    return this.for(conn.transport).refresh(conn)
  }

  async suspend(conn: OrgConnection, reason: SuspendReason): Promise<void> {
    logger.info('[connector-manager] suspend', {
      connectionId: conn.id,
      transport: conn.transport,
      reason,
    })
    await this.for(conn.transport).suspend(conn, reason)
  }

  /**
   * Idempotent disconnect. Fetches fresh connection state so a late call
   * after an earlier disconnect just no-ops cleanly.
   */
  async disconnect(
    connectionId: string,
    opts: DisconnectOptions,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const conn = await this.fetchConnection(connectionId)
    if (!conn) return { ok: false, reason: 'not_found' }
    if (conn.status === 'disabled' && opts.hard === false) {
      return { ok: true }
    }

    logger.info('[connector-manager] disconnect', {
      connectionId,
      transport: conn.transport,
      hard: opts.hard,
      initiator: opts.initiator,
    })

    try {
      await this.for(conn.transport).disconnect(conn, opts)
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[connector-manager] disconnect failed', {
        connectionId,
        transport: conn.transport,
        error: message,
      })
      await this.reporter.setStatus(connectionId, 'error', { error: message })
      return { ok: false, reason: message }
    }
  }

  // ─── Health sweep ──────────────────────────────────────────────────────────

  async runHealthSweep(opts: HealthSweepOptions = {}): Promise<HealthSweepResult> {
    const transports = opts.transports && opts.transports.length > 0
      ? opts.transports
      : (Object.keys(this.deps.lifecycles) as TransportType[])

    let query = this.deps.supabase
      .from('org_connections')
      .select('*')
      .in('transport', transports)
      .in('status', ['connected', 'error', 'auth_expired', 'needs_reauth'])

    if (opts.maxAgeMs) {
      const cutoff = new Date(Date.now() - opts.maxAgeMs).toISOString()
      query = query.or(`last_health_at.is.null,last_health_at.lt.${cutoff}`)
    }

    const { data, error } = await query.limit(opts.limit ?? 500)
    if (error) {
      throw new Error(`[connector-manager] health sweep query failed: ${error.message}`)
    }

    const result: HealthSweepResult = { checked: 0, healthy: 0, unhealthy: 0, errors: [] }

    for (const row of (data ?? []) as OrgConnection[]) {
      result.checked++
      try {
        const report = await this.for(row.transport).healthCheck(row)
        if (report.healthy) result.healthy++
        else result.unhealthy++

        await this.reporter.report({
          connectionId: row.id,
          healthy: report.healthy,
          nextStatus: report.nextStatus,
          error: report.error,
          authExpiresAt: report.authExpiresAt,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`${row.id}: ${message}`)
        result.unhealthy++
        await this.reporter.report({
          connectionId: row.id,
          healthy: false,
          error: message,
        })
      }
    }

    return result
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async fetchConnection(id: string): Promise<OrgConnection | null> {
    const { data, error } = await this.deps.supabase
      .from('org_connections')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data as OrgConnection
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────
//
// The manager is built lazily with dependencies that need runtime access
// to env vars (Fly client, Supabase service client, etc.). See ./index.ts
// for the default-wired builder.
