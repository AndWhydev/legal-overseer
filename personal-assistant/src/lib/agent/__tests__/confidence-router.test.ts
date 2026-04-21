import { describe, expect, it } from 'vitest'
import {
  routeByConfidence,
  routeAgentAction,
  getEffectiveThresholds,
  getAgentThresholds,
  DEFAULT_THRESHOLDS,
  AGENT_THRESHOLDS,
  type ConfidenceRoutingResult,
  type EntityDelegation,
} from '../confidence-router'
import type { ConfidenceThresholds } from '@/lib/bitbit-core'

describe('confidence-router', () => {
  describe('routeByConfidence', () => {
    it('routes to "act" when confidence >= act threshold', () => {
      const result = routeByConfidence(0.9, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('act')
      expect(result.confidence).toBe(0.9)
    })

    it('routes to "ask" when confidence in lower ask band (below clarify threshold)', () => {
      // With act=0.85, ask=0.55 -> clarify threshold = 0.70; 0.6 is in the lower ask band
      const result = routeByConfidence(0.6, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('ask')
      expect(result.confidence).toBe(0.6)
    })

    it('routes to "escalate" when confidence < ask threshold', () => {
      const result = routeByConfidence(0.4, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('escalate')
      expect(result.confidence).toBe(0.4)
    })

    it('uses DEFAULT_THRESHOLDS when no thresholds provided', () => {
      const result = routeByConfidence(0.9)
      expect(result.decision).toBe('act')
      expect(result.thresholds).toEqual(DEFAULT_THRESHOLDS)
    })

    it('includes reasoning in result', () => {
      const result = routeByConfidence(0.9, { act: 0.85, ask: 0.55 })
      expect(result.reasoning).toContain('0.9')
      expect(result.reasoning).toContain('0.85')
    })
  })

  describe('clarify band', () => {
    it('returns clarify when confidence in upper ask band (0.70-0.85)', () => {
      const result = routeByConfidence(0.75)
      expect(result.decision).toBe('clarify')
      expect(result.reasoning).toContain('clarify band')
    })

    it('returns clarify at exact clarify threshold (0.70)', () => {
      const result = routeByConfidence(0.70)
      expect(result.decision).toBe('clarify')
    })

    it('returns ask when confidence in lower ask band (0.55-0.70)', () => {
      const result = routeByConfidence(0.60)
      expect(result.decision).toBe('ask')
    })

    it('returns ask just below clarify threshold', () => {
      const result = routeByConfidence(0.69)
      expect(result.decision).toBe('ask')
    })

    it('does not affect act routing above act threshold', () => {
      const result = routeByConfidence(0.90)
      expect(result.decision).toBe('act')
    })

    it('does not affect escalate routing below ask threshold', () => {
      const result = routeByConfidence(0.40)
      expect(result.decision).toBe('escalate')
    })

    it('clarify threshold adjusts with custom thresholds', () => {
      // Custom: act=0.90, ask=0.50 -> clarify threshold = 0.50 + (0.90-0.50)*0.5 = 0.70
      const result = routeByConfidence(0.75, { act: 0.90, ask: 0.50 })
      expect(result.decision).toBe('clarify')
    })
  })

  describe('getEffectiveThresholds', () => {
    it('prefers agent thresholds over org thresholds', () => {
      const agentThresholds = { act: 0.92, ask: 0.60 }
      const orgThresholds = { act: 0.85, ask: 0.55 }
      const result = getEffectiveThresholds(agentThresholds, orgThresholds)
      expect(result).toEqual(agentThresholds)
    })

    it('falls back to org thresholds when agent not specified', () => {
      const orgThresholds = { act: 0.85, ask: 0.55 }
      const result = getEffectiveThresholds(undefined, orgThresholds)
      expect(result).toEqual(orgThresholds)
    })

    it('falls back to defaults when nothing specified', () => {
      const result = getEffectiveThresholds(undefined, undefined)
      expect(result).toEqual(DEFAULT_THRESHOLDS)
    })

    it('clamps values to 0-1 range', () => {
      const result = getEffectiveThresholds({ act: 1.5, ask: -0.5 }, undefined)
      expect(result.act).toBeLessThanOrEqual(1)
      expect(result.ask).toBeGreaterThanOrEqual(0)
    })

    it('validates that act > ask', () => {
      const invalid = { act: 0.5, ask: 0.6 }
      const result = getEffectiveThresholds(invalid, undefined)
      expect(result).toEqual(DEFAULT_THRESHOLDS)
    })

    it('merges partial agent and org thresholds', () => {
      const agentPartial = { act: 0.92 }
      const orgPartial = { ask: 0.58 }
      const result = getEffectiveThresholds(agentPartial, orgPartial)
      expect(result.act).toBe(0.92)
      expect(result.ask).toBe(0.58)
    })
  })

  describe('getAgentThresholds', () => {
    it('returns specific agent type thresholds', () => {
      const result = getAgentThresholds('invoice-flow')
      expect(result.act).toBe(AGENT_THRESHOLDS['invoice-flow'].act)
      expect(result.ask).toBe(AGENT_THRESHOLDS['invoice-flow'].ask)
    })

    it('returns defaults for unknown agent type', () => {
      const result = getAgentThresholds('unknown-agent')
      expect(result).toEqual(DEFAULT_THRESHOLDS)
    })

    it('invoice-flow has higher act threshold than lead-swarm', () => {
      const invoice = getAgentThresholds('invoice-flow')
      const lead = getAgentThresholds('lead-swarm')
      expect(invoice.act).toBeGreaterThan(lead.act)
    })

    it('sentry has lower act threshold than defaults', () => {
      const sentry = getAgentThresholds('sentry')
      expect(sentry.act).toBeLessThan(DEFAULT_THRESHOLDS.act)
    })
  })

  describe('routeAgentAction', () => {
    it('uses agent config thresholds when provided', () => {
      // act=0.92, ask=0.60 -> clarify threshold = 0.76; 0.65 is in lower ask band
      const result = routeAgentAction(
        0.65,
        { confidence_thresholds: { act: 0.92, ask: 0.60 } }
      )
      expect(result.decision).toBe('ask')
      expect(result.confidence).toBe(0.65)
    })

    it('falls back to agent type thresholds when no config provided', () => {
      // invoice-flow: act=0.92, ask=0.60 -> clarify threshold = 0.76; 0.65 in lower ask band
      const result = routeAgentAction(0.65, undefined, undefined, 'invoice-flow')
      expect(result.decision).toBe('ask')
      expect(result.thresholds.act).toBe(AGENT_THRESHOLDS['invoice-flow'].act)
    })

    it('uses org settings as fallback', () => {
      // act=0.80, ask=0.60 -> clarify threshold = 0.70; 0.65 in lower ask band
      const result = routeAgentAction(
        0.65,
        undefined,
        { confidence_thresholds: { act: 0.80, ask: 0.60 } }
      )
      expect(result.decision).toBe('ask')
    })

    it('uses defaults when nothing specified', () => {
      const result = routeAgentAction(0.7)
      expect(result.thresholds).toEqual(DEFAULT_THRESHOLDS)
    })

    it('cascade order: config > agent type > org > defaults', () => {
      const agentConfig = { confidence_thresholds: { act: 0.99, ask: 0.90 } }
      const orgSettings = { confidence_thresholds: { act: 0.85, ask: 0.55 } }
      const agentType = 'invoice-flow'

      const result = routeAgentAction(0.95, agentConfig, orgSettings, agentType)
      // Should use agentConfig, not invoice-flow thresholds
      expect(result.thresholds.act).toBe(0.99)
      expect(result.thresholds.ask).toBe(0.90)
    })

    it('routing works correctly across confidence spectrum', () => {
      // act=0.85, ask=0.55 -> clarify threshold = 0.70
      const thresholds = { act: 0.85, ask: 0.55 }

      const lowConfidence = routeAgentAction(0.3, { confidence_thresholds: thresholds })
      expect(lowConfidence.decision).toBe('escalate')

      // 0.6 is in lower ask band (below 0.70 clarify threshold) -> ask
      const mediumConfidence = routeAgentAction(0.6, { confidence_thresholds: thresholds })
      expect(mediumConfidence.decision).toBe('ask')

      // 0.75 is in upper ask band (above 0.70 clarify threshold) -> clarify
      const clarifyConfidence = routeAgentAction(0.75, { confidence_thresholds: thresholds })
      expect(clarifyConfidence.decision).toBe('clarify')

      const highConfidence = routeAgentAction(0.9, { confidence_thresholds: thresholds })
      expect(highConfidence.decision).toBe('act')
    })
  })

  describe('entity delegation', () => {
    it('returns auto_delegated for infinite_autopilot mandate regardless of confidence', () => {
      const result = routeAgentAction(
        0.3, // Low confidence — would normally escalate
        undefined,
        undefined,
        undefined,
        undefined,
        { mandate: 'infinite_autopilot', entityId: 'test-entity-1' },
      )
      expect(result.decision).toBe('auto_delegated')
      expect(result.reasoning).toContain('infinite_autopilot')
      expect(result.reasoning).toContain('test-entity-1')
    })

    it('falls through to standard routing for standard mandate', () => {
      const result = routeAgentAction(
        0.90,
        undefined,
        undefined,
        undefined,
        undefined,
        { mandate: 'standard' },
      )
      expect(result.decision).toBe('act')
      expect(result.thresholdSource).toBe('defaults')
    })

    it('falls through to standard routing for supervised mandate', () => {
      const result = routeAgentAction(
        0.90,
        undefined,
        undefined,
        undefined,
        undefined,
        { mandate: 'supervised' },
      )
      expect(result.decision).toBe('act')
    })

    it('falls through to standard routing when entityDelegation is undefined', () => {
      const result = routeAgentAction(0.90)
      expect(result.decision).toBe('act')
      expect(result.thresholdSource).toBe('defaults')
    })

    it('auto_delegated takes priority over calibrated thresholds', () => {
      const result = routeAgentAction(
        0.3,
        undefined,
        undefined,
        undefined,
        { act: 0.85, ask: 0.55, sampleSize: 100 },
        { mandate: 'infinite_autopilot' },
      )
      expect(result.decision).toBe('auto_delegated')
    })
  })

  describe('edge cases', () => {
    it('handles confidence = act threshold exactly', () => {
      const result = routeByConfidence(0.85, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('act')
    })

    it('handles confidence = ask threshold exactly', () => {
      const result = routeByConfidence(0.55, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('ask')
    })

    it('handles 0 confidence', () => {
      const result = routeByConfidence(0)
      expect(result.decision).toBe('escalate')
    })

    it('handles 1.0 confidence', () => {
      const result = routeByConfidence(1.0)
      expect(result.decision).toBe('act')
    })

    it('handles NaN gracefully', () => {
      const result = routeByConfidence(NaN)
      expect(result.decision).toBe('escalate')
    })
  })
})
