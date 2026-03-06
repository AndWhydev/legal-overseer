import { describe, expect, it } from 'vitest'
import {
  routeByConfidence,
  routeAgentAction,
  getEffectiveThresholds,
  getAgentThresholds,
  DEFAULT_THRESHOLDS,
  AGENT_THRESHOLDS,
  type ConfidenceRoutingResult,
} from '../confidence-router'
import type { ConfidenceThresholds } from '@/lib/bitbit-core'

describe('confidence-router', () => {
  describe('routeByConfidence', () => {
    it('routes to "act" when confidence >= act threshold', () => {
      const result = routeByConfidence(0.9, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('act')
      expect(result.confidence).toBe(0.9)
    })

    it('routes to "ask" when confidence between ask and act thresholds', () => {
      const result = routeByConfidence(0.7, { act: 0.85, ask: 0.55 })
      expect(result.decision).toBe('ask')
      expect(result.confidence).toBe(0.7)
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
      const result = routeAgentAction(
        0.88,
        { confidence_thresholds: { act: 0.92, ask: 0.60 } }
      )
      expect(result.decision).toBe('ask')
      expect(result.confidence).toBe(0.88)
    })

    it('falls back to agent type thresholds when no config provided', () => {
      const result = routeAgentAction(0.88, undefined, undefined, 'invoice-flow')
      expect(result.decision).toBe('ask')
      expect(result.thresholds.act).toBe(AGENT_THRESHOLDS['invoice-flow'].act)
    })

    it('uses org settings as fallback', () => {
      const result = routeAgentAction(
        0.7,
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
      const thresholds = { act: 0.85, ask: 0.55 }

      const lowConfidence = routeAgentAction(0.3, { confidence_thresholds: thresholds })
      expect(lowConfidence.decision).toBe('escalate')

      const mediumConfidence = routeAgentAction(0.7, { confidence_thresholds: thresholds })
      expect(mediumConfidence.decision).toBe('ask')

      const highConfidence = routeAgentAction(0.9, { confidence_thresholds: thresholds })
      expect(highConfidence.decision).toBe('act')
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
