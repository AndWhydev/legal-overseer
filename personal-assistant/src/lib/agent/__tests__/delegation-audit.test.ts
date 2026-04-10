import { describe, it, expect, vi } from 'vitest'
import {
  logDelegatedAction,
  getEntityDelegationHistory,
  getActionsForMandate,
  getDelegationAuditSummary,
} from '../delegation-mandate'

// ---------------------------------------------------------------------------
// Mock helpers (same pattern as delegation-mandate.test.ts)
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

  for (const key of Object.keys(fns)) {
    if (!overrides[key]) {
      fns[key as keyof typeof fns] = vi.fn().mockReturnValue(fns)
    }
  }
  return fns
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

function mockSupabaseForList(
  data: Record<string, unknown>[] | null,
  error: { message: string } | null = null,
) {
  const chain = createMockChain({
    order: vi.fn().mockResolvedValue({ data, error }),
  })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any
}

// ---------------------------------------------------------------------------
// Task 2: Delegation Audit Trail Unit Tests
// ---------------------------------------------------------------------------

describe('logDelegatedAction — evidence and fiduciary fields', () => {
  it('stores evidence_urls in the action entry', async () => {
    const urls = [
      'https://example.com/invoice/42',
      'https://example.com/receipt/99',
    ]
    const entry = {
      id: 'action-ev-1',
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: 'mandate-1',
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #42',
      action_payload: {},
      financial_impact: null,
      evidence_urls: urls,
      fiduciary_evaluation: null,
      agent_run_id: null,
      created_at: '2026-04-10T00:00:00Z',
    }
    const supabase = mockSupabaseForInsert(entry)
    const result = await logDelegatedAction(supabase, {
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: 'mandate-1',
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #42',
      evidence_urls: urls,
    })
    expect(result.evidence_urls).toEqual(urls)
    expect(result.evidence_urls).toHaveLength(2)
  })

  it('stores fiduciary_evaluation in the action entry', async () => {
    const fiduciary = {
      risk: 'medium',
      score: 0.78,
      rationale: 'Recurring vendor, within budget',
    }
    const entry = {
      id: 'action-fid-1',
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: 'mandate-1',
      action_type: 'approve_payment',
      action_summary: 'Approved payment of $500',
      action_payload: { amount: 500 },
      financial_impact: { amount: 500, currency: 'USD', direction: 'outbound' },
      evidence_urls: [],
      fiduciary_evaluation: fiduciary,
      agent_run_id: 'run-42',
      created_at: '2026-04-10T01:00:00Z',
    }
    const supabase = mockSupabaseForInsert(entry)
    const result = await logDelegatedAction(supabase, {
      org_id: 'org-1',
      entity_id: 'entity-1',
      mandate_id: 'mandate-1',
      action_type: 'approve_payment',
      action_summary: 'Approved payment of $500',
      action_payload: { amount: 500 },
      financial_impact: { amount: 500, currency: 'USD', direction: 'outbound' },
      fiduciary_evaluation: fiduciary,
      agent_run_id: 'run-42',
    })
    expect(result.fiduciary_evaluation).toEqual(fiduciary)
    expect((result.fiduciary_evaluation as any).risk).toBe('medium')
  })
})

describe('getEntityDelegationHistory', () => {
  it('returns mandates ordered by activated_at descending', async () => {
    const mandates = [
      {
        id: 'mandate-3',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_level: 'infinite_autopilot',
        activated_at: '2026-04-10T00:00:00Z',
        activated_via: 'dashboard',
        deactivated_at: null,
        deactivated_via: null,
      },
      {
        id: 'mandate-2',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_level: 'supervised',
        activated_at: '2026-04-05T00:00:00Z',
        activated_via: 'api',
        deactivated_at: '2026-04-09T00:00:00Z',
        deactivated_via: 'dashboard',
      },
      {
        id: 'mandate-1',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_level: 'standard',
        activated_at: '2026-04-01T00:00:00Z',
        activated_via: 'onboarding',
        deactivated_at: '2026-04-04T00:00:00Z',
        deactivated_via: 'api',
      },
    ]
    const supabase = mockSupabaseForList(mandates)
    const result = await getEntityDelegationHistory(supabase, 'org-1', 'entity-1')

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('mandate-3')
    expect(result[2].id).toBe('mandate-1')
    expect(supabase.from).toHaveBeenCalledWith('delegation_mandates')
  })

  it('returns empty array when no mandates exist', async () => {
    const supabase = mockSupabaseForList([])
    const result = await getEntityDelegationHistory(supabase, 'org-1', 'entity-new')
    expect(result).toEqual([])
  })

  it('returns empty array on query error (fail-open)', async () => {
    const supabase = mockSupabaseForList(null, { message: 'connection timeout' })
    const result = await getEntityDelegationHistory(supabase, 'org-1', 'entity-1')
    expect(result).toEqual([])
  })
})

describe('getActionsForMandate', () => {
  it('returns all actions for a specific mandate', async () => {
    const actions = [
      {
        id: 'action-1',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-5',
        action_type: 'send_invoice',
        action_summary: 'Sent invoice #42',
        action_payload: {},
        financial_impact: { amount: 1500, currency: 'AUD', direction: 'outbound' },
        evidence_urls: ['https://example.com/invoice/42'],
        fiduciary_evaluation: null,
        agent_run_id: 'run-1',
        created_at: '2026-04-10T08:00:00Z',
      },
      {
        id: 'action-2',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-5',
        action_type: 'reply',
        action_summary: 'Replied to client query',
        action_payload: {},
        financial_impact: null,
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: 'run-2',
        created_at: '2026-04-10T07:00:00Z',
      },
    ]
    const supabase = mockSupabaseForList(actions)
    const result = await getActionsForMandate(supabase, 'mandate-5')

    expect(result).toHaveLength(2)
    expect(result[0].mandate_id).toBe('mandate-5')
    expect(result[1].mandate_id).toBe('mandate-5')
    expect(supabase.from).toHaveBeenCalledWith('delegation_action_log')
  })

  it('returns empty array when mandate has no actions', async () => {
    const supabase = mockSupabaseForList([])
    const result = await getActionsForMandate(supabase, 'mandate-empty')
    expect(result).toEqual([])
  })

  it('returns empty array on query error (fail-open)', async () => {
    const supabase = mockSupabaseForList(null, { message: 'db error' })
    const result = await getActionsForMandate(supabase, 'mandate-5')
    expect(result).toEqual([])
  })
})

describe('getDelegationAuditSummary', () => {
  it('calculates correct totals with financial impact aggregation', async () => {
    const mandates = [
      {
        id: 'mandate-active',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_level: 'infinite_autopilot',
        activated_at: '2026-04-08T00:00:00Z',
        activated_via: 'dashboard',
        deactivated_at: null,
        deactivated_via: null,
      },
      {
        id: 'mandate-old',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_level: 'supervised',
        activated_at: '2026-04-01T00:00:00Z',
        activated_via: 'api',
        deactivated_at: '2026-04-07T00:00:00Z',
        deactivated_via: 'dashboard',
      },
    ]
    const actions = [
      {
        id: 'a1',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-active',
        action_type: 'send_invoice',
        action_summary: 'Invoice #1',
        action_payload: {},
        financial_impact: { amount: 1500, currency: 'AUD', direction: 'outbound' },
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: null,
        created_at: '2026-04-10T08:00:00Z',
      },
      {
        id: 'a2',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-active',
        action_type: 'approve_payment',
        action_summary: 'Payment $800',
        action_payload: {},
        financial_impact: { amount: 800, currency: 'AUD', direction: 'outbound' },
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: null,
        created_at: '2026-04-10T06:00:00Z',
      },
      {
        id: 'a3',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-old',
        action_type: 'reply',
        action_summary: 'Auto-reply',
        action_payload: {},
        financial_impact: null,
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: null,
        created_at: '2026-04-05T10:00:00Z',
      },
    ]

    // Build a mock that handles multiple from() calls:
    // 1. getEntityMandate: delegation_mandates (select, eq, eq, is, maybeSingle)
    // 2. getEntityDelegationHistory: delegation_mandates (select, eq, eq, order)
    // 3. actions query: delegation_action_log (select, eq, eq, order)
    const mandateSelectChain = createMockChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: mandates[0], error: null }),
    })
    const mandateHistoryChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: mandates, error: null }),
    })
    const actionsChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: actions, error: null }),
    })

    const fromFn = vi.fn()
      .mockReturnValueOnce(mandateSelectChain)   // getEntityMandate
      .mockReturnValueOnce(mandateHistoryChain)   // getEntityDelegationHistory
      .mockReturnValueOnce(actionsChain)          // actions query
    const supabase = { from: fromFn } as any

    const summary = await getDelegationAuditSummary(supabase, 'org-1', 'entity-1')

    expect(summary.currentMandate).not.toBeNull()
    expect(summary.currentMandate!.id).toBe('mandate-active')
    expect(summary.totalMandates).toBe(2)
    expect(summary.totalActions).toBe(3)
    expect(summary.totalFinancialImpact).toBe(2300) // 1500 + 800
    expect(summary.lastActionAt).toBe('2026-04-10T08:00:00Z')
  })

  it('returns zero totals when no history exists', async () => {
    const mandateSelectChain = createMockChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const mandateHistoryChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const actionsChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const fromFn = vi.fn()
      .mockReturnValueOnce(mandateSelectChain)
      .mockReturnValueOnce(mandateHistoryChain)
      .mockReturnValueOnce(actionsChain)
    const supabase = { from: fromFn } as any

    const summary = await getDelegationAuditSummary(supabase, 'org-1', 'entity-new')

    expect(summary.currentMandate).toBeNull()
    expect(summary.totalMandates).toBe(0)
    expect(summary.totalActions).toBe(0)
    expect(summary.totalFinancialImpact).toBe(0)
    expect(summary.lastActionAt).toBeNull()
  })

  it('skips non-numeric financial_impact.amount values', async () => {
    const actions = [
      {
        id: 'a1',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-1',
        action_type: 'reply',
        action_summary: 'Replied',
        action_payload: {},
        financial_impact: { amount: 'not-a-number', currency: 'AUD' },
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: null,
        created_at: '2026-04-10T08:00:00Z',
      },
      {
        id: 'a2',
        org_id: 'org-1',
        entity_id: 'entity-1',
        mandate_id: 'mandate-1',
        action_type: 'invoice',
        action_summary: 'Invoice',
        action_payload: {},
        financial_impact: { amount: 250, currency: 'AUD' },
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: null,
        created_at: '2026-04-10T06:00:00Z',
      },
    ]

    const mandateSelectChain = createMockChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const mandateHistoryChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const actionsChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: actions, error: null }),
    })

    const fromFn = vi.fn()
      .mockReturnValueOnce(mandateSelectChain)
      .mockReturnValueOnce(mandateHistoryChain)
      .mockReturnValueOnce(actionsChain)
    const supabase = { from: fromFn } as any

    const summary = await getDelegationAuditSummary(supabase, 'org-1', 'entity-1')
    expect(summary.totalFinancialImpact).toBe(250)
  })

  it('handles actions query error gracefully', async () => {
    const mandateSelectChain = createMockChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const mandateHistoryChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const actionsChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'db timeout' } }),
    })

    const fromFn = vi.fn()
      .mockReturnValueOnce(mandateSelectChain)
      .mockReturnValueOnce(mandateHistoryChain)
      .mockReturnValueOnce(actionsChain)
    const supabase = { from: fromFn } as any

    const summary = await getDelegationAuditSummary(supabase, 'org-1', 'entity-1')
    expect(summary.totalActions).toBe(0)
    expect(summary.totalFinancialImpact).toBe(0)
    expect(summary.lastActionAt).toBeNull()
  })
})
