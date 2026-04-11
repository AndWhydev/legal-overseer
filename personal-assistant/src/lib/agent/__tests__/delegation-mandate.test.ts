import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEntityMandate,
  setEntityMandate,
  revokeEntityMandate,
  logDelegatedAction,
  getRecentDelegatedActions,
  isEntityFullyDelegated,
} from '../delegation-mandate'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockChain(overrides: Record<string, unknown> = {}) {
  const defaults = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  }
  const fns = { ...defaults, ...overrides }

  // Each chainable method returns the chain itself unless overridden
  for (const key of Object.keys(fns)) {
    if (!overrides[key]) {
      fns[key as keyof typeof fns] = vi.fn().mockReturnValue(fns)
    }
  }
  return fns
}

function mockSupabaseForSelect(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
) {
  const chain = createMockChain({
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any
}

function mockSupabaseForInsert(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
) {
  const chain = createMockChain({
    single: vi.fn().mockResolvedValue({ data, error }),
  })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any
}

function mockSupabaseForUpdate(
  data: Record<string, unknown>[] | null,
  error: { message: string } | null = null,
) {
  const chain = createMockChain({
    select: vi.fn().mockResolvedValue({ data, error }),
  })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any
}

function mockSupabaseForList(
  data: Record<string, unknown>[] | null,
  error: { message: string } | null = null,
) {
  const chain = createMockChain({
    order: vi.fn().mockResolvedValue({ data, error }),
  })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any
}

/** Creates a mock that handles both update (revoke) then insert (set) in sequence */
function mockSupabaseForSet(
  revokeData: Record<string, unknown>[] | null,
  insertData: Record<string, unknown> | null,
  insertError: { message: string } | null = null,
) {
  const revokeChain = createMockChain({
    select: vi.fn().mockResolvedValue({ data: revokeData, error: null }),
  })
  const insertChain = createMockChain({
    single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
  })
  const fromFn = vi.fn()
    .mockReturnValueOnce(revokeChain) // first call = revoke update
    .mockReturnValueOnce(insertChain) // second call = insert
  return { from: fromFn } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getEntityMandate', () => {
  it('returns the active mandate when one exists', async () => {
    const mandate = {
      id: 'mandate-1',
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_level: 'infinite_autopilot',
      activated_at: '2026-04-10T00:00:00Z',
      activated_via: 'dashboard',
      deactivated_at: null,
      deactivated_via: null,
    }
    const supabase = mockSupabaseForSelect(mandate)
    const result = await getEntityMandate(supabase, 'org-1', 'entity-1')
    expect(result).toEqual(mandate)
    expect(supabase.from).toHaveBeenCalledWith('delegation_mandates')
  })

  it('returns null when no active mandate exists', async () => {
    const supabase = mockSupabaseForSelect(null)
    const result = await getEntityMandate(supabase, 'org-1', 'entity-1')
    expect(result).toBeNull()
  })

  it('returns null on query error (fail-open)', async () => {
    const supabase = mockSupabaseForSelect(null, { message: 'connection error' })
    const result = await getEntityMandate(supabase, 'org-1', 'entity-1')
    expect(result).toBeNull()
  })
})

describe('setEntityMandate', () => {
  it('revokes existing mandate and creates a new one', async () => {
    const newMandate = {
      id: 'mandate-2',
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_level: 'supervised',
      activated_at: '2026-04-10T00:00:00Z',
      activated_via: 'api',
      deactivated_at: null,
      deactivated_via: null,
    }
    const supabase = mockSupabaseForSet([], newMandate)
    const result = await setEntityMandate(supabase, 'org-1', 'entity-1', 'supervised', 'api')
    expect(result).toEqual(newMandate)
    // from() called twice: once for revoke, once for insert
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('throws on insert error', async () => {
    const supabase = mockSupabaseForSet([], null, { message: 'insert failed' })
    await expect(
      setEntityMandate(supabase, 'org-1', 'entity-1', 'infinite_autopilot', 'dashboard'),
    ).rejects.toThrow('insert failed')
  })
})

describe('revokeEntityMandate', () => {
  it('returns true when a mandate was revoked', async () => {
    const supabase = mockSupabaseForUpdate([{ id: 'mandate-1' }])
    const result = await revokeEntityMandate(supabase, 'org-1', 'entity-1', 'dashboard')
    expect(result).toBe(true)
  })

  it('returns false when no active mandate to revoke', async () => {
    const supabase = mockSupabaseForUpdate([])
    const result = await revokeEntityMandate(supabase, 'org-1', 'entity-1', 'dashboard')
    expect(result).toBe(false)
  })

  it('returns false on update error', async () => {
    const supabase = mockSupabaseForUpdate(null, { message: 'update failed' })
    const result = await revokeEntityMandate(supabase, 'org-1', 'entity-1', 'admin')
    expect(result).toBe(false)
  })
})

describe('logDelegatedAction', () => {
  it('inserts and returns the action entry', async () => {
    const entry = {
      id: 'action-1',
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: 'mandate-1',
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #42 to client',
      action_payload: { invoice_id: '42' },
      financial_impact: { amount: 1500, currency: 'AUD', direction: 'outbound' },
      evidence_urls: ['https://example.com/invoice/42'],
      fiduciary_evaluation: { risk: 'low', score: 0.92 },
      agent_run_id: 'run-1',
      created_at: '2026-04-10T00:00:00Z',
    }
    const supabase = mockSupabaseForInsert(entry)
    const result = await logDelegatedAction(supabase, {
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: 'mandate-1',
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #42 to client',
      action_payload: { invoice_id: '42' },
      financial_impact: { amount: 1500, currency: 'AUD', direction: 'outbound' },
      evidence_urls: ['https://example.com/invoice/42'],
      fiduciary_evaluation: { risk: 'low', score: 0.92 },
      agent_run_id: 'run-1',
    })
    expect(result).toEqual(entry)
    expect(supabase.from).toHaveBeenCalledWith('delegation_action_log')
  })

  it('throws on insert error', async () => {
    const supabase = mockSupabaseForInsert(null, { message: 'log insert failed' })
    await expect(
      logDelegatedAction(supabase, {
        org_id: 'org-1',
        entity_id: 'entity-1',
        action_type: 'reply',
        action_summary: 'Replied to message',
      }),
    ).rejects.toThrow('log insert failed')
  })

  it('uses defaults for optional fields', async () => {
    const entry = {
      id: 'action-2',
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: null,
      action_type: 'reply',
      action_summary: 'Auto-reply sent',
      action_payload: {},
      financial_impact: null,
      evidence_urls: [],
      fiduciary_evaluation: null,
      agent_run_id: null,
      created_at: '2026-04-10T01:00:00Z',
    }
    const supabase = mockSupabaseForInsert(entry)
    const result = await logDelegatedAction(supabase, {
      org_id: 'org-1',
      entity_id: 'entity-1',
      action_type: 'reply',
      action_summary: 'Auto-reply sent',
    })
    expect(result.mandate_id).toBeNull()
    expect(result.action_payload).toEqual({})
    expect(result.financial_impact).toBeNull()
    expect(result.evidence_urls).toEqual([])
  })
})

describe('getRecentDelegatedActions', () => {
  it('returns actions since the given date', async () => {
    const actions = [
      { id: 'a1', org_id: 'org-1', action_type: 'reply', created_at: '2026-04-10T08:00:00Z' },
      { id: 'a2', org_id: 'org-1', action_type: 'invoice', created_at: '2026-04-10T07:00:00Z' },
    ]
    const supabase = mockSupabaseForList(actions)
    const result = await getRecentDelegatedActions(
      supabase,
      'org-1',
      new Date('2026-04-10T00:00:00Z'),
    )
    expect(result).toEqual(actions)
    expect(result).toHaveLength(2)
  })

  it('returns empty array on query error', async () => {
    const supabase = mockSupabaseForList(null, { message: 'query error' })
    const result = await getRecentDelegatedActions(
      supabase,
      'org-1',
      new Date('2026-04-10T00:00:00Z'),
    )
    expect(result).toEqual([])
  })

  it('returns empty array when no actions exist', async () => {
    const supabase = mockSupabaseForList([])
    const result = await getRecentDelegatedActions(
      supabase,
      'org-1',
      new Date('2026-04-10T00:00:00Z'),
    )
    expect(result).toEqual([])
  })
})

describe('isEntityFullyDelegated', () => {
  it('returns true when entity has infinite_autopilot mandate', async () => {
    const mandate = {
      id: 'mandate-1',
      mandate_level: 'infinite_autopilot',
      deactivated_at: null,
    }
    const supabase = mockSupabaseForSelect(mandate)
    const result = await isEntityFullyDelegated(supabase, 'org-1', 'entity-1')
    expect(result).toBe(true)
  })

  it('returns false when entity has supervised mandate', async () => {
    const mandate = {
      id: 'mandate-2',
      mandate_level: 'supervised',
      deactivated_at: null,
    }
    const supabase = mockSupabaseForSelect(mandate)
    const result = await isEntityFullyDelegated(supabase, 'org-1', 'entity-1')
    expect(result).toBe(false)
  })

  it('returns false when no mandate exists', async () => {
    const supabase = mockSupabaseForSelect(null)
    const result = await isEntityFullyDelegated(supabase, 'org-1', 'entity-1')
    expect(result).toBe(false)
  })
})
