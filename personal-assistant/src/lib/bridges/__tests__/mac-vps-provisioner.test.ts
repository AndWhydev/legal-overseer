import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MacVpsProvisioner } from '../mac-vps-provisioner'
import type { BlueBubblesConfig } from '../types'

// Mock ssh2 so no real SSH connections are made.
// The mock Client triggers 'ready' immediately on .connect() and
// exec callbacks succeed with exit code 0.
vi.mock('ssh2', () => {
  const mockStream = {
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') cb(0)
    }),
  }

  class MockClient {
    private handlers: Record<string, (...args: unknown[]) => void> = {}

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = handler
      return this
    }

    connect(_opts: unknown) {
      // Fire 'ready' synchronously so the promise chain resolves
      this.handlers['ready']?.()
    }

    exec(_cmd: string, cb: (err: null, stream: typeof mockStream) => void) {
      cb(null, mockStream)
    }

    end() {}
  }

  return { Client: MockClient }
})

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

function makeChain(resolvedValue: unknown = { error: null }) {
  const resolved = Promise.resolve(resolvedValue)
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  }
  return chain
}

function mockSupabase() {
  const supabase = {
    from: vi.fn().mockReturnValue(makeChain()),
  }
  return supabase
}

// ---------------------------------------------------------------------------
// VpsPool mock helper
// ---------------------------------------------------------------------------

function mockPool(instance: BlueBubblesConfig | null) {
  return {
    claimInstance: vi.fn().mockResolvedValue(instance),
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_INSTANCE: BlueBubblesConfig = {
  bb_server_url: 'http://10.0.0.1:3000',
  bb_password: 'secret123',
  vps_ip: '10.0.0.1',
  vps_id: 'vps-abc',
  ssh_key_fingerprint: 'SHA256:abc',
  vnc_port: 5900,
  vnc_password: 'vncpass',
  apple_id_email: '',
  protocol: 'imessage',
  linked_at: null,
  last_message_at: null,
}

const PROVISIONER_CONFIG = {
  sshPrivateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
  sshUser: 'admin',
  webhookBaseUrl: 'https://app.bitbit.com',
}

const PROVISION_OPTS = {
  orgId: 'org-1',
  userId: 'user-1',
  connectionId: 'conn-1',
  appleIdEmail: 'test@icloud.com',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MacVpsProvisioner', () => {
  describe('provision', () => {
    it('claims from pool and returns LinkingInfo with link_type vnc', async () => {
      const supabase = mockSupabase()
      const pool = mockPool(TEST_INSTANCE)
      const provisioner = new MacVpsProvisioner(supabase as any, pool as any, PROVISIONER_CONFIG)

      const result = await provisioner.provision(PROVISION_OPTS)

      // Pool was called with correct args
      expect(pool.claimInstance).toHaveBeenCalledWith('conn-1', 'org-1')

      // Returns correct LinkingInfo shape
      expect(result.connection_id).toBe('conn-1')
      expect(result.protocol).toBe('imessage')
      expect(result.link_type).toBe('vnc')
      expect(result.status).toBe('waiting')

      // link_data contains VNC connection info
      const linkData = JSON.parse(result.link_data!)
      expect(linkData.vps_ip).toBe('10.0.0.1')
      expect(linkData.vnc_port).toBe(5900)
      expect(linkData.vnc_password).toBe('vncpass')
    })

    it('throws when pool is empty', async () => {
      const supabase = mockSupabase()
      const pool = mockPool(null)
      const provisioner = new MacVpsProvisioner(supabase as any, pool as any, PROVISIONER_CONFIG)

      await expect(provisioner.provision(PROVISION_OPTS)).rejects.toThrow(
        'No warm Mac VPS instances available',
      )
    })
  })

  describe('destroy', () => {
    it('updates connection status to disabled', async () => {
      const chain = makeChain({ error: null })
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
      }
      const pool = mockPool(null)
      const provisioner = new MacVpsProvisioner(supabase as any, pool as any, PROVISIONER_CONFIG)

      await provisioner.destroy('conn-1', '10.0.0.1')

      // supabase.from was called (for update and insert)
      expect(supabase.from).toHaveBeenCalledWith('org_connections')
      expect(supabase.from).toHaveBeenCalledWith('connection_sync_logs')

      // The update chain was called with disabled status
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'disabled' }),
      )
    })
  })
})
