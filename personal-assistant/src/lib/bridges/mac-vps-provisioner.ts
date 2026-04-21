import { Client as SSHClient } from 'ssh2'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VpsPool } from './vps-pool'
import type { ImessageVpsClient } from './imessage-vps-client'
import type { LinkingInfo } from './types'
import { logger } from '../core/logger'

export interface MacVpsProvisionerConfig {
  sshPrivateKey: string
  sshUser: string
  webhookBaseUrl: string
  /**
   * Path to the bootstrap script baked into the VPS image. Invoked via SSH
   * as `bash <path> <bb_password> <bb_port>`. Defaults to the production
   * image path.
   */
  setupScriptPath?: string
}

export interface ReplenishResult {
  requested: number
  provisioned: number
  failed: number
  errors: string[]
}

export class MacVpsProvisioner {
  constructor(
    private supabase: SupabaseClient,
    private pool: VpsPool,
    private config: MacVpsProvisionerConfig,
    /**
     * Optional VPS provider client. When omitted, replenishPool() will
     * throw — only the claim/destroy paths work without it (they operate
     * on already-provisioned instances).
     */
    private vpsClient?: ImessageVpsClient,
  ) {}

  // -------------------------------------------------------------------------
  // Pool replenishment
  // -------------------------------------------------------------------------

  /**
   * Top the pool up to target size. Called by the /api/cron/bridge-pool
   * cron. Provisions instances sequentially (not in parallel) so a burst
   * of errors doesn't hammer the VPS provider's API.
   *
   * Each instance goes through three phases, each reflected in the DB:
   *   1. reserveProvisioningSlot — row inserted with status='provisioning'
   *      so getDeficit() sees the in-flight work.
   *   2. VPS boot + SSH-reachable + setup script runs.
   *   3. markInstanceReady — status flips to 'warm', eligible for claim.
   *
   * Failures are recorded per-instance via markInstanceFailed so operators
   * can inspect what went wrong without re-running the whole cron.
   */
  async replenishPool(): Promise<ReplenishResult> {
    if (!this.vpsClient) {
      throw new Error('[mac-vps-provisioner] replenishPool requires IMESSAGE_VPS_* env vars')
    }

    const deficit = await this.pool.getDeficit()
    const result: ReplenishResult = {
      requested: deficit,
      provisioned: 0,
      failed: 0,
      errors: [],
    }

    if (deficit === 0) return result

    logger.info('[mac-vps-provisioner] Replenishing pool', { deficit })

    for (let i = 0; i < deficit; i++) {
      const bbPassword = randomToken(32)
      const vncPassword = randomToken(12)
      const name = `bitbit-imessage-${Date.now()}-${i}`

      try {
        await this.provisionOne({ name, bbPassword, vncPassword })
        result.provisioned++
      } catch (err) {
        result.failed++
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(msg)
        logger.error('[mac-vps-provisioner] Failed to provision one instance', {
          name, error: msg,
        })
      }
    }

    logger.info('[mac-vps-provisioner] Replenish complete', result)
    return result
  }

  private async provisionOne(opts: {
    name: string
    bbPassword: string
    vncPassword: string
  }): Promise<void> {
    // Phase 1: boot VPS via provider API
    const instance = await this.vpsClient!.createInstance({ name: opts.name })

    // Phase 2: reserve a row so getDeficit sees in-flight work
    const bbServerUrl = `http://${instance.ip || 'pending'}:1234`
    const slotId = await this.pool.reserveProvisioningSlot({
      vpsId: instance.id,
      vpsIp: instance.ip || '0.0.0.0',
      bbServerUrl,
      bbPassword: opts.bbPassword,
      sshKeyFingerprint: '',
      vncPassword: opts.vncPassword,
    })

    try {
      // Wait for running + public IP
      const ready = await this.vpsClient!.waitForRunning(instance.id)

      // Update row with real IP (could differ from initial response)
      await this.supabase
        .from('bridge_pool_instances')
        .update({
          vps_ip: ready.ip,
          bb_server_url: `http://${ready.ip}:1234`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', slotId)

      // Wait until SSH responds (macOS boot takes ~60-120s after IP assignment)
      await this.waitForSsh(ready.ip)

      // Run bootstrap script baked into the VPS image
      const scriptPath = this.config.setupScriptPath ?? '/usr/local/bin/bitbit-imessage-setup.sh'
      await this.sshExec(ready.ip, [
        `bash ${scriptPath} ${shellEscape(opts.bbPassword)} 1234`,
      ])

      // Phase 3: promote to warm
      await this.pool.markInstanceReady(slotId)
      logger.info('[mac-vps-provisioner] Instance ready', { slotId, vpsId: instance.id, ip: ready.ip })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.pool.markInstanceFailed(slotId, msg)
      // Best-effort cleanup of the VPS so we don't leak billed instances
      try {
        await this.vpsClient!.deleteInstance(instance.id)
      } catch {
        // swallow — already in error path
      }
      throw err
    }
  }

  private async waitForSsh(ip: string, timeoutMs = 240_000, pollMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    let lastErr: unknown
    while (Date.now() < deadline) {
      try {
        await this.sshExec(ip, ['true'])
        return
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, pollMs))
      }
    }
    throw new Error(`[mac-vps-provisioner] SSH never came up on ${ip}: ${lastErr instanceof Error ? lastErr.message : 'unknown'}`)
  }

  async provision(opts: {
    orgId: string
    userId: string
    connectionId: string
    appleIdEmail: string
  }): Promise<LinkingInfo> {
    const instance = await this.pool.claimInstance(opts.connectionId, opts.orgId)
    if (!instance) {
      throw new Error('No warm Mac VPS instances available. Please try again in a few minutes.')
    }

    await this.supabase
      .from('org_connections')
      .update({
        status: 'provisioning',
        config: {
          ...instance,
          apple_id_email: opts.appleIdEmail,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.connectionId)

    const webhookUrl = `${this.config.webhookBaseUrl}/api/connections/${opts.connectionId}/webhook?token=${instance.bb_password}`

    try {
      await this.sshExec(instance.vps_ip, [
        `curl -s -X POST "http://localhost:1234/api/v1/webhook?password=${instance.bb_password}" ` +
          `-H "Content-Type: application/json" ` +
          `-d '{"url":"${webhookUrl}","events":["new-message","updated-message","typing-indicator"]}'`,
        `bash /opt/bitbit/kiosk-setup.sh "${opts.appleIdEmail}"`,
      ])
    } catch (err) {
      await this.supabase
        .from('org_connections')
        .update({
          status: 'error',
          last_error: `SSH setup failed: ${err instanceof Error ? err.message : String(err)}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', opts.connectionId)

      throw err
    }

    await this.supabase
      .from('org_connections')
      .update({
        status: 'provisioning',
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.connectionId)

    await this.supabase.from('connection_sync_logs').insert({
      connection_id: opts.connectionId,
      status: 'success',
      messages_found: 0,
      messages_inserted: 0,
      duplicates: 0,
      error_message: `Mac VPS ${instance.vps_id} claimed from pool, kiosk ready`,
    })

    return {
      connection_id: opts.connectionId,
      protocol: 'imessage',
      link_type: 'vnc' as any,
      link_data: JSON.stringify({
        vps_ip: instance.vps_ip,
        vnc_port: instance.vnc_port,
        vnc_password: instance.vnc_password,
      }),
      status: 'waiting',
    }
  }

  async destroy(connectionId: string, vpsIp: string): Promise<void> {
    try {
      await this.sshExec(vpsIp, [
        'launchctl unload ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist 2>/dev/null || true',
        'killall BlueBubbles 2>/dev/null || true',
        'rm -rf ~/Library/Messages/chat.db-wal ~/Library/Messages/chat.db-shm 2>/dev/null || true',
      ])
    } catch {
      // Best effort cleanup
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
      error_message: `Mac VPS at ${vpsIp} destroyed`,
    })
  }

  async checkHealth(bbServerUrl: string, bbPassword: string): Promise<boolean> {
    try {
      const res = await fetch(`${bbServerUrl}/api/v1/ping?password=${bbPassword}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return false
      const data = await res.json() as { data?: string }
      return data.data === 'pong'
    } catch {
      return false
    }
  }

  async checkImessageActive(bbServerUrl: string, bbPassword: string): Promise<boolean> {
    try {
      const res = await fetch(`${bbServerUrl}/api/v1/chat/query?password=${bbPassword}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1 }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return false
      const data = await res.json() as { data?: unknown[] }
      return Array.isArray(data.data) && data.data.length > 0
    } catch {
      return false
    }
  }

  private sshExec(host: string, commands: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new SSHClient()

      conn.on('ready', async () => {
        try {
          for (const cmd of commands) {
            await new Promise<void>((res, rej) => {
              conn.exec(cmd, (err, stream) => {
                if (err) return rej(err)
                let stderr = ''
                stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
                stream.on('close', (code: number) => {
                  if (code !== 0) rej(new Error(`Command failed (exit ${code}): ${stderr || cmd}`))
                  else res()
                })
              })
            })
          }
          conn.end()
          resolve()
        } catch (err) {
          conn.end()
          reject(err)
        }
      })

      conn.on('error', reject)

      conn.connect({
        host,
        port: 22,
        username: this.config.sshUser,
        privateKey: this.config.sshPrivateKey,
        readyTimeout: 30_000,
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomToken(length: number): string {
  // crypto.randomUUID yields 32 hex chars (minus dashes) — plenty for bb + vnc
  const hex = globalThis.crypto.randomUUID().replace(/-/g, '')
  return hex.slice(0, length)
}

function shellEscape(v: string): string {
  // Single-quote, escape embedded single quotes the POSIX-safe way.
  return `'${v.replace(/'/g, `'\\''`)}'`
}

