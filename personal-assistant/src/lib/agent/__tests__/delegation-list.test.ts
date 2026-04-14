/**
 * Tests for `listActiveMandatesForOrg` — the helper backing the new
 * /api/delegation endpoint. Returns all active (non-deactivated) mandates
 * for the caller's org, joined with the entity name for display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { listActiveMandatesForOrg } from '../delegation-mandate'

function mockSupabaseList(rows: any[], error: { message: string } | null = null): any {
  const chain: any = {}
  for (const m of ['select', 'eq', 'is']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.order = vi.fn().mockResolvedValue({ data: rows, error })
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('listActiveMandatesForOrg', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns active mandates with entity names', async () => {
    const rows = [
      {
        id: 'm-1',
        org_id: 'org-1',
        entity_id: 'e-1',
        mandate_level: 'infinite_autopilot',
        activated_at: '2026-04-14T00:00:00Z',
        activated_via: 'whatsapp',
        deactivated_at: null,
        deactivated_via: null,
        entity_nodes: { name: 'Acme Corp' },
      },
      {
        id: 'm-2',
        org_id: 'org-1',
        entity_id: 'e-2',
        mandate_level: 'supervised',
        activated_at: '2026-04-13T00:00:00Z',
        activated_via: 'dashboard',
        deactivated_at: null,
        deactivated_via: null,
        entity_nodes: { name: 'Beta Ltd' },
      },
    ]
    const supabase = mockSupabaseList(rows)
    const result = await listActiveMandatesForOrg(supabase, 'org-1')

    expect(result).toHaveLength(2)
    expect(result[0].entityName).toBe('Acme Corp')
    expect(result[0].mandateLevel).toBe('infinite_autopilot')
    expect(result[1].entityName).toBe('Beta Ltd')
    expect(result[1].mandateLevel).toBe('supervised')
  })

  it('returns empty array when no active mandates exist', async () => {
    const supabase = mockSupabaseList([])
    const result = await listActiveMandatesForOrg(supabase, 'org-1')
    expect(result).toEqual([])
  })

  it('handles missing entity_nodes join gracefully', async () => {
    const rows = [
      {
        id: 'm-1',
        org_id: 'org-1',
        entity_id: 'orphan',
        mandate_level: 'infinite_autopilot',
        activated_at: '2026-04-14T00:00:00Z',
        activated_via: 'whatsapp',
        deactivated_at: null,
        deactivated_via: null,
        entity_nodes: null,
      },
    ]
    const supabase = mockSupabaseList(rows)
    const result = await listActiveMandatesForOrg(supabase, 'org-1')
    expect(result).toHaveLength(1)
    expect(result[0].entityName).toBe('Unknown entity')
  })

  it('handles array-shape entity_nodes join', async () => {
    const rows = [
      {
        id: 'm-1',
        org_id: 'org-1',
        entity_id: 'e-1',
        mandate_level: 'infinite_autopilot',
        activated_at: '2026-04-14T00:00:00Z',
        activated_via: 'whatsapp',
        deactivated_at: null,
        deactivated_via: null,
        entity_nodes: [{ name: 'Acme' }],
      },
    ]
    const supabase = mockSupabaseList(rows)
    const result = await listActiveMandatesForOrg(supabase, 'org-1')
    expect(result[0].entityName).toBe('Acme')
  })

  it('fails open on query error', async () => {
    const supabase = mockSupabaseList([], { message: 'connection reset' })
    const result = await listActiveMandatesForOrg(supabase, 'org-1')
    expect(result).toEqual([])
  })
})
