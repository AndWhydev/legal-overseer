import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VpsPool } from '../vps-pool'

function mockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  }
  return { from: vi.fn().mockReturnValue(chain), _chain: chain }
}

describe('VpsPool', () => {
  let pool: VpsPool
  let supabase: ReturnType<typeof mockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    supabase = mockSupabase()
    pool = new VpsPool(supabase as any)
  })

  describe('claimInstance', () => {
    it('returns a BlueBubblesConfig and marks the pool row as claimed', async () => {
      const poolRow = {
        id: 'pool-row-1',
        config: {
          bb_server_url: 'http://10.0.0.1:3000',
          bb_password: 'secret123',
          vps_ip: '10.0.0.1',
          vps_id: 'vps-abc',
          ssh_key_fingerprint: 'SHA256:abc',
          vnc_port: 5900,
          vnc_password: 'vncpass',
          status: 'warm',
          protocol: 'imessage',
        },
      }

      // First call (select for claim): returns pool row
      // Second call (update): returns void-like
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: poolRow, error: null }),
      }
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }

      supabase.from
        .mockReturnValueOnce(selectChain as any)
        .mockReturnValueOnce(updateChain as any)

      const result = await pool.claimInstance('conn-1', 'org-1')

      expect(result).not.toBeNull()
      expect(result!.bb_server_url).toBe('http://10.0.0.1:3000')
      expect(result!.bb_password).toBe('secret123')
      expect(result!.vps_ip).toBe('10.0.0.1')
      expect(result!.vps_id).toBe('vps-abc')
      expect(result!.ssh_key_fingerprint).toBe('SHA256:abc')
      expect(result!.vnc_port).toBe(5900)
      expect(result!.vnc_password).toBe('vncpass')
      expect(result!.apple_id_email).toBe('')
      expect(result!.protocol).toBe('imessage')
      expect(result!.linked_at).toBeNull()
      expect(result!.last_message_at).toBeNull()

      // Verify update was called to mark as claimed
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'disabled',
          config: expect.objectContaining({
            status: 'claimed',
            claimed_by: 'conn-1',
          }),
        }),
      )
      expect(updateChain.eq).toHaveBeenCalledWith('id', 'pool-row-1')
    })

    it('returns null when pool is empty', async () => {
      const emptyChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }
      supabase.from.mockReturnValueOnce(emptyChain as any)

      const result = await pool.claimInstance('conn-1', 'org-1')

      expect(result).toBeNull()
    })
  })

  describe('getPoolCount', () => {
    function makeCountChain(resolvedData: unknown[] | null) {
      // The chain is awaited directly after the last .eq() call.
      // We make the chain itself a thenable so `await chain.eq(...)` resolves.
      const resolved = Promise.resolve({ data: resolvedData, error: null })
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
      }
      // Each .eq() returns the same chain (which is also thenable)
      chain.eq = vi.fn().mockReturnValue(chain)
      return chain
    }

    it('returns number of warm pending instances', async () => {
      supabase.from.mockReturnValueOnce(makeCountChain([{ id: 'row-1' }, { id: 'row-2' }]) as any)

      const count = await pool.getPoolCount()

      expect(count).toBe(2)
      expect(supabase.from).toHaveBeenCalledWith('org_connections')
    })

    it('returns 0 when no instances exist', async () => {
      supabase.from.mockReturnValueOnce(makeCountChain([]) as any)

      const count = await pool.getPoolCount()
      expect(count).toBe(0)
    })

    it('returns 0 when data is null', async () => {
      supabase.from.mockReturnValueOnce(makeCountChain(null) as any)

      const count = await pool.getPoolCount()
      expect(count).toBe(0)
    })
  })
})
