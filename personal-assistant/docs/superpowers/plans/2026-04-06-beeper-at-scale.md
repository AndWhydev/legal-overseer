# Beeper-at-Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build managed Beeper bridge infrastructure where users connect iMessage, WhatsApp, and Android Messages from BitBit's dashboard — Fly Machines per user, shared Conduit homeserver, webhook-driven real-time sync, tiered lifecycle.

**Architecture:** Per-user Fly Machine running mautrix bridges → shared Conduit Matrix homeserver on Fly → webhook push to BitBit's existing `/api/connections/{id}/webhook` endpoint. Bridge management API on Vercel provisions/suspends/destroys machines. Dashboard shows QR code or credential form for account linking.

**Tech Stack:** Next.js 16 (App Router), Fly.io Machines API, Conduit (Matrix homeserver), mautrix-imessage/whatsapp/gmessages, Docker + s6-overlay, Supabase (Postgres), shadcn/ui, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-06-beeper-at-scale-design.md`

---

## File Structure

```
# New files
infra/
  bridges/
    Dockerfile                          # Multi-bridge container (mautrix-imessage, whatsapp, gmessages)
    entrypoint.sh                       # Selects and starts the correct bridge based on BRIDGE_PROTOCOL env
  conduit/
    Dockerfile                          # Conduit Matrix homeserver container
    conduit.toml                        # Conduit config (federation off, registration on)
  fly-bridges.toml                      # Fly app config for bridge machines (image builds only)
  fly-conduit.toml                      # Fly app config for Conduit homeserver

src/lib/bridges/
  fly-machines.ts                       # Fly Machines API client (create, start, stop, destroy, status)
  bridge-provisioner.ts                 # Orchestrates provisioning flow (create machine → configure bridge → return link info)
  bridge-lifecycle.ts                   # Tiered lifecycle management (suspend, wake, destroy idle)
  types.ts                              # Bridge-specific types (FlyMachine, BridgeState, LinkingInfo)

src/app/api/bridges/
  provision/route.ts                    # POST — provision new bridge machine
  link-status/route.ts                  # POST — poll for account linking completion
  wake/route.ts                         # POST — wake suspended bridge
  suspend/route.ts                      # POST — suspend idle bridge
  status/route.ts                       # GET — list user's bridges with machine state
  [connectionId]/route.ts               # DELETE — destroy bridge machine

src/app/api/cron/
  bridge-health/route.ts                # Health check cron (every 5 min)
  bridge-lifecycle/route.ts             # Suspend idle bridges cron (daily)

src/components/channels/
  bridge-link-modal.tsx                 # Modal for QR code / credential linking flow

# Modified files
src/lib/connections/types.ts            # Add 'provisioning' | 'suspended' to ConnectionStatus
src/components/channels/channel-grid.tsx # Add iMessage, Android Messages cards; wire bridge provisioning
src/components/channels/channel-card.tsx # Add 'provisioning' | 'suspended' status variants
vercel.json                             # Add bridge-health and bridge-lifecycle crons
```

---

## Task 1: Database Migration — Add Bridge Status Values

**Files:**
- Create: `src/lib/db/migrations/20260406_bridge_statuses.sql`
- Modify: `src/lib/connections/types.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/lib/db/migrations/20260406_bridge_statuses.sql`:

```sql
-- Add 'provisioning' and 'suspended' to org_connections status check
ALTER TABLE org_connections DROP CONSTRAINT IF EXISTS org_connections_status_check;
ALTER TABLE org_connections ADD CONSTRAINT org_connections_status_check
  CHECK (status IN ('pending', 'provisioning', 'connected', 'suspended', 'error', 'disabled'));
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Run the SQL above against project `johvduasrhmufrfdxjus` using the `mcp__plugin_supabase_supabase__apply_migration` tool with name `bridge_statuses`.

- [ ] **Step 3: Update TypeScript types**

In `src/lib/connections/types.ts`, change line 5:

```typescript
// Before:
export type ConnectionStatus = 'pending' | 'connected' | 'error' | 'disabled'

// After:
export type ConnectionStatus = 'pending' | 'provisioning' | 'connected' | 'suspended' | 'error' | 'disabled'
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep "connections/types"
```

Expected: no output (no errors)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrations/20260406_bridge_statuses.sql src/lib/connections/types.ts
git commit -m "feat(db): add provisioning and suspended status values to org_connections"
```

---

## Task 2: Fly Machines API Client

**Files:**
- Create: `src/lib/bridges/types.ts`
- Create: `src/lib/bridges/fly-machines.ts`
- Test: `src/lib/bridges/__tests__/fly-machines.test.ts`

- [ ] **Step 1: Create bridge types**

Create `src/lib/bridges/types.ts`:

```typescript
export interface FlyMachine {
  id: string
  name: string
  state: 'created' | 'starting' | 'started' | 'stopping' | 'stopped' | 'replacing' | 'destroying' | 'destroyed'
  region: string
  instance_id: string
  config: {
    image: string
    env: Record<string, string>
    guest: { cpu_kind: string; cpus: number; memory_mb: number }
    mounts?: { volume: string; path: string }[]
  }
  created_at: string
  updated_at: string
}

export type BridgeProtocol = 'imessage' | 'whatsapp' | 'android-messages'

export interface BridgeState {
  connection_id: string
  protocol: BridgeProtocol
  fly_machine_id: string
  fly_app_name: string
  matrix_user_id: string
  status: 'provisioning' | 'linking' | 'connected' | 'suspended' | 'error' | 'destroyed'
  linked_at: string | null
  last_message_at: string | null
}

export interface LinkingInfo {
  connection_id: string
  protocol: BridgeProtocol
  link_type: 'qr' | 'credentials'
  link_data: string | null
  status: 'waiting' | 'linked' | 'error'
  error?: string
}

export interface FlyVolume {
  id: string
  name: string
  size_gb: number
  state: string
  region: string
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/bridges/__tests__/fly-machines.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FlyMachinesClient } from '../fly-machines'

describe('FlyMachinesClient', () => {
  const mockFetch = vi.fn()
  let client: FlyMachinesClient

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
    client = new FlyMachinesClient('test-token', 'bitbit-bridges')
  })

  it('creates a machine with correct config', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'mach_123', state: 'created', name: 'bridge-user1' }),
    })

    const result = await client.createMachine({
      name: 'bridge-user1',
      region: 'syd',
      image: 'registry.fly.io/bitbit-bridges:latest',
      env: { BRIDGE_PROTOCOL: 'imessage' },
      cpus: 1,
      memoryMb: 256,
    })

    expect(result.id).toBe('mach_123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('stops a machine', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

    await client.stopMachine('mach_123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines/mach_123/stop',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('starts a machine', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

    await client.startMachine('mach_123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines/mach_123/start',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('destroys a machine', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

    await client.destroyMachine('mach_123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines/mach_123',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('gets machine state', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'mach_123', state: 'started' }),
    })

    const machine = await client.getMachine('mach_123')
    expect(machine.state).toBe('started')
  })

  it('creates a volume', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'vol_123', name: 'bridge_data_user1', size_gb: 1 }),
    })

    const vol = await client.createVolume({ name: 'bridge_data_user1', region: 'syd', sizeGb: 1 })
    expect(vol.id).toBe('vol_123')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Machine limit reached'),
    })

    await expect(client.createMachine({
      name: 'bridge-fail',
      region: 'syd',
      image: 'test',
      env: {},
      cpus: 1,
      memoryMb: 256,
    })).rejects.toThrow('Fly API error 422')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/bridges/__tests__/fly-machines.test.ts
```

Expected: FAIL — module `../fly-machines` not found

- [ ] **Step 4: Implement FlyMachinesClient**

Create `src/lib/bridges/fly-machines.ts`:

```typescript
import type { FlyMachine, FlyVolume } from './types'

const FLY_API_BASE = 'https://api.machines.dev/v1'

export class FlyMachinesClient {
  constructor(
    private token: string,
    private appName: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${FLY_API_BASE}/apps/${this.appName}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Fly API error ${res.status}: ${body}`)
    }

    const text = await res.text()
    return text ? JSON.parse(text) : ({} as T)
  }

  async createMachine(opts: {
    name: string
    region: string
    image: string
    env: Record<string, string>
    cpus: number
    memoryMb: number
    volumeId?: string
  }): Promise<FlyMachine> {
    return this.request<FlyMachine>('/machines', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        config: {
          image: opts.image,
          env: opts.env,
          guest: {
            cpu_kind: 'shared',
            cpus: opts.cpus,
            memory_mb: opts.memoryMb,
          },
          mounts: opts.volumeId
            ? [{ volume: opts.volumeId, path: '/data' }]
            : undefined,
          auto_destroy: false,
        },
      }),
    })
  }

  async getMachine(machineId: string): Promise<FlyMachine> {
    return this.request<FlyMachine>(`/machines/${machineId}`)
  }

  async listMachines(): Promise<FlyMachine[]> {
    return this.request<FlyMachine[]>('/machines')
  }

  async startMachine(machineId: string): Promise<void> {
    await this.request(`/machines/${machineId}/start`, { method: 'POST' })
  }

  async stopMachine(machineId: string): Promise<void> {
    await this.request(`/machines/${machineId}/stop`, { method: 'POST' })
  }

  async destroyMachine(machineId: string): Promise<void> {
    await this.request(`/machines/${machineId}`, { method: 'DELETE' })
  }

  async waitForState(machineId: string, state: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const machine = await this.getMachine(machineId)
      if (machine.state === state) return
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`Timed out waiting for machine ${machineId} to reach state ${state}`)
  }

  async createVolume(opts: { name: string; region: string; sizeGb: number }): Promise<FlyVolume> {
    return this.request<FlyVolume>('/volumes', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        size_gb: opts.sizeGb,
      }),
    })
  }

  async deleteVolume(volumeId: string): Promise<void> {
    await this.request(`/volumes/${volumeId}`, { method: 'DELETE' })
  }
}

/**
 * Create a FlyMachinesClient from environment variables.
 */
export function createFlyClient(appName = 'bitbit-bridges'): FlyMachinesClient {
  const token = process.env.FLY_API_TOKEN
  if (!token) throw new Error('FLY_API_TOKEN environment variable required')
  return new FlyMachinesClient(token, appName)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/bridges/__tests__/fly-machines.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/bridges/
git commit -m "feat: add Fly Machines API client with types and tests"
```

---

## Task 3: Bridge Provisioner

**Files:**
- Create: `src/lib/bridges/bridge-provisioner.ts`
- Test: `src/lib/bridges/__tests__/bridge-provisioner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/bridges/__tests__/bridge-provisioner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BridgeProvisioner } from '../bridge-provisioner'
import type { FlyMachinesClient } from '../fly-machines'

function mockFlyClient(): FlyMachinesClient {
  return {
    createMachine: vi.fn().mockResolvedValue({ id: 'mach_abc', state: 'started', name: 'bridge-user1' }),
    getMachine: vi.fn().mockResolvedValue({ id: 'mach_abc', state: 'started' }),
    startMachine: vi.fn().mockResolvedValue(undefined),
    stopMachine: vi.fn().mockResolvedValue(undefined),
    destroyMachine: vi.fn().mockResolvedValue(undefined),
    waitForState: vi.fn().mockResolvedValue(undefined),
    createVolume: vi.fn().mockResolvedValue({ id: 'vol_xyz', name: 'bridge_data' }),
    deleteVolume: vi.fn().mockResolvedValue(undefined),
    listMachines: vi.fn().mockResolvedValue([]),
  } as unknown as FlyMachinesClient
}

function mockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
  }
  return { from: vi.fn().mockReturnValue(chain), _chain: chain }
}

describe('BridgeProvisioner', () => {
  let provisioner: BridgeProvisioner
  let fly: ReturnType<typeof mockFlyClient>
  let supabase: ReturnType<typeof mockSupabase>

  beforeEach(() => {
    fly = mockFlyClient()
    supabase = mockSupabase()
    provisioner = new BridgeProvisioner(fly, supabase as any, {
      region: 'syd',
      image: 'registry.fly.io/bitbit-bridges:latest',
      conduitUrl: 'https://conduit.internal',
      webhookBaseUrl: 'https://app.bitbit.chat',
      registrationServerUrl: 'http://registration.internal',
    })
  })

  it('provisions a bridge machine and returns linking info', async () => {
    const result = await provisioner.provision({
      orgId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      protocol: 'whatsapp',
    })

    expect(fly.createVolume).toHaveBeenCalled()
    expect(fly.createMachine).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('bridge-'),
        env: expect.objectContaining({
          BRIDGE_PROTOCOL: 'whatsapp',
        }),
      }),
    )
    expect(result.connection_id).toBe('conn-1')
    expect(result.protocol).toBe('whatsapp')
    expect(result.link_type).toBe('qr')
  })

  it('uses credentials link type for imessage', async () => {
    const result = await provisioner.provision({
      orgId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      protocol: 'imessage',
    })

    expect(result.link_type).toBe('credentials')
    expect(fly.createMachine).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          BRIDGE_PROTOCOL: 'imessage',
          REGISTRATION_SERVER_URL: 'http://registration.internal',
        }),
      }),
    )
  })

  it('destroys machine and volume', async () => {
    await provisioner.destroy('conn-1', 'mach_abc', 'vol_xyz')

    expect(fly.destroyMachine).toHaveBeenCalledWith('mach_abc')
    expect(fly.deleteVolume).toHaveBeenCalledWith('vol_xyz')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/bridges/__tests__/bridge-provisioner.test.ts
```

Expected: FAIL — module `../bridge-provisioner` not found

- [ ] **Step 3: Implement BridgeProvisioner**

Create `src/lib/bridges/bridge-provisioner.ts`:

```typescript
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

    // Build environment for the bridge container
    const env: Record<string, string> = {
      BRIDGE_PROTOCOL: opts.protocol,
      MATRIX_HOMESERVER_URL: this.config.conduitUrl,
      WEBHOOK_URL: `${this.config.webhookBaseUrl}/api/connections/${opts.connectionId}/webhook`,
      CONNECTION_ID: opts.connectionId,
      ORG_ID: opts.orgId,
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
      link_data: null, // QR data comes from polling link-status
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/bridges/__tests__/bridge-provisioner.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridges/bridge-provisioner.ts src/lib/bridges/__tests__/bridge-provisioner.test.ts
git commit -m "feat: add BridgeProvisioner with provision, destroy, wake, suspend"
```

---

## Task 4: Bridge Lifecycle Manager

**Files:**
- Create: `src/lib/bridges/bridge-lifecycle.ts`

- [ ] **Step 1: Create the lifecycle manager**

Create `src/lib/bridges/bridge-lifecycle.ts`:

```typescript
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
        // Machine not running — attempt restart
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/bridges/bridge-lifecycle.ts
git commit -m "feat: add bridge lifecycle manager — suspend idle, health checks"
```

---

## Task 5: Bridge Management API Routes

**Files:**
- Create: `src/app/api/bridges/provision/route.ts`
- Create: `src/app/api/bridges/link-status/route.ts`
- Create: `src/app/api/bridges/wake/route.ts`
- Create: `src/app/api/bridges/suspend/route.ts`
- Create: `src/app/api/bridges/status/route.ts`
- Create: `src/app/api/bridges/[connectionId]/route.ts`

- [ ] **Step 1: Create helper to instantiate provisioner**

Create `src/lib/bridges/index.ts`:

```typescript
export { FlyMachinesClient, createFlyClient } from './fly-machines'
export { BridgeProvisioner } from './bridge-provisioner'
export { suspendIdleBridges, checkBridgeHealth } from './bridge-lifecycle'
export type { FlyMachine, FlyVolume, BridgeProtocol, BridgeState, LinkingInfo } from './types'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createFlyClient } from './fly-machines'
import { BridgeProvisioner } from './bridge-provisioner'

export function createProvisioner(supabase: SupabaseClient): BridgeProvisioner {
  const fly = createFlyClient()
  return new BridgeProvisioner(fly, supabase, {
    region: process.env.FLY_BRIDGE_REGION || 'syd',
    image: process.env.FLY_BRIDGE_IMAGE || 'registry.fly.io/bitbit-bridges:latest',
    conduitUrl: process.env.CONDUIT_INTERNAL_URL || 'http://conduit.internal:6167',
    webhookBaseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat',
    registrationServerUrl: process.env.IMESSAGE_REGISTRATION_URL || 'http://registration.internal:8080',
  })
}
```

- [ ] **Step 2: Create provision route**

Create `src/app/api/bridges/provision/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner } from '@/lib/bridges'
import { generateBridgeToken } from '@/lib/connections'
import type { BridgeProtocol } from '@/lib/bridges'

const VALID_PROTOCOLS: BridgeProtocol[] = ['imessage', 'whatsapp', 'android-messages']

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { protocol } = await request.json() as { protocol: BridgeProtocol }

  if (!VALID_PROTOCOLS.includes(protocol)) {
    return NextResponse.json({ error: `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(', ')}` }, { status: 400 })
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
    // Re-use existing connection row
    connectionId = existing.id
    await supabase
      .from('org_connections')
      .update({ status: 'provisioning', updated_at: new Date().toISOString() })
      .eq('id', connectionId)
  } else {
    // Create new connection
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

  const provisioner = createProvisioner(supabase)

  try {
    const linkingInfo = await provisioner.provision({
      orgId,
      userId: user.id,
      connectionId,
      protocol,
    })

    return NextResponse.json(linkingInfo, { status: 201 })
  } catch (err) {
    await supabase
      .from('org_connections')
      .update({ status: 'error', last_error: String(err), updated_at: new Date().toISOString() })
      .eq('id', connectionId)

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create link-status route**

Create `src/app/api/bridges/link-status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner } from '@/lib/bridges'

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
  const machineId = config.fly_machine_id as string | undefined

  if (!machineId) {
    return NextResponse.json({ status: 'waiting', protocol: conn.provider })
  }

  // Check if bridge has reported linked status
  if (conn.status === 'connected' && config.linked_at) {
    return NextResponse.json({
      status: 'linked',
      protocol: conn.provider,
      linked_at: config.linked_at,
    })
  }

  if (conn.status === 'error') {
    return NextResponse.json({
      status: 'error',
      protocol: conn.provider,
      error: conn.last_error,
    })
  }

  // Check machine health
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

  return NextResponse.json({ status: 'waiting', protocol: conn.provider })
}
```

- [ ] **Step 4: Create wake route**

Create `src/app/api/bridges/wake/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner } from '@/lib/bridges'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { connection_id } = await request.json() as { connection_id: string }

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, config, status')
    .eq('id', connection_id)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  if (conn.status !== 'suspended') {
    return NextResponse.json({ error: `Connection is ${conn.status}, not suspended` }, { status: 400 })
  }

  const config = conn.config as Record<string, string>
  if (!config.fly_machine_id) {
    return NextResponse.json({ error: 'No Fly machine associated' }, { status: 400 })
  }

  const provisioner = createProvisioner(supabase)

  try {
    await provisioner.wake(conn.id, config.fly_machine_id)
    return NextResponse.json({ ok: true, status: 'connected' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Create suspend route**

Create `src/app/api/bridges/suspend/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner } from '@/lib/bridges'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { connection_id } = await request.json() as { connection_id: string }

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, config, status')
    .eq('id', connection_id)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  if (conn.status !== 'connected') {
    return NextResponse.json({ error: `Connection is ${conn.status}, not connected` }, { status: 400 })
  }

  const config = conn.config as Record<string, string>
  if (!config.fly_machine_id) {
    return NextResponse.json({ error: 'No Fly machine associated' }, { status: 400 })
  }

  const provisioner = createProvisioner(supabase)

  try {
    await provisioner.suspend(conn.id, config.fly_machine_id)
    return NextResponse.json({ ok: true, status: 'suspended' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 6: Create status route**

Create `src/app/api/bridges/status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: connections } = await supabase
    .from('org_connections')
    .select('id, provider, display_name, status, transport, message_count, last_sync_at, last_error, config')
    .eq('org_id', orgId)
    .in('provider', ['imessage', 'whatsapp', 'android-messages'])
    .not('config->fly_machine_id', 'is', null)
    .order('created_at', { ascending: true })

  const bridges = (connections || []).map(conn => {
    const config = conn.config as Record<string, unknown>
    return {
      connection_id: conn.id,
      protocol: conn.provider,
      display_name: conn.display_name,
      status: conn.status,
      message_count: conn.message_count,
      last_sync_at: conn.last_sync_at,
      last_error: conn.last_error,
      linked_at: config.linked_at || null,
      last_message_at: config.last_message_at || null,
      suspended: config.suspended || false,
    }
  })

  return NextResponse.json({ bridges })
}
```

- [ ] **Step 7: Create destroy route**

Create `src/app/api/bridges/[connectionId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner } from '@/lib/bridges'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, config')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  const config = conn.config as Record<string, string>
  const provisioner = createProvisioner(supabase)

  try {
    await provisioner.destroy(connectionId, config.fly_machine_id, config.fly_volume_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/bridges/index.ts src/app/api/bridges/
git commit -m "feat: add bridge management API routes — provision, link-status, wake, suspend, destroy, status"
```

---

## Task 6: Health and Lifecycle Cron Jobs

**Files:**
- Create: `src/app/api/cron/bridge-health/route.ts`
- Create: `src/app/api/cron/bridge-lifecycle/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create bridge-health cron**

Create `src/app/api/cron/bridge-health/route.ts`:

```typescript
import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { createProvisioner } from '@/lib/bridges'
import { checkBridgeHealth } from '@/lib/bridges'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const provisioner = createProvisioner(supabase)
    const result = await checkBridgeHealth(supabase, provisioner)

    if (result.errors.length > 0) {
      console.error('[cron/bridge-health] errors:', result.errors)
    }

    return {
      message: `Health check: ${result.healthy}/${result.checked} healthy`,
      details: result,
    }
  })
}
```

- [ ] **Step 2: Create bridge-lifecycle cron**

Create `src/app/api/cron/bridge-lifecycle/route.ts`:

```typescript
import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { createProvisioner, suspendIdleBridges } from '@/lib/bridges'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const provisioner = createProvisioner(supabase)
    const result = await suspendIdleBridges(supabase, provisioner)

    if (result.errors.length > 0) {
      console.error('[cron/bridge-lifecycle] errors:', result.errors)
    }

    return {
      message: `Lifecycle: ${result.suspended} bridges suspended`,
      details: result,
    }
  })
}
```

- [ ] **Step 3: Add crons to vercel.json**

In `vercel.json`, add to the `crons` array:

```json
{ "path": "/api/cron/bridge-health", "schedule": "*/5 * * * *" },
{ "path": "/api/cron/bridge-lifecycle", "schedule": "0 3 * * *" }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/bridge-health/ src/app/api/cron/bridge-lifecycle/ vercel.json
git commit -m "feat: add bridge health (5min) and lifecycle (daily) cron jobs"
```

---

## Task 7: Bridge Linking Modal Component

**Files:**
- Create: `src/components/channels/bridge-link-modal.tsx`

- [ ] **Step 1: Create the modal component**

Create `src/components/channels/bridge-link-modal.tsx`:

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
import { Loader2, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react'

type BridgeProtocol = 'imessage' | 'whatsapp' | 'android-messages'
type LinkingState = 'idle' | 'provisioning' | 'linking' | 'connected' | 'error'

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
      'Enter your Apple ID email address',
      'Enter your Apple ID password',
      'If prompted, enter the 2FA code from your Apple device',
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

export function BridgeLinkModal({ open, onOpenChange, protocol, onSuccess }: BridgeLinkModalProps) {
  const [state, setState] = useState<LinkingState>('idle')
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // iMessage credential fields
  const [appleId, setAppleId] = useState('')
  const [applePassword, setApplePassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [needs2FA, setNeeds2FA] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const config = PROTOCOL_CONFIG[protocol]

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      cleanup()
      setState('idle')
      setConnectionId(null)
      setQrData(null)
      setError(null)
      setAppleId('')
      setApplePassword('')
      setTwoFactorCode('')
      setNeeds2FA(false)
    }
  }, [open, cleanup])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const startProvisioning = async () => {
    setState('provisioning')
    setError(null)

    try {
      const res = await fetch('/api/bridges/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to provision bridge')
      }

      const data = await res.json()
      setConnectionId(data.connection_id)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            Connect {config.name}
          </DialogTitle>
          <DialogDescription>
            Link your {config.name} account to BitBit
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Idle state — show instructions and start button */}
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
              <Button className="w-full" onClick={startProvisioning}>
                <Smartphone className="mr-2 h-4 w-4" />
                Start Connection
              </Button>
            </>
          )}

          {/* Provisioning state — spinner */}
          {state === 'provisioning' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Setting up your bridge...</p>
            </div>
          )}

          {/* Linking state — QR code or credential form */}
          {state === 'linking' && protocol === 'imessage' && (
            <div className="space-y-3">
              <Input
                placeholder="Apple ID (email)"
                value={appleId}
                onChange={e => setAppleId(e.target.value)}
                type="email"
              />
              <Input
                placeholder="Password"
                value={applePassword}
                onChange={e => setApplePassword(e.target.value)}
                type="password"
              />
              {needs2FA && (
                <Input
                  placeholder="2FA Code"
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  type="text"
                  maxLength={6}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Your credentials are sent directly to the bridge and never stored by BitBit.
              </p>
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for link...
              </Badge>
            </div>
          )}

          {state === 'linking' && protocol !== 'imessage' && (
            <div className="flex flex-col items-center gap-3">
              {/* QR code placeholder — actual QR comes from bridge via polling */}
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

          {/* Connected state — success */}
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

- [ ] **Step 2: Commit**

```bash
git add src/components/channels/bridge-link-modal.tsx
git commit -m "feat: add BridgeLinkModal component for QR/credential account linking"
```

---

## Task 8: Update Channel Grid with Bridge Cards

**Files:**
- Modify: `src/components/channels/channel-grid.tsx`
- Modify: `src/components/channels/channel-card.tsx`

- [ ] **Step 1: Add bridge protocols to TARGET_CHANNELS**

In `src/components/channels/channel-grid.tsx`, add iMessage and Android Messages to the `TARGET_CHANNELS` array (after the existing entries, before the closing `]`):

```typescript
  { type: 'imessage', name: 'iMessage', description: 'Send and receive iMessages', icon: 'MessageSquare', color: '#34C759', connectFlow: 'bridge_link' as ConnectFlow },
  { type: 'android-messages', name: 'Android Messages', description: 'SMS and RCS messaging', icon: 'Smartphone', color: '#1A73E8', connectFlow: 'bridge_link' as ConnectFlow },
```

- [ ] **Step 2: Update ConnectFlow type**

In `src/components/channels/channel-card.tsx`, add `'bridge_link'` to the `ConnectFlow` type:

```typescript
// Before:
export type ConnectFlow = 'oauth' | 'api_key' | 'whatsapp_qr'

// After:
export type ConnectFlow = 'oauth' | 'api_key' | 'whatsapp_qr' | 'bridge_link'
```

- [ ] **Step 3: Add provisioning and suspended status to channel-card.tsx**

In the card's status rendering section, add handling for `'provisioning'` and `'suspended'`:

```typescript
// Add alongside existing 'syncing' and 'error' status checks:
{status === 'provisioning' && (
  <Badge variant="outline" className="gap-1 border-blue-500/30 text-blue-500">
    <Loader2 className="h-3 w-3 animate-spin" />
    Setting up
  </Badge>
)}
{status === 'suspended' && (
  <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-500">
    Sleeping
  </Badge>
)}
```

Update the `ChannelCardProps` status type:

```typescript
// Before:
status: 'connected' | 'disconnected' | 'syncing' | 'error'

// After:
status: 'connected' | 'disconnected' | 'syncing' | 'error' | 'provisioning' | 'suspended'
```

- [ ] **Step 4: Wire bridge_link flow in channel-grid.tsx**

In the `handleConnect()` function, add a case for `bridge_link`:

```typescript
// Import at top:
import { BridgeLinkModal } from './bridge-link-modal'

// Add state:
const [bridgeLinkOpen, setBridgeLinkOpen] = useState(false)
const [bridgeLinkProtocol, setBridgeLinkProtocol] = useState<'imessage' | 'whatsapp' | 'android-messages'>('imessage')

// In handleConnect():
if (channel.connectFlow === 'bridge_link') {
  setBridgeLinkProtocol(channel.type as 'imessage' | 'whatsapp' | 'android-messages')
  setBridgeLinkOpen(true)
  return
}

// Change whatsapp_qr to also use bridge_link:
// Update WhatsApp's connectFlow from 'whatsapp_qr' to 'bridge_link' in TARGET_CHANNELS

// Add modal render at bottom of component (before closing fragment):
<BridgeLinkModal
  open={bridgeLinkOpen}
  onOpenChange={setBridgeLinkOpen}
  protocol={bridgeLinkProtocol}
  onSuccess={() => {
    setBridgeLinkOpen(false)
    fetchStatus()
    addToast('Bridge connected successfully', 'success')
  }}
/>
```

- [ ] **Step 5: Update WhatsApp to use bridge_link flow**

In `TARGET_CHANNELS`, change WhatsApp's `connectFlow`:

```typescript
// Before:
{ type: 'whatsapp', name: 'WhatsApp', description: 'Business messaging via WhatsApp', icon: 'Phone', color: '#25D366', connectFlow: 'whatsapp_qr' },

// After:
{ type: 'whatsapp', name: 'WhatsApp', description: 'Send and receive WhatsApp messages', icon: 'Phone', color: '#25D366', connectFlow: 'bridge_link' },
```

- [ ] **Step 6: Commit**

```bash
git add src/components/channels/channel-grid.tsx src/components/channels/channel-card.tsx
git commit -m "feat: add iMessage, Android Messages cards and bridge linking flow to channel grid"
```

---

## Task 9: Docker Infrastructure — Bridge Container Image

**Files:**
- Create: `infra/bridges/Dockerfile`
- Create: `infra/bridges/entrypoint.sh`
- Create: `infra/fly-bridges.toml`

- [ ] **Step 1: Create the multi-bridge Dockerfile**

Create `infra/bridges/Dockerfile`:

```dockerfile
FROM docker.io/dock.mau.dev/mautrix/whatsapp:latest AS whatsapp
FROM docker.io/dock.mau.dev/mautrix/gmessages:latest AS gmessages
FROM docker.io/dock.mau.dev/mautrix/imessage:latest AS imessage

FROM alpine:3.20

RUN apk add --no-cache bash curl jq

# Copy bridge binaries from builder stages
COPY --from=whatsapp /usr/bin/mautrix-whatsapp /usr/bin/mautrix-whatsapp
COPY --from=gmessages /usr/bin/mautrix-gmessages /usr/bin/mautrix-gmessages
COPY --from=imessage /usr/bin/mautrix-imessage /usr/bin/mautrix-imessage

# Data directory (mounted as Fly Volume)
RUN mkdir -p /data

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV BRIDGE_PROTOCOL=""
ENV MATRIX_HOMESERVER_URL=""
ENV WEBHOOK_URL=""
ENV CONNECTION_ID=""
ENV REGISTRATION_SERVER_URL=""

VOLUME /data
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Create the entrypoint script**

Create `infra/bridges/entrypoint.sh`:

```bash
#!/bin/bash
set -e

echo "BitBit Bridge Container"
echo "Protocol: ${BRIDGE_PROTOCOL}"
echo "Homeserver: ${MATRIX_HOMESERVER_URL}"

CONFIG_DIR="/data/config"
mkdir -p "$CONFIG_DIR"

case "$BRIDGE_PROTOCOL" in
  imessage)
    echo "Starting mautrix-imessage bridge..."
    exec mautrix-imessage -c "$CONFIG_DIR/config.yaml"
    ;;
  whatsapp)
    echo "Starting mautrix-whatsapp bridge..."
    exec mautrix-whatsapp -c "$CONFIG_DIR/config.yaml"
    ;;
  android-messages)
    echo "Starting mautrix-gmessages bridge..."
    exec mautrix-gmessages -c "$CONFIG_DIR/config.yaml"
    ;;
  *)
    echo "Error: Unknown BRIDGE_PROTOCOL: ${BRIDGE_PROTOCOL}"
    echo "Must be one of: imessage, whatsapp, android-messages"
    exit 1
    ;;
esac
```

- [ ] **Step 3: Create Fly app config**

Create `infra/fly-bridges.toml`:

```toml
app = "bitbit-bridges"
primary_region = "syd"

[build]
  dockerfile = "bridges/Dockerfile"

[env]
  LOG_LEVEL = "info"

# Machines are created individually via API, not fly deploy.
# This toml is for `fly apps create` and image builds only.
```

- [ ] **Step 4: Commit**

```bash
git add infra/
git commit -m "infra: add bridge container Dockerfile, entrypoint, and Fly config"
```

---

## Task 10: Docker Infrastructure — Conduit Homeserver

**Files:**
- Create: `infra/conduit/Dockerfile`
- Create: `infra/conduit/conduit.toml`
- Create: `infra/fly-conduit.toml`

- [ ] **Step 1: Create Conduit Dockerfile**

Create `infra/conduit/Dockerfile`:

```dockerfile
FROM docker.io/matrixconduit/matrix-conduit:latest

COPY conduit.toml /etc/conduit/conduit.toml

VOLUME /data

EXPOSE 6167

CMD ["/usr/local/bin/matrix-conduit"]
```

- [ ] **Step 2: Create Conduit config**

Create `infra/conduit/conduit.toml`:

```toml
[global]
server_name = "bitbit.chat"
database_path = "/data/conduit.db"
database_backend = "rocksdb"
port = 6167
address = "0.0.0.0"
max_request_size = 20_000_000
allow_registration = true
allow_federation = false
allow_check_for_updates = false
trusted_servers = []

# Appservice webhook — pushes events to BitBit
# Configured via appservice registration YAML per bridge
```

- [ ] **Step 3: Create Fly app config for Conduit**

Create `infra/fly-conduit.toml`:

```toml
app = "bitbit-conduit"
primary_region = "syd"

[build]
  dockerfile = "conduit/Dockerfile"

[[services]]
  internal_port = 6167
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.ports]]
    port = 80
    handlers = ["http"]

[mounts]
  source = "conduit_data"
  destination = "/data"

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 1024
```

- [ ] **Step 4: Commit**

```bash
git add infra/conduit/ infra/fly-conduit.toml
git commit -m "infra: add Conduit Matrix homeserver Dockerfile and Fly config"
```

---

## Task 11: E2E Verification Checklist

**Files:** No new files — verification steps against running infrastructure.

- [ ] **Step 1: Deploy Conduit homeserver**

```bash
cd infra
fly apps create bitbit-conduit --org personal
fly volumes create conduit_data --size 10 --region syd -a bitbit-conduit
fly deploy -a bitbit-conduit -c fly-conduit.toml
```

Verify: `curl https://bitbit-conduit.fly.dev/_matrix/client/versions` returns Matrix version list.

- [ ] **Step 2: Build and push bridge image**

```bash
cd infra
fly apps create bitbit-bridges --org personal
fly deploy -a bitbit-bridges -c fly-bridges.toml --build-only --push
```

Verify: image is pushed to `registry.fly.io/bitbit-bridges:latest`.

- [ ] **Step 3: Set Vercel environment variables**

Add to Vercel project settings:
- `FLY_API_TOKEN` — Fly.io API token
- `FLY_BRIDGE_REGION` — `syd`
- `FLY_BRIDGE_IMAGE` — `registry.fly.io/bitbit-bridges:latest`
- `CONDUIT_INTERNAL_URL` — Conduit's Fly internal URL
- `IMESSAGE_REGISTRATION_URL` — Registration server internal URL
- `NEXT_PUBLIC_APP_URL` — `https://app.bitbit.chat`

- [ ] **Step 4: Test provision flow**

From BitBit dashboard:
1. Navigate to Connections
2. Click "Connect" on WhatsApp card
3. Modal opens → "Setting up your bridge..." spinner
4. QR code appears (or "Waiting for scan..." if bridge is booting)
5. Scan QR with WhatsApp on phone
6. Modal shows "WhatsApp connected!"
7. Connection card shows "Connected" badge

- [ ] **Step 5: Test message flow**

Send a WhatsApp message to the linked account. Verify:
1. Message arrives in Conduit homeserver
2. Webhook fires to `/api/connections/{id}/webhook`
3. Message appears in `channel_messages` table
4. Message visible in BitBit inbox

- [ ] **Step 6: Test suspend/wake lifecycle**

```bash
# Suspend via API
curl -X POST https://app.bitbit.chat/api/bridges/suspend \
  -H "Content-Type: application/json" \
  -d '{"connection_id": "<id>"}'

# Verify machine stopped
fly machines list -a bitbit-bridges

# Wake via API
curl -X POST https://app.bitbit.chat/api/bridges/wake \
  -H "Content-Type: application/json" \
  -d '{"connection_id": "<id>"}'

# Verify machine started
fly machines list -a bitbit-bridges
```

- [ ] **Step 7: Test disconnect flow**

1. Click "Disconnect" on connected WhatsApp card
2. Confirm in dialog
3. Verify Fly Machine destroyed: `fly machines list -a bitbit-bridges`
4. Connection shows "Disconnected" in dashboard
5. Historical messages preserved in `channel_messages`
