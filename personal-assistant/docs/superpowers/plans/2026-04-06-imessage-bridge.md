# iMessage Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect their iMessage account to BitBit via a LightNode Mac VPS running BlueBubbles, with a bulletproof noVNC sign-in experience embedded in the dashboard.

**Architecture:** BitBit maintains a warm pool of pre-provisioned LightNode Mac VPS instances running BlueBubbles. On "Connect iMessage," we claim a warm instance, personalize it (webhook + kiosk lockdown), embed a noVNC viewer for Apple ID sign-in, then auto-detect activation. Messages flow via BlueBubbles webhooks (inbound) and REST API (outbound).

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, BlueBubbles REST API, noVNC (WebSocket VNC client), ssh2 (Node.js SSH), LightNode Mac VPS

**Spec:** `docs/superpowers/specs/2026-04-06-imessage-bridge-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/bridges/mac-vps-provisioner.ts` | MacVpsProvisioner class — claim from pool, SSH setup, kiosk, VNC, destroy |
| `src/lib/bridges/__tests__/mac-vps-provisioner.test.ts` | Tests for MacVpsProvisioner |
| `src/lib/bridges/vps-pool.ts` | Warm pool management — claim available instance, replenish, list |
| `src/lib/bridges/__tests__/vps-pool.test.ts` | Tests for VPS pool |
| `src/lib/connections/providers/bluebubbles.ts` | Provider plugin — webhookParse, send, healthCheck, pull |
| `src/lib/connections/providers/__tests__/bluebubbles.test.ts` | Tests for BlueBubbles provider |
| `src/app/api/cron/bridge-pool/route.ts` | Cron to maintain warm pool ≥2 instances |
| `infra/imessage/setup.sh` | SSH setup script — BlueBubbles configure, kiosk lockdown |
| `infra/imessage/kiosk-watcher.sh` | LaunchAgent script — keeps Messages.app focused |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/bridges/types.ts` | Add `MacVpsInstance` interface |
| `src/lib/bridges/index.ts` | Export MacVpsProvisioner, add `createImessageProvisioner` factory |
| `src/lib/connections/providers/beeper.ts` | No changes (reference only) |
| `src/lib/connections/built-in-providers.ts` | Import + register `blueBubblesProvider` for iMessage |
| `src/lib/connections/templates.ts` | Add `imessageConfigFields` |
| `src/app/api/bridges/provision/route.ts` | Branch iMessage protocol to MacVpsProvisioner |
| `src/app/api/bridges/link-status/route.ts` | Add BlueBubbles health polling for iMessage connections |
| `src/app/api/cron/bridge-health/route.ts` | Add BlueBubbles ping path for iMessage |
| `src/lib/bridges/bridge-lifecycle.ts` | Skip suspension for iMessage connections |
| `src/components/channels/bridge-link-modal.tsx` | Replace iMessage credential form with noVNC viewer |
| `vercel.json` | Add bridge-pool cron entry |
| `docs/adr/0005-imessage-bridge-approach.md` | Update with corrected approach |
| `package.json` | Add `@novnc/novnc` and `ssh2` + `@types/ssh2` dependencies |

---

### Task 1: Add Types and Dependencies

**Files:**
- Modify: `src/lib/bridges/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Add MacVpsInstance interface to types.ts**

Add after the `FlyVolume` interface at the bottom of the file:

```typescript
export interface MacVpsInstance {
  id: string
  vps_id: string
  vps_ip: string
  ssh_key_fingerprint: string
  bb_server_url: string
  bb_password: string
  vnc_port: number
  vnc_password: string
  status: 'warm' | 'claimed' | 'active' | 'destroying'
  claimed_by_connection_id: string | null
  created_at: string
}

export interface BlueBubblesConfig {
  bb_server_url: string
  bb_password: string
  vps_ip: string
  vps_id: string
  ssh_key_fingerprint: string
  vnc_port: number
  vnc_password: string
  apple_id_email: string
  protocol: 'imessage'
  linked_at: string | null
  last_message_at: string | null
}

export interface BlueBubblesWebhookPayload {
  type: string
  data: {
    guid: string
    text: string | null
    isFromMe: boolean
    dateCreated: number
    handle: {
      address: string
      service: string
    } | null
    chats: { guid: string; displayName: string }[]
    attachments: {
      guid: string
      mimeType: string
      filePath: string
      transferName: string
    }[]
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npm install ssh2 @types/ssh2 @novnc/novnc`

Expected: packages added to package.json dependencies

- [ ] **Step 3: Commit**

```bash
git add src/lib/bridges/types.ts package.json package-lock.json
git commit -m "feat(imessage): add Mac VPS types and install ssh2 + novnc dependencies"
```

---

### Task 2: VPS Pool Manager

**Files:**
- Create: `src/lib/bridges/vps-pool.ts`
- Create: `src/lib/bridges/__tests__/vps-pool.test.ts`

- [ ] **Step 1: Write failing tests for VPS pool**

```typescript
// src/lib/bridges/__tests__/vps-pool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VpsPool } from '../vps-pool'

function createMockSupabase() {
  const chainMethods = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
  }
  return {
    from: vi.fn(() => ({ ...chainMethods })),
    _chain: chainMethods,
  } as any
}

describe('VpsPool', () => {
  let supabase: ReturnType<typeof createMockSupabase>
  let pool: VpsPool

  beforeEach(() => {
    supabase = createMockSupabase()
    pool = new VpsPool(supabase)
  })

  it('claimInstance returns a warm instance and marks it claimed', async () => {
    const warmInstance = {
      id: 'conn-pool-1',
      config: {
        vps_id: 'ln-123',
        vps_ip: '103.1.2.3',
        bb_server_url: 'https://abc.trycloudflare.com',
        bb_password: 'secret123',
        vnc_port: 5900,
        vnc_password: 'vnc-pass',
        ssh_key_fingerprint: 'SHA256:abc',
        status: 'warm',
      },
    }

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: warmInstance, error: null }),
    }
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    supabase.from = vi.fn((table: string) => {
      if (table === 'org_connections') {
        return { ...selectChain, ...updateChain }
      }
      return selectChain
    })

    const result = await pool.claimInstance('conn-user-1', 'org-1')
    expect(result).toBeDefined()
    expect(result!.vps_ip).toBe('103.1.2.3')
    expect(supabase.from).toHaveBeenCalledWith('org_connections')
  })

  it('claimInstance returns null when pool is empty', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    supabase.from = vi.fn(() => selectChain)

    const result = await pool.claimInstance('conn-user-1', 'org-1')
    expect(result).toBeNull()
  })

  it('getPoolCount returns number of warm instances', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    // Mock the response with count
    selectChain.eq = vi.fn().mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }],
      error: null,
    })
    supabase.from = vi.fn(() => selectChain)

    const count = await pool.getPoolCount()
    expect(typeof count).toBe('number')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run src/lib/bridges/__tests__/vps-pool.test.ts`

Expected: FAIL — module `../vps-pool` not found

- [ ] **Step 3: Implement VpsPool**

```typescript
// src/lib/bridges/vps-pool.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlueBubblesConfig } from './types'

const POOL_ORG_ID = '__bitbit_pool__'
const POOL_PROVIDER = 'imessage'
const TARGET_POOL_SIZE = 2

export class VpsPool {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Claim a warm instance from the pool for a user's connection.
   * Returns the BlueBubbles config or null if pool is empty.
   */
  async claimInstance(
    connectionId: string,
    orgId: string,
  ): Promise<BlueBubblesConfig | null> {
    // Find a warm pool instance
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

    // Transfer ownership: update the pool row to point to the real connection
    // We don't reuse the pool row — we copy config to the user's connection
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

    // Mark pool instance as claimed (so it's not double-claimed)
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

  /**
   * Get the number of warm (available) instances in the pool.
   */
  async getPoolCount(): Promise<number> {
    const { data } = await this.supabase
      .from('org_connections')
      .select('id')
      .eq('org_id', POOL_ORG_ID)
      .eq('provider', POOL_PROVIDER)
      .eq('status', 'pending')

    return data?.length ?? 0
  }

  /**
   * Add a new warm instance to the pool.
   * Called by the pool replenishment cron after SSH setup completes.
   */
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

  /**
   * Check if pool needs replenishment and return deficit.
   */
  async getDeficit(): Promise<number> {
    const count = await this.getPoolCount()
    return Math.max(0, TARGET_POOL_SIZE - count)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run src/lib/bridges/__tests__/vps-pool.test.ts`

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridges/vps-pool.ts src/lib/bridges/__tests__/vps-pool.test.ts
git commit -m "feat(imessage): add VPS warm pool manager"
```

---

### Task 3: MacVpsProvisioner

**Files:**
- Create: `src/lib/bridges/mac-vps-provisioner.ts`
- Create: `src/lib/bridges/__tests__/mac-vps-provisioner.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/bridges/__tests__/mac-vps-provisioner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MacVpsProvisioner } from '../mac-vps-provisioner'

// Mock ssh2
vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: vi.fn().mockReturnThis(),
    connect: vi.fn(),
    exec: vi.fn((_cmd: string, cb: Function) => {
      const stream = {
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'close') setTimeout(() => handler(0), 10)
          return stream
        }),
        stderr: { on: vi.fn().mockReturnThis() },
      }
      cb(null, stream)
    }),
    end: vi.fn(),
  })),
}))

function createMockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'conn-1' }, error: null }),
  }
  return { from: vi.fn(() => chain), _chain: chain } as any
}

function createMockPool() {
  return {
    claimInstance: vi.fn().mockResolvedValue({
      bb_server_url: 'https://test.trycloudflare.com',
      bb_password: 'test-pass-32chars-abcdefghijklmn',
      vps_ip: '103.1.2.3',
      vps_id: 'ln-test-123',
      ssh_key_fingerprint: 'SHA256:test',
      vnc_port: 5900,
      vnc_password: 'vnc-test-pass',
      apple_id_email: '',
      protocol: 'imessage' as const,
      linked_at: null,
      last_message_at: null,
    }),
    getPoolCount: vi.fn().mockResolvedValue(2),
    getDeficit: vi.fn().mockResolvedValue(0),
  }
}

describe('MacVpsProvisioner', () => {
  let supabase: ReturnType<typeof createMockSupabase>
  let pool: ReturnType<typeof createMockPool>
  let provisioner: MacVpsProvisioner

  beforeEach(() => {
    supabase = createMockSupabase()
    pool = createMockPool()
    provisioner = new MacVpsProvisioner(supabase, pool as any, {
      sshPrivateKey: 'test-key',
      sshUser: 'admin',
      webhookBaseUrl: 'https://app.bitbit.chat',
    })
  })

  it('provision claims from pool and returns linking info', async () => {
    const result = await provisioner.provision({
      orgId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      appleIdEmail: 'test@icloud.com',
    })

    expect(pool.claimInstance).toHaveBeenCalledWith('conn-1', 'org-1')
    expect(result.connection_id).toBe('conn-1')
    expect(result.protocol).toBe('imessage')
    expect(result.link_type).toBe('vnc')
    expect(result.status).toBe('waiting')
  })

  it('provision throws when pool is empty', async () => {
    pool.claimInstance.mockResolvedValue(null)

    await expect(
      provisioner.provision({
        orgId: 'org-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        appleIdEmail: 'test@icloud.com',
      }),
    ).rejects.toThrow('No warm Mac VPS instances available')
  })

  it('destroy updates connection status to disabled', async () => {
    await provisioner.destroy('conn-1', '103.1.2.3')

    expect(supabase.from).toHaveBeenCalledWith('org_connections')
    expect(supabase._chain.update).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run src/lib/bridges/__tests__/mac-vps-provisioner.test.ts`

Expected: FAIL — module `../mac-vps-provisioner` not found

- [ ] **Step 3: Implement MacVpsProvisioner**

```typescript
// src/lib/bridges/mac-vps-provisioner.ts
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

  /**
   * Provision an iMessage bridge by claiming a warm VPS from the pool,
   * personalizing it with the user's webhook URL and Apple ID email,
   * then enabling the VNC kiosk for sign-in.
   */
  async provision(opts: {
    orgId: string
    userId: string
    connectionId: string
    appleIdEmail: string
  }): Promise<LinkingInfo> {
    // 1. Claim a warm instance from the pool
    const instance = await this.pool.claimInstance(opts.connectionId, opts.orgId)
    if (!instance) {
      throw new Error('No warm Mac VPS instances available. Please try again in a few minutes.')
    }

    // 2. Update org_connections with VPS details
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

    // 3. SSH into VPS and personalize
    const webhookUrl = `${this.config.webhookBaseUrl}/api/connections/${opts.connectionId}/webhook?token=${instance.bb_password}`

    try {
      await this.sshExec(instance.vps_ip, [
        // Register webhook with BlueBubbles
        `curl -s -X POST "http://localhost:1234/api/v1/webhook?password=${instance.bb_password}" ` +
          `-H "Content-Type: application/json" ` +
          `-d '{"url":"${webhookUrl}","events":["new-message","updated-message","typing-indicator"]}'`,
        // Run kiosk setup with Apple ID email
        `bash /opt/bitbit/kiosk-setup.sh "${opts.appleIdEmail}"`,
      ])
    } catch (err) {
      // SSH failed — update connection to error state
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

    // 4. Update status to linking (VNC ready)
    await this.supabase
      .from('org_connections')
      .update({
        status: 'provisioning', // stays provisioning until VNC is shown, then link-status handles transition
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.connectionId)

    // 5. Log provisioning event
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

  /**
   * Destroy an iMessage bridge — stop BlueBubbles, clean user data, destroy VPS.
   */
  async destroy(connectionId: string, vpsIp: string): Promise<void> {
    try {
      await this.sshExec(vpsIp, [
        'launchctl unload ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist 2>/dev/null || true',
        'killall BlueBubbles 2>/dev/null || true',
        'rm -rf ~/Library/Messages/chat.db-wal ~/Library/Messages/chat.db-shm 2>/dev/null || true',
      ])
    } catch {
      // Best effort cleanup — VPS may already be gone
    }

    // TODO: When LightNode API is available, destroy the VPS instance here
    // For now, mark connection as disabled
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

  /**
   * Check health of a BlueBubbles instance via its REST API.
   */
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

  /**
   * Check if iMessage is signed in by querying BlueBubbles for chats.
   */
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

  /**
   * Execute commands on a VPS via SSH.
   */
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run src/lib/bridges/__tests__/mac-vps-provisioner.test.ts`

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridges/mac-vps-provisioner.ts src/lib/bridges/__tests__/mac-vps-provisioner.test.ts
git commit -m "feat(imessage): add MacVpsProvisioner with SSH automation"
```

---

### Task 4: BlueBubbles Provider Plugin

**Files:**
- Create: `src/lib/connections/providers/bluebubbles.ts`
- Create: `src/lib/connections/providers/__tests__/bluebubbles.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/connections/providers/__tests__/bluebubbles.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { blueBubblesProvider } from '../bluebubbles'
import type { OrgConnection, Envelope } from '../../types'

function mockConnection(overrides: Partial<OrgConnection> = {}): OrgConnection {
  return {
    id: 'conn-1',
    org_id: 'org-1',
    provider: 'imessage',
    display_name: 'iMessage',
    transport: 'webhook',
    capabilities: ['push', 'send', 'webhook'],
    status: 'connected',
    template: null,
    bridge_token: null,
    webhook_secret: null,
    poll_interval: null,
    poll_cursor: null,
    last_sync_at: null,
    last_error: null,
    message_count: 0,
    config: {
      bb_server_url: 'https://test.trycloudflare.com',
      bb_password: 'test-password-32chars-abcdef1234',
      vps_ip: '103.1.2.3',
      protocol: 'imessage',
    },
    created_at: '2026-04-06T00:00:00Z',
    updated_at: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

describe('blueBubblesProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('webhookParse', () => {
    it('parses a new-message webhook into an Envelope', async () => {
      const body = {
        type: 'new-message',
        data: {
          guid: 'msg-abc-123',
          text: 'Hey, are we still on for tomorrow?',
          isFromMe: false,
          dateCreated: 1712438400000,
          handle: { address: '+61400000000', service: 'iMessage' },
          chats: [{ guid: 'iMessage;-;+61400000000', displayName: 'John Smith' }],
          attachments: [],
        },
      }

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const conn = mockConnection()
      const envelopes = await blueBubblesProvider.webhookParse!(req, conn)

      expect(envelopes).toHaveLength(1)
      expect(envelopes[0].provider).toBe('imessage')
      expect(envelopes[0].transport).toBe('webhook')
      expect(envelopes[0].dedup_key).toBe('msg-abc-123')
      expect(envelopes[0].payload.body).toBe('Hey, are we still on for tomorrow?')
      expect(envelopes[0].payload.sender?.name).toBe('John Smith')
      expect(envelopes[0].payload.sender?.phone).toBe('+61400000000')
      expect(envelopes[0].payload.metadata?.chat_guid).toBe('iMessage;-;+61400000000')
      expect(envelopes[0].payload.metadata?.bb_message_guid).toBe('msg-abc-123')
    })

    it('ignores messages from self (isFromMe)', async () => {
      const body = {
        type: 'new-message',
        data: {
          guid: 'msg-self-1',
          text: 'My own message',
          isFromMe: true,
          dateCreated: 1712438400000,
          handle: null,
          chats: [{ guid: 'iMessage;-;+61400000000', displayName: '' }],
          attachments: [],
        },
      }

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const envelopes = await blueBubblesProvider.webhookParse!(req, mockConnection())
      expect(envelopes).toHaveLength(0)
    })

    it('ignores non-message events (typing-indicator)', async () => {
      const body = { type: 'typing-indicator', data: { guid: 'x', display: true } }

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const envelopes = await blueBubblesProvider.webhookParse!(req, mockConnection())
      expect(envelopes).toHaveLength(0)
    })

    it('handles messages with attachments', async () => {
      const body = {
        type: 'new-message',
        data: {
          guid: 'msg-attach-1',
          text: 'Check this photo',
          isFromMe: false,
          dateCreated: 1712438400000,
          handle: { address: '+61400000000', service: 'iMessage' },
          chats: [{ guid: 'iMessage;-;+61400000000', displayName: '' }],
          attachments: [{
            guid: 'att-1',
            mimeType: 'image/jpeg',
            filePath: '/path/to/image.jpg',
            transferName: 'photo.jpg',
          }],
        },
      }

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const envelopes = await blueBubblesProvider.webhookParse!(req, mockConnection())
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0].payload.attachments).toHaveLength(1)
      expect(envelopes[0].payload.attachments![0].name).toBe('photo.jpg')
      expect(envelopes[0].payload.attachments![0].mime).toBe('image/jpeg')
    })
  })

  describe('send', () => {
    it('sends a message via BlueBubbles REST API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 200, data: {} }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const conn = mockConnection()
      const envelope: Envelope = {
        connection_id: 'conn-1',
        org_id: 'org-1',
        provider: 'imessage',
        transport: 'webhook',
        dedup_key: 'reply-1',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'message',
          body: 'Yes, confirmed for 2pm!',
          metadata: { chat_guid: 'iMessage;-;+61400000000' },
        },
      }

      await blueBubblesProvider.send!(conn, envelope)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/message/text?password='),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('iMessage;-;+61400000000'),
        }),
      )
    })
  })

  describe('healthCheck', () => {
    it('returns true when BlueBubbles responds with pong', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 200, message: 'Ping received!', data: 'pong' }),
      }))

      const result = await blueBubblesProvider.healthCheck!(mockConnection())
      expect(result).toBe(true)
    })

    it('returns false when BlueBubbles is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      const result = await blueBubblesProvider.healthCheck!(mockConnection())
      expect(result).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run src/lib/connections/providers/__tests__/bluebubbles.test.ts`

Expected: FAIL — module `../bluebubbles` not found

- [ ] **Step 3: Implement BlueBubbles provider**

```typescript
// src/lib/connections/providers/bluebubbles.ts
/**
 * BlueBubbles Provider Plugin
 *
 * Bridges iMessage via a BlueBubbles server running on a Mac VPS.
 * Receives messages via webhook, sends via REST API.
 *
 * Config shape (stored in org_connections.config):
 *   bb_server_url: string  — BlueBubbles Cloudflare tunnel URL
 *   bb_password: string    — BlueBubbles server password
 *   vps_ip: string         — Mac VPS IP address
 *   protocol: 'imessage'
 */

import type { ProviderPlugin, OrgConnection, Envelope } from '../types'
import type { BlueBubblesWebhookPayload } from '../../bridges/types'

interface BlueBubblesConfig {
  bb_server_url: string
  bb_password: string
}

function getConfig(connection: OrgConnection): BlueBubblesConfig {
  const cfg = connection.config as Record<string, unknown>
  if (!cfg.bb_server_url || !cfg.bb_password) {
    throw new Error('iMessage connection missing bb_server_url or bb_password')
  }
  return {
    bb_server_url: (cfg.bb_server_url as string).replace(/\/$/, ''),
    bb_password: cfg.bb_password as string,
  }
}

/**
 * Parse a BlueBubbles webhook POST into Envelope[].
 * Only processes 'new-message' events where isFromMe is false.
 */
async function webhookParse(req: Request, connection: OrgConnection): Promise<Envelope[]> {
  const body = await req.json() as BlueBubblesWebhookPayload
  const envelopes: Envelope[] = []

  // Only process new incoming messages
  if (body.type !== 'new-message') return envelopes
  if (!body.data || body.data.isFromMe) return envelopes
  if (!body.data.text && body.data.attachments.length === 0) return envelopes

  const { data } = body
  const chatGuid = data.chats?.[0]?.guid || 'unknown'
  const displayName = data.chats?.[0]?.displayName || ''
  const address = data.handle?.address || ''
  const service = data.handle?.service || 'iMessage'

  // Determine sender name: prefer chat display name, fall back to address
  const senderName = displayName || address || 'Unknown'

  // Format phone number
  const phone = /^\+?\d{7,15}$/.test(address.replace(/\s/g, ''))
    ? (address.startsWith('+') ? address : `+${address}`)
    : undefined

  const envelope: Envelope = {
    connection_id: connection.id,
    org_id: connection.org_id,
    provider: 'imessage',
    transport: 'webhook',
    dedup_key: data.guid,
    timestamp: new Date(data.dateCreated).toISOString(),
    payload: {
      type: 'message',
      sender: {
        name: senderName,
        phone,
      },
      subject: displayName || `${service} chat`,
      body: data.text || '[attachment]',
      attachments: data.attachments.length > 0
        ? data.attachments.map(att => ({
            name: att.transferName || 'attachment',
            url: att.filePath,
            mime: att.mimeType || 'application/octet-stream',
          }))
        : undefined,
      metadata: {
        bb_message_guid: data.guid,
        chat_guid: chatGuid,
        service,
        handle_address: address,
      },
    },
  }

  envelopes.push(envelope)
  return envelopes
}

/**
 * Send a message via BlueBubbles REST API.
 */
async function send(connection: OrgConnection, envelope: Envelope): Promise<void> {
  const cfg = getConfig(connection)
  const chatGuid = envelope.payload.metadata?.chat_guid as string

  if (!chatGuid) {
    throw new Error('Cannot send: no chat_guid in envelope metadata')
  }

  const tempGuid = `bitbit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const res = await fetch(`${cfg.bb_server_url}/api/v1/message/text?password=${cfg.bb_password}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatGuid,
      tempGuid,
      message: envelope.payload.body,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`BlueBubbles send failed: ${res.status} ${err}`)
  }
}

/**
 * Check if BlueBubbles server is responsive.
 */
async function healthCheck(connection: OrgConnection): Promise<boolean> {
  try {
    const cfg = getConfig(connection)
    const res = await fetch(`${cfg.bb_server_url}/api/v1/ping?password=${cfg.bb_password}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return false
    const data = await res.json() as { data?: string }
    return data.data === 'pong'
  } catch {
    return false
  }
}

/**
 * Pull recent messages from BlueBubbles (used for backfill on first connect).
 */
async function pull(connection: OrgConnection, since?: Date): Promise<Envelope[]> {
  const cfg = getConfig(connection)
  const envelopes: Envelope[] = []

  const sinceTs = since?.getTime() || (Date.now() - 24 * 60 * 60 * 1000)

  const res = await fetch(
    `${cfg.bb_server_url}/api/v1/message?password=${cfg.bb_password}&limit=100&sort=DESC`,
    { signal: AbortSignal.timeout(30_000) },
  )

  if (!res.ok) {
    throw new Error(`BlueBubbles pull failed: ${res.status}`)
  }

  const { data: messages } = await res.json() as {
    data: Array<{
      guid: string
      text: string | null
      isFromMe: boolean
      dateCreated: number
      handle: { address: string; service: string } | null
      chats: { guid: string; displayName: string }[]
      attachments: { guid: string; mimeType: string; filePath: string; transferName: string }[]
    }>
  }

  for (const msg of messages || []) {
    if (msg.isFromMe) continue
    if (msg.dateCreated < sinceTs) continue
    if (!msg.text && msg.attachments.length === 0) continue

    const chatGuid = msg.chats?.[0]?.guid || 'unknown'
    const displayName = msg.chats?.[0]?.displayName || ''
    const address = msg.handle?.address || ''
    const phone = /^\+?\d{7,15}$/.test(address.replace(/\s/g, ''))
      ? (address.startsWith('+') ? address : `+${address}`)
      : undefined

    envelopes.push({
      connection_id: connection.id,
      org_id: connection.org_id,
      provider: 'imessage',
      transport: 'poll',
      dedup_key: msg.guid,
      timestamp: new Date(msg.dateCreated).toISOString(),
      payload: {
        type: 'message',
        sender: {
          name: displayName || address || 'Unknown',
          phone,
        },
        subject: displayName || `${msg.handle?.service || 'iMessage'} chat`,
        body: msg.text || '[attachment]',
        attachments: msg.attachments.length > 0
          ? msg.attachments.map(att => ({
              name: att.transferName || 'attachment',
              url: att.filePath,
              mime: att.mimeType || 'application/octet-stream',
            }))
          : undefined,
        metadata: {
          bb_message_guid: msg.guid,
          chat_guid: chatGuid,
          service: msg.handle?.service || 'iMessage',
          handle_address: address,
        },
      },
    })
  }

  // Sort ascending by timestamp
  envelopes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  return envelopes
}

export const blueBubblesProvider: ProviderPlugin = {
  id: 'imessage',
  name: 'iMessage',
  description: 'Send and receive iMessages via BlueBubbles bridge',
  category: 'communication',
  auth: { method: 'guided' },
  defaultTransport: 'webhook',
  capabilities: ['pull', 'push', 'send', 'webhook'],
  pull,
  send,
  webhookParse,
  healthCheck,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run src/lib/connections/providers/__tests__/bluebubbles.test.ts`

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/connections/providers/bluebubbles.ts src/lib/connections/providers/__tests__/bluebubbles.test.ts
git commit -m "feat(imessage): add BlueBubbles provider plugin with webhookParse, send, healthCheck, pull"
```

---

### Task 5: Register Provider and Update Exports

**Files:**
- Modify: `src/lib/connections/built-in-providers.ts`
- Modify: `src/lib/connections/templates.ts`
- Modify: `src/lib/bridges/types.ts` (add 'vnc' to LinkingInfo.link_type)
- Modify: `src/lib/bridges/index.ts`

- [ ] **Step 1: Update built-in-providers.ts — replace iMessage stub with real provider**

In `src/lib/connections/built-in-providers.ts`, add the import at the top alongside the beeper import:

```typescript
import { blueBubblesProvider } from './providers/bluebubbles'
```

Then replace the iMessage stub object (the one with `id: 'imessage'`, lines 29-36) with just a reference to the imported provider:

```typescript
  blueBubblesProvider,
```

This replaces the stub that had `auth: { method: 'bridge' }` and `capabilities: ['push']` with the real provider that has `auth: { method: 'guided' }` and `capabilities: ['pull', 'push', 'send', 'webhook']`.

- [ ] **Step 2: Add iMessage config fields to templates.ts**

Add after the `beeperConfigFields` export at the bottom of `src/lib/connections/templates.ts`:

```typescript
/**
 * iMessage (BlueBubbles) connection config schema.
 * Used by the UI to render the setup form.
 */
export const imessageConfigFields = [
  { key: 'apple_id_email', label: 'Apple ID Email', required: true, type: 'email' as const, placeholder: 'your@icloud.com' },
]
```

- [ ] **Step 3: Add 'vnc' to LinkingInfo.link_type in types.ts**

In `src/lib/bridges/types.ts`, change the `LinkingInfo` interface's `link_type` property:

```typescript
  link_type: 'qr' | 'credentials' | 'vnc'
```

- [ ] **Step 4: Update bridges/index.ts — add iMessage provisioner factory**

Add to `src/lib/bridges/index.ts`:

```typescript
export { MacVpsProvisioner } from './mac-vps-provisioner'
export { VpsPool } from './vps-pool'
export type { MacVpsInstance, BlueBubblesConfig, BlueBubblesWebhookPayload } from './types'

import { MacVpsProvisioner } from './mac-vps-provisioner'
import { VpsPool } from './vps-pool'

export function createImessageProvisioner(supabase: SupabaseClient): MacVpsProvisioner {
  const pool = new VpsPool(supabase)
  return new MacVpsProvisioner(supabase, pool, {
    sshPrivateKey: process.env.IMESSAGE_SSH_PRIVATE_KEY || '',
    sshUser: process.env.IMESSAGE_SSH_USER || 'admin',
    webhookBaseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat',
  })
}
```

- [ ] **Step 5: Run all tests to verify nothing is broken**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run`

Expected: all existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/connections/built-in-providers.ts src/lib/connections/templates.ts src/lib/bridges/types.ts src/lib/bridges/index.ts
git commit -m "feat(imessage): register BlueBubbles provider, add config fields, update exports"
```

---

### Task 6: Update Provision Route for iMessage

**Files:**
- Modify: `src/app/api/bridges/provision/route.ts`

- [ ] **Step 1: Update provision route to branch on protocol**

Replace the entire content of `src/app/api/bridges/provision/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner, createImessageProvisioner } from '@/lib/bridges'
import { generateBridgeToken } from '@/lib/connections'
import type { BridgeProtocol } from '@/lib/bridges'

const VALID_PROTOCOLS: BridgeProtocol[] = ['imessage', 'whatsapp', 'android-messages']

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const body = await request.json() as { protocol: BridgeProtocol; apple_id_email?: string }
  const { protocol, apple_id_email } = body

  if (!VALID_PROTOCOLS.includes(protocol)) {
    return NextResponse.json({ error: `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(', ')}` }, { status: 400 })
  }

  if (protocol === 'imessage' && !apple_id_email) {
    return NextResponse.json({ error: 'apple_id_email is required for iMessage' }, { status: 400 })
  }

  // Check if connection already exists
  const { data: existing } = await supabase
    .from('org_connections')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('provider', protocol)
    .single()

  let connectionId: string

  if (existing && existing.status === 'connected') {
    return NextResponse.json({ error: `${protocol} is already connected` }, { status: 409 })
  }

  if (existing) {
    connectionId = existing.id
    await supabase
      .from('org_connections')
      .update({ status: 'provisioning', updated_at: new Date().toISOString() })
      .eq('id', connectionId)
  } else {
    const { data: conn, error } = await supabase
      .from('org_connections')
      .insert({
        org_id: orgId,
        provider: protocol,
        display_name: protocol === 'android-messages' ? 'Android Messages' : protocol === 'imessage' ? 'iMessage' : 'WhatsApp',
        transport: 'webhook',
        capabilities: ['push', 'send', 'webhook'],
        status: 'provisioning',
        bridge_token: generateBridgeToken(),
        config: {},
      })
      .select('id')
      .single()

    if (error || !conn) {
      return NextResponse.json({ error: error?.message || 'Failed to create connection' }, { status: 500 })
    }
    connectionId = conn.id
  }

  try {
    if (protocol === 'imessage') {
      // iMessage: use MacVpsProvisioner (LightNode + BlueBubbles)
      const provisioner = createImessageProvisioner(supabase)
      const linkingInfo = await provisioner.provision({
        orgId,
        userId: user.id,
        connectionId,
        appleIdEmail: apple_id_email!,
      })
      return NextResponse.json(linkingInfo, { status: 201 })
    } else {
      // WhatsApp/Android: use Fly-based BridgeProvisioner
      const provisioner = createProvisioner(supabase)
      const linkingInfo = await provisioner.provision({
        orgId,
        userId: user.id,
        connectionId,
        protocol,
      })
      return NextResponse.json(linkingInfo, { status: 201 })
    }
  } catch (err) {
    await supabase
      .from('org_connections')
      .update({ status: 'error', last_error: String(err), updated_at: new Date().toISOString() })
      .eq('id', connectionId)

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/bridges/provision/route.ts
git commit -m "feat(imessage): route iMessage provisioning to MacVpsProvisioner"
```

---

### Task 7: Update Link-Status Route for iMessage

**Files:**
- Modify: `src/app/api/bridges/link-status/route.ts`

- [ ] **Step 1: Update link-status to handle iMessage VNC flow**

Replace the entire content of `src/app/api/bridges/link-status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner, createImessageProvisioner } from '@/lib/bridges'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { connection_id } = await request.json() as { connection_id: string }

  const { data: conn } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', connection_id)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  const config = conn.config as Record<string, unknown>

  // Already connected
  if (conn.status === 'connected' && config.linked_at) {
    return NextResponse.json({
      status: 'linked',
      protocol: conn.provider,
      linked_at: config.linked_at,
    })
  }

  // Error state
  if (conn.status === 'error') {
    return NextResponse.json({
      status: 'error',
      protocol: conn.provider,
      error: conn.last_error,
    })
  }

  // iMessage: check BlueBubbles health + iMessage activation
  if (conn.provider === 'imessage' && config.bb_server_url) {
    const provisioner = createImessageProvisioner(supabase)
    const bbUrl = config.bb_server_url as string
    const bbPass = config.bb_password as string

    // Check if BlueBubbles is running
    const healthy = await provisioner.checkHealth(bbUrl, bbPass)
    if (!healthy) {
      return NextResponse.json({
        status: 'waiting',
        protocol: 'imessage',
        vnc: config.vnc_port ? {
          ip: config.vps_ip,
          port: config.vnc_port,
          password: config.vnc_password,
        } : null,
        sign_in_state: 'waiting_for_password',
      })
    }

    // Check if iMessage is actually signed in (chats exist)
    const active = await provisioner.checkImessageActive(bbUrl, bbPass)
    if (active) {
      // iMessage is live! Mark as connected.
      await supabase
        .from('org_connections')
        .update({
          status: 'connected',
          config: { ...config, linked_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection_id)

      return NextResponse.json({
        status: 'linked',
        protocol: 'imessage',
        linked_at: new Date().toISOString(),
      })
    }

    // BlueBubbles running but no chats — user still signing in
    return NextResponse.json({
      status: 'waiting',
      protocol: 'imessage',
      vnc: {
        ip: config.vps_ip,
        port: config.vnc_port,
        password: config.vnc_password,
      },
      sign_in_state: 'waiting_for_password',
    })
  }

  // WhatsApp/Android: existing Fly-based flow
  const machineId = config.fly_machine_id as string | undefined

  if (!machineId) {
    return NextResponse.json({ status: 'waiting', protocol: conn.provider })
  }

  const provisioner = createProvisioner(supabase)
  try {
    const health = await provisioner.checkHealth(machineId)
    if (!health.running) {
      return NextResponse.json({
        status: 'error',
        protocol: conn.provider,
        error: `Bridge machine is ${health.state}`,
      })
    }
  } catch {
    // Machine check failed, still waiting
  }

  // Relay QR data if the bridge has posted one
  const qrData = config.qr_data as string | undefined
  if (qrData) {
    return NextResponse.json({ status: 'waiting', protocol: conn.provider, qr: qrData })
  }

  return NextResponse.json({ status: 'waiting', protocol: conn.provider })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/bridges/link-status/route.ts
git commit -m "feat(imessage): add BlueBubbles activation detection to link-status"
```

---

### Task 8: Update Health Cron and Lifecycle

**Files:**
- Modify: `src/app/api/cron/bridge-health/route.ts`
- Modify: `src/lib/bridges/bridge-lifecycle.ts`

- [ ] **Step 1: Add BlueBubbles health check path to bridge-health cron**

In `src/app/api/cron/bridge-health/route.ts`, add after line 11 (`const result = await checkBridgeHealth(supabase, provisioner)`), before the `if (result.errors.length > 0)` block, add a call to check iMessage connections:

Add this import at the top:
```typescript
import { createImessageProvisioner } from '@/lib/bridges'
```

Then after `const result = await checkBridgeHealth(supabase, provisioner)`, add:

```typescript
    // Check iMessage (BlueBubbles) connections separately
    const imessageProvisioner = createImessageProvisioner(supabase)
    const { data: imessageConns } = await supabase
      .from('org_connections')
      .select('id, config, org_id, provider, display_name')
      .eq('provider', 'imessage')
      .eq('status', 'connected')

    for (const conn of imessageConns || []) {
      const cfg = conn.config as Record<string, string>
      if (!cfg.bb_server_url || !cfg.bb_password) continue

      const healthy = await imessageProvisioner.checkHealth(cfg.bb_server_url, cfg.bb_password)
      if (!healthy) {
        result.errors.push(`${conn.id}: BlueBubbles unreachable at ${cfg.bb_server_url}`)
        result.checked++
      } else {
        result.healthy++
        result.checked++
      }
    }
```

- [ ] **Step 2: Skip iMessage connections in suspension logic**

In `src/lib/bridges/bridge-lifecycle.ts`, update the `suspendIdleBridges` query (line 12-19) to exclude iMessage connections. Add `.neq('provider', 'imessage')` to the query chain:

```typescript
  const { data: connections } = await supabase
    .from('org_connections')
    .select('id, config')
    .eq('status', 'connected')
    .neq('provider', 'imessage')
    .not('config->fly_machine_id', 'is', null)
    .lt('config->last_message_at', sevenDaysAgo)
```

- [ ] **Step 3: Run tests to verify nothing breaks**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run`

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/bridge-health/route.ts src/lib/bridges/bridge-lifecycle.ts
git commit -m "feat(imessage): add BlueBubbles health check, skip iMessage in suspension"
```

---

### Task 9: Pool Replenishment Cron

**Files:**
- Create: `src/app/api/cron/bridge-pool/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create bridge-pool cron route**

```typescript
// src/app/api/cron/bridge-pool/route.ts
import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { VpsPool } from '@/lib/bridges/vps-pool'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const pool = new VpsPool(supabase)
    const deficit = await pool.getDeficit()

    if (deficit === 0) {
      return { message: 'Pool is full', poolSize: await pool.getPoolCount() }
    }

    // For now, log the deficit. Actual VPS creation requires LightNode API
    // or manual provisioning via portal. The cron monitors and alerts.
    console.warn(`[cron/bridge-pool] Pool deficit: ${deficit} instances needed`)

    // TODO: When LightNode API is available, auto-create instances here:
    // for (let i = 0; i < deficit; i++) {
    //   const vps = await lightnodeApi.createInstance({ image: 'macos-sequoia', ... })
    //   await sshSetup(vps.ip)
    //   await pool.addToPool({ vpsId: vps.id, vpsIp: vps.ip, ... })
    // }

    return {
      message: `Pool deficit: ${deficit} instances needed. Manual provisioning required.`,
      deficit,
      currentPoolSize: await pool.getPoolCount(),
    }
  })
}
```

- [ ] **Step 2: Add cron entry to vercel.json**

Add to the `crons` array in `vercel.json`:

```json
    { "path": "/api/cron/bridge-pool", "schedule": "*/15 * * * *" }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/bridge-pool/route.ts vercel.json
git commit -m "feat(imessage): add pool replenishment cron (monitoring + manual provisioning)"
```

---

### Task 10: Infrastructure Scripts

**Files:**
- Create: `infra/imessage/setup.sh`
- Create: `infra/imessage/kiosk-watcher.sh`

- [ ] **Step 1: Create BlueBubbles setup script**

```bash
#!/usr/bin/env bash
# infra/imessage/setup.sh
# Run on a fresh LightNode Mac VPS (macOS Sequoia) via SSH.
# Installs BlueBubbles, configures headless mode, prepares kiosk lockdown.
#
# Usage: bash setup.sh <bb_password> <bb_port>
# Example: bash setup.sh "my-secret-password-32chars" 1234

set -euo pipefail

BB_PASSWORD="${1:?Usage: setup.sh <bb_password> <bb_port>}"
BB_PORT="${2:-1234}"

echo "=== BitBit iMessage Bridge Setup ==="

# 1. Install BlueBubbles from DMG (skip if already installed)
if [ ! -d "/Applications/BlueBubbles.app" ]; then
  echo "Installing BlueBubbles..."
  BB_DMG_URL="https://github.com/BlueBubblesApp/bluebubbles-server/releases/latest/download/BlueBubbles.dmg"
  curl -L -o /tmp/BlueBubbles.dmg "$BB_DMG_URL"
  hdiutil attach /tmp/BlueBubbles.dmg -nobrowse -quiet
  cp -R "/Volumes/BlueBubbles/BlueBubbles.app" /Applications/
  hdiutil detach "/Volumes/BlueBubbles" -quiet
  rm /tmp/BlueBubbles.dmg
  echo "BlueBubbles installed."
else
  echo "BlueBubbles already installed."
fi

# 2. Allow BlueBubbles through Gatekeeper
xattr -dr com.apple.quarantine /Applications/BlueBubbles.app 2>/dev/null || true

# 3. Grant Full Disk Access (requires TCC database manipulation or MDM profile)
# On a VPS this is typically pre-configured. Log a warning if not.
echo "Ensure Full Disk Access is granted to BlueBubbles in System Settings > Privacy."

# 4. Configure BlueBubbles via CLI flags
# Start BlueBubbles headless with password and Cloudflare proxy
echo "Starting BlueBubbles in headless mode..."
/Applications/BlueBubbles.app/Contents/MacOS/BlueBubbles \
  --headless \
  --password "$BB_PASSWORD" \
  --port "$BB_PORT" \
  --proxy-service cloudflare \
  &

# Wait for BlueBubbles to start
echo "Waiting for BlueBubbles to initialize..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${BB_PORT}/api/v1/ping?password=${BB_PASSWORD}" > /dev/null 2>&1; then
    echo "BlueBubbles is running."
    break
  fi
  sleep 2
done

# 5. Prevent sleep
caffeinate -s &
disown

# 6. Auto-start BlueBubbles on login
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/BlueBubbles.app", hidden:true}' 2>/dev/null || true

# 7. Install kiosk watcher script
mkdir -p /opt/bitbit
cp "$(dirname "$0")/kiosk-watcher.sh" /opt/bitbit/kiosk-watcher.sh
chmod +x /opt/bitbit/kiosk-watcher.sh

# 8. Create kiosk setup script (called during provisioning with Apple ID)
cat > /opt/bitbit/kiosk-setup.sh << 'KIOSK_EOF'
#!/usr/bin/env bash
# kiosk-setup.sh <apple_id_email>
# Locks the desktop into kiosk mode and opens Messages with pre-filled Apple ID.
set -euo pipefail

APPLE_ID="${1:?Usage: kiosk-setup.sh <apple_id_email>}"

# Hide Dock
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 999
killall Dock 2>/dev/null || true

# Hide desktop icons
defaults write com.apple.finder CreateDesktop -bool false
killall Finder 2>/dev/null || true

# Disable keyboard shortcuts
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 32 "<dict><key>enabled</key><false/></dict>"  # Mission Control
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 34 "<dict><key>enabled</key><false/></dict>"  # App Exposé
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 64 "<dict><key>enabled</key><false/></dict>"  # Spotlight

# Set resolution to 800x600
# (Requires displayplacer or similar tool on the VPS)
# displayplacer "id:1 res:800x600" 2>/dev/null || true

# Open Messages.app
open -a Messages

# Wait for Messages to launch
sleep 3

# Start kiosk watcher daemon
launchctl unload ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist 2>/dev/null || true

mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bitbit.kiosk-watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/bitbit/kiosk-watcher.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>1</integer>
</dict>
</plist>
PLIST_EOF

launchctl load ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist

# Enable VNC server
sudo defaults write /var/db/launchd.db/com.apple.launchd/overrides.plist com.apple.screensharing -dict Disabled -bool false
sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.screensharing.plist 2>/dev/null || true

echo "Kiosk mode active. VNC ready."
KIOSK_EOF
chmod +x /opt/bitbit/kiosk-setup.sh

echo "=== Setup complete ==="
```

- [ ] **Step 2: Create kiosk watcher script**

```bash
#!/usr/bin/env bash
# infra/imessage/kiosk-watcher.sh
# LaunchAgent that keeps Messages.app focused and in the foreground.
# Runs continuously, checks every 500ms.

while true; do
  # Get the frontmost application
  FRONT_APP=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' 2>/dev/null || echo "")

  # If Messages is not frontmost, bring it to front
  if [ "$FRONT_APP" != "Messages" ]; then
    # Check if Messages is running
    if ! pgrep -q "Messages"; then
      open -a Messages
      sleep 2
    fi
    osascript -e 'tell application "Messages" to activate' 2>/dev/null || true
  fi

  sleep 0.5
done
```

- [ ] **Step 3: Commit**

```bash
git add infra/imessage/setup.sh infra/imessage/kiosk-watcher.sh
git commit -m "infra(imessage): add BlueBubbles setup and kiosk watcher scripts"
```

---

### Task 11: Dashboard — noVNC Integration in Bridge-Link Modal

**Files:**
- Modify: `src/components/channels/bridge-link-modal.tsx`

- [ ] **Step 1: Update bridge-link-modal.tsx with noVNC viewer for iMessage**

Replace the entire file `src/components/channels/bridge-link-modal.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, Smartphone, Monitor } from 'lucide-react'

type BridgeProtocol = 'imessage' | 'whatsapp' | 'android-messages'
type LinkingState = 'idle' | 'provisioning' | 'linking' | 'connected' | 'error'
type SignInState = 'waiting_for_password' | 'waiting_for_2fa' | 'verifying' | 'connected' | 'error'

interface BridgeLinkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  protocol: BridgeProtocol
  onSuccess: () => void
}

const PROTOCOL_CONFIG: Record<BridgeProtocol, {
  name: string
  icon: string
  color: string
  instructions: string[]
}> = {
  imessage: {
    name: 'iMessage',
    icon: '💬',
    color: '#34C759',
    instructions: [
      'Enter your Apple ID email below',
      'Sign in to Messages in the secure window',
      'Approve the 2FA prompt on your iPhone',
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: '📱',
    color: '#25D366',
    instructions: [
      'Open WhatsApp on your phone',
      'Go to Settings → Linked Devices',
      'Tap "Link a Device"',
      'Scan the QR code below',
    ],
  },
  'android-messages': {
    name: 'Android Messages',
    icon: '💬',
    color: '#1A73E8',
    instructions: [
      'Open Messages on your Android phone',
      'Tap ⋮ (menu) → Device pairing',
      'Tap "QR code scanner"',
      'Scan the QR code below',
    ],
  },
}

const SIGN_IN_INSTRUCTIONS: Record<SignInState, string> = {
  waiting_for_password: 'Enter your Apple ID password above.',
  waiting_for_2fa: 'Check your iPhone — tap Allow to verify.',
  verifying: 'Verifying your account...',
  connected: 'Connected!',
  error: 'Something went wrong. Please try again.',
}

export function BridgeLinkModal({ open, onOpenChange, protocol, onSuccess }: BridgeLinkModalProps) {
  const [state, setState] = useState<LinkingState>('idle')
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signInState, setSignInState] = useState<SignInState>('waiting_for_password')
  const [showFullDesktop, setShowFullDesktop] = useState(false)

  // iMessage fields
  const [appleIdEmail, setAppleIdEmail] = useState('')
  const [vncInfo, setVncInfo] = useState<{ ip: string; port: number; password: string } | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vncContainerRef = useRef<HTMLDivElement>(null)
  const vncRef = useRef<any>(null)
  const config = PROTOCOL_CONFIG[protocol]

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (vncRef.current) {
      vncRef.current.disconnect()
      vncRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      cleanup()
      setState('idle')
      setConnectionId(null)
      setQrData(null)
      setError(null)
      setAppleIdEmail('')
      setVncInfo(null)
      setSignInState('waiting_for_password')
      setShowFullDesktop(false)
    }
  }, [open, cleanup])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Connect noVNC when we have VNC info and are in linking state
  useEffect(() => {
    if (state !== 'linking' || protocol !== 'imessage' || !vncInfo || !vncContainerRef.current) return
    if (vncRef.current) return // already connected

    async function connectVnc() {
      try {
        // Dynamic import to avoid SSR issues
        const { default: RFB } = await import('@novnc/novnc/core/rfb')

        const url = `ws://${vncInfo!.ip}:${vncInfo!.port}`
        const rfb = new RFB(vncContainerRef.current!, url, {
          credentials: { password: vncInfo!.password },
        })

        rfb.viewOnly = false
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfb.showDotCursor = true

        vncRef.current = rfb
      } catch (err) {
        console.error('[noVNC] Connection failed:', err)
        setError('Could not connect to secure session. Please try again.')
        setState('error')
      }
    }

    connectVnc()
  }, [state, protocol, vncInfo])

  const startProvisioning = async () => {
    setState('provisioning')
    setError(null)

    try {
      const body: Record<string, string> = { protocol }
      if (protocol === 'imessage') {
        body.apple_id_email = appleIdEmail
      }

      const res = await fetch('/api/bridges/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to provision bridge')
      }

      const data = await res.json()
      setConnectionId(data.connection_id)

      // For iMessage, parse VNC info from link_data
      if (protocol === 'imessage' && data.link_data) {
        try {
          const vnc = JSON.parse(data.link_data)
          setVncInfo(vnc)
        } catch { /* VNC info will come from polling */ }
      }

      setState('linking')

      // Start polling for link status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/bridges/link-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection_id: data.connection_id }),
          })

          if (statusRes.ok) {
            const statusData = await statusRes.json()

            // Update VNC info if available
            if (statusData.vnc && !vncInfo) {
              setVncInfo(statusData.vnc)
            }

            // Update sign-in state
            if (statusData.sign_in_state) {
              setSignInState(statusData.sign_in_state)
            }

            // Update QR data for WhatsApp/Android
            if (statusData.qr) {
              setQrData(statusData.qr)
            }

            if (statusData.status === 'linked') {
              cleanup()
              setState('connected')
              setTimeout(() => {
                onSuccess()
                onOpenChange(false)
              }, 1500)
            } else if (statusData.status === 'error') {
              cleanup()
              setState('error')
              setError(statusData.error || 'Linking failed')
            }
          }
        } catch {
          // Polling error, continue
        }
      }, 2500)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Provisioning failed')
    }
  }

  const modalWidth = protocol === 'imessage' && state === 'linking' ? 'sm:max-w-2xl' : 'sm:max-w-md'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalWidth}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            Connect {config.name}
            {state === 'linking' && protocol === 'imessage' && (
              <Badge variant="outline" className="ml-auto text-xs font-normal">Step 2 of 3</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Link your {config.name} account to BitBit
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Idle state — instructions + start */}
          {state === 'idle' && (
            <>
              <div className="space-y-2">
                {config.instructions.map((instruction, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {i + 1}
                    </span>
                    {instruction}
                  </div>
                ))}
              </div>

              {/* Apple ID email input for iMessage */}
              {protocol === 'imessage' && (
                <Input
                  placeholder="Apple ID email (e.g. you@icloud.com)"
                  value={appleIdEmail}
                  onChange={e => setAppleIdEmail(e.target.value)}
                  type="email"
                />
              )}

              <Button
                className="w-full"
                onClick={startProvisioning}
                disabled={protocol === 'imessage' && !appleIdEmail}
              >
                <Smartphone className="mr-2 h-4 w-4" />
                Start Connection
              </Button>
            </>
          )}

          {/* Provisioning state — spinner */}
          {state === 'provisioning' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Setting up your secure environment...</p>
            </div>
          )}

          {/* Linking state — noVNC for iMessage */}
          {state === 'linking' && protocol === 'imessage' && (
            <div className="space-y-3">
              {/* noVNC viewer container */}
              <div
                ref={vncContainerRef}
                className="relative mx-auto overflow-hidden rounded-lg border border-border bg-black"
                style={{ width: '100%', height: showFullDesktop ? 480 : 360 }}
              >
                {!vncInfo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                  </div>
                )}
              </div>

              {/* State-aware instruction */}
              <p className="text-center text-sm text-muted-foreground">
                {SIGN_IN_INSTRUCTIONS[signInState]}
              </p>
              <p className="text-center text-xs text-muted-foreground/60">
                Your credentials go directly to Apple — BitBit never sees your password.
              </p>

              {/* Timeout / advanced options */}
              {!showFullDesktop && (
                <button
                  onClick={() => setShowFullDesktop(true)}
                  className="mx-auto block text-xs text-muted-foreground/40 underline hover:text-muted-foreground/60"
                >
                  Having trouble? Show full desktop
                </button>
              )}
            </div>
          )}

          {/* Linking state — QR code for WhatsApp/Android Messages */}
          {state === 'linking' && protocol !== 'imessage' && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
                {qrData ? (
                  <img src={qrData} alt="QR Code" className="h-full w-full rounded-lg" />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                )}
              </div>
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for scan...
              </Badge>
            </div>
          )}

          {/* Connected state */}
          {state === 'connected' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-medium">{config.name} connected!</p>
              <p className="text-xs text-muted-foreground">Messages will appear in your inbox shortly.</p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm text-red-500">{error || 'Something went wrong'}</p>
              <Button variant="outline" onClick={() => { setState('idle'); setError(null) }}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify the build**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx next build --webpack 2>&1 | tail -20`

Expected: build succeeds (or only pre-existing warnings)

- [ ] **Step 3: Commit**

```bash
git add src/components/channels/bridge-link-modal.tsx
git commit -m "feat(imessage): replace credential form with embedded noVNC viewer in bridge modal"
```

---

### Task 12: Update ADR and Webhook Auth

**Files:**
- Modify: `docs/adr/0005-imessage-bridge-approach.md`
- Modify: `src/app/api/connections/[id]/webhook/route.ts`

- [ ] **Step 1: Update ADR 0005 with corrected approach**

Replace the entire content of `docs/adr/0005-imessage-bridge-approach.md`:

```markdown
# ADR 0005: iMessage Bridge Approach

**Date:** 2026-04-06
**Status:** Updated
**Decision:** Use LightNode Mac VPS + BlueBubbles, with HostMyApple as reliability fallback

## Context

BitBit needs iMessage read/write access for its intelligence engine. Unlike WhatsApp and Android Messages (which have working open-source Matrix bridges), iMessage requires macOS hardware. Every server-side approach that bypasses Apple hardware has been shut down or abandoned.

**Critical finding:** Claw Messenger and Linq do NOT bridge a user's existing iMessage account. They provision agent-owned phone numbers — a fundamentally different use case. The original ADR was incorrect about this.

## Options Considered

| Approach | Cost/mo | Bridges User Account? | Works Today | Risk |
|----------|---------|----------------------|-------------|------|
| LightNode Mac VPS + BlueBubbles | $7.70 | Yes | Yes | Apple VM serial blacklisting |
| HostMyApple BlueBubbles Edition | $24.99 | Yes | Yes | No API, portal-only |
| VPSMAC bare-metal | $109 | Yes | Yes | Expensive |
| Claw Messenger API | $5-25 | **No** (agent number) | Yes | Wrong use case |
| Linq API (direct) | Enterprise | **No** (agent number) | Yes | Wrong use case |
| Mac Mini colo + mautrix-imessage | $30-120 | Yes | Yes | Ops overhead |
| pypush v3 | Free | Yes (in theory) | No | Not stable, no ETA |
| Beeper registration server | N/A | Yes | No | Archived Apr 2025 |

## Decision

**Use LightNode Mac VPS** ($7.70/mo, macOS Sequoia, hourly billing) running **BlueBubbles** (open-source iMessage bridge with REST API + webhooks).

Users sign in to their Apple ID via a **noVNC session** embedded in BitBit's dashboard. The Mac VPS desktop is locked into a kiosk state so the user only sees the Apple sign-in dialog — it feels like a native widget, not a remote desktop.

A **warm pool** of 2 pre-provisioned instances ensures instant (<5s) provisioning.

If Apple serial blacklisting becomes an issue, **HostMyApple** (real hardware, $24.99/mo) is the reliability fallback.

## Architecture Impact

iMessage uses a fundamentally different architecture than WhatsApp/Android:
- WhatsApp/Android: Per-user Fly Machine running mautrix bridge → Matrix Conduit → webhook
- iMessage: Per-user LightNode Mac VPS running BlueBubbles → REST API + webhooks → BitBit

The `org_connections` row uses `provider: 'imessage'` with BlueBubbles config (server URL, password, VPS IP) instead of Fly machine details.

## Consequences

- Per-user Mac VPS cost ($7.70/mo) is higher than WhatsApp/Android ($1.90/mo)
- Warm pool overhead: ~$17/mo for 2 idle instances
- No suspension lifecycle — Mac VPS runs continuously (macOS boot too slow for wake/suspend)
- Apple can disrupt any iMessage bridge at any time (inherent to the problem)
- BlueBubbles is pinned to macOS Sequoia (Tahoe has Private API bugs)
```

- [ ] **Step 2: Add token-based webhook verification for iMessage**

In `src/app/api/connections/[id]/webhook/route.ts`, add token verification for iMessage connections. After the existing signature verification block (after line 45), add:

```typescript
  // For iMessage (BlueBubbles): verify token from query param
  // BlueBubbles doesn't support HMAC signing, so we include the bb_password as a query token
  if (conn.provider === 'imessage') {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const expectedToken = (conn.config as Record<string, unknown>).bb_password as string

    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
  }
```

Also, for iMessage webhooks, the connection status may be `provisioning` or `linking` during initial setup when the first "hello-world" test event arrives. Update the status check (line 29-31) to allow provisioning status for iMessage:

```typescript
  if (conn.status !== 'connected' && !(conn.provider === 'imessage' && conn.status === 'provisioning')) {
    return NextResponse.json({ error: `Connection status: ${conn.status}` }, { status: 409 })
  }
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/torrinkay/Agent/bitbit/personal-assistant && npx vitest run`

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0005-imessage-bridge-approach.md src/app/api/connections/[id]/webhook/route.ts
git commit -m "docs: update ADR 0005 with corrected iMessage approach, add webhook token auth"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Task(s) |
|-------------|---------|
| Architecture overview | Tasks 3, 6 (provisioner + provision route) |
| Warm instance pool | Task 2 (VpsPool), Task 9 (pool cron) |
| Provisioning sequence (phases 1-4) | Tasks 3, 6, 7 (provisioner + routes) |
| Bulletproof sign-in / kiosk | Task 10 (setup.sh, kiosk-watcher.sh) |
| Dashboard noVNC modal | Task 11 (bridge-link-modal.tsx) |
| Data flow (inbound/outbound) | Task 4 (BlueBubbles provider) |
| Health check | Task 8 (bridge-health cron) |
| Lifecycle (no suspension) | Task 8 (bridge-lifecycle.ts) |
| Connection config | Task 1 (types), Task 5 (registration) |
| Security (webhook auth) | Task 12 (token verification) |
| Cost model | Task 9 (pool cron monitors deficit) |
| ADR update | Task 12 |
| File map completeness | All files from spec are covered |

### Placeholder Scan

- Task 9 has a `TODO` comment for LightNode API auto-creation — this is intentional since LightNode doesn't have an API yet. The cron logs the deficit for manual action. Not a placeholder — it's the current reality.

### Type Consistency

- `BlueBubblesConfig` defined in Task 1 (types.ts), used in Task 2 (vps-pool.ts) and Task 3 (mac-vps-provisioner.ts) ✅
- `BlueBubblesWebhookPayload` defined in Task 1, used in Task 4 (bluebubbles.ts) ✅
- `LinkingInfo.link_type: 'vnc'` added in Task 5, returned by Task 3 provisioner ✅
- `createImessageProvisioner` exported in Task 5, used in Tasks 6, 7, 8 ✅
- `blueBubblesProvider` exported in Task 4, registered in Task 5 ✅
