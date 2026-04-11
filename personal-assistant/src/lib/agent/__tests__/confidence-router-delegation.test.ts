import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  routeAgentAction,
  DEFAULT_THRESHOLDS,
  AGENT_THRESHOLDS,
  type EntityDelegation,
  type ConfidenceRoutingResult,
} from '../confidence-router'
import {
  shouldAutoExecute,
  type OrgAutonomyOverrides,
} from '@/lib/intelligence/autonomy-levels'
import type { ConfidenceDecision } from '@/lib/bitbit-core'

// ---------------------------------------------------------------------------
// Confidence Router — Delegation Bypass Tests
// ---------------------------------------------------------------------------

describe('confidence-router delegation bypass', () => {
  describe('infinite_autopilot mandate', () => {
    it('returns auto_delegated regardless of confidence score', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-42',
      }

      // Even a zero-confidence action should bypass
      const result = routeAgentAction(0.0, undefined, undefined, undefined, undefined, delegation)
      expect(result.decision).toBe('auto_delegated')
      expect(result.reasoning).toContain('infinite_autopilot')
      expect(result.reasoning).toContain('entity-42')
    })

    it('bypasses agent-level thresholds', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-1',
      }
      // invoice-flow has act: 0.92 — even 0.5 confidence should bypass
      const result = routeAgentAction(
        0.5,
        { confidence_thresholds: { act: 0.92, ask: 0.60 } },
        undefined,
        'invoice-flow',
        undefined,
        delegation,
      )
      expect(result.decision).toBe('auto_delegated')
    })

    it('bypasses calibrated thresholds', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-2',
      }
      const calibrated = { act: 0.95, ask: 0.65, sampleSize: 200 }
      const result = routeAgentAction(0.1, undefined, undefined, undefined, calibrated, delegation)
      expect(result.decision).toBe('auto_delegated')
    })

    it('bypasses org-level thresholds', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-3',
      }
      const orgSettings = { confidence_thresholds: { act: 0.99, ask: 0.80 } }
      const result = routeAgentAction(0.2, undefined, orgSettings, undefined, undefined, delegation)
      expect(result.decision).toBe('auto_delegated')
    })

    it('uses default thresholds in the result (not evaluated)', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-4',
      }
      const result = routeAgentAction(0.5, undefined, undefined, undefined, undefined, delegation)
      expect(result.thresholds).toEqual(DEFAULT_THRESHOLDS)
      expect(result.thresholdSource).toBe('defaults')
    })

    it('handles missing entityId gracefully', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
      }
      const result = routeAgentAction(0.3, undefined, undefined, undefined, undefined, delegation)
      expect(result.decision).toBe('auto_delegated')
      expect(result.reasoning).toContain('unknown')
    })
  })

  describe('supervised mandate', () => {
    it('lowers thresholds by 20% to make auto-act easier', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-5',
      }
      // Default act = 0.85 → supervised act = 0.68
      // Confidence 0.70 would normally be 'ask' but should now be 'act'
      const result = routeAgentAction(0.70, undefined, undefined, undefined, undefined, delegation)
      expect(result.decision).toBe('act')
    })

    it('still routes to ask when confidence is in the reduced ask range', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-6',
      }
      // Default ask = 0.55 → supervised ask = 0.44
      // Confidence 0.50 should be 'ask' (between 0.44 and 0.68)
      const result = routeAgentAction(0.50, undefined, undefined, undefined, undefined, delegation)
      expect(result.decision).toBe('ask')
    })

    it('still escalates when confidence is very low', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-7',
      }
      // Default ask = 0.55 → supervised ask = 0.44
      // Confidence 0.30 should still escalate
      const result = routeAgentAction(0.30, undefined, undefined, undefined, undefined, delegation)
      expect(result.decision).toBe('escalate')
    })

    it('applies 20% reduction to agent-type thresholds', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-8',
      }
      // invoice-flow act = 0.92 → supervised = 0.736
      const result = routeAgentAction(0.75, undefined, undefined, 'invoice-flow', undefined, delegation)
      expect(result.decision).toBe('act')
      expect(result.thresholdSource).toBe('agent_type')
    })
  })

  describe('standard mandate', () => {
    it('applies no reduction — routes normally', () => {
      const delegation: EntityDelegation = {
        mandate: 'standard',
        entityId: 'entity-9',
      }
      // Default thresholds apply unchanged
      const result = routeAgentAction(0.70, undefined, undefined, undefined, undefined, delegation)
      expect(result.decision).toBe('ask')
    })

    it('behaves identically to no delegation', () => {
      const delegation: EntityDelegation = { mandate: 'standard' }
      const withDelegation = routeAgentAction(0.90, undefined, undefined, undefined, undefined, delegation)
      const withoutDelegation = routeAgentAction(0.90)
      expect(withDelegation.decision).toBe(withoutDelegation.decision)
      expect(withDelegation.thresholdSource).toBe(withoutDelegation.thresholdSource)
    })
  })

  describe('no delegation (undefined)', () => {
    it('falls through to standard routing', () => {
      const result = routeAgentAction(0.90)
      expect(result.decision).toBe('act')
      expect(result.thresholdSource).toBe('defaults')
    })
  })
})

// ---------------------------------------------------------------------------
// Autonomy Levels — Delegation Support Tests
// ---------------------------------------------------------------------------

describe('autonomy-levels delegation support', () => {
  describe('infinite_autopilot mandate', () => {
    it('auto-executes L4 (silent) tools', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-10',
      }
      const result = shouldAutoExecute('search_memory', 0.9, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.reason).toContain('infinite_autopilot')
    })

    it('auto-executes L3 (notify) tools even with low confidence', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-11',
      }
      const result = shouldAutoExecute('create_task', 0.2, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.notify).toBe(true)
      expect(result.reason).toContain('infinite_autopilot')
    })

    it('auto-executes L2 (propose) tools — bypasses consequential gate', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-12',
      }
      const result = shouldAutoExecute('send_email', 0.3, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.reason).toContain('infinite_autopilot')
    })

    it('auto-executes L1 (approve) tools — full bypass', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-13',
      }
      // L1 tools normally always require approval, but infinite_autopilot overrides
      const result = shouldAutoExecute('approve_action', 0.5, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.reason).toContain('infinite_autopilot')
    })

    it('includes entity ID in reasoning', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
        entityId: 'entity-99',
      }
      const result = shouldAutoExecute('send_email', 0.5, null, delegation)
      expect(result.reason).toContain('entity-99')
    })

    it('handles missing entityId gracefully', () => {
      const delegation: EntityDelegation = {
        mandate: 'infinite_autopilot',
      }
      const result = shouldAutoExecute('send_email', 0.5, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.reason).toContain('unknown')
    })
  })

  describe('supervised mandate', () => {
    it('promotes L2 tools to auto-execute with sufficient confidence', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-14',
      }
      const result = shouldAutoExecute('send_email', 0.7, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.notify).toBe(true)
      expect(result.reason).toContain('Supervised delegation')
      expect(result.reason).toContain('L2→L3')
    })

    it('does not promote L2 tools with low confidence', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-15',
      }
      const result = shouldAutoExecute('send_email', 0.3, null, delegation)
      expect(result.execute).toBe(false)
      expect(result.reason).toContain('Supervised delegation')
      expect(result.reason).toContain('confidence too low')
    })

    it('does NOT promote L1 tools — still requires approval', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-16',
      }
      // approve_action is L2 in our map, but if we had an L1 tool it shouldn't be promoted
      // L1 tools stay as L1 under supervised mandate — they are not promoted
      // Since approve_action is actually L2, let's use a custom override to test L1
      const orgOverrides: OrgAutonomyOverrides = {
        autonomy_overrides: { custom_payment: 'L1_approve' },
      }
      const result = shouldAutoExecute('custom_payment', 0.9, orgOverrides, delegation)
      expect(result.execute).toBe(false)
      expect(result.reason).toContain('L1 (approve)')
    })

    it('does not affect L4 tools — they remain auto-execute', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-17',
      }
      const result = shouldAutoExecute('search_memory', 0.9, null, delegation)
      expect(result.execute).toBe(true)
      expect(result.notify).toBe(false) // L4 is silent
    })

    it('does not affect L3 tools — they follow normal confidence check', () => {
      const delegation: EntityDelegation = {
        mandate: 'supervised',
        entityId: 'entity-18',
      }
      const result = shouldAutoExecute('create_task', 0.3, null, delegation)
      // L3 with low confidence (0.3 <= 0.5) should not execute
      expect(result.execute).toBe(false)
    })
  })

  describe('standard mandate', () => {
    it('does not affect routing — L2 still requires approval', () => {
      const delegation: EntityDelegation = {
        mandate: 'standard',
        entityId: 'entity-19',
      }
      const result = shouldAutoExecute('send_email', 0.9, null, delegation)
      expect(result.execute).toBe(false)
      expect(result.reason).toContain('L2 (propose)')
    })
  })

  describe('no delegation (undefined/null)', () => {
    it('falls through to standard autonomy routing', () => {
      const result = shouldAutoExecute('send_email', 0.9, null, undefined)
      expect(result.execute).toBe(false)
      expect(result.reason).toContain('L2 (propose)')
    })

    it('null delegation is treated same as undefined', () => {
      const result = shouldAutoExecute('send_email', 0.9, null, null)
      expect(result.execute).toBe(false)
      expect(result.reason).toContain('L2 (propose)')
    })
  })
})

// ---------------------------------------------------------------------------
// Integration — Confidence Router + Autonomy Levels coherence
// ---------------------------------------------------------------------------

describe('delegation coherence between confidence router and autonomy levels', () => {
  it('both systems agree on auto_delegated/execute for infinite_autopilot', () => {
    const delegation: EntityDelegation = {
      mandate: 'infinite_autopilot',
      entityId: 'entity-coherence-1',
    }

    const routerResult = routeAgentAction(0.3, undefined, undefined, undefined, undefined, delegation)
    const autonomyResult = shouldAutoExecute('send_email', 0.3, null, delegation)

    expect(routerResult.decision).toBe('auto_delegated')
    expect(autonomyResult.execute).toBe(true)
  })

  it('standard mandate: both use normal routing', () => {
    const delegation: EntityDelegation = {
      mandate: 'standard',
      entityId: 'entity-coherence-2',
    }

    const routerResult = routeAgentAction(0.7, undefined, undefined, undefined, undefined, delegation)
    const autonomyResult = shouldAutoExecute('send_email', 0.7, null, delegation)

    // Router says 'ask' (0.7 between default ask/act)
    expect(routerResult.decision).toBe('ask')
    // Autonomy says no (L2 doesn't auto-execute under standard mandate)
    expect(autonomyResult.execute).toBe(false)
  })

  it('supervised mandate: both loosen controls consistently', () => {
    const delegation: EntityDelegation = {
      mandate: 'supervised',
      entityId: 'entity-coherence-3',
    }

    // Confidence 0.70 — under supervised, router act threshold drops to 0.68
    const routerResult = routeAgentAction(0.70, undefined, undefined, undefined, undefined, delegation)
    // Autonomy promotes L2 to L3, and 0.70 > 0.5
    const autonomyResult = shouldAutoExecute('send_email', 0.70, null, delegation)

    expect(routerResult.decision).toBe('act')
    expect(autonomyResult.execute).toBe(true)
  })
})
