import { describe, it, expect } from 'vitest'
import {
  resolveModel,
  resolveTokenLimit,
  computeCost,
  classifyPurpose,
  type ModelPurpose,
} from '../model-registry'

describe('resolveModel', () => {
  it('returns a model ID string for classification', () => {
    const model = resolveModel('classification')
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })

  it('returns a model ID string for conversation', () => {
    const model = resolveModel('conversation')
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })

  it('returns a model ID string for synthesis', () => {
    const model = resolveModel('synthesis')
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })

  it('returns different model IDs for each purpose', () => {
    const classification = resolveModel('classification')
    const conversation = resolveModel('conversation')
    const synthesis = resolveModel('synthesis')

    expect(classification).not.toBe(conversation)
    expect(conversation).not.toBe(synthesis)
    expect(classification).not.toBe(synthesis)
  })
})

describe('resolveTokenLimit', () => {
  it('returns 4096 for classification', () => {
    expect(resolveTokenLimit('classification')).toBe(4096)
  })

  it('returns 8192 for conversation', () => {
    expect(resolveTokenLimit('conversation')).toBe(8192)
  })

  it('returns 16384 for synthesis', () => {
    expect(resolveTokenLimit('synthesis')).toBe(16384)
  })
})

describe('computeCost', () => {
  it('computes classification cost correctly (0.25 in + 1.25 out per 1M)', () => {
    const cost = computeCost('classification', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(1.50)
  })

  it('computes conversation cost correctly (3.00 in + 15.00 out per 1M)', () => {
    const cost = computeCost('conversation', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(18.00)
  })

  it('computes synthesis cost correctly (15.00 in + 75.00 out per 1M)', () => {
    const cost = computeCost('synthesis', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(90.00)
  })

  it('returns 0 for 0 tokens', () => {
    expect(computeCost('classification', 0, 0)).toBe(0)
    expect(computeCost('conversation', 0, 0)).toBe(0)
    expect(computeCost('synthesis', 0, 0)).toBe(0)
  })

  it('handles input-only cost', () => {
    const cost = computeCost('conversation', 1_000_000, 0)
    expect(cost).toBeCloseTo(3.00)
  })

  it('handles output-only cost', () => {
    const cost = computeCost('conversation', 0, 1_000_000)
    expect(cost).toBeCloseTo(15.00)
  })
})

describe('classifyPurpose', () => {
  it('returns classification for "classify this email"', () => {
    expect(classifyPurpose('classify this email')).toBe('classification')
  })

  it('returns classification for "triage these tickets"', () => {
    expect(classifyPurpose('triage these tickets')).toBe('classification')
  })

  it('returns classification for "extract the data"', () => {
    expect(classifyPurpose('extract the data')).toBe('classification')
  })

  it('returns classification for "parse this input"', () => {
    expect(classifyPurpose('parse this input')).toBe('classification')
  })

  it('returns classification for "label these items"', () => {
    expect(classifyPurpose('label these items')).toBe('classification')
  })

  it('returns classification for "sentiment analysis" (light signal)', () => {
    expect(classifyPurpose('sentiment analysis')).toBe('classification')
  })

  it('returns synthesis for "plan a marketing strategy"', () => {
    expect(classifyPurpose('plan a marketing strategy')).toBe('synthesis')
  })

  it('returns synthesis for "analyze this data"', () => {
    expect(classifyPurpose('analyze this data')).toBe('synthesis')
  })

  it('returns synthesis for "write a complex script"', () => {
    expect(classifyPurpose('write a complex script')).toBe('synthesis')
  })

  it('returns synthesis for "synthesize the findings"', () => {
    expect(classifyPurpose('synthesize the findings')).toBe('synthesis')
  })

  it('returns conversation as default for "send a message"', () => {
    expect(classifyPurpose('send a message')).toBe('conversation')
  })

  it('returns conversation as default for "hello world"', () => {
    expect(classifyPurpose('hello world')).toBe('conversation')
  })

  it('returns synthesis when wordCount exceeds 2000', () => {
    expect(classifyPurpose('short task', 3000)).toBe('synthesis')
  })

  it('returns conversation when wordCount is under 2000', () => {
    expect(classifyPurpose('short task', 500)).toBe('conversation')
  })

  it('is case-insensitive', () => {
    expect(classifyPurpose('CLASSIFY THIS')).toBe('classification')
    expect(classifyPurpose('PLAN A STRATEGY')).toBe('synthesis')
  })
})
