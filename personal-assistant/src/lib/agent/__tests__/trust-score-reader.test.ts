/**
 * Trust Score Reader Tests
 *
 * Tests the trust-score reading logic that feeds historical execution data
 * into autonomy gating decisions — turning theater into real data-driven gating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  getSkillTrustScore,
  getEntityTrustScore,
  getCompositeTrustScore,
  adjustConfidenceByTrust,
  computeTrustFromOutcomes,
  computeEntityTrustFromOutcomes,
  NEUTRAL_TRUST,
  MIN_TRUST_SAMPLES,
  TRUST_APPROVAL_THRESHOLD,
  TRUST_BLOCK_THRESHOLD,
  PROMOTION_STREAK_THRESHOLD,
  type TrustScore,
} from '../trust-score-reader'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSupabase(overrides?: {
  actionOutcomes?: unknown[]
  actionOutcomesError?: { message: string }
  delegationActions?: unknown[]
  delegationActionsError?: { message: string }
  entityOutcomes?: unknown[]
  entityOutcomesError?: { message: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const actionChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      data: overrides?.actionOutcomes ?? [],
      error: overrides?.actionOutcomesError ?? null,
    }),
  }

  const delegationChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      data: overrides?.delegationActions ?? [],
      error: overrides?.delegationActionsError ?? null,
    }),
  }

  const entityOutcomeChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      data: overrides?.entityOutcomes ?? [],
      error: overrides?.entityOutcomesError ?? null,
    }),
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'action_outcomes') return actionChain
      if (table === 'delegation_action_log') return delegationChain
      if (table === 'agent_action_outcomes') return entityOutcomeChain
      return actionChain
    }),
    _actionChain: actionChain,
    _delegationChain: delegationChain,
    _entityOutcomeChain: entityOutcomeChain,
  }
}

function makeOutcome(overrides?: {
  was_approved?: boolean
  was_correct?: boolean | null
  confidence_score?: number
}) {
  return {
    was_approved: overrides?.was_approved ?? true,
    was_correct: overrides?.was_correct ?? null,
    confidence_score: overrides?.confidence_score ?? 0.85,
    created_at: new Date().toISOString(),
  }
}

let delegationActionCounter = 0

function makeDelegationAction(overrides?: { agent_run_id?: string | null }) {
  delegationActionCounter++
  return {
    action_type: 'send_email',
    financial_impact: null,
    agent_run_id: overrides && 'agent_run_id' in overrides
      ? overrides.agent_run_id
      : `run-${delegationActionCounter}`,
    created_at: new Date().toISOString(),
  }
}

function makeEntityOutcome(overrides?: {
  outcome?: string
  created_at?: string
  agent_run_id?: string
}) {
  return {
    outcome: overrides?.outcome ?? 'success',
    action_type: 'send_email',
    created_at: overrides?.created_at ?? new Date().toISOString(),
    agent_run_id: overrides?.agent_run_id ?? `run-${delegationActionCounter}`,
  }
}

// ---------------------------------------------------------------------------
// computeTrustFromOutcomes (pure function, no DB)
// ---------------------------------------------------------------------------

describe('computeTrustFromOutcomes', () => {
  it('returns NEUTRAL_TRUST for empty outcomes', () => {
    const result = computeTrustFromOutcomes([], 'test')
    expect(result.score).toBe(NEUTRAL_TRUST.score)
    expect(result.sampleSize).toBe(0)
  })

  it('computes 100% trust when all outcomes approved', () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: true }))
    const result = computeTrustFromOutcomes(outcomes, 'send_email')
    expect(result.score).toBe(1.0)
    expect(result.sampleSize).toBe(10)
    expect(result.sufficient).toBe(true)
    expect(result.gate).toBe('allow')
  })

  it('computes 0% trust when no outcomes approved', () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: false }))
    const result = computeTrustFromOutcomes(outcomes, 'send_email')
    expect(result.score).toBe(0)
    expect(result.gate).toBe('block')
  })

  it('computes mixed trust correctly', () => {
    const outcomes = [
      ...Array.from({ length: 7 }, () => makeOutcome({ was_approved: true })),
      ...Array.from({ length: 3 }, () => makeOutcome({ was_approved: false })),
    ]
    const result = computeTrustFromOutcomes(outcomes, 'send_email')
    expect(result.score).toBe(0.7) // 7/10
    expect(result.gate).toBe('allow') // 0.7 >= TRUST_APPROVAL_THRESHOLD (0.6)
  })

  it('blends correctness when available (60% approval, 40% correctness)', () => {
    const outcomes = [
      makeOutcome({ was_approved: true, was_correct: true }),
      makeOutcome({ was_approved: true, was_correct: true }),
      makeOutcome({ was_approved: true, was_correct: false }),
      makeOutcome({ was_approved: false, was_correct: false }),
      makeOutcome({ was_approved: false, was_correct: false }),
    ]
    const result = computeTrustFromOutcomes(outcomes, 'send_email')
    // approvalRate = 3/5 = 0.6
    // correctRate = 2/5 = 0.4
    // score = 0.6 * 0.6 + 0.4 * 0.4 = 0.36 + 0.16 = 0.52
    expect(result.score).toBeCloseTo(0.52, 2)
    expect(result.gate).toBe('require_approval') // below 0.6
  })

  it('calculates streak from consecutive recent approvals', () => {
    const outcomes = [
      makeOutcome({ was_approved: true }),
      makeOutcome({ was_approved: true }),
      makeOutcome({ was_approved: true }),
      makeOutcome({ was_approved: false }), // breaks streak
      makeOutcome({ was_approved: true }),
    ]
    const result = computeTrustFromOutcomes(outcomes, 'send_email')
    expect(result.streak).toBe(3)
  })

  it('returns insufficient when below MIN_TRUST_SAMPLES', () => {
    const outcomes = [
      makeOutcome({ was_approved: true }),
      makeOutcome({ was_approved: true }),
    ]
    const result = computeTrustFromOutcomes(outcomes, 'send_email')
    expect(result.sufficient).toBe(false)
    // Gate should be 'allow' when insufficient (don't restrict without evidence)
    expect(result.gate).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// computeEntityTrustFromOutcomes (pure function, no DB)
// ---------------------------------------------------------------------------

describe('computeEntityTrustFromOutcomes', () => {
  it('returns NEUTRAL_TRUST for empty outcomes', () => {
    const result = computeEntityTrustFromOutcomes([], 10, 'ent-1')
    expect(result.score).toBe(NEUTRAL_TRUST.score)
    expect(result.sampleSize).toBe(0)
  })

  it('scores ~1.0 for all-success outcomes', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      outcome: 'success',
      created_at: new Date().toISOString(),
    }))
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    expect(result.score).toBeGreaterThan(0.95)
    expect(result.sufficient).toBe(true)
    expect(result.gate).toBe('allow')
  })

  it('scores ~0.0 for all-failure outcomes', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      outcome: 'failure',
      created_at: new Date().toISOString(),
    }))
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    expect(result.score).toBeLessThan(0.05)
    expect(result.gate).toBe('block')
  })

  it('scores ~0.5 for 50/50 success/failure', () => {
    const outcomes = [
      ...Array.from({ length: 5 }, () => ({
        outcome: 'success',
        created_at: new Date().toISOString(),
      })),
      ...Array.from({ length: 5 }, () => ({
        outcome: 'failure',
        created_at: new Date().toISOString(),
      })),
    ]
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    expect(result.score).toBeCloseTo(0.5, 1)
    expect(result.gate).toBe('require_approval')
  })

  it('weighs "corrected" as 0.7 (partial success)', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      outcome: 'corrected',
      created_at: new Date().toISOString(),
    }))
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    expect(result.score).toBeCloseTo(0.7, 1)
    expect(result.gate).toBe('allow')
  })

  it('weighs "partial" as 0.5', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      outcome: 'partial',
      created_at: new Date().toISOString(),
    }))
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    expect(result.score).toBeCloseTo(0.5, 1)
  })

  it('applies recency weighting (recent successes matter more)', () => {
    const now = Date.now()
    // Old failures (28 days ago) + recent successes (today)
    const outcomes = [
      ...Array.from({ length: 5 }, () => ({
        outcome: 'success',
        created_at: new Date(now).toISOString(),
      })),
      ...Array.from({ length: 5 }, () => ({
        outcome: 'failure',
        created_at: new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString(),
      })),
    ]
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    // Recent successes should outweigh old failures
    expect(result.score).toBeGreaterThan(0.7)
  })

  it('calculates streak from consecutive successes/corrected', () => {
    const outcomes = [
      { outcome: 'success', created_at: new Date().toISOString() },
      { outcome: 'corrected', created_at: new Date().toISOString() },
      { outcome: 'success', created_at: new Date().toISOString() },
      { outcome: 'failure', created_at: new Date().toISOString() }, // breaks streak
      { outcome: 'success', created_at: new Date().toISOString() },
    ]
    const result = computeEntityTrustFromOutcomes(outcomes, 5, 'ent-1')
    expect(result.streak).toBe(3)
  })

  it('reports insufficient when below MIN_TRUST_SAMPLES', () => {
    const outcomes = [
      { outcome: 'success', created_at: new Date().toISOString() },
      { outcome: 'success', created_at: new Date().toISOString() },
    ]
    const result = computeEntityTrustFromOutcomes(outcomes, 2, 'ent-1')
    expect(result.sufficient).toBe(false)
    expect(result.gate).toBe('allow') // fail-open
  })

  it('includes entityId in reasoning string', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      outcome: 'success',
      created_at: new Date().toISOString(),
    }))
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-42')
    expect(result.reasoning).toContain('ent-42')
  })

  it('handles unknown outcomes as neutral (0.5)', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      outcome: 'unknown',
      created_at: new Date().toISOString(),
    }))
    const result = computeEntityTrustFromOutcomes(outcomes, 10, 'ent-1')
    expect(result.score).toBeCloseTo(0.5, 1)
  })
})

// ---------------------------------------------------------------------------
// getSkillTrustScore
// ---------------------------------------------------------------------------

describe('getSkillTrustScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns NEUTRAL_TRUST when no actionType provided', async () => {
    const sb = mockSupabase()
    const result = await getSkillTrustScore(sb, { orgId: 'org-1' })
    expect(result).toEqual(NEUTRAL_TRUST)
    expect(sb.from).not.toHaveBeenCalled()
  })

  it('returns NEUTRAL_TRUST when insufficient samples', async () => {
    const sb = mockSupabase({
      actionOutcomes: [makeOutcome(), makeOutcome()], // 2 < MIN_TRUST_SAMPLES
    })
    const result = await getSkillTrustScore(sb, { orgId: 'org-1', actionType: 'send_email' })
    expect(result.sufficient).toBe(false)
    expect(result.sampleSize).toBe(2)
    expect(result.gate).toBe('allow')
  })

  it('computes trust score when sufficient data exists', async () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: true }))
    const sb = mockSupabase({ actionOutcomes: outcomes })

    const result = await getSkillTrustScore(sb, { orgId: 'org-1', actionType: 'send_email' })

    expect(result.score).toBe(1.0)
    expect(result.sufficient).toBe(true)
    expect(result.sampleSize).toBe(10)
    expect(result.gate).toBe('allow')
  })

  it('queries with agent_type filter when provided', async () => {
    const outcomes = Array.from({ length: 8 }, () => makeOutcome())
    const sb = mockSupabase({ actionOutcomes: outcomes })

    await getSkillTrustScore(sb, {
      orgId: 'org-1',
      actionType: 'send_email',
      agentType: 'invoice-flow',
    })

    // Verify all .eq() calls include the agent_type filter
    const eqCalls = sb._actionChain.eq.mock.calls as [string, string][]
    const agentTypeCall = eqCalls.find(([col]) => col === 'agent_type')
    expect(agentTypeCall).toBeDefined()
    expect(agentTypeCall![1]).toBe('invoice-flow')
  })

  it('returns NEUTRAL_TRUST on database error', async () => {
    const sb = mockSupabase({ actionOutcomesError: { message: 'DB connection lost' } })
    const result = await getSkillTrustScore(sb, { orgId: 'org-1', actionType: 'send_email' })
    expect(result).toEqual(NEUTRAL_TRUST)
  })

  it('returns NEUTRAL_TRUST on thrown exception', async () => {
    const sb = {
      from: vi.fn(() => { throw new Error('Unexpected failure') }),
    }
    const result = await getSkillTrustScore(sb as never, { orgId: 'org-1', actionType: 'send_email' })
    expect(result).toEqual(NEUTRAL_TRUST)
  })
})

// ---------------------------------------------------------------------------
// getEntityTrustScore
// ---------------------------------------------------------------------------

describe('getEntityTrustScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delegationActionCounter = 0
  })

  it('returns NEUTRAL_TRUST when no entityId provided', async () => {
    const sb = mockSupabase()
    const result = await getEntityTrustScore(sb, { orgId: 'org-1' })
    expect(result).toEqual(NEUTRAL_TRUST)
  })

  it('returns NEUTRAL_TRUST when insufficient delegation actions', async () => {
    const sb = mockSupabase({
      delegationActions: [makeDelegationAction()],
    })
    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })
    expect(result.sufficient).toBe(false)
  })

  it('uses outcome-based trust when agent_action_outcomes data exists', async () => {
    const actions = Array.from({ length: 10 }, () => makeDelegationAction())
    const outcomes = Array.from({ length: 10 }, () => makeEntityOutcome({ outcome: 'success' }))
    const sb = mockSupabase({ delegationActions: actions, entityOutcomes: outcomes })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })

    expect(result.sufficient).toBe(true)
    // All success outcomes with recent timestamps → score ~1.0
    expect(result.score).toBeGreaterThan(0.95)
    expect(result.gate).toBe('allow')
    expect(sb.from).toHaveBeenCalledWith('agent_action_outcomes')
  })

  it('uses outcome-based trust with mixed outcomes', async () => {
    const actions = Array.from({ length: 10 }, () => makeDelegationAction())
    const outcomes = [
      ...Array.from({ length: 5 }, () => makeEntityOutcome({ outcome: 'success' })),
      ...Array.from({ length: 5 }, () => makeEntityOutcome({ outcome: 'failure' })),
    ]
    const sb = mockSupabase({ delegationActions: actions, entityOutcomes: outcomes })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })

    expect(result.sufficient).toBe(true)
    // 50/50 success/failure → score ~0.5
    expect(result.score).toBeCloseTo(0.5, 1)
    expect(result.gate).toBe('require_approval')
  })

  it('falls back to volume scoring when no outcome data exists', async () => {
    const actions = Array.from({ length: 15 }, () => makeDelegationAction())
    // No entityOutcomes provided → empty array
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.75) // 15/20 volume fallback
    expect(result.sampleSize).toBe(15)
    expect(result.gate).toBe('allow')
    expect(result.reasoning).toContain('no outcome data')
  })

  it('falls back to volume scoring when delegation actions have no agent_run_ids', async () => {
    const actions = Array.from({ length: 10 }, () => makeDelegationAction({ agent_run_id: null }))
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.5) // 10/20 volume fallback
    // Should NOT have queried agent_action_outcomes since there are no run_ids
    const fromCalls = sb.from.mock.calls.map((c: string[]) => c[0])
    expect(fromCalls).not.toContain('agent_action_outcomes')
  })

  it('falls back to volume scoring when outcome query fails', async () => {
    const actions = Array.from({ length: 10 }, () => makeDelegationAction())
    const sb = mockSupabase({
      delegationActions: actions,
      entityOutcomesError: { message: 'table not found' },
    })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.5) // 10/20 volume fallback
    expect(result.reasoning).toContain('no outcome data')
  })

  it('caps volume-only trust at 1.0 for 20+ actions', async () => {
    const actions = Array.from({ length: 25 }, () => makeDelegationAction())
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })
    expect(result.score).toBe(1.0)
  })

  it('returns NEUTRAL_TRUST on delegation query error', async () => {
    const sb = mockSupabase({ delegationActionsError: { message: 'table not found' } })
    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })
    expect(result).toEqual(NEUTRAL_TRUST)
  })

  it('returns NEUTRAL_TRUST on thrown exception', async () => {
    const sb = {
      from: vi.fn(() => { throw new Error('Connection refused') }),
    }
    const result = await getEntityTrustScore(sb as never, { orgId: 'org-1', entityId: 'ent-1' })
    expect(result).toEqual(NEUTRAL_TRUST)
  })
})

// ---------------------------------------------------------------------------
// getCompositeTrustScore
// ---------------------------------------------------------------------------

describe('getCompositeTrustScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns neutral when neither skill nor entity has data', async () => {
    const sb = mockSupabase()
    const result = await getCompositeTrustScore(sb, { orgId: 'org-1' })
    expect(result.sufficient).toBe(false)
    expect(result.gate).toBe('allow')
  })

  it('uses skill score when only skill has sufficient data', async () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: true }))
    const sb = mockSupabase({ actionOutcomes: outcomes })

    const result = await getCompositeTrustScore(sb, {
      orgId: 'org-1',
      actionType: 'send_email',
    })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('uses entity score when only entity has sufficient data (volume fallback)', async () => {
    const actions = Array.from({ length: 10 }, () => makeDelegationAction())
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getCompositeTrustScore(sb, {
      orgId: 'org-1',
      entityId: 'ent-1',
    })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.5) // 10/20 volume fallback (no outcomes)
  })

  it('uses entity score when entity has outcome data', async () => {
    const actions = Array.from({ length: 10 }, () => makeDelegationAction())
    const entityOutcomes = Array.from({ length: 10 }, () => makeEntityOutcome({ outcome: 'success' }))
    const sb = mockSupabase({ delegationActions: actions, entityOutcomes })

    const result = await getCompositeTrustScore(sb, {
      orgId: 'org-1',
      entityId: 'ent-1',
    })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBeGreaterThan(0.95) // all success
  })

  it('takes minimum of skill and entity scores (conservative)', async () => {
    // Skill: 100% approved → score 1.0
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: true }))
    // Entity: 10 actions with no outcomes → volume score 0.5 (10/20)
    const actions = Array.from({ length: 10 }, () => makeDelegationAction())

    const sb = mockSupabase({
      actionOutcomes: outcomes,
      delegationActions: actions,
    })

    const result = await getCompositeTrustScore(sb, {
      orgId: 'org-1',
      actionType: 'send_email',
      entityId: 'ent-1',
    })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.5) // min(1.0, 0.5)
  })
})

// ---------------------------------------------------------------------------
// adjustConfidenceByTrust
// ---------------------------------------------------------------------------

describe('adjustConfidenceByTrust', () => {
  it('returns unchanged confidence when trust data is insufficient', () => {
    const trust: TrustScore = { ...NEUTRAL_TRUST, sufficient: false }
    const { adjusted } = adjustConfidenceByTrust(0.85, trust)
    expect(adjusted).toBe(0.85)
  })

  it('boosts confidence for high trust with long streak', () => {
    const trust: TrustScore = {
      score: 0.95,
      sampleSize: 50,
      sufficient: true,
      streak: PROMOTION_STREAK_THRESHOLD + 5,
      gate: 'allow',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.83, trust)
    // boost = min(0.05, 5 * 0.005) = min(0.05, 0.025) = 0.025
    expect(adjusted).toBeCloseTo(0.855, 3)
  })

  it('caps boost at 0.05', () => {
    const trust: TrustScore = {
      score: 0.95,
      sampleSize: 100,
      sufficient: true,
      streak: PROMOTION_STREAK_THRESHOLD + 100,
      gate: 'allow',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.90, trust)
    // boost = min(0.05, 100 * 0.005) = min(0.05, 0.5) = 0.05
    expect(adjusted).toBeCloseTo(0.95, 3)
  })

  it('does not boost above 1.0', () => {
    const trust: TrustScore = {
      score: 0.95,
      sampleSize: 100,
      sufficient: true,
      streak: PROMOTION_STREAK_THRESHOLD + 100,
      gate: 'allow',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.98, trust)
    expect(adjusted).toBe(1.0)
  })

  it('penalises confidence for low trust', () => {
    const trust: TrustScore = {
      score: 0.4,
      sampleSize: 20,
      sufficient: true,
      streak: 0,
      gate: 'require_approval',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.85, trust)
    // penalty = (0.6 - 0.4) * 0.15 = 0.03
    expect(adjusted).toBeCloseTo(0.82, 2)
  })

  it('does not penalise below 0', () => {
    const trust: TrustScore = {
      score: 0.0,
      sampleSize: 20,
      sufficient: true,
      streak: 0,
      gate: 'block',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.05, trust)
    // penalty = (0.6 - 0) * 0.15 = 0.09
    expect(adjusted).toBe(0)
  })

  it('leaves confidence unchanged for normal trust range', () => {
    const trust: TrustScore = {
      score: 0.75,
      sampleSize: 20,
      sufficient: true,
      streak: 5,
      gate: 'allow',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.85, trust)
    expect(adjusted).toBe(0.85) // no adjustment
  })

  it('leaves confidence unchanged for high trust without long streak', () => {
    const trust: TrustScore = {
      score: 0.9,
      sampleSize: 20,
      sufficient: true,
      streak: 3, // below PROMOTION_STREAK_THRESHOLD
      gate: 'allow',
      reasoning: '',
    }
    const { adjusted } = adjustConfidenceByTrust(0.85, trust)
    expect(adjusted).toBe(0.85) // no boost without streak
  })
})

// ---------------------------------------------------------------------------
// Gate derivation edge cases
// ---------------------------------------------------------------------------

describe('gate derivation', () => {
  it('gates "block" for score below TRUST_BLOCK_THRESHOLD', () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: false }))
    const result = computeTrustFromOutcomes(outcomes, 'test')
    expect(result.gate).toBe('block')
  })

  it('gates "require_approval" for score between block and approval thresholds', () => {
    // 4/10 approved = 0.4 → between 0.3 (block) and 0.6 (approval)
    const outcomes = [
      ...Array.from({ length: 4 }, () => makeOutcome({ was_approved: true })),
      ...Array.from({ length: 6 }, () => makeOutcome({ was_approved: false })),
    ]
    const result = computeTrustFromOutcomes(outcomes, 'test')
    expect(result.score).toBe(0.4)
    expect(result.gate).toBe('require_approval')
  })

  it('gates "allow" for score at or above TRUST_APPROVAL_THRESHOLD', () => {
    // 6/10 approved = 0.6 → exactly at approval threshold
    const outcomes = [
      ...Array.from({ length: 6 }, () => makeOutcome({ was_approved: true })),
      ...Array.from({ length: 4 }, () => makeOutcome({ was_approved: false })),
    ]
    const result = computeTrustFromOutcomes(outcomes, 'test')
    expect(result.score).toBe(0.6)
    expect(result.gate).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

describe('threshold constants', () => {
  it('MIN_TRUST_SAMPLES is 5', () => {
    expect(MIN_TRUST_SAMPLES).toBe(5)
  })

  it('TRUST_APPROVAL_THRESHOLD is 0.6', () => {
    expect(TRUST_APPROVAL_THRESHOLD).toBe(0.6)
  })

  it('TRUST_BLOCK_THRESHOLD is 0.3', () => {
    expect(TRUST_BLOCK_THRESHOLD).toBe(0.3)
  })

  it('PROMOTION_STREAK_THRESHOLD is 10', () => {
    expect(PROMOTION_STREAK_THRESHOLD).toBe(10)
  })

  it('NEUTRAL_TRUST has safe defaults', () => {
    expect(NEUTRAL_TRUST.score).toBe(1.0)
    expect(NEUTRAL_TRUST.sampleSize).toBe(0)
    expect(NEUTRAL_TRUST.sufficient).toBe(false)
    expect(NEUTRAL_TRUST.streak).toBe(0)
    expect(NEUTRAL_TRUST.gate).toBe('allow')
  })
})
