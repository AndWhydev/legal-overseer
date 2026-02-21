import { describe, it, expect, vi } from 'vitest'
import {
  routeByConfidence,
  getEffectiveThresholds,
  DEFAULT_THRESHOLDS,
  routeAgentAction,
} from './confidence-router'

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
})
