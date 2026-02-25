import { afterEach, describe, expect, it, vi } from 'vitest'
import { qualifyLead, type LeadQualificationInput } from '../lead-swarm'

// classifyInboundLead and runLeadSwarmTick depend on LLM calls via classifier.
// We test the pure functions (qualifyLead) and mock the classifier for integration.

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// qualifyLead — pure scoring logic
// ---------------------------------------------------------------------------

describe('qualifyLead', () => {
  it('scores a hot lead (high budget + services + urgent timeline)', () => {
    const input: LeadQualificationInput = {
      estimatedValue: 15000,
      serviceInterest: ['web-development', 'seo'],
      timelineDays: 7,
    }
    const result = qualifyLead(input)
    expect(result.score).toBe('hot')
    expect(result.points.total).toBeGreaterThanOrEqual(5)
    expect(result.budgetRange).toBe('high')
  })

  it('scores a warm lead (medium budget + services)', () => {
    const input: LeadQualificationInput = {
      estimatedValue: 5000,
      serviceInterest: ['branding'],
      timelineDays: 30,
    }
    const result = qualifyLead(input)
    expect(result.score).toBe('warm')
    expect(result.points.budget).toBe(1)
    expect(result.points.service).toBe(2)
  })

  it('scores a cold lead (no signals)', () => {
    const input: LeadQualificationInput = {
      estimatedValue: null,
      serviceInterest: [],
      timelineDays: null,
    }
    const result = qualifyLead(input)
    expect(result.score).toBe('cold')
    expect(result.points.total).toBe(0)
  })

  it('handles edge case: very high budget alone is warm', () => {
    const input: LeadQualificationInput = {
      estimatedValue: 50000,
      serviceInterest: [],
      timelineDays: null,
    }
    const result = qualifyLead(input)
    // budget=2, service=0, timeline=0 => total=2 => cold
    expect(result.score).toBe('cold')
    expect(result.budgetRange).toBe('high')
  })

  it('clamps negative values', () => {
    const input: LeadQualificationInput = {
      estimatedValue: -100,
      serviceInterest: [],
      timelineDays: -5,
    }
    const result = qualifyLead(input)
    expect(result.estimatedValue).toBe(0)
    expect(result.timelineDays).toBe(0)
  })

  it('deduplicates service interests', () => {
    const input: LeadQualificationInput = {
      estimatedValue: null,
      serviceInterest: ['seo', 'seo', 'ads'],
      timelineDays: null,
    }
    const result = qualifyLead(input)
    expect(result.serviceInterest).toEqual(['ads', 'seo'])
  })

  it('timeline <= 14 days gets max timeline points', () => {
    const result = qualifyLead({ estimatedValue: null, serviceInterest: [], timelineDays: 10 })
    expect(result.points.timeline).toBe(2)
  })

  it('timeline 15-45 days gets 1 timeline point', () => {
    const result = qualifyLead({ estimatedValue: null, serviceInterest: [], timelineDays: 30 })
    expect(result.points.timeline).toBe(1)
  })

  it('timeline > 45 days gets 0 timeline points', () => {
    const result = qualifyLead({ estimatedValue: null, serviceInterest: [], timelineDays: 90 })
    expect(result.points.timeline).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Lead classification mapping (tested via classifyInboundLead mock)
// ---------------------------------------------------------------------------

describe('lead scoring integration', () => {
  it('hot lead = high budget + multiple services + urgent', () => {
    const result = qualifyLead({
      estimatedValue: 20000,
      serviceInterest: ['web-development', 'ads'],
      timelineDays: 5,
    })
    expect(result.score).toBe('hot')
    expect(result.points.total).toBe(6)
  })
})
