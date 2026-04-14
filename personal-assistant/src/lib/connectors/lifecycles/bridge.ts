/**
 * BridgeLifecycle — wraps the existing BridgeProvisioner (Fly) and
 * MacVpsProvisioner (iMessage) behind the ConnectorLifecycle contract.
 *
 * This is a pure routing layer: the heavy lifting stays in the
 * provisioners. Bridge rows still enjoy their existing crons
 * (bridge-health / bridge-lifecycle); the connector-health cron skips
 * 'bridge' rows during rollout to avoid double-probing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../../core/logger'
import type { BridgeProvisioner } from '../../bridges/bridge-provisioner'
import type { MacVpsProvisioner } from '../../bridges/mac-vps-provisioner'
import type { BridgeProtocol } from '../../bridges/types'
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

export interface BridgeLifecycleDeps {
  supabase: SupabaseClient
  bridgeProvisioner: BridgeProvisioner
  /** Optional — iMessage flows still work without it on non-macOS deploys. */
  macVpsProvisioner?: MacVpsProvisioner
}

export class BridgeLifecycle implements ConnectorLifecycle {
  readonly transport = 'bridge' as const

  private readonly health: ConnectionHealthReporter

  constructor(private deps: BridgeLifecycleDeps) {
    this.health = new ConnectionHealthReporter(deps.supabase)
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const protocol = (input.options?.protocol as BridgeProtocol | undefined)
      ?? this.inferProtocol(input.providerId)

    // Ensure a row exists first so the provisioner can update it.
    const { data: row, error } = await this.deps.supabase
      .from('org_connections')
      .upsert({
        org_id: input.orgId,
        provider: input.providerId,
        display_name: `${capitalize(input.providerId)} (Bridge)`,
        transport: 'bridge',
        status: 'pending',
        capabilities: ['pull', 'send'],
        config: { protocol },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
      .select()
      .single()

    if (error || !row) {
      throw new Error(`[bridge-lifecycle] upsert failed: ${error?.message}`)
    }

    const connectionId = row.id as string

    if (protocol === 'imessage') {
      if (!this.deps.macVpsProvisioner) {
        throw new Error('[bridge-lifecycle] iMessage requested but MacVpsProvisioner not configured')
      }
      const info = await this.deps.macVpsProvisioner.provision({
        orgId: input.orgId,
        userId: input.userId,
        connectionId,
        appleIdEmail: (input.options?.appleIdEmail as string | undefined) ?? '',
      })
      return {
        kind: 'linking_info',
        connectionId,
        linkType: info.link_type,
        linkData: info.link_data,
      }
    }

    const info = await this.deps.bridgeProvisioner.provision({
      orgId: input.orgId,
      userId: input.userId,
      connectionId,
      protocol,
    })
    return {
      kind: 'linking_info',
      connectionId,
      linkType: info.link_type,
      linkData: info.link_data,
    }
  }

  async activate(conn: OrgConnection): Promise<void> {
    // For bridges, activation happens implicitly when the Fly machine
    // reports 'linked' via its own webhook. We just flip the row.
    await this.health.setStatus(conn.id, 'connected')
  }

  async refresh(): Promise<RefreshResult> {
    // Bridges don't use OAuth tokens — nothing to refresh.
    return { kind: 'noop' }
  }

  async suspend(conn: OrgConnection, reason: SuspendReason): Promise<void> {
    const config = (conn.config ?? {}) as Record<string, string | undefined>
    const machineId = config.fly_machine_id
    if (machineId) {
      await this.deps.bridgeProvisioner.suspend(conn.id, machineId)
    } else {
      // iMessage or misconfigured row — just mark suspended.
      await this.health.setStatus(conn.id, 'suspended', { error: `suspended: ${reason}` })
    }
  }

  async disconnect(conn: OrgConnection, opts: DisconnectOptions): Promise<void> {
    const config = (conn.config ?? {}) as Record<string, string | undefined>

    if (config.fly_machine_id) {
      try {
        await this.deps.bridgeProvisioner.destroy(
          conn.id,
          config.fly_machine_id,
          config.fly_volume_id,
        )
      } catch (err) {
        logger.error('[bridge-lifecycle] destroy Fly machine failed', {
          connectionId: conn.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    } else if (config.vps_ip && this.deps.macVpsProvisioner) {
      try {
        await this.deps.macVpsProvisioner.destroy(conn.id, config.vps_ip)
      } catch (err) {
        logger.error('[bridge-lifecycle] destroy Mac VPS failed', {
          connectionId: conn.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (opts.hard) {
      await this.deps.supabase.from('org_connections').delete().eq('id', conn.id)
    } else {
      await this.health.setStatus(conn.id, 'disabled', { error: null })
    }
  }

  async healthCheck(conn: OrgConnection): Promise<HealthReport> {
    const config = (conn.config ?? {}) as Record<string, string | undefined>
    try {
      if (config.fly_machine_id) {
        const { running, state } = await this.deps.bridgeProvisioner.checkHealth(
          config.fly_machine_id,
        )
        return {
          healthy: running,
          nextStatus: running ? 'connected' : 'error',
          error: running ? undefined : `fly_state=${state}`,
          details: { state },
        }
      }

      if (config.bb_server_url && config.bb_password && this.deps.macVpsProvisioner) {
        const ok = await this.deps.macVpsProvisioner.checkHealth(
          config.bb_server_url,
          config.bb_password,
        )
        return {
          healthy: ok,
          nextStatus: ok ? 'connected' : 'error',
          error: ok ? undefined : 'bluebubbles_unreachable',
        }
      }

      return { healthy: true, details: { skipped: 'no_probe_target' } }
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private inferProtocol(providerId: string): BridgeProtocol {
    if (providerId === 'imessage') return 'imessage'
    if (providerId === 'whatsapp') return 'whatsapp'
    if (providerId === 'android-messages' || providerId === 'android_messages') {
      return 'android-messages'
    }
    // Default to whatsapp for unknown — callers can always override via options.protocol
    return 'whatsapp'
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
