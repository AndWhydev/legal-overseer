import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorManager } from '../manager'
import type { ConnectorLifecycle } from '../lifecycle'

function makeLifecycle(transport: 'composio' | 'bridge' | 'poll' | 'webhook' = 'composio'): ConnectorLifecycle {
  return {
    transport,
    provision: vi.fn().mockResolvedValue({ kind: 'immediate', connectionId: 'c1' }),
    activate: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({ kind: 'noop' }),
    suspend: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  } as unknown as ConnectorLifecycle
}

function makeSupabase(rows: any[] = []) {
  const single = vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null })
  const or = vi.fn().mockReturnValue({ limit })
  const inFn = vi.fn().mockReturnValue({ or, limit, in: vi.fn().mockReturnValue({ or, limit }) })
  const eq = vi.fn(() => ({ single, eq: vi.fn(() => ({ single })) }))
  const select = vi.fn(() => ({ eq, in: inFn, single, limit }))
  return {
    from: vi.fn(() => ({
      select,
      update,
      delete: del,
    })),
  } as any
}

describe('ConnectorManager', () => {
  it('dispatches provision to the right lifecycle', async () => {
    const composio = makeLifecycle('composio')
    const bridge = makeLifecycle('bridge')
    const supabase = makeSupabase()
    const manager = new ConnectorManager({
      supabase,
      lifecycles: { composio, bridge },
    })

    await manager.provision('composio', {
      orgId: 'org-1',
      userId: 'user-1',
      providerId: 'gmail',
    })

    expect(composio.provision).toHaveBeenCalledTimes(1)
    expect(bridge.provision).not.toHaveBeenCalled()
  })

  it('throws when no lifecycle is registered for a transport', async () => {
    const supabase = makeSupabase()
    const manager = new ConnectorManager({ supabase, lifecycles: {} })

    await expect(
      manager.provision('composio', { orgId: 'x', userId: 'y', providerId: 'gmail' }),
    ).rejects.toThrow(/no lifecycle registered/)
  })

  it('disconnect returns not_found when row missing', async () => {
    const supabase = makeSupabase([]) // single returns null
    const manager = new ConnectorManager({
      supabase,
      lifecycles: { composio: makeLifecycle('composio') },
    })

    const result = await manager.disconnect('missing', { hard: true })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('disconnect routes to the connection transport lifecycle', async () => {
    const lifecycle = makeLifecycle('composio')
    const supabase = makeSupabase([{
      id: 'c1',
      transport: 'composio',
      status: 'connected',
      org_id: 'org-1',
      provider: 'gmail',
      trigger_ids: [],
    }])
    const manager = new ConnectorManager({ supabase, lifecycles: { composio: lifecycle } })

    const result = await manager.disconnect('c1', { hard: true, initiator: 'user' })
    expect(result).toEqual({ ok: true })
    expect(lifecycle.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', transport: 'composio' }),
      expect.objectContaining({ hard: true, initiator: 'user' }),
    )
  })

  it('runHealthSweep reports healthy + unhealthy correctly', async () => {
    const lifecycle = makeLifecycle('composio')
    ;(lifecycle.healthCheck as any)
      .mockResolvedValueOnce({ healthy: true })
      .mockResolvedValueOnce({ healthy: false, error: 'boom' })

    const supabase = makeSupabase([
      { id: 'c1', transport: 'composio', status: 'connected', consecutive_failures: 0 },
      { id: 'c2', transport: 'composio', status: 'connected', consecutive_failures: 1 },
    ])
    const manager = new ConnectorManager({ supabase, lifecycles: { composio: lifecycle } })

    const result = await manager.runHealthSweep({ transports: ['composio'] })
    expect(result.checked).toBe(2)
    expect(result.healthy).toBe(1)
    expect(result.unhealthy).toBe(1)
  })
})
