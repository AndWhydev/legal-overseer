/**
 * Assess gate tests.
 *
 * Covers staleness classification, corroboration scoring, verdict selection,
 * and the hedge-note builder.
 */

import { describe, it, expect } from 'vitest'

import {
  assess,
  scoredItemsToSurfaced,
  STALE_AGE_DAYS,
  STALE_CONFIDENCE_FLOOR,
  HEDGE_COVERAGE_THRESHOLD,
  REFRESH_STALE_FRACTION,
  type SurfacedMemoryLike,
  type AssessResult,
} from '../assess'
import type { ScoredItem } from '@/lib/memory-palace/proactive-recall'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mem(overrides: Partial<SurfacedMemoryLike> = {}): SurfacedMemoryLike {
  return {
    description: 'works_with --> Maya Mendoza',
    confidence: 0.8,
    ageDays: 3,
    type: 'edge',
    blendedScore: 0.7,
    ...overrides,
  }
}

function baseInput(memories: SurfacedMemoryLike[] = []): Parameters<typeof assess>[0] {
  return {
    surfacedMemories: memories,
    userMessage: 'What is going on with Maya?',
    entityIds: ['ent-maya'],
  }
}

// ---------------------------------------------------------------------------
// Verdict: ok
// ---------------------------------------------------------------------------

describe('assess — verdict: ok', () => {
  it('returns ok with empty memory set', () => {
    const result = assess(baseInput([]))
    expect(result.verdict).toBe('ok')
    expect(result.staleMemoryIds).toEqual([])
    expect(result.corroborationScore).toBe(1)
    expect(result.staleFraction).toBeNull()
    expect(result.recommendedHedge).toBe('')
  })

  it('returns ok when a single fresh memory is surfaced', () => {
    const result = assess(baseInput([mem({ ageDays: 1, confidence: 0.9 })]))
    expect(result.verdict).toBe('ok')
    expect(result.recommendedHedge).toBe('')
  })

  it('returns ok when memories agree on salient tokens', () => {
    // Multiple items that share "maya" / "mendoza" tokens → high corroboration.
    const memories = [
      mem({ description: 'works_with --> Maya Mendoza', ageDays: 2 }),
      mem({ description: 'paid_invoice: Maya Mendoza $1200', ageDays: 3 }),
      mem({ description: 'Related: Maya Mendoza', ageDays: 4 }),
    ]
    const result = assess(baseInput(memories))
    expect(result.verdict).toBe('ok')
    expect(result.corroborationScore).toBeGreaterThanOrEqual(HEDGE_COVERAGE_THRESHOLD)
  })

  it('does not flag stale items with unknown ageDays', () => {
    const result = assess(baseInput([
      mem({ ageDays: null, confidence: 0.2 }),
      mem({ ageDays: null, confidence: 0.3 }),
    ]))
    expect(result.staleMemoryIds).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Verdict: hedge
// ---------------------------------------------------------------------------

describe('assess — verdict: hedge', () => {
  it('hedges when memories do not corroborate one another', () => {
    // Each description shares no salient tokens with the others.
    const memories = [
      mem({ description: 'opened_invoice Alpha Corp', confidence: 0.9, ageDays: 1 }),
      mem({ description: 'attended_meeting Beta Inc', confidence: 0.9, ageDays: 2 }),
      mem({ description: 'replied_email Gamma LLC', confidence: 0.9, ageDays: 3 }),
      mem({ description: 'scheduled_call Delta Partners', confidence: 0.9, ageDays: 1 }),
    ]
    const result = assess(baseInput(memories))
    expect(result.verdict).toBe('hedge')
    expect(result.corroborationScore).toBeLessThan(HEDGE_COVERAGE_THRESHOLD)
    expect(result.recommendedHedge).toContain('[assess]')
    expect(result.recommendedHedge.toLowerCase()).toContain('corroborat')
  })
})

// ---------------------------------------------------------------------------
// Verdict: refresh_required
// ---------------------------------------------------------------------------

describe('assess — verdict: refresh_required', () => {
  it('escalates to refresh_required when most top-K items are stale', () => {
    const memories = [
      mem({ ageDays: STALE_AGE_DAYS + 40, confidence: STALE_CONFIDENCE_FLOOR - 0.2, blendedScore: 0.9 }),
      mem({ ageDays: STALE_AGE_DAYS + 30, confidence: STALE_CONFIDENCE_FLOOR - 0.1, blendedScore: 0.8 }),
      mem({ ageDays: STALE_AGE_DAYS + 20, confidence: STALE_CONFIDENCE_FLOOR - 0.05, blendedScore: 0.7 }),
    ]
    const result = assess(baseInput(memories))
    expect(result.verdict).toBe('refresh_required')
    expect(result.staleFraction ?? 0).toBeGreaterThan(REFRESH_STALE_FRACTION)
    expect(result.staleMemoryIds.length).toBeGreaterThan(0)
    expect(result.recommendedHedge.toLowerCase()).toContain('search_gmail')
  })

  it('flags items old AND under confidence floor; not items that are just old', () => {
    // Old but high-confidence item should NOT be flagged stale.
    const memories = [
      mem({ ageDays: STALE_AGE_DAYS + 100, confidence: 0.95 }),
      mem({ ageDays: 1, confidence: 0.9 }),
    ]
    const result = assess(baseInput(memories))
    expect(result.staleMemoryIds).toEqual([])
  })

  it('flags items that are old AND low-confidence', () => {
    const memories = [
      mem({ ageDays: STALE_AGE_DAYS + 1, confidence: STALE_CONFIDENCE_FLOOR - 0.01, id: 'm1' }),
      mem({ ageDays: STALE_AGE_DAYS + 1, confidence: STALE_CONFIDENCE_FLOOR + 0.01, id: 'm2' }),
    ]
    const result = assess(baseInput(memories))
    expect(result.staleMemoryIds).toContain('m1')
    expect(result.staleMemoryIds).not.toContain('m2')
  })
})

// ---------------------------------------------------------------------------
// Top-K salience
// ---------------------------------------------------------------------------

describe('assess — top-K ranking', () => {
  it('only counts staleness among the top-K items by blendedScore', () => {
    // One highly ranked fresh item, many low-ranked stale items. topK = 3.
    const memories: SurfacedMemoryLike[] = [
      mem({ blendedScore: 0.99, ageDays: 1, confidence: 0.95, id: 'fresh1' }),
      mem({ blendedScore: 0.98, ageDays: 1, confidence: 0.95, id: 'fresh2' }),
      mem({ blendedScore: 0.97, ageDays: 1, confidence: 0.95, id: 'fresh3' }),
      mem({ blendedScore: 0.1, ageDays: STALE_AGE_DAYS + 50, confidence: 0.2, id: 'stale1' }),
      mem({ blendedScore: 0.09, ageDays: STALE_AGE_DAYS + 50, confidence: 0.2, id: 'stale2' }),
    ]
    const result = assess({ ...baseInput(memories), topK: 3 })
    expect(result.staleFraction).toBe(0)
    expect(result.verdict).not.toBe('refresh_required')
  })
})

// ---------------------------------------------------------------------------
// Adapter: scoredItemsToSurfaced
// ---------------------------------------------------------------------------

describe('scoredItemsToSurfaced', () => {
  it('preserves the fields needed by assess', () => {
    const scored: ScoredItem[] = [
      {
        type: 'edge',
        description: 'works_with --> Maya',
        blendedScore: 0.8,
        relevance: 1,
        confidence: 0.75,
        recency: 0.9,
        edgeWeight: 1,
        ageDays: 5,
        decayMultiplier: 0.95,
      },
    ]
    const surfaced = scoredItemsToSurfaced(scored)
    expect(surfaced).toHaveLength(1)
    expect(surfaced[0].ageDays).toBe(5)
    expect(surfaced[0].confidence).toBe(0.75)
    expect(surfaced[0].type).toBe('edge')
  })
})

// ---------------------------------------------------------------------------
// Hedge note shape — snapshot-style, not exact-match
// ---------------------------------------------------------------------------

describe('hedge note', () => {
  function runRefresh(): AssessResult {
    const memories = [
      mem({ ageDays: STALE_AGE_DAYS + 60, confidence: 0.3, blendedScore: 0.9 }),
      mem({ ageDays: STALE_AGE_DAYS + 60, confidence: 0.3, blendedScore: 0.8 }),
    ]
    return assess(baseInput(memories))
  }

  it('refresh note names concrete verification tools', () => {
    const r = runRefresh()
    expect(r.verdict).toBe('refresh_required')
    expect(r.recommendedHedge).toMatch(/search_gmail|search_messages/)
  })

  it('refresh note starts with an operator tag, not user-facing phrasing', () => {
    const r = runRefresh()
    expect(r.recommendedHedge.startsWith('[assess]')).toBe(true)
  })
})
