import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FlyMachinesClient } from './fly-machines'
import type { BridgeProtocol, LinkingInfo } from './types'

export interface ProvisionerConfig {
  region: string
  image: string
  conduitUrl: string
  webhookBaseUrl: string
  registrationServerUrl: string
}

export class BridgeProvisioner {
  constructor(
    private fly: FlyMachinesClient,
    private supabase: SupabaseClient,
    private config: ProvisionerConfig,
  ) {}

  async provision(opts: {
    orgId: string
    userId: string
    connectionId: string
    protocol: BridgeProtocol
  }): Promise<LinkingInfo> {
    const machineName = `bridge-${opts.userId.slice(0, 8)}-${opts.protocol}`

    // Create persistent volume for bridge state
    const volume = await this.fly.createVolume({
      name: `bridge_data_${opts.userId.slice(0, 8)}`,
      region: this.config.region,
      sizeGb: 1,
    })

    // Generate a secret for the bridge's provisioning API (used later for QR relay)
    const provisioningSecret = crypto.randomBytes(32).toString('hex')

    // Build environment for the bridge container
    const env: Record<string, string> = {
      BRIDGE_PROTOCOL: opts.protocol,
      MATRIX_HOMESERVER_URL: this.config.conduitUrl,
      WEBHOOK_URL: `${this.config.webhookBaseUrl}/api/connections/${opts.connectionId}/webhook`,
      CONNECTION_ID: opts.connectionId,
      ORG_ID: opts.orgId,
      PROVISIONING_SECRET: provisioningSecret,
    }

    if (opts.protocol === 'imessage') {
      env.REGISTRATION_SERVER_URL = this.config.registrationServerUrl
    }

    // Create and start the Fly Machine
    const machine = await this.fly.createMachine({
      name: machineName,
      region: this.config.region,
      image: this.config.image,
      env,
      cpus: 1,
      memoryMb: 256,
      volumeId: volume.id,
    })

    // Update org_connections with Fly machine details
    await this.supabase
      .from('org_connections')
      .update({
        status: 'provisioning',
        config: {
          fly_machine_id: machine.id,
          fly_app_name: 'bitbit-bridges',
          fly_volume_id: volume.id,
          matrix_user_id: `@bridge-${opts.connectionId.slice(0, 8)}:bitbit.chat`,
          protocol: opts.protocol,
          provisioning_secret: provisioningSecret,
          bridge_port: opts.protocol === 'android-messages' ? 29336 : 29318,
          linked_at: null,
          last_message_at: null,
          suspended: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.connectionId)

    // Log provisioning event
    await this.supabase.from('connection_sync_logs').insert({
      connection_id: opts.connectionId,
      status: 'success',
      messages_found: 0,
      messages_inserted: 0,
      duplicates: 0,
      error_message: `Fly Machine ${machine.id} created in ${this.config.region}`,
    })

    return {
      connection_id: opts.connectionId,
      protocol: opts.protocol,
      link_type: opts.protocol === 'imessage' ? 'credentials' : 'qr',
      link_data: null,
      status: 'waiting',
    }
  }

  async destroy(connectionId: string, machineId: string, volumeId?: string): Promise<void> {
    await this.fly.destroyMachine(machineId)
    if (volumeId) {
      await this.fly.deleteVolume(volumeId)
    }

    await this.supabase
      .from('org_connections')
      .update({
        status: 'disabled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)

    await this.supabase.from('connection_sync_logs').insert({
      connection_id: connectionId,
      status: 'success',
      messages_found: 0,
      messages_inserted: 0,
      duplicates: 0,
      error_message: `Fly Machine ${machineId} destroyed`,
    })
  }

  async wake(connectionId: string, machineId: string): Promise<void> {
    await this.fly.startMachine(machineId)
    await this.fly.waitForState(machineId, 'started', 30_000)

    await this.supabase
      .from('org_connections')
      .update({
        status: 'connected',
        config: { suspended: false },
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
  }

  async suspend(connectionId: string, machineId: string): Promise<void> {
    await this.fly.stopMachine(machineId)

    await this.supabase
      .from('org_connections')
      .update({
        status: 'suspended',
        config: { suspended: true },
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)

    await this.supabase.from('connection_sync_logs').insert({
      connection_id: connectionId,
      status: 'success',
      messages_found: 0,
      messages_inserted: 0,
      duplicates: 0,
      error_message: 'Suspended after 7 days idle',
    })
  }

  async checkHealth(machineId: string): Promise<{ running: boolean; state: string }> {
    const machine = await this.fly.getMachine(machineId)
    return { running: machine.state === 'started', state: machine.state }
  }
}
