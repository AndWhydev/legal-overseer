/**
 * PollLifecycle — thin wrapper over the legacy ProviderPlugin.pull/send
 * hooks for providers that ship their own adapters (Gmail OAuth polled,
 * BlueBubbles backfill, …).
 *
 * We expose a ConnectorLifecycle shape so API routes + crons can treat
 * poll-transport connections uniformly. Health checks delegate to the
 * provider's own healthCheck if defined.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../../core/logger'
import { getProviderRegistry } from '../../connections/registry'
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

export interface PollLifecycleDeps {
  supabase: SupabaseClient
}

export class PollLifecycle implements ConnectorLifecycle {
  readonly transport = 'poll' as const

  private readonly health: ConnectionHealthReporter

  constructor(private deps: PollLifecycleDeps) {
    this.health = new ConnectionHealthReporter(deps.supabase)
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    // Polled providers are typically created by OAuth setup flows
    // elsewhere (e.g. Gmail OAuth → callback creates row). We just
    // upsert a stub row so the manager can take ownership.
    const { data, error } = await this.deps.supabase
      .from('org_connections')
      .upsert({
        org_id: input.orgId,
        provider: input.providerId,
        display_name: `${capitalize(input.providerId)}`,
        transport: 'poll',
        status: 'pending',
        capabilities: ['pull'],
        config: input.options ?? {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`[poll-lifecycle] upsert failed: ${error?.message}`)
    }

    return { kind: 'immediate', connectionId: data.id as string }
  }

  async activate(conn: OrgConnection): Promise<void> {
    await this.health.setStatus(conn.id, 'connected')
  }

  async refresh(): Promise<RefreshResult> {
    // OAuth refresh for polled providers is out-of-band via the
    // provider's own adapter (Gmail, Outlook, …). Nothing to do here.
    return { kind: 'noop' }
  }

  async suspend(conn: OrgConnection, reason: SuspendReason): Promise<void> {
    await this.health.setStatus(conn.id, 'suspended', { error: `suspended: ${reason}` })
  }

  async disconnect(conn: OrgConnection, opts: DisconnectOptions): Promise<void> {
    if (opts.hard) {
      await this.deps.supabase.from('org_connections').delete().eq('id', conn.id)
    } else {
      await this.health.setStatus(conn.id, 'disabled', { error: null })
    }
  }

  async healthCheck(conn: OrgConnection): Promise<HealthReport> {
    const provider = getProviderRegistry().get(conn.provider)
    if (!provider?.healthCheck) {
      return { healthy: true, details: { skipped: 'no_provider_healthCheck' } }
    }
    try {
      const ok = await provider.healthCheck(conn)
      return {
        healthy: ok,
        nextStatus: ok ? 'connected' : 'error',
        error: ok ? undefined : 'provider_healthCheck_returned_false',
      }
    } catch (err) {
      logger.warn('[poll-lifecycle] healthCheck threw', {
        connectionId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
