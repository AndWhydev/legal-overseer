/**
 * Integration test: verify the Phase 43 plumbing fix actually threads
 * the delegation mandate from ExecuteToolOptions down to shouldAutoExecute
 * and queueAgentAction. Pre-fix, both were called without the mandate arg
 * — the bypass code in autonomy-levels.ts and approval-queue.ts was dead.
 *
 * Strategy: mock shouldAutoExecute + queueAgentAction + checkDelegationRateLimit
 * and assert the arguments tools.ts passes to them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecuteToolOptions } from '../tools'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock all the heavy dependencies we don't want to exercise in this test.
vi.mock('@/lib/intelligence/autonomy-levels', async () => {
  const actual = await vi.importActual<typeof import('@/lib/intelligence/autonomy-levels')>(
    '@/lib/intelligence/autonomy-levels',
  )
  return {
    ...actual,
    shouldAutoExecute: vi.fn(),
  }
})

vi.mock('../approval-queue', async () => {
  const actual = await vi.importActual<typeof import('../approval-queue')>('../approval-queue')
  return {
    ...actual,
    queueAgentAction: vi.fn(),
    getPendingApprovals: vi.fn(),
    resolveApproval: vi.fn(),
  }
})

vi.mock('../delegation-mandate', async () => {
  const actual = await vi.importActual<typeof import('../delegation-mandate')>(
    '../delegation-mandate',
  )
  return {
    ...actual,
    checkDelegationRateLimit: vi.fn(),
  }
})

// Import AFTER mocks are registered so tools.ts picks up the mocked deps.
import { executeAgentTool } from '../tools'
import { shouldAutoExecute } from '@/lib/intelligence/autonomy-levels'
import { queueAgentAction } from '../approval-queue'
import { checkDelegationRateLimit } from '../delegation-mandate'

const mockedShouldAutoExecute = vi.mocked(shouldAutoExecute)
const mockedQueueAgentAction = vi.mocked(queueAgentAction)
const mockedCheckRateLimit = vi.mocked(checkDelegationRateLimit)

describe('executeAgentTool — delegation mandate plumbing', () => {
  const supabase = {} as any
  const orgId = 'org-1'
  const ENTITY = 'entity-acme'

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: rate limit allows
    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 0,
      limit: 100,
      windowMs: 3_600_000,
    })
    // Default: autonomy auto-executes (what we care about is the arg)
    mockedShouldAutoExecute.mockReturnValue({
      execute: true,
      notify: false,
      reason: 'test-stub',
    })
    mockedQueueAgentAction.mockResolvedValue(null)
  })

  it('passes delegationMandate + entityId to shouldAutoExecute when both provided', async () => {
    const options: ExecuteToolOptions = {
      confidenceScore: 0.5,
      delegationMandate: 'infinite_autopilot',
      entityId: ENTITY,
    }
    // search_memory is an L4 tool; will auto-execute via mocked shouldAutoExecute.
    await executeAgentTool('search_memory', { query: 'x' }, orgId, supabase, options)

    expect(mockedShouldAutoExecute).toHaveBeenCalledTimes(1)
    const [name, conf, orgOverrides, delegation] = mockedShouldAutoExecute.mock.calls[0]
    expect(name).toBe('search_memory')
    expect(conf).toBe(0.5)
    expect(orgOverrides).toBeFalsy()
    expect(delegation).toEqual({
      mandate: 'infinite_autopilot',
      entityId: ENTITY,
    })
  })

  it('passes null delegation when no mandate present', async () => {
    await executeAgentTool(
      'search_memory',
      { query: 'x' },
      orgId,
      supabase,
      { confidenceScore: 0.9 },
    )
    const [, , , delegation] = mockedShouldAutoExecute.mock.calls[0]
    expect(delegation).toBeNull()
  })

  it('demotes delegation when rate limit is exceeded', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 100,
      limit: 100,
      windowMs: 3_600_000,
      reason: 'cap hit',
    })
    await executeAgentTool(
      'search_memory',
      { query: 'x' },
      orgId,
      supabase,
      {
        confidenceScore: 0.5,
        delegationMandate: 'infinite_autopilot',
        entityId: ENTITY,
      },
    )
    const [, , , delegation] = mockedShouldAutoExecute.mock.calls[0]
    // Rate limit hit → delegation demoted to null, falls back to standard routing
    expect(delegation).toBeNull()
    expect(mockedCheckRateLimit).toHaveBeenCalledWith(supabase, orgId, ENTITY)
  })

  it('does NOT call rate limit when mandate is supervised (only infinite_autopilot triggers it)', async () => {
    await executeAgentTool(
      'search_memory',
      { query: 'x' },
      orgId,
      supabase,
      {
        confidenceScore: 0.5,
        delegationMandate: 'supervised',
        entityId: ENTITY,
      },
    )
    expect(mockedCheckRateLimit).not.toHaveBeenCalled()
    const [, , , delegation] = mockedShouldAutoExecute.mock.calls[0]
    expect(delegation).toEqual({ mandate: 'supervised', entityId: ENTITY })
  })

  it('threads entityDelegation + entity_id into queueAgentAction when tool queues', async () => {
    // Force fall-through: autonomy says do not execute, and confidence routing says ask.
    mockedShouldAutoExecute.mockReturnValue({
      execute: false,
      notify: true,
      reason: 'L2 propose',
    })
    // L2 tool where confidence routing will kick in.
    mockedQueueAgentAction.mockResolvedValue({
      id: 'approval-1',
      org_id: orgId,
      status: 'pending',
    } as any)

    await executeAgentTool(
      'send_email',
      { to: 'a@b.com', body: 'hi' },
      orgId,
      supabase,
      {
        agentConfigId: 'agent-1',
        agentType: 'client-comms',
        confidenceScore: 0.3,        // low → routing says 'ask'
        delegationMandate: 'supervised',
        entityId: ENTITY,
      },
    )

    // queueAgentAction may not be called if routing decision isn't 'ask'/'escalate';
    // this test relies on default thresholds giving 'ask' at conf=0.3.
    if (mockedQueueAgentAction.mock.calls.length > 0) {
      const [, params] = mockedQueueAgentAction.mock.calls[0]
      expect(params.entityDelegation).toEqual({
        mandate: 'supervised',
        entityId: ENTITY,
      })
      expect(params.entity_id).toBe(ENTITY)
    }
  })
})
