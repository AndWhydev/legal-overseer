import type { SupabaseClient } from '@supabase/supabase-js'
import { BridgeProvisioner } from './bridge-provisioner'

/**
 * Suspend bridges that haven't received a message in 7 days.
 * Called by /api/cron/bridge-lifecycle (daily).
 */
export async function suspendIdleBridges(
  supabase: SupabaseClient,
  provisioner: BridgeProvisioner,
): Promise<{ suspended: number; errors: string[] }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: connections } = await supabase
    .from('org_connections')
    .select('id, config')
    .eq('status', 'connected')
    .neq('provider', 'imessage')
    .not('config->fly_machine_id', 'is', null)
    .lt('config->last_message_at', sevenDaysAgo)

  let suspended = 0
  const errors: string[] = []

  for (const conn of connections || []) {
    const config = conn.config as Record<string, string>
    if (!config.fly_machine_id) continue

    try {
      await provisioner.suspend(conn.id, config.fly_machine_id)
      suspended++
    } catch (err) {
      errors.push(`${conn.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { suspended, errors }
}

/**
 * Check health of all active bridge machines.
 * Called by /api/cron/bridge-health (every 5 min).
 */
export async function checkBridgeHealth(
  supabase: SupabaseClient,
  provisioner: BridgeProvisioner,
): Promise<{ checked: number; healthy: number; errors: string[] }> {
  const { data: connections } = await supabase
    .from('org_connections')
    .select('id, config')
    .eq('status', 'connected')
    .not('config->fly_machine_id', 'is', null)

  let checked = 0
  let healthy = 0
  const errors: string[] = []

  for (const conn of connections || []) {
    const config = conn.config as Record<string, string>
    if (!config.fly_machine_id) continue

    checked++
    try {
      const health = await provisioner.checkHealth(config.fly_machine_id)
      if (health.running) {
        healthy++
      } else {
        try {
          await provisioner.wake(conn.id, config.fly_machine_id)
          healthy++
        } catch (wakeErr) {
          const msg = `${conn.id}: machine ${config.fly_machine_id} down, wake failed: ${wakeErr}`
          errors.push(msg)

          await supabase
            .from('org_connections')
            .update({ status: 'error', last_error: msg, updated_at: new Date().toISOString() })
            .eq('id', conn.id)
        }
      }
    } catch (err) {
      errors.push(`${conn.id}: health check failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { checked, healthy, errors }
}
