import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  disconnectConnectorToolDefinitions,
  disconnectConnectorToolHandlers,
} from '../disconnect-connector'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDisconnect = vi.fn()

vi.mock('@/lib/connectors', () => ({
  createConnectorManager: vi.fn(() => ({
    disconnect: mockDisconnect,
  })),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Supabase mock builder — supports the chained queries used in the handler
// ---------------------------------------------------------------------------

interface StubRow {
  id: string
  provider: string
  display_name: string
  last_sync_at: string | null
  status: string
}

function makeSupabase(opts: {
  byId?: Record<string, StubRow>
  bySlug?: Record<string, StubRow[]>
  queryError?: string
}) {
  const { byId = {}, bySlug = {}, queryError } = opts

  return {
    from(_table: string) {
      const state: {
        eqOrgId?: string
        eqId?: string
        ilikeProvider?: string
      } = {}

      const builder: any = {
        select(_cols: string) {
          return builder
        },
        eq(col: string, val: string) {
          if (col === 'org_id') state.eqOrgId = val
          else if (col === 'id') state.eqId = val
          return builder
        },
        ilike(col: string, val: string) {
          if (col === 'provider') state.ilikeProvider = val
          return builder
        },
        order() {
          return builder
        },
        limit() {
          // Terminal for slug path — returns a thenable
          return {
            then(resolve: (r: { data: StubRow[] | null; error: { message: string } | null }) => unknown) {
              if (queryError) return resolve({ data: null, error: { message: queryError } })
              const slug = (state.ilikeProvider || '').toLowerCase()
              const rows = bySlug[slug] || []
              return resolve({ data: rows, error: null })
            },
          }
        },
        maybeSingle() {
          // Terminal for UUID path
          if (queryError) return Promise.resolve({ data: null, error: { message: queryError } })
          const row = state.eqId ? byId[state.eqId] : undefined
          return Promise.resolve({ data: row ?? null, error: null })
        },
      }

      return builder
    },
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('disconnect-connector tool', () => {
  beforeEach(() => {
    mockDisconnect.mockReset()
  })

  describe('tool definitions', () => {
    it('exports disconnect_connector tool', () => {
      const tool = disconnectConnectorToolDefinitions.find(
        t => t.name === 'disconnect_connector',
      )
      expect(tool).toBeDefined()
      expect(tool!.description?.toLowerCase() ?? '').toContain('revoke')
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['connector_id', 'confirm']),
      )
      expect((tool!.input_schema.properties as any).connector_id).toBeDefined()
      expect((tool!.input_schema.properties as any).confirm).toBeDefined()
    })
  })

  describe('handler', () => {
    const UUID = '11111111-2222-3333-4444-555555555555'
    const row: StubRow = {
      id: UUID,
      provider: 'outlook',
      display_name: 'Outlook (work)',
      last_sync_at: '2026-04-10T00:00:00Z',
      status: 'connected',
    }

    it('confirm=false returns preview and does NOT call disconnect', async () => {
      const supabase = makeSupabase({ byId: { [UUID]: row } })
      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { connector_id: UUID, confirm: false },
        'org-1',
        supabase,
      )

      expect(result.success).toBe(true)
      expect((result.data as any).about_to_disconnect).toEqual({
        id: UUID,
        provider: 'outlook',
        display_name: 'Outlook (work)',
        last_active_at: '2026-04-10T00:00:00Z',
      })
      expect(mockDisconnect).not.toHaveBeenCalled()
    })

    it('confirm=true calls disconnect and returns success', async () => {
      const supabase = makeSupabase({ byId: { [UUID]: row } })
      mockDisconnect.mockResolvedValue({ ok: true })

      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { connector_id: UUID, confirm: true },
        'org-1',
        supabase,
      )

      expect(result.success).toBe(true)
      expect((result.data as any).disconnected).toEqual({
        provider: 'outlook',
        id: UUID,
      })
      expect(mockDisconnect).toHaveBeenCalledTimes(1)
      expect(mockDisconnect).toHaveBeenCalledWith(
        UUID,
        expect.objectContaining({ hard: true, initiator: 'user' }),
      )
    })

    it('resolves provider slug (case-insensitive) to most recent connection', async () => {
      const supabase = makeSupabase({ bySlug: { outlook: [row] } })
      mockDisconnect.mockResolvedValue({ ok: true })

      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { connector_id: 'OUTLOOK', confirm: true },
        'org-1',
        supabase,
      )

      expect(result.success).toBe(true)
      expect((result.data as any).disconnected.id).toBe(UUID)
      expect(mockDisconnect).toHaveBeenCalledWith(UUID, expect.any(Object))
    })

    it('returns structured error when connector is unknown', async () => {
      const supabase = makeSupabase({})
      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { connector_id: 'nonexistent', confirm: true },
        'org-1',
        supabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('nonexistent')
      expect(mockDisconnect).not.toHaveBeenCalled()
    })

    it('wraps disconnect failures without throwing', async () => {
      const supabase = makeSupabase({ byId: { [UUID]: row } })
      mockDisconnect.mockResolvedValue({ ok: false, reason: 'upstream exploded' })

      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { connector_id: UUID, confirm: true },
        'org-1',
        supabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('upstream exploded')
    })

    it('wraps thrown errors from the manager without throwing', async () => {
      const supabase = makeSupabase({ byId: { [UUID]: row } })
      mockDisconnect.mockRejectedValue(new Error('boom'))

      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { connector_id: UUID, confirm: true },
        'org-1',
        supabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('boom')
    })

    it('requires connector_id', async () => {
      const supabase = makeSupabase({})
      const result = await disconnectConnectorToolHandlers.disconnect_connector(
        { confirm: true },
        'org-1',
        supabase,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('connector_id')
    })
  })
})
