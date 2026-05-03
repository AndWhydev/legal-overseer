import { describe, it, expect } from 'vitest'
import {
  MAX_SCORE,
  MIN_SCORE,
  MODE_RUBRICS,
  getAllDimensions,
  getRubricForMode,
  isEvalDimension,
  scoreSubmission,
  type EvalDimension,
} from '../mode-eval-rubric'
import type { Mode } from '@/lib/dashboard/mode-store'

const ALL_MODES: Mode[] = ['chat', 'inbox', 'work', 'money']

describe('MODE_RUBRICS — invariants', () => {
  it('has a rubric for every mode', () => {
    for (const m of ALL_MODES) {
      expect(MODE_RUBRICS[m]).toBeDefined()
      expect(MODE_RUBRICS[m].mode).toBe(m)
    }
  })

  it('every rubric has at least one dimension', () => {
    for (const m of ALL_MODES) {
      expect(MODE_RUBRICS[m].dimensions.length).toBeGreaterThan(0)
    }
  })

  it('every rubric dimension is a known EvalDimension', () => {
    const known = new Set(getAllDimensions())
    for (const m of ALL_MODES) {
      for (const d of MODE_RUBRICS[m].dimensions) {
        expect(known.has(d)).toBe(true)
      }
    }
  })

  it('rubrics do not reuse the same dimension across modes', () => {
    // Each dimension is mode-coded by design — chat and money should not share
    // helpfulness, etc. This guards against accidental rubric collapse.
    const seen = new Map<EvalDimension, Mode>()
    for (const m of ALL_MODES) {
      for (const d of MODE_RUBRICS[m].dimensions) {
        const prior = seen.get(d)
        if (prior !== undefined) {
          throw new Error(`dimension "${d}" appears in both ${prior} and ${m}`)
        }
        seen.set(d, m)
      }
    }
    expect(seen.size).toBe(getAllDimensions().length)
  })
})

describe('isEvalDimension', () => {
  it('returns true for known dimensions', () => {
    expect(isEvalDimension('helpfulness')).toBe(true)
    expect(isEvalDimension('numeric_correctness')).toBe(true)
  })
  it('returns false for unknown strings', () => {
    expect(isEvalDimension('vibes')).toBe(false)
    expect(isEvalDimension('')).toBe(false)
  })
})

describe('getRubricForMode', () => {
  it('returns the canonical rubric reference', () => {
    expect(getRubricForMode('chat')).toBe(MODE_RUBRICS.chat)
  })
})

describe('scoreSubmission — happy path', () => {
  it('sums valid scores and normalises to 0-100', () => {
    const result = scoreSubmission(MODE_RUBRICS.chat, {
      helpfulness: 4,
      conversational_tone: 5,
    })
    expect(result.total).toBe(9)
    expect(result.normalized).toBe(90) // 9 / (2 * 5) * 100
    expect(result.missing).toEqual([])
    expect(result.ignored).toEqual([])
  })

  it('a perfect score normalises to 100', () => {
    const result = scoreSubmission(MODE_RUBRICS.work, {
      task_extraction: MAX_SCORE,
      due_date_inference: MAX_SCORE,
    })
    expect(result.normalized).toBe(100)
  })

  it('an all-zeros score normalises to 0', () => {
    const result = scoreSubmission(MODE_RUBRICS.work, {
      task_extraction: MIN_SCORE,
      due_date_inference: MIN_SCORE,
    })
    expect(result.total).toBe(0)
    expect(result.normalized).toBe(0)
    // Zero scores are still counted, not "missing".
    expect(result.missing).toEqual([])
  })
})

describe('scoreSubmission — edges', () => {
  it('clamps out-of-range scores to [MIN_SCORE, MAX_SCORE]', () => {
    const result = scoreSubmission(MODE_RUBRICS.chat, {
      helpfulness: 99,
      conversational_tone: -3,
    })
    expect(result.total).toBe(MAX_SCORE + MIN_SCORE)
    expect(result.normalized).toBe(50)
  })

  it('drops non-finite values as missing', () => {
    const result = scoreSubmission(MODE_RUBRICS.money, {
      numeric_correctness: NaN,
      currency_handling: 4,
    })
    expect(result.missing).toEqual(['numeric_correctness'])
    expect(result.total).toBe(4)
  })

  it('drops null and undefined as missing', () => {
    const result = scoreSubmission(MODE_RUBRICS.money, {
      numeric_correctness: null,
      currency_handling: undefined,
    })
    expect(result.missing).toEqual(['numeric_correctness', 'currency_handling'])
    expect(result.total).toBe(0)
    // No counted scores → normalized stays 0.
    expect(result.normalized).toBe(0)
  })

  it('lists unknown keys in `ignored` and does not score them', () => {
    const result = scoreSubmission(MODE_RUBRICS.chat, {
      helpfulness: 5,
      conversational_tone: 5,
      vibes: 5,
    })
    expect(result.ignored).toContain('vibes')
    expect(result.total).toBe(10)
  })

  it('lists rubric-mismatched dimensions in `ignored` even if they are valid', () => {
    // numeric_correctness IS a real dimension, but not in the chat rubric.
    const result = scoreSubmission(MODE_RUBRICS.chat, {
      helpfulness: 4,
      conversational_tone: 4,
      numeric_correctness: 5,
    })
    expect(result.ignored).toContain('numeric_correctness')
    expect(result.total).toBe(8)
  })
})
