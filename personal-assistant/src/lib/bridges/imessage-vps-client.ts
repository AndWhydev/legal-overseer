/**
 * ImessageVpsClient
 *
 * Proprietary BitBit client for booting and tearing down the macOS VPS
 * instances that host the iMessage bridge (BlueBubbles + kiosk + VNC).
 *
 * The underlying compute is a vendor VPS API, isolated behind this class.
 * Consumers only see the `VpsInstance` shape — they do not know or care
 * which vendor we're using. This keeps the bridge code vendor-agnostic and
 * makes swapping providers (or running multiple in parallel) a one-file
 * change.
 *
 * Env contract (all IMESSAGE_VPS_* prefix):
 *  - IMESSAGE_VPS_API_KEY       — bearer token for the VPS provider REST API
 *  - IMESSAGE_VPS_API_BASE_URL  — e.g. https://api.example.com/v1
 *  - IMESSAGE_VPS_REGION        — provider region slug (e.g. "us-west")
 *  - IMESSAGE_VPS_IMAGE_ID      — macOS image ID with BlueBubbles deps baked in
 *  - IMESSAGE_VPS_PLAN_ID       — VPS plan / size SKU
 *  - IMESSAGE_VPS_SSH_KEY_ID    — pre-registered SSH public key ID to inject
 */

import { logger } from '../core/logger'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VpsInstance {
  /** Opaque provider-assigned instance ID. */
  id: string
  /** Public IPv4 address, once the instance is running. */
  ip: string
  /** Current lifecycle state reported by the provider. */
  status: 'booting' | 'running' | 'stopped' | 'destroyed' | 'error'
  /** ISO timestamp when the instance was created. */
  created_at: string
}

export interface CreateInstanceOptions {
  /** Human-readable name (shown in provider console + logs). */
  name: string
  /**
   * Optional override for the SSH key ID to inject. Defaults to the
   * IMESSAGE_VPS_SSH_KEY_ID env var.
   */
  sshKeyId?: string
}

export interface ImessageVpsClientConfig {
  apiKey: string
  apiBaseUrl: string
  region: string
  imageId: string
  planId: string
  sshKeyId: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a client from environment variables. Throws if any required var
 * is missing — callers should check `isImessageVpsConfigured()` first.
 */
export function createImessageVpsClient(): ImessageVpsClient {
  const cfg: ImessageVpsClientConfig = {
    apiKey: requireEnv('IMESSAGE_VPS_API_KEY'),
    apiBaseUrl: requireEnv('IMESSAGE_VPS_API_BASE_URL'),
    region: requireEnv('IMESSAGE_VPS_REGION'),
    imageId: requireEnv('IMESSAGE_VPS_IMAGE_ID'),
    planId: requireEnv('IMESSAGE_VPS_PLAN_ID'),
    sshKeyId: requireEnv('IMESSAGE_VPS_SSH_KEY_ID'),
  }
  return new ImessageVpsClient(cfg)
}

/**
 * Check whether the iMessage VPS client can be constructed from env.
 * Used by cron + admin endpoints to fail fast with a clear message.
 */
export function isImessageVpsConfigured(): boolean {
  return [
    'IMESSAGE_VPS_API_KEY',
    'IMESSAGE_VPS_API_BASE_URL',
    'IMESSAGE_VPS_REGION',
    'IMESSAGE_VPS_IMAGE_ID',
    'IMESSAGE_VPS_PLAN_ID',
    'IMESSAGE_VPS_SSH_KEY_ID',
  ].every((k) => !!process.env[k])
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`[imessage-vps] Missing required env var: ${name}`)
  return v
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ImessageVpsClient {
  constructor(private cfg: ImessageVpsClientConfig) {}

  /** POST {base}/instances — boots a new macOS VPS and returns its identity. */
  async createInstance(opts: CreateInstanceOptions): Promise<VpsInstance> {
    const body = {
      name: opts.name,
      region: this.cfg.region,
      image: this.cfg.imageId,
      plan: this.cfg.planId,
      ssh_key_id: opts.sshKeyId ?? this.cfg.sshKeyId,
    }

    const res = await this.fetch('/instances', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[imessage-vps] createInstance failed: ${res.status} ${text.slice(0, 300)}`)
    }

    const raw = (await res.json()) as Record<string, unknown>
    return this.normalize(raw)
  }

  /** GET {base}/instances/:id */
  async getInstance(id: string): Promise<VpsInstance | null> {
    const res = await this.fetch(`/instances/${encodeURIComponent(id)}`)
    if (res.status === 404) return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[imessage-vps] getInstance failed: ${res.status} ${text.slice(0, 300)}`)
    }
    const raw = (await res.json()) as Record<string, unknown>
    return this.normalize(raw)
  }

  /** DELETE {base}/instances/:id — destroys the VPS permanently. */
  async deleteInstance(id: string): Promise<boolean> {
    const res = await this.fetch(`/instances/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.status === 404) return true // Already gone
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.error('[imessage-vps] deleteInstance failed', {
        id, status: res.status, body: text.slice(0, 300),
      })
      return false
    }
    return true
  }

  /** GET {base}/instances */
  async listInstances(): Promise<VpsInstance[]> {
    const res = await this.fetch('/instances')
    if (!res.ok) return []
    const raw = (await res.json()) as { items?: Record<string, unknown>[] } | Record<string, unknown>[]
    const items = Array.isArray(raw) ? raw : (raw.items ?? [])
    return items.map((i) => this.normalize(i))
  }

  /**
   * Poll until the instance reaches 'running' state (or timeout).
   * Returns the final instance snapshot, or throws on timeout / error state.
   */
  async waitForRunning(id: string, timeoutMs = 300_000, pollMs = 5_000): Promise<VpsInstance> {
    const deadline = Date.now() + timeoutMs
    let last: VpsInstance | null = null
    while (Date.now() < deadline) {
      last = await this.getInstance(id)
      if (last?.status === 'running' && last.ip) return last
      if (last?.status === 'error' || last?.status === 'destroyed') {
        throw new Error(`[imessage-vps] instance ${id} entered terminal state: ${last.status}`)
      }
      await sleep(pollMs)
    }
    throw new Error(`[imessage-vps] Timeout waiting for instance ${id} to reach running state (last=${last?.status ?? 'unknown'})`)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.cfg.apiBaseUrl.replace(/\/$/, '')}${path}`
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    })
  }

  /**
   * Normalize the provider's response shape into our `VpsInstance`.
   * Tolerates a few common field-name variations (id / instance_id,
   * ip / public_ip, status / state). Centralizing this here means the
   * rest of the codebase doesn't care about provider idiosyncrasies.
   */
  private normalize(raw: Record<string, unknown>): VpsInstance {
    const id = (raw.id ?? raw.instance_id ?? raw.uuid) as string
    const ip = (raw.ip ?? raw.public_ip ?? raw.ipv4 ?? '') as string
    const rawStatus = String(raw.status ?? raw.state ?? '').toLowerCase()
    const createdAt = (raw.created_at ?? raw.createdAt ?? new Date().toISOString()) as string

    return {
      id,
      ip,
      status: mapStatus(rawStatus),
      created_at: createdAt,
    }
  }
}

function mapStatus(raw: string): VpsInstance['status'] {
  if (['running', 'active', 'started'].includes(raw)) return 'running'
  if (['starting', 'booting', 'pending', 'creating', 'provisioning'].includes(raw)) return 'booting'
  if (['stopped', 'shutdown', 'off'].includes(raw)) return 'stopped'
  if (['destroyed', 'deleted', 'terminated'].includes(raw)) return 'destroyed'
  return 'error'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
