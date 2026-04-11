import { describe, it, expect } from 'vitest'
import {
  analyzeModelPurposeBehavior,
  measureFalsePositives,
  runConfidenceHarness,
} from './confidence-harness'
import { AWU_SCENARIOS } from './confidence-scenarios'

describe('Model tier confidence behavior', () => {
  const analysis = analyzeModelPurposeBehavior(AWU_SCENARIOS)

  it('model tier analysis runs without error', () => {
    expect(analysis).toBeDefined()
    expect(analysis.byTier).toBeDefined()
    expect(analysis.stabilityScore).toBeDefined()
    expect(analysis.riskyCases).toBeDefined()
  })

  it('all three tiers are represented', () => {
    expect(analysis.byTier).toHaveProperty('classification')
    expect(analysis.byTier).toHaveProperty('conversation')
    expect(analysis.byTier).toHaveProperty('synthesis')
  })

  it('Sonnet and Opus have equal or higher accuracy than Haiku', () => {
    const { classification, conversation, synthesis } = analysis.byTier
    expect(conversation.accuracy).toBeGreaterThanOrEqual(classification.accuracy)
    expect(synthesis.accuracy).toBeGreaterThanOrEqual(classification.accuracy)
  })

  it('stability score is above 70%', () => {
    expect(analysis.stabilityScore).toBeGreaterThanOrEqual(0.70)
  })

  it('risky cases (Haiku auto-acts, others do not) are flagged', () => {
    expect(Array.isArray(analysis.riskyCases)).toBe(true)
    // Each risky case should have Haiku deciding 'act'
    for (const risky of analysis.riskyCases) {
      expect(risky.haikuDecision).toBe('act')
      const othersDisagree =
        risky.sonnetDecision !== 'act' || risky.opusDecision !== 'act'
      expect(othersDisagree).toBe(true)
    }
  })
})

describe('False positive measurement', () => {
  const report = runConfidenceHarness(AWU_SCENARIOS)
  const fpAnalysis = measureFalsePositives(report, AWU_SCENARIOS)

  it('false positive rate below 5% for default scenarios', () => {
    expect(fpAnalysis.falsePositiveRate).toBeLessThan(0.05)
  })

  it('no false positives on high-stakes agents (invoice-flow, proposal-bot)', () => {
    const highStakesFPs = fpAnalysis.details.filter(
      (d) => d.agentType === 'invoice-flow' || d.agentType === 'proposal-bot',
    )
    expect(highStakesFPs.length).toBe(0)
  })

  it('false positive analysis includes recommendation', () => {
    expect(fpAnalysis.recommendation).toBeDefined()
    expect(
      fpAnalysis.recommendation.includes('PASS') ||
        fpAnalysis.recommendation.includes('FAIL'),
    ).toBe(true)
  })

  it('totalAutoActions counts all act decisions', () => {
    expect(fpAnalysis.totalAutoActions).toBeGreaterThan(0)
    expect(typeof fpAnalysis.totalAutoActions).toBe('number')
  })

  it('incorrectAutoActions matches details length', () => {
    expect(fpAnalysis.incorrectAutoActions).toBe(fpAnalysis.details.length)
  })

  it('details include full context for each false positive', () => {
    for (const detail of fpAnalysis.details) {
      expect(detail.scenarioId).toBeTruthy()
      expect(detail.agentType).toBeTruthy()
      expect(typeof detail.confidence).toBe('number')
      expect(detail.expectedDecision).not.toBe('act')
      expect(detail.description).toBeTruthy()
    }
  })
})
