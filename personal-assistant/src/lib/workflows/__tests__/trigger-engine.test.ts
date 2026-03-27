import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkflowEvent, WorkflowRule } from '../workflow-rule-types'
import {
  evaluateEventTriggers,
  evaluateScheduledTriggers,
  evaluateConditions,
  matchesCronPattern,
  getActiveWorkflowRules,
} from '../workflow-rule-engine'

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

function createMockSupabase(rows: Partial<WorkflowRule>[] = []) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  const rpcMock = vi.fn().mockResolvedValue({ error: null })

  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation((_col: string, _val: unknown) => ({
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
        })),
        is: vi.fn().mockResolvedValue({ data: rows, error: null }),
      })),
    }),
    update: updateMock,
  })

  return {
    from: fromMock,
    rpc: rpcMock,
    _updateMock: updateMock,
    _fromMock: fromMock,
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ORG_ID = '7abcbfb1-0000-0000-0000-000000000000'

function makeRule(overrides: Partial<WorkflowRule> = {}): WorkflowRule {
  return {
    id: 'rule-1',
    org_id: ORG_ID,
    name: 'Test Rule',
    description: 'Test',
    trigger: { type: 'event', event: 'new_lead' },
    conditions: [],
    actions: [{
      step_id: 'step1',
      name: 'Do thing',
      tool_group: 'web',
      tool_name: 'web_search',
      parameters: {},
    }],
    enabled: true,
    created_by: 'user-1',
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// evaluateEventTriggers
// ---------------------------------------------------------------------------

describe('evaluateEventTriggers', () => {
  it('matches rules by event type', async () => {
    const rule = makeRule({ trigger: { type: 'event', event: 'new_lead' } })
    // Mock that returns our rule for the matching event query
    const supabase = createMockSupabase([rule])

    const event: WorkflowEvent = {
      event: 'new_lead',
      data: { company: 'Acme' },
    }

    const matched = await evaluateEventTriggers(supabase as any, ORG_ID, event)
    expect(matched).toContain('rule-1')
  })

  it('skips events with triggered_by_workflow=true (loop prevention)', async () => {
    const rule = makeRule()
    const supabase = createMockSupabase([rule])

    const event: WorkflowEvent = {
      event: 'new_lead',
      data: { company: 'Acme' },
      triggered_by_workflow: true,
    }

    const matched = await evaluateEventTriggers(supabase as any, ORG_ID, event)
    expect(matched).toHaveLength(0)
  })

  it('skips disabled rules', async () => {
    const rule = makeRule({ enabled: false })
    const supabase = createMockSupabase([rule])

    const event: WorkflowEvent = {
      event: 'new_lead',
      data: {},
    }

    const matched = await evaluateEventTriggers(supabase as any, ORG_ID, event)
    expect(matched).toHaveLength(0)
  })

  it('evaluates conditions against event data', async () => {
    const rule = makeRule({
      conditions: [{ field: 'estimated_value', operator: 'gt', value: 5000 }],
    })
    const supabase = createMockSupabase([rule])

    // Event that does NOT satisfy the condition
    const event: WorkflowEvent = {
      event: 'new_lead',
      data: { estimated_value: 2000 },
    }

    const matched = await evaluateEventTriggers(supabase as any, ORG_ID, event)
    expect(matched).toHaveLength(0)
  })

  it('matches rules when conditions are satisfied', async () => {
    const rule = makeRule({
      conditions: [{ field: 'estimated_value', operator: 'gt', value: 5000 }],
    })
    const supabase = createMockSupabase([rule])

    const event: WorkflowEvent = {
      event: 'new_lead',
      data: { estimated_value: 10000 },
    }

    const matched = await evaluateEventTriggers(supabase as any, ORG_ID, event)
    expect(matched).toContain('rule-1')
  })

  it('does not match rules with wrong event type', async () => {
    const rule = makeRule({ trigger: { type: 'event', event: 'invoice_overdue' } })
    const supabase = createMockSupabase([rule])

    const event: WorkflowEvent = {
      event: 'new_lead',
      data: {},
    }

    const matched = await evaluateEventTriggers(supabase as any, ORG_ID, event)
    expect(matched).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// evaluateScheduledTriggers
// ---------------------------------------------------------------------------

describe('evaluateScheduledTriggers', () => {
  it('finds rules with interval triggers due for execution', async () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
    const rule = makeRule({
      id: 'sched-1',
      trigger: { type: 'schedule', schedule: { interval_seconds: 1800 } },
      last_triggered_at: oneHourAgo,
    })
    const supabase = createMockSupabase([rule])

    const matched = await evaluateScheduledTriggers(supabase as any, ORG_ID)
    expect(matched).toContain('sched-1')
  })

  it('skips interval rules not yet due', async () => {
    const justNow = new Date().toISOString()
    const rule = makeRule({
      id: 'sched-2',
      trigger: { type: 'schedule', schedule: { interval_seconds: 3600 } },
      last_triggered_at: justNow,
    })
    const supabase = createMockSupabase([rule])

    const matched = await evaluateScheduledTriggers(supabase as any, ORG_ID)
    expect(matched).not.toContain('sched-2')
  })

  it('triggers interval rules with null last_triggered_at (first run)', async () => {
    const rule = makeRule({
      id: 'sched-3',
      trigger: { type: 'schedule', schedule: { interval_seconds: 600 } },
      last_triggered_at: null,
    })
    const supabase = createMockSupabase([rule])

    const matched = await evaluateScheduledTriggers(supabase as any, ORG_ID)
    expect(matched).toContain('sched-3')
  })
})

// ---------------------------------------------------------------------------
// evaluateConditions (pure function)
// ---------------------------------------------------------------------------

describe('evaluateConditions', () => {
  it('returns true for empty conditions', () => {
    expect(evaluateConditions([], {})).toBe(true)
  })

  it('evaluates eq operator', () => {
    const conditions = [{ field: 'status', operator: 'eq' as const, value: 'active' }]
    expect(evaluateConditions(conditions, { status: 'active' })).toBe(true)
    expect(evaluateConditions(conditions, { status: 'inactive' })).toBe(false)
  })

  it('evaluates neq operator', () => {
    const conditions = [{ field: 'status', operator: 'neq' as const, value: 'deleted' }]
    expect(evaluateConditions(conditions, { status: 'active' })).toBe(true)
    expect(evaluateConditions(conditions, { status: 'deleted' })).toBe(false)
  })

  it('evaluates contains operator', () => {
    const conditions = [{ field: 'subject', operator: 'contains' as const, value: 'urgent' }]
    expect(evaluateConditions(conditions, { subject: 'urgent: payment needed' })).toBe(true)
    expect(evaluateConditions(conditions, { subject: 'normal message' })).toBe(false)
  })

  it('evaluates gt and lt operators', () => {
    const gt = [{ field: 'amount', operator: 'gt' as const, value: 100 }]
    expect(evaluateConditions(gt, { amount: 200 })).toBe(true)
    expect(evaluateConditions(gt, { amount: 50 })).toBe(false)

    const lt = [{ field: 'amount', operator: 'lt' as const, value: 100 }]
    expect(evaluateConditions(lt, { amount: 50 })).toBe(true)
    expect(evaluateConditions(lt, { amount: 200 })).toBe(false)
  })

  it('AND-logic: all conditions must pass', () => {
    const conditions = [
      { field: 'status', operator: 'eq' as const, value: 'active' },
      { field: 'amount', operator: 'gt' as const, value: 100 },
    ]
    expect(evaluateConditions(conditions, { status: 'active', amount: 200 })).toBe(true)
    expect(evaluateConditions(conditions, { status: 'active', amount: 50 })).toBe(false)
    expect(evaluateConditions(conditions, { status: 'inactive', amount: 200 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesCronPattern
// ---------------------------------------------------------------------------

describe('matchesCronPattern', () => {
  it('matches HH:MM daily pattern', () => {
    const at8am = new Date('2026-03-28T08:00:00Z')
    expect(matchesCronPattern('08:00', at8am)).toBe(true)
    expect(matchesCronPattern('09:00', at8am)).toBe(false)
  })

  it('matches within minute window', () => {
    const at8_04 = new Date('2026-03-28T08:04:00Z')
    // Within 5-min tolerance window
    expect(matchesCronPattern('08:00', at8_04)).toBe(true)
  })

  it('does not match outside window', () => {
    const at8_10 = new Date('2026-03-28T08:10:00Z')
    expect(matchesCronPattern('08:00', at8_10)).toBe(false)
  })
})
