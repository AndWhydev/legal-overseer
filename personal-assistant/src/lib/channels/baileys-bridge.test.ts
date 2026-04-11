import { describe, expect, it, vi } from 'vitest'
import { BaileysBridge } from './baileys-bridge'

type BridgeInternals = {
  sessionId: string | null
  persistenceMode: 'database' | 'memory'
  status: 'connected' | 'disconnected' | 'pairing'
  qrCode: string | null
  createdAt: string | null
  lastActivity: string | null
}

function createSupabaseSelectMock(result: { data?: unknown; error?: unknown }) {
  const single = vi.fn().mockResolvedValue(result)
  const limit = vi.fn(() => ({ single }))
  const order = vi.fn(() => ({ limit }))
  const eqStatus = vi.fn(() => ({ order }))
  const eqOrg = vi.fn(() => ({ eq: eqStatus }))
  const eqId = vi.fn(() => ({ single }))

  return {
    from: vi.fn(() => ({
      select: vi.fn((query: string) => {
        if (query === 'session_data') {
          return { eq: eqOrg }
        }

        return { eq: eqId }
      }),
    })),
  }
}

function getBridgeInternals(bridge: BaileysBridge) {
  return bridge as unknown as BridgeInternals
}

describe('BaileysBridge.getStatus', () => {
  it('returns in-memory status when using memory persistence', async () => {
    const bridge = new BaileysBridge({ from: vi.fn() } as never, 'org-123')
    const internals = getBridgeInternals(bridge)

    internals.sessionId = 'memory:org-123:test'
    internals.persistenceMode = 'memory'
    internals.status = 'pairing'
    internals.qrCode = 'data:image/png;base64,qr'
    internals.createdAt = new Date(Date.now() - 60_000).toISOString()
    internals.lastActivity = '2026-03-09T00:00:00.000Z'

    const status = await bridge.getStatus()

    expect(status).toMatchObject({
      status: 'pairing',
      sessionId: 'memory:org-123:test',
      qrCode: 'data:image/png;base64,qr',
      lastActivity: '2026-03-09T00:00:00.000Z',
    })
    expect(status.sessionAge).not.toBeNull()
  })

  it('falls back to in-memory status when whatsapp_sessions is missing', async () => {
    const supabase = createSupabaseSelectMock({
      data: null,
      error: {
        message: "Could not find the table 'public.whatsapp_sessions' in the schema cache",
      },
    })

    const bridge = new BaileysBridge(supabase as never, 'org-123')
    const internals = getBridgeInternals(bridge)

    internals.sessionId = 'session-123'
    internals.persistenceMode = 'database'
    internals.status = 'connected'
    internals.qrCode = null
    internals.createdAt = new Date(Date.now() - 60_000).toISOString()
    internals.lastActivity = '2026-03-09T00:00:00.000Z'

    const status = await bridge.getStatus()

    expect(status).toMatchObject({
      status: 'connected',
      sessionId: 'session-123',
      qrCode: null,
      lastActivity: '2026-03-09T00:00:00.000Z',
    })
    expect(internals.persistenceMode).toBe('memory')
  })
})
