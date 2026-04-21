import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlueBubblesConfig } from './types'

/**
 * Minimum number of warm Mac VPS instances to keep ready at all times.
 * When the warm count drops below this, the pool cron replenishes up to this size.
 */
const TARGET_POOL_SIZE = 2
const POOL_PROVIDER = 'imessage'

export interface PoolInstanceSeed {
  vpsId: string
  vpsIp: string
  bbServerUrl: string
  bbPassword: string
  sshKeyFingerprint: string
  vncPassword: string
  vncPort?: number
}

/**
 * VpsPool — data access for the `bridge_pool_instances` table.
 *
 * Responsibilities:
 *  - Insert new warm instances (addToPool)
 *  - Atomically claim a warm instance for a user connection (claimInstance)
 *  - Report pool size / deficit for the replenishment cron
 *
 * Provisioning (booting a VPS, SSH-configuring BlueBubbles) lives on
 * MacVpsProvisioner; this class is pure persistence.
 */
export class VpsPool {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Claim one warm instance for a user connection. Returns null when the
   * pool is empty — caller is responsible for surfacing a "try again" error.
   *
   * Uses a conditional UPDATE to avoid races: two concurrent claims cannot
   * both receive the same row because the WHERE includes status='warm' and
   * the UPDATE flips it to 'claimed' atomically.
   */
  async claimInstance(connectionId: string, _orgId: string): Promise<BlueBubblesConfig | null> {
    // Pick the oldest warm instance (FIFO — let the pool bake in longer
    // before we hand it to a user).
    const { data: candidate } = await this.supabase
      .from('bridge_pool_instances')
      .select('id, vps_id, vps_ip, bb_server_url, bb_password, ssh_key_fingerprint, vnc_port, vnc_password')
      .eq('provider', POOL_PROVIDER)
      .eq('status', 'warm')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!candidate) return null

    // Atomic claim — only succeeds if still warm. Guards against a race
    // where two connection requests arrive concurrently.
    const { data: claimed, error: claimErr } = await this.supabase
      .from('bridge_pool_instances')
      .update({
        status: 'claimed',
        claimed_by_connection_id: connectionId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'warm')
      .select('id')
      .maybeSingle()

    if (claimErr || !claimed) return null

    return {
      bb_server_url: candidate.bb_server_url,
      bb_password: candidate.bb_password,
      vps_ip: candidate.vps_ip,
      vps_id: candidate.vps_id,
      ssh_key_fingerprint: candidate.ssh_key_fingerprint,
      vnc_port: candidate.vnc_port || 5900,
      vnc_password: candidate.vnc_password,
      apple_id_email: '',
      protocol: 'imessage',
      linked_at: null,
      last_message_at: null,
    }
  }

  /** Count of instances currently ready to be claimed. */
  async getPoolCount(): Promise<number> {
    const { count } = await this.supabase
      .from('bridge_pool_instances')
      .select('id', { count: 'exact', head: true })
      .eq('provider', POOL_PROVIDER)
      .eq('status', 'warm')

    return count ?? 0
  }

  /** Count of instances currently being provisioned (not yet claimable). */
  async getProvisioningCount(): Promise<number> {
    const { count } = await this.supabase
      .from('bridge_pool_instances')
      .select('id', { count: 'exact', head: true })
      .eq('provider', POOL_PROVIDER)
      .eq('status', 'provisioning')

    return count ?? 0
  }

  /**
   * How many new instances need to be provisioned to reach the target.
   * Counts both warm AND in-flight (provisioning) so a slow cron run
   * doesn't over-provision.
   */
  async getDeficit(): Promise<number> {
    const [warm, inflight] = await Promise.all([
      this.getPoolCount(),
      this.getProvisioningCount(),
    ])
    return Math.max(0, TARGET_POOL_SIZE - warm - inflight)
  }

  /**
   * Reserve a provisioning slot before the VPS is booted. The returned row
   * ID is passed to markInstanceReady() once the VPS is SSH-reachable and
   * BlueBubbles is configured. Two-phase insert lets getDeficit() see
   * in-flight work so we don't over-provision.
   */
  async reserveProvisioningSlot(seed: PoolInstanceSeed): Promise<string> {
    const { data, error } = await this.supabase
      .from('bridge_pool_instances')
      .insert({
        provider: POOL_PROVIDER,
        vps_id: seed.vpsId,
        vps_ip: seed.vpsIp,
        bb_server_url: seed.bbServerUrl,
        bb_password: seed.bbPassword,
        ssh_key_fingerprint: seed.sshKeyFingerprint,
        vnc_port: seed.vncPort ?? 5900,
        vnc_password: seed.vncPassword,
        status: 'provisioning',
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to reserve pool slot: ${error.message}`)
    return data!.id
  }

  /** Promote a provisioning row to warm once SSH setup completes. */
  async markInstanceReady(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('bridge_pool_instances')
      .update({ status: 'warm', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(`Failed to mark pool instance ready: ${error.message}`)
  }

  /** Mark a provisioning row as failed (setup script failed, VPS unreachable, etc). */
  async markInstanceFailed(id: string, reason: string): Promise<void> {
    await this.supabase
      .from('bridge_pool_instances')
      .update({
        status: 'error',
        last_error: reason.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }

  /**
   * Convenience — insert a fully-provisioned warm instance in one shot.
   * Used by the admin seed endpoint when an operator has provisioned a
   * VPS by hand and just wants it added to the pool.
   */
  async addToPool(seed: PoolInstanceSeed): Promise<string> {
    const id = await this.reserveProvisioningSlot(seed)
    await this.markInstanceReady(id)
    return id
  }
}

export { TARGET_POOL_SIZE, POOL_PROVIDER }
