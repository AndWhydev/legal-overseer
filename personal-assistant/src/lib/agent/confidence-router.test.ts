import { describe, it, expect, vi } from 'vitest'
import {
  routeByConfidence,
  getEffectiveThresholds,
  DEFAULT_THRESHOLDS,
  routeAgentAction,
  AGENT_THRESHOLDS,
  getAgentThresholds,
} from './confidence-router'
import { AWU_SCENARIOS } from '../testing/confidence-scenarios'
import { runConfidenceHarness, formatHarnessReport } from '../testing/confidence-harness'

describe('confidence-router', () => {
  describe('DEFAULT_THRESHOLDS', () => {
    it('has act=0.85 and ask=0.55', () => {
      expect(DEFAULT_THRESHOLDS).toEqual({ act: 0.85, ask: 0.55 })
    })
  })

  describe('routeByConfidence - default thresholds', () => {
    it('routes 0.90 to act', () => {
      const result = routeByConfidence(0.9)
      expect(result.decision).toBe('act')
    })

    it('routes 0.70 to ask', () => {
      const result = routeByConfidence(0.7)
      expect(result.decision).toBe('ask')
    })

    it('routes 0.40 to escalate', () => {
      const result = routeByConfidence(0.4)
      expect(result.decision).toBe('escalate')
    })
  })

  describe('routeByConfidence - exact boundaries', () => {
    it('routes 0.85 to act (inclusive)', () => {
      expect(routeByConfidence(0.85).decision).toBe('act')
    })

    it('routes 0.55 to ask (inclusive)', () => {
      expect(routeByConfidence(0.55).decision).toBe('ask')
    })

    it('routes 0.5499 to escalate', () => {
      expect(routeByConfidence(0.5499).decision).toBe('escalate')
    })

    it('routes 0.8499 to ask (just below act)', () => {
      expect(routeByConfidence(0.8499).decision).toBe('ask')
    })
  })

  describe('routeByConfidence - custom thresholds', () => {
    const custom = { act: 0.95, ask: 0.70 }

    it('routes 0.90 to ask with high act threshold', () => {
      expect(routeByConfidence(0.9, custom).decision).toBe('ask')
    })

    it('routes 0.60 to escalate with high ask threshold', () => {
      expect(routeByConfidence(0.6, custom).decision).toBe('escalate')
    })

    it('routes 0.95 to act', () => {
      expect(routeByConfidence(0.95, custom).decision).toBe('act')
    })
  })

  describe('routeByConfidence - edge cases', () => {
    it('routes 0 to escalate', () => {
      expect(routeByConfidence(0).decision).toBe('escalate')
    })

    it('routes 1.0 to act', () => {
      expect(routeByConfidence(1.0).decision).toBe('act')
    })

    it('routes negative confidence to escalate', () => {
      expect(routeByConfidence(-0.1).decision).toBe('escalate')
    })

    it('routes confidence > 1 to act', () => {
      expect(routeByConfidence(1.5).decision).toBe('act')
    })

    it('includes confidence and thresholds in result', () => {
      const result = routeByConfidence(0.65)
      expect(result.confidence).toBe(0.65)
      expect(result.thresholds).toEqual(DEFAULT_THRESHOLDS)
      expect(result.reasoning).toContain('0.65')
    })
  })

  describe('getEffectiveThresholds', () => {
    it('returns defaults when no overrides', () => {
      expect(getEffectiveThresholds()).toEqual(DEFAULT_THRESHOLDS)
    })

    it('agent overrides defaults', () => {
      const result = getEffectiveThresholds({ act: 0.95 })
      expect(result.act).toBe(0.95)
      expect(result.ask).toBe(0.55) // default
    })

    it('org overrides defaults', () => {
      const result = getEffectiveThresholds(undefined, { ask: 0.60 })
      expect(result.ask).toBe(0.60)
      expect(result.act).toBe(0.85) // default
    })

    it('agent overrides org', () => {
      const result = getEffectiveThresholds({ act: 0.90 }, { act: 0.80 })
      expect(result.act).toBe(0.90)
    })

    it('partial agent + partial org compose', () => {
      const result = getEffectiveThresholds({ act: 0.92 }, { ask: 0.60 })
      expect(result.act).toBe(0.92)
      expect(result.ask).toBe(0.60)
    })
  })

  describe('getEffectiveThresholds - invalid thresholds', () => {
    it('falls back to defaults when act <= ask', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = getEffectiveThresholds({ act: 0.50, ask: 0.70 })
      expect(result).toEqual(DEFAULT_THRESHOLDS)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('clamps values > 1', () => {
      const result = getEffectiveThresholds({ act: 1.5 })
      expect(result.act).toBe(1)
    })

    it('clamps values < 0', () => {
      const result = getEffectiveThresholds({ ask: -0.5 })
      // ask=-0.5 clamped to 0, act=0.85 default -> act > ask, valid
      expect(result.ask).toBe(0)
    })
  })

  describe('routeAgentAction', () => {
    it('passes agent and org thresholds correctly', () => {
      const result = routeAgentAction(
        0.80,
        { confidence_thresholds: { act: 0.90, ask: 0.60 } },
        { confidence_thresholds: { act: 0.75 } },
      )
      // Agent act=0.90 overrides org act=0.75; agent ask=0.60
      expect(result.decision).toBe('ask')
      expect(result.thresholds.act).toBe(0.90)
    })

    it('works with no config', () => {
      const result = routeAgentAction(0.90)
      expect(result.decision).toBe('act')
    })

    it('uses org when agent has no thresholds', () => {
      const result = routeAgentAction(0.80, {}, { confidence_thresholds: { act: 0.75 } })
      expect(result.decision).toBe('act')
    })
  })

  describe('Production scenarios', () => {
    it('invoice send (confidence 0.92) routes to act', () => {
      const result = routeAgentAction(0.92)
      expect(result.decision).toBe('act')
    })

    it('lead reply draft (confidence 0.70) routes to ask', () => {
      const result = routeAgentAction(0.70)
      expect(result.decision).toBe('ask')
    })

    it('unknown request (confidence 0.30) routes to escalate', () => {
      const result = routeAgentAction(0.30)
      expect(result.decision).toBe('escalate')
    })

    it('borderline task with strict agent thresholds escalates', () => {
      const result = routeAgentAction(
        0.60,
        { confidence_thresholds: { act: 0.95, ask: 0.75 } },
      )
      expect(result.decision).toBe('escalate')
    })

    it('agent with relaxed thresholds acts on moderate confidence', () => {
      const result = routeAgentAction(
        0.65,
        { confidence_thresholds: { act: 0.60, ask: 0.30 } },
      )
      expect(result.decision).toBe('act')
    })
  })

  describe('Per-agent thresholds', () => {
    it('invoice-flow has higher act threshold (0.92) than sentry (0.75)', () => {
      expect(AGENT_THRESHOLDS['invoice-flow'].act).toBe(0.92)
      expect(AGENT_THRESHOLDS['sentry'].act).toBe(0.75)
      expect(AGENT_THRESHOLDS['invoice-flow'].act).toBeGreaterThan(AGENT_THRESHOLDS['sentry'].act)
    })

    it('getAgentThresholds returns AGENT_THRESHOLDS for known types', () => {
      expect(getAgentThresholds('invoice-flow')).toEqual({ act: 0.92, ask: 0.60 })
      expect(getAgentThresholds('sentry')).toEqual({ act: 0.75, ask: 0.45 })
      expect(getAgentThresholds('client-comms')).toEqual({ act: 0.88, ask: 0.58 })
    })

    it('getAgentThresholds falls back to DEFAULT_THRESHOLDS for unknown types', () => {
      const result = getAgentThresholds('unknown-agent')
      expect(result).toEqual(DEFAULT_THRESHOLDS)
    })

    it('routeAgentAction with agentType uses AGENT_THRESHOLDS when no explicit config', () => {
      // Sentry threshold: act=0.75, ask=0.45
      // Confidence 0.78 should be 'act' with sentry thresholds
      const result = routeAgentAction(0.78, undefined, undefined, 'sentry')
      expect(result.decision).toBe('act')
      expect(result.thresholds.act).toBe(0.75)

      // Same confidence with invoice-flow (act=0.92) should be 'ask'
      const invoiceResult = routeAgentAction(0.78, undefined, undefined, 'invoice-flow')
      expect(invoiceResult.decision).toBe('ask')
      expect(invoiceResult.thresholds.act).toBe(0.92)
    })

    it('explicit config overrides AGENT_THRESHOLDS', () => {
      // Even though invoice-flow act=0.92, explicit config act=0.70 should win
      const result = routeAgentAction(
        0.75,
        { confidence_thresholds: { act: 0.70, ask: 0.40 } },
        undefined,
        'invoice-flow',
      )
      expect(result.decision).toBe('act')
      expect(result.thresholds.act).toBe(0.70)
    })

    it('AGENT_THRESHOLDS covers all 10 agent types', () => {
      const expectedTypes = [
        'invoice-flow', 'lead-swarm', 'sentry', 'channel-triage',
        'client-comms', 'proposal-bot', 'client-onboarding',
        'quote-bot', 'tender-hunter', 'ad-script-gen',
      ]
      for (const agentType of expectedTypes) {
        expect(AGENT_THRESHOLDS[agentType]).toBeDefined()
        expect(AGENT_THRESHOLDS[agentType].act).toBeGreaterThan(AGENT_THRESHOLDS[agentType].ask)
      }
    })
  })

  describe('Confidence harness', () => {
    it('runs all 50 scenarios and returns a report', () => {
      const report = runConfidenceHarness()
      expect(report).toBeDefined()
      expect(report.totalScenarios).toBe(50)
      expect(report.runAt).toBeTruthy()
    })

    it('report.totalScenarios === 50', () => {
      const report = runConfidenceHarness()
      expect(report.totalScenarios).toBe(50)
    })

    it('report.accuracy is > 0.80', () => {
      const report = runConfidenceHarness()
      expect(report.accuracy).toBeGreaterThan(0.80)
    })

    it('report.falsePositiveRate is reported (even if 0)', () => {
      const report = runConfidenceHarness()
      expect(typeof report.falsePositiveRate).toBe('number')
      expect(report.falsePositiveRate).toBeGreaterThanOrEqual(0)
      expect(report.falsePositiveRate).toBeLessThanOrEqual(1)
    })

    it('all 10 agent types appear in report.byAgent', () => {
      const report = runConfidenceHarness()
      const expectedTypes = [
        'invoice-flow', 'lead-swarm', 'sentry', 'channel-triage',
        'client-comms', 'proposal-bot', 'client-onboarding',
        'quote-bot', 'tender-hunter', 'ad-script-gen',
      ]
      for (const agentType of expectedTypes) {
        expect(report.byAgent[agentType]).toBeDefined()
        expect(report.byAgent[agentType].total).toBeGreaterThan(0)
      }
    })

    it('misses array contains details for any incorrect routing', () => {
      const report = runConfidenceHarness()
      const incorrectCount = report.totalScenarios - report.correct
      expect(report.misses.length).toBe(incorrectCount)
      for (const miss of report.misses) {
        expect(miss.scenarioId).toBeTruthy()
        expect(miss.expected).toBeTruthy()
        expect(miss.actual).toBeTruthy()
        expect(typeof miss.confidence).toBe('number')
      }
    })

    it('formatHarnessReport produces readable output', () => {
      const report = runConfidenceHarness()
      const output = formatHarnessReport(report)
      expect(output).toContain('Confidence Routing Harness Report')
      expect(output).toContain('By Agent Type')
      expect(output).toContain('By Category')
      expect(output).toContain(`${report.totalScenarios}`)
    })

    it('AWU_SCENARIOS has exactly 50 entries', () => {
      expect(AWU_SCENARIOS.length).toBe(50)
    })

    it('AWU_SCENARIOS covers all 10 agent types', () => {
      const types = new Set(AWU_SCENARIOS.map(s => s.agentType))
      expect(types.size).toBe(10)
    })
  })
})
