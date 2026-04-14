/**
 * Locks in the cron-partitioning invariant:
 *
 * The /api/cron/connector-health sweep MUST NOT touch transport='bridge'
 * rows. Those are owned by /api/cron/bridge-health until phase 7 merges
 * them. If this test breaks, either (a) you added bridge handling here
 * without removing it from bridge-health (double-probe bug), or
 * (b) phase 7 has landed — in which case also update this test.
 */
import { describe, it, expect, vi } from 'vitest'
import { ConnectorManager } from '../../../../../lib/connectors/manager'
import type { ConnectorLifecycle } from '../../../../../lib/connectors/lifecycle'

function makeLifecycle(): ConnectorLifecycle {
  return {
    transport: 'composio',
    provision: vi.fn(),
    activate: vi.fn(),
    refresh: vi.fn(),
    suspend: vi.fn(),
    disconnect: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  } as unknown as ConnectorLifecycle
}

describe('connector-health cron partition', () => {
  it('runHealthSweep with transports=[composio,poll,webhook] does not request bridge rows', async () => {
    const inFn = vi.fn().mockReturnThis()
    const or = vi.fn().mockReturnThis()
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: inFn, or, limit })),
      })),
    }
    ;(inFn as any).or = or
    ;(inFn as any).in = inFn
    ;(inFn as any).limit = limit
    ;(or as any).limit = limit

    const manager = new ConnectorManager({
      supabase: supabase as any,
      lifecycles: { composio: makeLifecycle() },
    })

    await manager.runHealthSweep({ transports: ['composio', 'poll', 'webhook'] })

    // First `in` call in manager.runHealthSweep is on the `transport` column.
    expect(inFn).toHaveBeenCalled()
    const firstInCall = (inFn as any).mock.calls[0]
    // firstInCall = [column, values] — assert transport column excludes bridge.
    expect(firstInCall[0]).toBe('transport')
    expect(firstInCall[1]).not.toContain('bridge')
    expect(firstInCall[1]).toEqual(
      expect.arrayContaining(['composio', 'poll', 'webhook']),
    )
  })
})
