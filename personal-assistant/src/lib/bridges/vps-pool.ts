import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlueBubblesConfig } from './types'

const POOL_ORG_ID = '__bitbit_pool__'
const POOL_PROVIDER = 'imessage'
const TARGET_POOL_SIZE = 2

export class VpsPool {
  constructor(private supabase: SupabaseClient) {}

  async claimInstance(connectionId: string, orgId: string): Promise<BlueBubblesConfig | null> {
    const { data: poolConn } = await this.supabase
      .from('org_connections')
      .select('id, config')
      .eq('org_id', POOL_ORG_ID)
      .eq('provider', POOL_PROVIDER)
      .eq('status', 'pending')
      .limit(1)
      .single()

    if (!poolConn) return null

    const config = poolConn.config as Record<string, unknown>

    const bbConfig: BlueBubblesConfig = {
      bb_server_url: config.bb_server_url as string,
      bb_password: config.bb_password as string,
      vps_ip: config.vps_ip as string,
      vps_id: config.vps_id as string,
      ssh_key_fingerprint: config.ssh_key_fingerprint as string,
      vnc_port: (config.vnc_port as number) || 5900,
      vnc_password: config.vnc_password as string,
      apple_id_email: '',
      protocol: 'imessage',
      linked_at: null,
      last_message_at: null,
    }

    await this.supabase
      .from('org_connections')
      .update({
        status: 'disabled',
        config: { ...config, status: 'claimed', claimed_by: connectionId },
        updated_at: new Date().toISOString(),
      })
      .eq('id', poolConn.id)

    return bbConfig
  }

  async getPoolCount(): Promise<number> {
    const { data } = await this.supabase
      .from('org_connections')
      .select('id')
      .eq('org_id', POOL_ORG_ID)
      .eq('provider', POOL_PROVIDER)
      .eq('status', 'pending')

    return data?.length ?? 0
  }

  async addToPool(instance: {
    vpsId: string
    vpsIp: string
    bbServerUrl: string
    bbPassword: string
    sshKeyFingerprint: string
  }): Promise<string> {
    const vncPassword = crypto.randomUUID().slice(0, 12)

    const { data, error } = await this.supabase
      .from('org_connections')
      .insert({
        org_id: POOL_ORG_ID,
        provider: POOL_PROVIDER,
        display_name: `Pool Instance (${instance.vpsId})`,
        transport: 'webhook',
        capabilities: ['push', 'send', 'webhook'],
        status: 'pending',
        config: {
          vps_id: instance.vpsId,
          vps_ip: instance.vpsIp,
          bb_server_url: instance.bbServerUrl,
          bb_password: instance.bbPassword,
          ssh_key_fingerprint: instance.sshKeyFingerprint,
          vnc_port: 5900,
          vnc_password: vncPassword,
          status: 'warm',
          protocol: 'imessage',
        },
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to add pool instance: ${error.message}`)
    return data!.id
  }

  async getDeficit(): Promise<number> {
    const count = await this.getPoolCount()
    return Math.max(0, TARGET_POOL_SIZE - count)
  }
}
