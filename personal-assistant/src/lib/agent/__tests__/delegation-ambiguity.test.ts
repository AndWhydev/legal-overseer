/**
 * Phase 43 hardening: entity resolution ambiguity detection.
 *
 * Prevents the silent-wrong-entity bug: if a user says "stop managing John"
 * and there are two Johns, the fuzzy matcher would previously pick the first
 * and revoke the wrong mandate with no user confirmation.
 *
 * New helper: `resolveEntityCandidates` — returns up to N matches so the
 * caller (TAOR loop step 1c) can yield a clarification message instead.
 * `generateAmbiguityClarification` produces the user-facing prompt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  resolveEntityCandidates,
  generateAmbiguityClarification,
} from '../delegation-intent'

function mockSupabase(rowsByShape: Record<string, Array<{ id: string; name: string }>>): any {
  // We can't reliably key by query-shape, so instead we track which ilike
  // pattern was used and return rows based on call order. Tests set
  // up the rows for each of the 3 lookups (exact / alias / prefix).
  const callOrder: Array<'exact' | 'alias' | 'prefix'> = ['exact', 'alias', 'prefix']
  let callIdx = 0

  return {
    from: vi.fn().mockImplementation(() => {
      const chain: any = {}
      for (const m of ['select', 'eq', 'ilike', 'contains']) {
        chain[m] = vi.fn().mockReturnValue(chain)
      }
      chain.limit = vi.fn().mockImplementation((_n: number) => {
        const shape = callOrder[callIdx]
        callIdx += 1
        const rows = rowsByShape[shape] ?? []
        return Promise.resolve({ data: rows, error: null })
      })
      return chain
    }),
  }
}

describe('resolveEntityCandidates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the exact-match row when unique', async () => {
    const supabase = mockSupabase({
      exact: [{ id: 'e1', name: 'Acme Corp' }],
      alias: [],
      prefix: [],
    })
    const result = await resolveEntityCandidates(supabase, 'org-1', 'Acme Corp')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 'e1', name: 'Acme Corp' })
  })

  it('returns multiple candidates when prefix match is ambiguous', async () => {
    const supabase = mockSupabase({
      exact: [],
      alias: [],
      prefix: [
        { id: 'e1', name: 'John Smith' },
        { id: 'e2', name: 'John Doe' },
      ],
    })
    const result = await resolveEntityCandidates(supabase, 'org-1', 'John')
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.name).sort()).toEqual(['John Doe', 'John Smith'])
  })

  it('returns empty array when no match at any tier', async () => {
    const supabase = mockSupabase({ exact: [], alias: [], prefix: [] })
    const result = await resolveEntityCandidates(supabase, 'org-1', 'Unknown Entity')
    expect(result).toEqual([])
  })

  it('prefers exact match over prefix match (short-circuits tiers)', async () => {
    const supabase = mockSupabase({
      exact: [{ id: 'e-exact', name: 'Acme' }],
      // If we short-circuited correctly, alias+prefix queries are never issued.
      // If we DIDN'T, they'd also return rows and we'd get >1 candidate.
      alias: [{ id: 'e-alias', name: 'Alias Match' }],
      prefix: [{ id: 'e-prefix', name: 'Prefix Match' }],
    })
    const result = await resolveEntityCandidates(supabase, 'org-1', 'Acme')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e-exact')
  })

  it('applies a cap to prevent huge result sets', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      name: `John ${i}`,
    }))
    const supabase = mockSupabase({ exact: [], alias: [], prefix: many })
    const result = await resolveEntityCandidates(supabase, 'org-1', 'John', 5)
    expect(result).toHaveLength(5)
  })
})

describe('generateAmbiguityClarification', () => {
  it('lists the candidate names in a user-friendly message', () => {
    const msg = generateAmbiguityClarification('John', [
      { id: 'e1', name: 'John Smith' },
      { id: 'e2', name: 'John Doe' },
    ])
    expect(msg).toContain('John')
    expect(msg).toContain('John Smith')
    expect(msg).toContain('John Doe')
    expect(msg).toMatch(/which|clarify|mean/i)
  })

  it('truncates long candidate lists (keeps first 5, summarises rest)', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      name: `Candidate ${i}`,
    }))
    const msg = generateAmbiguityClarification('Candidate', candidates)
    expect(msg).toContain('Candidate 0')
    expect(msg).toContain('Candidate 4')
    // 3 more not listed individually
    expect(msg).toMatch(/3 more/i)
  })
})
