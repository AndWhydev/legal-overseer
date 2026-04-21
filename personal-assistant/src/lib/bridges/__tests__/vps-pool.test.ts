import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VpsPool } from '../vps-pool'

/**
 * Build a Supabase client mock where each call to `.from()` returns a
 * fresh chain. Tests configure each chain's terminal method (single /
 * maybeSingle / count) by pushing into `supabase.responses`.
 *
 * Keeping the chain functions chainable (returning `this`) lets us assert
 * which filters were applied without mocking every call individually.
 */
function mockSupabase() {
  const responses: Array<() => unknown> = []

  const makeChain = () => {
    const next = () => {
      const factory = responses.shift()
      return factory ? factory() : { data: null, error: null, count: 0 }
    }

    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(next())),
      maybeSingle: vi.fn(() => Promise.resolve(next())),
    }

    // Make the chain thenable so a bare `await supabase.from(...).select(...).eq(...)`
    // (for count queries) resolves via the next() response factory.
    const asThenable = {
      ...chain,
      then: (resolve: (v: unknown) => void) => resolve(next()),
    }
    chain.then = asThenable.then

    return chain
  }

  return {
    from: vi.fn(() => makeChain()),
    responses,
  }
}

describe('VpsPool', () => {
  let pool: VpsPool
  let supabase: ReturnType<typeof mockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    supabase = mockSupabase()
    pool = new VpsPool(supabase as never)
  })

  describe('claimInstance', () => {
    it('returns a BlueBubblesConfig and atomically flips status to claimed', async () => {
      const candidate = {
        id: 'pool-row-1',
        vps_id: 'vps-abc',
        vps_ip: '10.0.0.1',
        bb_server_url: 'http://10.0.0.1:1234',
        bb_password: 'secret123',
        ssh_key_fingerprint: 'SHA256:abc',
        vnc_port: 5900,
        vnc_password: 'vncpass',
      }

      // First .from().maybeSingle() — find candidate
      supabase.responses.push(() => ({ data: candidate, error: null }))
      // Second .from().maybeSingle() — atomic claim
      supabase.responses.push(() => ({ data: { id: 'pool-row-1' }, error: null }))

      const result = await pool.claimInstance('conn-1', 'org-1')

      expect(result).not.toBeNull()
      expect(result!.bb_server_url).toBe('http://10.0.0.1:1234')
      expect(result!.bb_password).toBe('secret123')
      expect(result!.vps_ip).toBe('10.0.0.1')
      expect(result!.vps_id).toBe('vps-abc')
      expect(result!.vnc_port).toBe(5900)
      expect(result!.protocol).toBe('imessage')
      expect(result!.linked_at).toBeNull()
      expect(supabase.from).toHaveBeenCalledWith('bridge_pool_instances')
    })

    it('returns null when no warm instance exists', async () => {
      supabase.responses.push(() => ({ data: null, error: null }))

      const result = await pool.claimInstance('conn-1', 'org-1')

      expect(result).toBeNull()
    })

    it('returns null when the atomic claim is lost to a concurrent claimer', async () => {
      const candidate = {
        id: 'pool-row-1',
        vps_id: 'vps-abc',
        vps_ip: '10.0.0.1',
        bb_server_url: 'http://10.0.0.1:1234',
        bb_password: 'secret123',
        ssh_key_fingerprint: 'SHA256:abc',
        vnc_port: 5900,
        vnc_password: 'vncpass',
      }

      // Candidate found
      supabase.responses.push(() => ({ data: candidate, error: null }))
      // But the update returned no rows — someone else got it first
      supabase.responses.push(() => ({ data: null, error: null }))

      const result = await pool.claimInstance('conn-1', 'org-1')

      expect(result).toBeNull()
    })
  })

  describe('getDeficit', () => {
    it('accounts for both warm and in-flight provisioning instances', async () => {
      // getPoolCount → 1 warm
      supabase.responses.push(() => ({ data: null, error: null, count: 1 }))
      // getProvisioningCount → 0 in flight
      supabase.responses.push(() => ({ data: null, error: null, count: 0 }))

      const deficit = await pool.getDeficit()

      // Target = 2, warm = 1, provisioning = 0 → deficit = 1
      expect(deficit).toBe(1)
    })

    it('returns 0 when warm + provisioning already meet target', async () => {
      supabase.responses.push(() => ({ data: null, error: null, count: 1 }))
      supabase.responses.push(() => ({ data: null, error: null, count: 1 }))

      const deficit = await pool.getDeficit()

      expect(deficit).toBe(0)
    })

    it('never returns a negative deficit', async () => {
      supabase.responses.push(() => ({ data: null, error: null, count: 5 }))
      supabase.responses.push(() => ({ data: null, error: null, count: 0 }))

      const deficit = await pool.getDeficit()

      expect(deficit).toBe(0)
    })
  })

  describe('reserveProvisioningSlot', () => {
    it('inserts a new row with status=provisioning and returns its id', async () => {
      supabase.responses.push(() => ({ data: { id: 'new-row-1' }, error: null }))

      const id = await pool.reserveProvisioningSlot({
        vpsId: 'vps-xyz',
        vpsIp: '10.0.0.2',
        bbServerUrl: 'http://10.0.0.2:1234',
        bbPassword: 'pw',
        sshKeyFingerprint: 'SHA256:xyz',
        vncPassword: 'vnc',
      })

      expect(id).toBe('new-row-1')
      expect(supabase.from).toHaveBeenCalledWith('bridge_pool_instances')
    })

    it('throws when the insert errors', async () => {
      supabase.responses.push(() => ({ data: null, error: { message: 'unique violation' } }))

      await expect(
        pool.reserveProvisioningSlot({
          vpsId: 'dup',
          vpsIp: '10.0.0.3',
          bbServerUrl: 'http://10.0.0.3:1234',
          bbPassword: 'pw',
          sshKeyFingerprint: '',
          vncPassword: 'vnc',
        }),
      ).rejects.toThrow(/unique violation/)
    })
  })
})
