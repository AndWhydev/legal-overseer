/**
 * WebhookLifecycle — for inbound-only integrations (Stripe, Calendly,
 * custom webhooks).
 *
 * These don't need provisioning of remote resources — the user pastes
 * BitBit's webhook URL into the remote service. Our job is just to
 * manage the webhook_secret and soft/hard-delete rows on disconnect.
 */
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

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

export interface WebhookLifecycleDeps {
  supabase: SupabaseClient
}

export class WebhookLifecycle implements ConnectorLifecycle {
  readonly transport = 'webhook' as const

  private readonly health: ConnectionHealthReporter

  constructor(private deps: WebhookLifecycleDeps) {
    this.health = new ConnectionHealthReporter(deps.supabase)
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const webhookSecret = crypto.randomBytes(32).toString('hex')

    const { data, error } = await this.deps.supabase
      .from('org_connections')
      .upsert({
        org_id: input.orgId,
        provider: input.providerId,
        display_name: `${capitalize(input.providerId)}`,
        transport: 'webhook',
        status: 'connected',
        capabilities: ['webhook'],
        webhook_secret: webhookSecret,
        config: input.options ?? {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`[webhook-lifecycle] upsert failed: ${error?.message}`)
    }
    return { kind: 'immediate', connectionId: data.id as string }
  }

  async activate(conn: OrgConnection): Promise<void> {
    await this.health.setStatus(conn.id, 'connected')
  }

  async refresh(): Promise<RefreshResult> {
    return { kind: 'noop' }
  }

  async suspend(conn: OrgConnection, reason: SuspendReason): Promise<void> {
    await this.health.setStatus(conn.id, 'suspended', { error: `suspended: ${reason}` })
  }

  async disconnect(conn: OrgConnection, opts: DisconnectOptions): Promise<void> {
    // Rotate the secret so any in-flight webhooks are rejected.
    const rotatedSecret = crypto.randomBytes(32).toString('hex')

    if (opts.hard) {
      await this.deps.supabase.from('org_connections').delete().eq('id', conn.id)
    } else {
      await this.deps.supabase
        .from('org_connections')
        .update({
          status: 'disabled',
          webhook_secret: rotatedSecret,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id)
    }
  }

  async healthCheck(conn: OrgConnection): Promise<HealthReport> {
    // Inbound-only webhooks are healthy if they've received a payload
    // recently. We treat "never received" as still-healthy for the
    // first 7 days after connect.
    if (!conn.last_sync_at) {
      const ageMs = Date.now() - new Date(conn.created_at).getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      return ageMs < sevenDays
        ? { healthy: true, details: { reason: 'grace_period' } }
        : { healthy: false, error: 'no_events_in_7_days' }
    }
    return { healthy: true }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
