import { describe, it, expect } from 'vitest'
import { classifyQuery, getRetrievalConfig } from '../query-router'

describe('classifyQuery', () => {
  it('classifies simple entity lookup', () => {
    const result = classifyQuery("What is Steve's email?")
    expect(result.complexity).toBe('simple')
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('classifies moderate temporal query', () => {
    const result = classifyQuery("What did we discuss about pricing last week?")
    expect(result.complexity).toBe('moderate')
    expect(result.score).toBe(2)
    expect(result.signals).toContain('temporal')
    expect(result.signals).toContain('relational')
  })

  it('classifies complex multi-entity relational query', () => {
    const result = classifyQuery("How does Steve's Phase 2 feedback relate to Maya's project delay?")
    expect(result.complexity).toBe('complex')
    expect(result.score).toBeGreaterThanOrEqual(3)
  })

  it('handles empty/trivial input', () => {
    expect(classifyQuery('').complexity).toBe('simple')
    expect(classifyQuery('hey').complexity).toBe('simple')
  })

  it('detects temporal markers', () => {
    const result = classifyQuery('What happened yesterday with the invoice?')
    expect(result.signals).toContain('temporal')
  })

  it('detects relational keywords', () => {
    const result = classifyQuery('How does the budget affect the timeline?')
    expect(result.signals).toContain('relational')
  })

  it('detects multiple entities', () => {
    const result = classifyQuery('Compare Steve and Maya project status')
    expect(result.signals).toContain('multi_entity')
  })
})

describe('getRetrievalConfig', () => {
  it('returns simple config', () => {
    const config = getRetrievalConfig('simple')
    expect(config.useGraph).toBe(false)
    expect(config.useRerank).toBe(false)
    expect(config.topK).toBe(5)
    expect(config.tokenBudget).toBe(500)
  })

  it('returns moderate config', () => {
    const config = getRetrievalConfig('moderate')
    expect(config.useGraph).toBe(true)
    expect(config.useRerank).toBe(false)
    expect(config.topK).toBe(10)
    expect(config.tokenBudget).toBe(1500)
  })

  it('returns complex config', () => {
    const config = getRetrievalConfig('complex')
    expect(config.useGraph).toBe(true)
    expect(config.useRerank).toBe(true)
    expect(config.topK).toBe(20)
    expect(config.tokenBudget).toBe(3000)
  })
})
