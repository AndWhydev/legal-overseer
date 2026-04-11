/**
 * Predictive Coding Engine — TDD tests.
 *
 * Tests surprise scoring, schema update thresholds, and schema evolution.
 * LLM-dependent functions are tested with mocked generateText calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KnowledgeLogEntry, SurpriseScore } from '../types'

// Mock the AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId), // passthrough — returns the string as-is
}))

import { generateText } from 'ai'
import {
  scoreSurprise,
  shouldUpdateSchema,
  updateSchemaFromErrors,
  SURPRISE_THRESHOLD,
  SCHEMA_UPDATE_THRESHOLD,
} from '../predictive-coding'

const mockedGenerateText = vi.mocked(generateText)

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFact(overrides: Partial<KnowledgeLogEntry> = {}): KnowledgeLogEntry {
  return {
    id: overrides.id ?? 'fact-1',
    org_id: 'org-1',
    entity_ids: ['entity-1'],
    signal_type: 'message',
    content: 'Alice sent a payment of $500',
    confidence: 0.9,
    source_memory_id: null,
    source_thread_id: null,
    consolidated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeError(
  score: number,
  deviationType: SurpriseScore['deviation_type'],
  factId = 'fact-1',
): SurpriseScore {
  return { fact_id: factId, score, deviation_type: deviationType }
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('predictive-coding constants', () => {
  it('SURPRISE_THRESHOLD is 0.3', () => {
    expect(SURPRISE_THRESHOLD).toBe(0.3)
  })

  it('SCHEMA_UPDATE_THRESHOLD is 3', () => {
    expect(SCHEMA_UPDATE_THRESHOLD).toBe(3)
  })
})

// ─── scoreSurprise ──────────────────────────────────────────────────────────

describe('scoreSurprise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns score 0.5 / novel_dimension for empty schema ({})', async () => {
    const fact = makeFact()
    const result = await scoreSurprise(fact, {})

    expect(result).toEqual({
      fact_id: 'fact-1',
      score: 0.5,
      deviation_type: 'novel_dimension',
    })
    // Should NOT call the LLM for empty schema
    expect(mockedGenerateText).not.toHaveBeenCalled()
  })

  it('returns score 0.5 / novel_dimension for null schema', async () => {
    const fact = makeFact({ id: 'fact-null' })
    const result = await scoreSurprise(fact, null as unknown as Record<string, unknown>)

    expect(result).toEqual({
      fact_id: 'fact-null',
      score: 0.5,
      deviation_type: 'novel_dimension',
    })
    expect(mockedGenerateText).not.toHaveBeenCalled()
  })

  it('calls LLM and parses surprise score for non-empty schema', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: '{"score": 0.8, "deviation_type": "contradicts_schema", "reason": "payment amount much higher than usual"}',
    } as any)

    const fact = makeFact({ id: 'fact-llm' })
    const schema = { typical_payment: 50, currency: 'USD' }
    const result = await scoreSurprise(fact, schema)

    expect(result).toEqual({
      fact_id: 'fact-llm',
      score: 0.8,
      deviation_type: 'contradicts_schema',
    })
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)
  })

  it('clamps score to [0, 1] range', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: '{"score": 1.5, "deviation_type": "magnitude_shift", "reason": "way over"}',
    } as any)

    const result = await scoreSurprise(makeFact({ id: 'f-clamp' }), { x: 1 })

    expect(result.score).toBe(1.0)
  })

  it('falls back to 0.5 / novel_dimension on LLM parse failure', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'this is not valid json at all',
    } as any)

    const result = await scoreSurprise(makeFact({ id: 'f-bad' }), { x: 1 })

    expect(result).toEqual({
      fact_id: 'f-bad',
      score: 0.5,
      deviation_type: 'novel_dimension',
    })
  })

  it('falls back to 0.5 / novel_dimension on LLM error', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('API timeout'))

    const result = await scoreSurprise(makeFact({ id: 'f-err' }), { x: 1 })

    expect(result).toEqual({
      fact_id: 'f-err',
      score: 0.5,
      deviation_type: 'novel_dimension',
    })
  })
})

// ─── shouldUpdateSchema ─────────────────────────────────────────────────────

describe('shouldUpdateSchema', () => {
  it('returns false with fewer than 3 significant errors', () => {
    const errors = [
      makeError(0.7, 'contradicts_schema', 'f1'),
      makeError(0.6, 'contradicts_schema', 'f2'),
    ]
    expect(shouldUpdateSchema(errors)).toBe(false)
  })

  it('returns true with 3+ errors of the same deviation type', () => {
    const errors = [
      makeError(0.8, 'contradicts_schema', 'f1'),
      makeError(0.7, 'contradicts_schema', 'f2'),
      makeError(0.6, 'contradicts_schema', 'f3'),
    ]
    expect(shouldUpdateSchema(errors)).toBe(true)
  })

  it('ignores errors below SURPRISE_THRESHOLD (score < 0.3)', () => {
    const errors = [
      makeError(0.1, 'contradicts_schema', 'f1'), // below threshold
      makeError(0.2, 'contradicts_schema', 'f2'), // below threshold
      makeError(0.29, 'contradicts_schema', 'f3'), // below threshold
      makeError(0.8, 'contradicts_schema', 'f4'), // above
    ]
    expect(shouldUpdateSchema(errors)).toBe(false)
  })

  it('returns false when errors are spread across different types', () => {
    const errors = [
      makeError(0.8, 'contradicts_schema', 'f1'),
      makeError(0.7, 'novel_dimension', 'f2'),
      makeError(0.6, 'magnitude_shift', 'f3'),
    ]
    expect(shouldUpdateSchema(errors)).toBe(false)
  })

  it('returns false for empty error list', () => {
    expect(shouldUpdateSchema([])).toBe(false)
  })

  it('respects custom threshold parameter', () => {
    const errors = [
      makeError(0.8, 'novel_dimension', 'f1'),
      makeError(0.7, 'novel_dimension', 'f2'),
    ]
    // Default threshold (3) → false, custom threshold (2) → true
    expect(shouldUpdateSchema(errors)).toBe(false)
    expect(shouldUpdateSchema(errors, 2)).toBe(true)
  })
})

// ─── updateSchemaFromErrors ─────────────────────────────────────────────────

describe('updateSchemaFromErrors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns currentSchema unchanged when no significant errors', async () => {
    const schema = { typical_payment: 50 }
    const errors = [makeError(0.1, 'expected', 'f1')] // below threshold
    const facts = [makeFact({ id: 'f1' })]

    const result = await updateSchemaFromErrors(schema, errors, facts)

    expect(result).toEqual(schema)
    expect(mockedGenerateText).not.toHaveBeenCalled()
  })

  it('returns currentSchema unchanged when errors list is empty', async () => {
    const schema = { typical_payment: 50 }
    const result = await updateSchemaFromErrors(schema, [], [])

    expect(result).toEqual(schema)
    expect(mockedGenerateText).not.toHaveBeenCalled()
  })

  it('calls LLM and returns updated schema when significant errors exist', async () => {
    const updatedSchema = { typical_payment: 500, currency: 'USD', high_value: true }
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(updatedSchema),
    } as any)

    const schema = { typical_payment: 50 }
    const errors = [
      makeError(0.8, 'contradicts_schema', 'f1'),
      makeError(0.7, 'magnitude_shift', 'f2'),
    ]
    const facts = [
      makeFact({ id: 'f1', content: 'Payment of $500' }),
      makeFact({ id: 'f2', content: 'Payment of $600' }),
    ]

    const result = await updateSchemaFromErrors(schema, errors, facts)

    expect(result).toEqual(updatedSchema)
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)
  })

  it('returns currentSchema on LLM parse failure', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'not valid json',
    } as any)

    const schema = { typical_payment: 50 }
    const errors = [makeError(0.8, 'contradicts_schema', 'f1')]
    const facts = [makeFact({ id: 'f1' })]

    const result = await updateSchemaFromErrors(schema, errors, facts)

    expect(result).toEqual(schema)
  })

  it('returns currentSchema on LLM error', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('API down'))

    const schema = { typical_payment: 50 }
    const errors = [makeError(0.8, 'contradicts_schema', 'f1')]
    const facts = [makeFact({ id: 'f1' })]

    const result = await updateSchemaFromErrors(schema, errors, facts)

    expect(result).toEqual(schema)
  })
})
