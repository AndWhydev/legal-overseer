import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ComposioLifecycle } from '../composio'
import type { OrgConnection } from '../../../connections/types'

vi.mock('../../../composio', async () => ({
  isComposioEnabled: vi.fn(() => true),
  initiateConnectionByAppKey: vi.fn().mockResolvedValue({
    redirectUrl: 'https://composio/auth?x=1',
    connectionRequestId: 'req-1',
  }),
  getConnectedAccount: vi.fn().mockResolvedValue({
    id: 'acc-1',
    status: 'ACTIVE',
    toolkit: 'gmail',
    auth_expires_at: '2027-01-01T00:00:00.000Z',
  }),
  disconnectAccount: vi.fn().mockResolvedValue(true),
  invalidateComposioToolCache: vi.fn(),
}))

vi.mock('../../../composio/triggers', async () => ({
  setupChannelTrigger: vi.fn().mockResolvedValue({ id: 'trig-1', status: 'ACTIVE' }),
  deleteTrigger: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../composio/dispatch-crawl', async () => ({
  dispatchConnectionCrawl: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'crawl:acc-1' }),
}))

function makeSupabase(opts: { failConnectedUpdate?: string } = {}) {
  const updates: Record<string, unknown>[] = []
  const inserts: Record<string, unknown>[] = []
  const deletes: string[] = []

  const single = vi.fn().mockResolvedValue({
    data: { id: 'c1', status: 'provisioning' },
    error: null,
  })

  const from = vi.fn((table: string) => ({
    upsert: vi.fn(() => ({
      select: vi.fn(() => ({ single })),
    })),
    update: vi.fn((u: Record<string, unknown>) => {
      updates.push({ ...u, __table: table })
      const updateError =
        table === 'org_connections' &&
        u.status === 'connected' &&
        opts.failConnectedUpdate
          ? { message: opts.failConnectedUpdate }
          : null
      // Support two shapes:
      //  1. .update(u).eq(id)                               — fire-and-forget update
      //  2. .update(u).eq(id).neq(col, val).select('id')    — CAS claim
      //  3. .update(u).eq(id).select('id')                  — verified update
      return {
        eq: vi.fn(() => {
          const p: any = Promise.resolve({ error: updateError })
          p.neq = vi.fn(() => ({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'c1' }], error: null }),
          }))
          p.select = vi.fn().mockResolvedValue({
            data: updateError ? null : [{ id: 'c1' }],
            error: updateError,
          })
          return p
        }),
      }
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((_col: string, id: string) => {
        deletes.push(id)
        return Promise.resolve({ error: null })
      }),
    })),
    insert: vi.fn((p: Record<string, unknown>) => {
      inserts.push({ ...p, __table: table })
      return {
        then: (onFulfilled: (v: { error: null }) => unknown) => onFulfilled({ error: null }),
      }
    }),
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
  }))

  return { supabase: { from } as any, updates, inserts, deletes, single }
}

describe('ComposioLifecycle', () => {
  let mocks: Awaited<typeof import('../../../composio')>

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks = await import('../../../composio')
  })

  describe('provision', () => {
    it('upserts row and returns redirect URL', async () => {
      const { supabase } = makeSupabase()
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const result = await lifecycle.provision({
        orgId: 'org-1',
        userId: 'user-1',
        providerId: 'gmail',
      })

      expect(result.kind).toBe('oauth_redirect')
      if (result.kind === 'oauth_redirect') {
        expect(result.redirectUrl).toBe('https://composio/auth?x=1')
        expect(result.connectionId).toBe('c1')
      }
    })
  })

  describe('activate', () => {
    it('wires triggers, stores expiry, dispatches crawl', async () => {
      const { supabase, updates } = makeSupabase()
      const triggers = await import('../../../composio/triggers')
      const crawl = await import('../../../composio/dispatch-crawl')
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        org_id: 'org-1',
        provider: 'gmail',
        transport: 'composio',
        config: {},
      } as unknown as OrgConnection

      await lifecycle.activate(conn, { accountId: 'acc-1' })

      expect(triggers.setupChannelTrigger).toHaveBeenCalledWith('gmail', 'acc-1', 'https://app.bitbit.chat')
      expect(crawl.dispatchConnectionCrawl).toHaveBeenCalledWith({
        orgId: 'org-1',
        appKey: 'gmail',
        connectedAccountId: 'acc-1',
      })
      const lastUpdate = updates[updates.length - 1]
      expect(lastUpdate.status).toBe('connected')
      expect(lastUpdate.connected_account_id).toBe('acc-1')
      expect(lastUpdate.trigger_ids).toEqual(['trig-1'])
      expect(lastUpdate.auth_expires_at).toBe('2027-01-01T00:00:00.000Z')
    })

    it('marks needs_reauth when activate is called without an account id', async () => {
      const { supabase, updates } = makeSupabase()
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        org_id: 'org-1',
        provider: 'gmail',
        transport: 'composio',
        config: {},
      } as unknown as OrgConnection

      await lifecycle.activate(conn, {})

      expect(updates.some((u) => u.status === 'needs_reauth')).toBe(true)
      expect(updates.some((u) => u.status === 'connected')).toBe(false)
    })

    it('throws and marks error when connection row update fails', async () => {
      const { supabase, updates } = makeSupabase({ failConnectedUpdate: 'write failed' })
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        org_id: 'org-1',
        provider: 'gmail',
        transport: 'composio',
        config: {},
      } as unknown as OrgConnection

      await expect(lifecycle.activate(conn, { accountId: 'acc-1' })).rejects.toThrow(
        'activate update failed: write failed',
      )
      expect(updates.some((u) => u.status === 'error')).toBe(true)
    })
  })

  describe('disconnect', () => {
    it('deletes triggers, revokes Composio account, and hard-deletes row', async () => {
      const { supabase, deletes } = makeSupabase()
      const triggers = await import('../../../composio/triggers')
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        org_id: 'org-1',
        provider: 'gmail',
        transport: 'composio',
        connected_account_id: 'acc-1',
        trigger_ids: ['trig-1', 'trig-2'],
        config: { composio_connected_account_id: 'acc-1' },
      } as unknown as OrgConnection

      await lifecycle.disconnect(conn, { hard: true, initiator: 'user' })

      expect(triggers.deleteTrigger).toHaveBeenCalledWith('trig-1')
      expect(triggers.deleteTrigger).toHaveBeenCalledWith('trig-2')
      expect(mocks.disconnectAccount).toHaveBeenCalledWith('acc-1')
      expect(deletes).toContain('c1')
    })

    it('soft-disconnect does not delete the row', async () => {
      const { supabase, deletes, updates } = makeSupabase()
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        org_id: 'org-1',
        provider: 'gmail',
        transport: 'composio',
        connected_account_id: 'acc-1',
        trigger_ids: [],
        config: {},
      } as unknown as OrgConnection

      await lifecycle.disconnect(conn, { hard: false, initiator: 'system' })

      expect(deletes).not.toContain('c1')
      expect(updates.some(u => u.status === 'disabled')).toBe(true)
    })
  })

  describe('refresh', () => {
    it('returns refreshed when account ACTIVE', async () => {
      const { supabase } = makeSupabase()
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        connected_account_id: 'acc-1',
        config: {},
      } as unknown as OrgConnection

      const result = await lifecycle.refresh(conn)
      expect(result.kind).toBe('refreshed')
    })

    it('marks expired when Composio says EXPIRED', async () => {
      const { supabase, updates } = makeSupabase()
      ;(mocks.getConnectedAccount as any).mockResolvedValueOnce({
        id: 'acc-1', status: 'EXPIRED', toolkit: 'gmail',
      })
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1',
        connected_account_id: 'acc-1',
        config: {},
      } as unknown as OrgConnection

      const result = await lifecycle.refresh(conn)
      expect(result.kind).toBe('expired')
      expect(updates.some(u => u.status === 'auth_expired')).toBe(true)
    })
  })

  describe('healthCheck', () => {
    it('maps ACTIVE to healthy', async () => {
      const { supabase } = makeSupabase()
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1', connected_account_id: 'acc-1', config: {},
      } as unknown as OrgConnection

      const report = await lifecycle.healthCheck(conn)
      expect(report.healthy).toBe(true)
      expect(report.nextStatus).toBe('connected')
    })

    it('returns unhealthy with needs_reauth when account missing', async () => {
      const { supabase } = makeSupabase()
      const lifecycle = new ComposioLifecycle({ supabase, appUrl: 'https://app.bitbit.chat' })

      const conn = {
        id: 'c1', connected_account_id: null, config: {},
      } as unknown as OrgConnection

      const report = await lifecycle.healthCheck(conn)
      expect(report.healthy).toBe(false)
      expect(report.nextStatus).toBe('needs_reauth')
    })
  })
})
