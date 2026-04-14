import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DelegationActionEntry } from '../agent/delegation-mandate'
import { fetchDelegatedActionItems } from './morning-briefing'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAction(overrides: Partial<DelegationActionEntry> = {}): DelegationActionEntry {
  return {
    id: 'action-1',
    org_id: 'org-1',
    entity_id: 'entity-1',
    mandate_id: 'mandate-1',
    action_type: 'send_email',
    action_summary: 'Sent follow-up email to client',
    action_payload: {},
    financial_impact: null,
    evidence_urls: [],
    fiduciary_evaluation: null,
    agent_run_id: 'run-1',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// Mock getRecentDelegatedActions
const mockGetRecentDelegatedActions = vi.fn<
  () => Promise<DelegationActionEntry[]>
>()

vi.mock('../agent/delegation-mandate', () => ({
  getRecentDelegatedActions: (...args: unknown[]) =>
    mockGetRecentDelegatedActions(...(args as Parameters<typeof mockGetRecentDelegatedActions>)),
}))

function makeSupabase(entityName: string | null = 'Acme Corp') {
  const single = vi.fn().mockResolvedValue({
    data: entityName ? { name: entityName } : null,
    error: null,
  })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })

  return { from } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchDelegatedActionItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no delegated actions exist', async () => {
    mockGetRecentDelegatedActions.mockResolvedValue([])
    const supabase = makeSupabase()

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    expect(items).toEqual([])
  })

  it('formats a single action with entity name', async () => {
    mockGetRecentDelegatedActions.mockResolvedValue([
      makeAction({
        entity_id: 'e-1',
        action_summary: 'Sent follow-up email to client',
      }),
    ])
    const supabase = makeSupabase('Acme Corp')

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    expect(items).toHaveLength(1)
    expect(items[0]).toBe('Acme Corp: Sent follow-up email to client')
  })

  it('includes financial impact for single action', async () => {
    mockGetRecentDelegatedActions.mockResolvedValue([
      makeAction({
        entity_id: 'e-1',
        action_summary: 'Sent invoice',
        financial_impact: { amount: 5000 },
      }),
    ])
    const supabase = makeSupabase('ClientX')

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    expect(items).toHaveLength(1)
    expect(items[0]).toContain('ClientX: Sent invoice')
    expect(items[0]).toContain('$5,000')
  })

  it('groups multiple actions for the same entity with sub-items', async () => {
    const entityId = 'e-shared'
    mockGetRecentDelegatedActions.mockResolvedValue([
      makeAction({ entity_id: entityId, action_summary: 'Action one' }),
      makeAction({ id: 'a2', entity_id: entityId, action_summary: 'Action two' }),
    ])
    const supabase = makeSupabase('SameEntity')

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    // Header + 2 sub-items
    expect(items).toHaveLength(3)
    expect(items[0]).toContain('SameEntity: 2 actions')
    expect(items[1]).toContain('Action one')
    expect(items[2]).toContain('Action two')
  })

  it('truncates sub-items at 3 and shows overflow count', async () => {
    const entityId = 'e-busy'
    mockGetRecentDelegatedActions.mockResolvedValue([
      makeAction({ id: 'a1', entity_id: entityId, action_summary: 'A1' }),
      makeAction({ id: 'a2', entity_id: entityId, action_summary: 'A2' }),
      makeAction({ id: 'a3', entity_id: entityId, action_summary: 'A3' }),
      makeAction({ id: 'a4', entity_id: entityId, action_summary: 'A4' }),
      makeAction({ id: 'a5', entity_id: entityId, action_summary: 'A5' }),
    ])
    const supabase = makeSupabase('BusyCo')

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    // Header + 3 sub-items + 1 overflow line
    expect(items).toHaveLength(5)
    expect(items[0]).toContain('BusyCo: 5 actions')
    expect(items[1]).toContain('A1')
    expect(items[2]).toContain('A2')
    expect(items[3]).toContain('A3')
    expect(items[4]).toContain('...and 2 more')
  })

  it('falls back to entity_id when entity name cannot be resolved', async () => {
    mockGetRecentDelegatedActions.mockResolvedValue([
      makeAction({ entity_id: 'unknown-id', action_summary: 'Did something' }),
    ])
    const supabase = makeSupabase(null)

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    expect(items).toHaveLength(1)
    expect(items[0]).toContain('unknown-id: Did something')
  })

  it('aggregates financial impact across multiple actions for same entity', async () => {
    const entityId = 'e-money'
    mockGetRecentDelegatedActions.mockResolvedValue([
      makeAction({
        id: 'a1',
        entity_id: entityId,
        action_summary: 'Sent invoice A',
        financial_impact: { amount: 1000 },
      }),
      makeAction({
        id: 'a2',
        entity_id: entityId,
        action_summary: 'Sent invoice B',
        financial_impact: { amount: 2500 },
      }),
    ])
    const supabase = makeSupabase('MoneyCo')

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    expect(items[0]).toContain('$3,500 total')
  })

  it('returns empty array when getRecentDelegatedActions throws', async () => {
    mockGetRecentDelegatedActions.mockRejectedValue(new Error('DB down'))
    const supabase = makeSupabase()

    const items = await fetchDelegatedActionItems(supabase, 'org-1')

    expect(items).toEqual([])
  })
})
