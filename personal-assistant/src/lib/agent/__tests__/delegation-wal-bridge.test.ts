import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock wal-emitter before importing the module under test so logDelegatedAction
// picks up the mocked emitToWAL.
vi.mock('@/lib/brain/wal-emitter', () => ({
  emitToWAL: vi.fn().mockResolvedValue(null),
}))

import { emitToWAL } from '@/lib/brain/wal-emitter'
import { logDelegatedAction } from '../delegation-mandate'

const mockedEmit = vi.mocked(emitToWAL)

// ---------------------------------------------------------------------------
// Supabase mock (insert path only — same shape as delegation-audit.test.ts)
// ---------------------------------------------------------------------------

function createMockChain(overrides: Record<string, unknown> = {}) {
  const defaults = {
    select: vi.fn(),
    insert: vi.fn(),
    single: vi.fn(),
  }
  const fns = { ...defaults, ...overrides }
  for (const key of Object.keys(fns)) {
    if (!overrides[key]) {
      fns[key as keyof typeof fns] = vi.fn().mockReturnValue(fns)
    }
  }
  return fns
}

function mockSupabaseForInsert(data: Record<string, unknown> | null) {
  const chain = createMockChain({
    single: vi.fn().mockResolvedValue({ data, error: null }),
  })
  return { from: vi.fn().mockReturnValue(chain) } as any
}

// ---------------------------------------------------------------------------
// Bridge: logDelegatedAction -> emitToWAL
// ---------------------------------------------------------------------------

describe('logDelegatedAction — WAL bridge to Living Brain', () => {
  beforeEach(() => {
    mockedEmit.mockClear()
  })

  it('emits a delegated_action WAL entry after a successful insert', async () => {
    const entry = {
      id: 'action-wal-1',
      org_id: 'org-1',
      entity_id: 'entity-steve',
      mandate_id: 'mandate-1',
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #42 to Steve ($2,400)',
      action_payload: { invoice_id: '42' },
      financial_impact: { amount: 2400, currency: 'AUD', direction: 'inbound' },
      evidence_urls: ['https://example.com/invoice/42'],
      fiduciary_evaluation: { risk: 'low', score: 0.9 },
      agent_run_id: 'run-1',
      created_at: '2026-04-14T00:00:00Z',
    }
    const supabase = mockSupabaseForInsert(entry)

    await logDelegatedAction(supabase, {
      org_id: 'org-1',
      entity_id: 'entity-steve',
      mandate_id: 'mandate-1',
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #42 to Steve ($2,400)',
      action_payload: { invoice_id: '42' },
      financial_impact: { amount: 2400, currency: 'AUD', direction: 'inbound' },
      evidence_urls: ['https://example.com/invoice/42'],
      fiduciary_evaluation: { risk: 'low', score: 0.9 },
      agent_run_id: 'run-1',
    })

    // Wait a tick for the fire-and-forget emit promise to resolve.
    await Promise.resolve()

    expect(mockedEmit).toHaveBeenCalledTimes(1)
    const [, params] = mockedEmit.mock.calls[0]
    expect(params).toEqual({
      org_id: 'org-1',
      entity_ids: ['entity-steve'],
      signal_type: 'delegated_action',
      content: 'Sent invoice #42 to Steve ($2,400)',
      confidence: 1.0,
      source_memory_id: null,
      source_thread_id: null,
    })
  })

  it('does not throw if WAL emission fails (fire-and-forget)', async () => {
    mockedEmit.mockRejectedValueOnce(new Error('wal down'))

    const entry = {
      id: 'action-wal-2',
      org_id: 'org-1',
      entity_id: 'entity-2',
      mandate_id: null,
      action_type: 'reply',
      action_summary: 'Replied to Steve',
      action_payload: {},
      financial_impact: null,
      evidence_urls: [],
      fiduciary_evaluation: null,
      agent_run_id: null,
      created_at: '2026-04-14T00:00:00Z',
    }
    const supabase = mockSupabaseForInsert(entry)

    const result = await logDelegatedAction(supabase, {
      org_id: 'org-1',
      entity_id: 'entity-2',
      action_type: 'reply',
      action_summary: 'Replied to Steve',
    })

    // Action log insert still succeeds even though WAL emission rejected.
    expect(result.id).toBe('action-wal-2')
    expect(mockedEmit).toHaveBeenCalledTimes(1)
  })
})
