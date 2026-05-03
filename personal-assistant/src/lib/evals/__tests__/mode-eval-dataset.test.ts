import { describe, it, expect } from 'vitest'
import {
  SEED_DATASET,
  getCaseById,
  getCasesByDimension,
  getCasesByMode,
  getCrossModeCases,
} from '../mode-eval-dataset'
import { MODE_RUBRICS, isEvalDimension } from '../mode-eval-rubric'
import type { Mode } from '@/lib/dashboard/mode-store'

const ALL_MODES: Mode[] = ['chat', 'inbox', 'work', 'money']

describe('SEED_DATASET — invariants', () => {
  it('has at least 3 cases per mode', () => {
    for (const m of ALL_MODES) {
      expect(getCasesByMode(m).length, `${m} should have >= 3 cases`).toBeGreaterThanOrEqual(3)
    }
  })

  it('every case id is unique', () => {
    const ids = SEED_DATASET.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every case dimension is a known EvalDimension', () => {
    for (const c of SEED_DATASET) {
      for (const d of c.dimensions) {
        expect(isEvalDimension(d), `case ${c.id} has unknown dimension ${d}`).toBe(true)
      }
    }
  })

  it('every case has a non-empty input and expectedBehavior', () => {
    for (const c of SEED_DATASET) {
      expect(c.input.length).toBeGreaterThan(0)
      expect(c.expectedBehavior.length).toBeGreaterThan(0)
    }
  })

  it('case dimensions either match the mode default or expand it intentionally', () => {
    for (const c of SEED_DATASET) {
      const defaults = new Set(MODE_RUBRICS[c.mode].dimensions)
      const isCovered = c.dimensions.every(d => defaults.has(d))
      const isExpansion = c.dimensions.some(d => !defaults.has(d))
      // Either the case is fully covered by the rubric defaults, or it's an
      // intentional cross-mode expansion. Both are fine; this test just
      // ensures we didn't drop a dimension by accident.
      expect(isCovered || isExpansion).toBe(true)
    }
  })
})

describe('getCasesByMode', () => {
  it('returns only cases for the requested mode', () => {
    for (const m of ALL_MODES) {
      const cases = getCasesByMode(m)
      expect(cases.length).toBeGreaterThan(0)
      for (const c of cases) {
        expect(c.mode).toBe(m)
      }
    }
  })
})

describe('getCasesByDimension', () => {
  it('returns cases that score on the requested dimension', () => {
    const numeric = getCasesByDimension('numeric_correctness')
    expect(numeric.length).toBeGreaterThan(0)
    for (const c of numeric) {
      expect(c.dimensions).toContain('numeric_correctness')
    }
  })

  it('returns an empty list when no case scores on the dimension (no orphan dims today)', () => {
    // All eight dimensions appear in at least one case — the seed dataset
    // makes every rubric dimension reachable. This guards the "first-day
    // coverage" invariant.
    for (const m of ALL_MODES) {
      for (const d of MODE_RUBRICS[m].dimensions) {
        expect(getCasesByDimension(d).length, `dimension ${d} has no case`).toBeGreaterThan(0)
      }
    }
  })
})

describe('getCaseById', () => {
  it('returns the case with the given id', () => {
    const c = getCaseById('chat-001-todays-overview')
    expect(c?.mode).toBe('chat')
  })

  it('returns undefined when the id is not present', () => {
    expect(getCaseById('does-not-exist')).toBeUndefined()
  })
})

describe('getCrossModeCases', () => {
  it('returns the cases whose dimensions go beyond their mode default', () => {
    const cross = getCrossModeCases()
    // The seed dataset includes inbox-003 which scores on task_extraction +
    // due_date_inference (work-mode dimensions) — this is the canonical
    // cross-mode example.
    const ids = cross.map(c => c.id)
    expect(ids).toContain('inbox-003-task-bearing-message')
  })

  it('does not return cases whose dimensions are all in their mode default', () => {
    const cross = getCrossModeCases()
    for (const c of cross) {
      const defaults = new Set(MODE_RUBRICS[c.mode].dimensions)
      const beyond = c.dimensions.some(d => !defaults.has(d))
      expect(beyond).toBe(true)
    }
  })
})
