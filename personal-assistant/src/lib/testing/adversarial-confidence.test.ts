import { describe, it, expect } from 'vitest'
import { ADVERSARIAL_SCENARIOS, AWU_SCENARIOS } from './confidence-scenarios'
import { routeByConfidence, getAgentThresholds, AGENT_THRESHOLDS } from '../agent/confidence-router'
import { runConfidenceHarness, measureFalsePositives } from './confidence-harness'

describe('Adversarial inputs never auto-act', () => {
  it.each(ADVERSARIAL_SCENARIOS)(
    '$id: $description routes to $expectedDecision (not act)',
    (scenario) => {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(scenario.confidenceScore, thresholds)
      expect(result.decision).not.toBe('act')
      expect(result.decision).toBe(scenario.expectedDecision)
    },
  )
})

describe('Ambiguous scenarios route conservatively', () => {
  const ambiguousScenarios = AWU_SCENARIOS.filter((s) => s.category === 'ambiguous')

  it('there are ambiguous scenarios in the AWU dataset', () => {
    expect(ambiguousScenarios.length).toBeGreaterThan(0)
  })

  it('no ambiguous scenario routes to act', () => {
    for (const scenario of ambiguousScenarios) {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(scenario.confidenceScore, thresholds)
      expect(result.decision).not.toBe('act')
    }
  })

  it('all ambiguous scenarios route to ask or escalate', () => {
    for (const scenario of ambiguousScenarios) {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(scenario.confidenceScore, thresholds)
      expect(['ask', 'escalate']).toContain(result.decision)
    }
  })
})

describe('High-confidence adversarial still does not auto-act', () => {
  it('adversarial scenarios at confidence 0.70 do not auto-act', () => {
    for (const scenario of ADVERSARIAL_SCENARIOS) {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(0.70, thresholds)
      // 0.70 is below act threshold for all agents except sentry (0.75)
      // and even sentry is not in adversarial set at 0.70
      expect(result.decision).not.toBe('act')
    }
  })

  it('invoice-flow adversarial at 0.85 confidence still does not auto-act', () => {
    // invoice-flow act threshold is 0.92
    const invoiceAdversarial = ADVERSARIAL_SCENARIOS.filter(
      (s) => s.agentType === 'invoice-flow',
    )
    expect(invoiceAdversarial.length).toBeGreaterThan(0)

    for (const scenario of invoiceAdversarial) {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(0.85, thresholds)
      expect(result.decision).not.toBe('act')
      expect(result.thresholds.act).toBe(0.92)
    }
  })

  it('proposal-bot adversarial at 0.85 confidence still does not auto-act', () => {
    // proposal-bot act threshold is 0.90
    const proposalAdversarial = ADVERSARIAL_SCENARIOS.filter(
      (s) => s.agentType === 'proposal-bot',
    )
    expect(proposalAdversarial.length).toBeGreaterThan(0)

    for (const scenario of proposalAdversarial) {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(0.85, thresholds)
      expect(result.decision).not.toBe('act')
    }
  })
})

describe('Threshold boundary safety', () => {
  const agentTypes = Object.keys(AGENT_THRESHOLDS)

  it.each(agentTypes)(
    '%s: confidence at (act_threshold - 0.01) routes to ask, not act',
    (agentType) => {
      const thresholds = getAgentThresholds(agentType)
      const justBelow = thresholds.act - 0.01
      const result = routeByConfidence(justBelow, thresholds)
      expect(result.decision).not.toBe('act')
      expect(['ask', 'clarify', 'escalate']).toContain(result.decision)
    },
  )

  it('high-stakes agents have safety margin >= 0.25 between ask and act', () => {
    const highStakes = ['invoice-flow', 'proposal-bot', 'quote-bot', 'client-comms']
    for (const agentType of highStakes) {
      const thresholds = AGENT_THRESHOLDS[agentType]
      const gap = thresholds.act - thresholds.ask
      expect(gap).toBeGreaterThanOrEqual(0.25)
    }
  })
})

describe('Combined harness with adversarial', () => {
  const combined = [...AWU_SCENARIOS, ...ADVERSARIAL_SCENARIOS]
  const report = runConfidenceHarness(combined)
  const fpAnalysis = measureFalsePositives(report, combined)

  it('combined dataset has 65 scenarios', () => {
    expect(combined.length).toBe(65)
    expect(report.totalScenarios).toBe(65)
  })

  it('zero false positives in the adversarial set', () => {
    // Check that no adversarial scenario was routed to 'act'
    for (const scenario of ADVERSARIAL_SCENARIOS) {
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(scenario.confidenceScore, thresholds)
      expect(result.decision).not.toBe('act')
    }
  })

  it('overall false positive rate still below 5%', () => {
    expect(fpAnalysis.falsePositiveRate).toBeLessThan(0.05)
  })

  it('adversarial FPs specifically are zero', () => {
    const adversarialFPs = fpAnalysis.details.filter((d) =>
      ADVERSARIAL_SCENARIOS.some((s) => s.id === d.scenarioId),
    )
    expect(adversarialFPs.length).toBe(0)
  })

  it('combined accuracy is still reasonable (> 75%)', () => {
    expect(report.accuracy).toBeGreaterThan(0.75)
  })
})
