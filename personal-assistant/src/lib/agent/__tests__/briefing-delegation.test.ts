/**
 * Phase 43-03: Morning briefing delegation-aware aggregation tests.
 *
 * Covers:
 *   - aggregateDelegatedActionsByEntity() rollup grouping, financial totals,
 *     top-3 action capture, mandate join, sort order, and fail-open on error.
 *   - generateMondayBriefing() integrates the delegation section, updates the
 *     summary fields, and still renders when no delegated actions exist.
 *   - formatBriefingWhatsApp() surfaces the "Autonomous Actions Overnight"
 *     section when items are present.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  aggregateDelegatedActionsByEntity,
  type DelegatedActionAggregate,
} from '../delegation-mandate'
import { generateMondayBriefing, formatBriefingWhatsApp } from '../briefing-generator'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type TerminalResult<T> = { data: T; error: { message: string } | null }

/**
 * Build a chainable Supabase mock where every chain method returns `chain`
 * and the specified terminal methods resolve to the provided results.
 *
 * `terminalByTable` maps a table name to the terminal method name and its
 * resolved value. Non-terminal chain calls just return the chain.
 */
function buildSupabaseMock(
  handlers: Record<
    string,
    (chain: Record<string, ReturnType<typeof vi.fn>>) => Record<string, ReturnType<typeof vi.fn>>
  >,
) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      for (const method of ['select', 'insert', 'update', 'eq', 'is', 'gte', 'lte', 'lt', 'in', 'not', 'or', 'order', 'limit', 'contains', 'ilike']) {
        chain[method] = vi.fn().mockReturnValue(chain)
      }
      // Default terminal: return empty list
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      chain.single = vi.fn().mockResolvedValue({ data: null, error: null })

      const handler = handlers[table]
      return handler ? handler(chain) : chain
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// ---------------------------------------------------------------------------
// aggregateDelegatedActionsByEntity
// ---------------------------------------------------------------------------

describe('aggregateDelegatedActionsByEntity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('groups actions by entity and computes totals + top 3', async () => {
    const since = new Date('2026-04-13T00:00:00Z')
    const rows = [
      {
        entity_id: 'e1',
        action_type: 'send_email',
        action_summary: 'Sent invoice #1001 reminder to Acme',
        financial_impact: { amount: 1500, currency: 'AUD' },
        created_at: '2026-04-14T09:00:00Z',
        entity_nodes: { name: 'Acme Corp' },
      },
      {
        entity_id: 'e1',
        action_type: 'create_task',
        action_summary: 'Follow up on unpaid invoice',
        financial_impact: null,
        created_at: '2026-04-14T08:30:00Z',
        entity_nodes: { name: 'Acme Corp' },
      },
      {
        entity_id: 'e1',
        action_type: 'schedule_event',
        action_summary: 'Scheduled payment call',
        financial_impact: { amount: 0 },
        created_at: '2026-04-14T08:00:00Z',
        entity_nodes: { name: 'Acme Corp' },
      },
      {
        entity_id: 'e1',
        action_type: 'draft_reply',
        action_summary: 'Drafted escalation reply (should NOT appear in topActions)',
        financial_impact: null,
        created_at: '2026-04-14T07:00:00Z',
        entity_nodes: { name: 'Acme Corp' },
      },
      {
        entity_id: 'e2',
        action_type: 'send_whatsapp',
        action_summary: 'Confirmed booking with Beta Ltd',
        financial_impact: { amount: 250, currency: 'AUD' },
        created_at: '2026-04-14T06:00:00Z',
        entity_nodes: [{ name: 'Beta Ltd' }], // array shape (PostgREST 1:1 join)
      },
    ]

    const supabase = buildSupabaseMock({
      delegation_action_log: (chain) => {
        chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
        return chain
      },
      delegation_mandates: (chain) => {
        chain.maybeSingle = vi.fn().mockImplementation(async () => {
          // Return an active mandate for e1, none for e2.
          // The mock chain is shared across entities, so rely on side-effect
          // counters via `eq` call args — instead, return a generic mandate
          // and assert the aggregate derives the right shape. We approximate
          // by returning the first-called mandate.
          return {
            data: {
              id: 'm1',
              org_id: 'org-1',
              entity_id: 'e1',
              mandate_level: 'infinite_autopilot',
              activated_at: '2026-04-10T00:00:00Z',
              activated_via: 'whatsapp',
              deactivated_at: null,
              deactivated_via: null,
            },
            error: null,
          }
        })
        return chain
      },
    })

    const result = await aggregateDelegatedActionsByEntity(supabase, 'org-1', since)

    expect(result).toHaveLength(2)

    // Acme (e1) should come first: 4 actions > 1 action for Beta
    expect(result[0].entityId).toBe('e1')
    expect(result[0].entityName).toBe('Acme Corp')
    expect(result[0].actionCount).toBe(4)
    expect(result[0].totalFinancialImpact).toBe(1500) // only the first row has a non-zero amount
    expect(result[0].topActions).toHaveLength(3) // capped at 3
    expect(result[0].topActions[0].summary).toContain('invoice #1001')
    expect(result[0].topActions[2].summary).not.toContain('escalation reply')

    // Beta (e2)
    expect(result[1].entityId).toBe('e2')
    expect(result[1].entityName).toBe('Beta Ltd')
    expect(result[1].actionCount).toBe(1)
    expect(result[1].totalFinancialImpact).toBe(250)
  })

  it('returns empty array when there are no actions in the window', async () => {
    const supabase = buildSupabaseMock({
      delegation_action_log: (chain) => {
        chain.order = vi.fn().mockResolvedValue({ data: [], error: null })
        return chain
      },
    })
    const result = await aggregateDelegatedActionsByEntity(
      supabase,
      'org-1',
      new Date('2026-04-13T00:00:00Z'),
    )
    expect(result).toEqual([])
  })

  it('fails open on query error', async () => {
    const supabase = buildSupabaseMock({
      delegation_action_log: (chain) => {
        chain.order = vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'connection reset' },
        })
        return chain
      },
    })
    const result = await aggregateDelegatedActionsByEntity(
      supabase,
      'org-1',
      new Date('2026-04-13T00:00:00Z'),
    )
    expect(result).toEqual([])
  })

  it('skips non-numeric financial_impact amounts', async () => {
    const rows = [
      {
        entity_id: 'e1',
        action_type: 'send_email',
        action_summary: 'A',
        financial_impact: { amount: 'not a number' },
        created_at: '2026-04-14T09:00:00Z',
        entity_nodes: { name: 'Acme' },
      },
      {
        entity_id: 'e1',
        action_type: 'send_email',
        action_summary: 'B',
        financial_impact: { amount: 100 },
        created_at: '2026-04-14T08:00:00Z',
        entity_nodes: { name: 'Acme' },
      },
    ]
    const supabase = buildSupabaseMock({
      delegation_action_log: (chain) => {
        chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
        return chain
      },
    })
    const [acme] = await aggregateDelegatedActionsByEntity(
      supabase,
      'org-1',
      new Date('2026-04-13T00:00:00Z'),
    )
    expect(acme.totalFinancialImpact).toBe(100)
  })

  it('handles missing entity_nodes join gracefully', async () => {
    const rows = [
      {
        entity_id: 'ghost',
        action_type: 'send_email',
        action_summary: 'Orphaned action',
        financial_impact: null,
        created_at: '2026-04-14T09:00:00Z',
        entity_nodes: null,
      },
    ]
    const supabase = buildSupabaseMock({
      delegation_action_log: (chain) => {
        chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
        return chain
      },
    })
    const [result] = await aggregateDelegatedActionsByEntity(
      supabase,
      'org-1',
      new Date('2026-04-13T00:00:00Z'),
    )
    expect(result.entityName).toBe('Unknown entity')
  })
})

// ---------------------------------------------------------------------------
// generateMondayBriefing — delegation section integration
// ---------------------------------------------------------------------------

describe('generateMondayBriefing — delegated actions integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function emptyBriefingMock(overrides: Record<string, Record<string, unknown>> = {}) {
    // Every non-terminal chain call returns self; order/limit/maybeSingle return empty.
    return buildSupabaseMock({
      tasks: (c) => { c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c },
      invoices: (c) => { c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c },
      leads: (c) => { c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c },
      approval_queue: (c) => { c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c },
      contacts: (c) => { c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c },
      proposals: (c) => { c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c },
      delegation_action_log: (c) => {
        c.order = vi.fn().mockResolvedValue({
          data: overrides.delegation_action_log?.data ?? [],
          error: null,
        })
        return c
      },
      delegation_mandates: (c) => {
        c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
        return c
      },
    })
  }

  it('adds delegated_actions section at top when actions exist', async () => {
    const rows = [
      {
        entity_id: 'e1',
        action_type: 'send_email',
        action_summary: 'Paid supplier invoice',
        financial_impact: { amount: 800 },
        created_at: '2026-04-14T09:00:00Z',
        entity_nodes: { name: 'Supplier X' },
      },
    ]
    const supabase = emptyBriefingMock({
      delegation_action_log: { data: rows },
    })
    const briefing = await generateMondayBriefing(supabase, 'org-1')

    expect(briefing.sections[0].key).toBe('delegated_actions')
    expect(briefing.sections[0].items).toHaveLength(1)
    expect(briefing.sections[0].items[0].label).toBe('Supplier X')
    expect(briefing.summary.autonomousActions).toBe(1)
    expect(briefing.summary.autonomousImpact).toBe(800)
  })

  it('renders an empty delegated_actions section when none exist (does not inflate totalActionItems)', async () => {
    const supabase = emptyBriefingMock()
    const briefing = await generateMondayBriefing(supabase, 'org-1')

    const section = briefing.sections.find((s) => s.key === 'delegated_actions')
    expect(section).toBeDefined()
    expect(section!.items).toHaveLength(0)
    expect(briefing.summary.autonomousActions).toBe(0)
    expect(briefing.summary.totalActionItems).toBe(0) // delegated actions are status, not action items
  })

  it('WhatsApp formatter includes the autonomous-actions block when items present', async () => {
    const rows = [
      {
        entity_id: 'e1',
        action_type: 'send_email',
        action_summary: 'Sent overdue invoice reminder',
        financial_impact: { amount: 1500 },
        created_at: '2026-04-14T09:00:00Z',
        entity_nodes: { name: 'Acme Corp' },
      },
    ]
    const supabase = emptyBriefingMock({
      delegation_action_log: { data: rows },
    })
    const briefing = await generateMondayBriefing(supabase, 'org-1')
    const text = formatBriefingWhatsApp(briefing)

    expect(text).toContain('Autonomous Actions Overnight')
    expect(text).toContain('Acme Corp')
    expect(text).toContain('$1,500')
  })

  it('WhatsApp formatter omits the autonomous-actions block when no items', async () => {
    const supabase = emptyBriefingMock()
    const briefing = await generateMondayBriefing(supabase, 'org-1')
    const text = formatBriefingWhatsApp(briefing)
    expect(text).not.toContain('Autonomous Actions Overnight')
  })
})

// ---------------------------------------------------------------------------
// Exported type sanity
// ---------------------------------------------------------------------------

describe('DelegatedActionAggregate shape', () => {
  it('accepts a well-formed aggregate without type errors', () => {
    const agg: DelegatedActionAggregate = {
      entityId: 'e1',
      entityName: 'Acme',
      mandateLevel: 'infinite_autopilot',
      actionCount: 3,
      totalFinancialImpact: 1500,
      topActions: [
        { summary: 's', actionType: 'send_email', createdAt: 'now', amount: 1500 },
      ],
    }
    expect(agg.entityName).toBe('Acme')
  })
})
