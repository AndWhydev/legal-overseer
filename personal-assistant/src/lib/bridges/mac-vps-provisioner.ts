import { Client as SSHClient } from 'ssh2'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VpsPool } from './vps-pool'
import type { LinkingInfo } from './types'

export interface MacVpsProvisionerConfig {
  sshPrivateKey: string
  sshUser: string
  webhookBaseUrl: string
}

export class MacVpsProvisioner {
  constructor(
    private supabase: SupabaseClient,
    private pool: VpsPool,
    private config: MacVpsProvisionerConfig,
  ) {}

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
