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

  return {
    from: vi.fn((table: string) => {
      if (table === 'action_outcomes') return actionChain
      if (table === 'delegation_action_log') return delegationChain
      return actionChain
    }),
    _actionChain: actionChain,
    _delegationChain: delegationChain,
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

function makeDelegationAction() {
  return {
    action_type: 'send_email',
    financial_impact: null,
    created_at: new Date().toISOString(),
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

  it('computes entity trust score from delegation action count', async () => {
    const actions = Array.from({ length: 15 }, makeDelegationAction)
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.75) // 15/20
    expect(result.sampleSize).toBe(15)
    expect(result.gate).toBe('allow') // 0.75 >= 0.6
  })

  it('caps entity trust at 1.0 for 20+ actions', async () => {
    const actions = Array.from({ length: 25 }, makeDelegationAction)
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getEntityTrustScore(sb, { orgId: 'org-1', entityId: 'ent-1' })
    expect(result.score).toBe(1.0)
  })

  it('returns NEUTRAL_TRUST on database error', async () => {
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

  it('uses entity score when only entity has sufficient data', async () => {
    const actions = Array.from({ length: 10 }, makeDelegationAction)
    const sb = mockSupabase({ delegationActions: actions })

    const result = await getCompositeTrustScore(sb, {
      orgId: 'org-1',
      entityId: 'ent-1',
    })

    expect(result.sufficient).toBe(true)
    expect(result.score).toBe(0.5) // 10/20
  })

  it('takes minimum of skill and entity scores (conservative)', async () => {
    // Skill: 100% approved → score 1.0
    const outcomes = Array.from({ length: 10 }, () => makeOutcome({ was_approved: true }))
    // Entity: 10 actions → score 0.5
    const actions = Array.from({ length: 10 }, makeDelegationAction)

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
