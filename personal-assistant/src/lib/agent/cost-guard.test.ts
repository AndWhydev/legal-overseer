import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canProceed, checkRoleBudget, getExecutionTokenCap, ROLE_BUDGET_CONFIG } from './cost-guard'

// Mock usage-metering for role budget tests
vi.mock('@/lib/billing/usage-metering', () => ({
  getRoleUsageToday: vi.fn(),
  trackUsage: vi.fn(),
  getUsage: vi.fn(),
}))

import { getRoleUsageToday } from '@/lib/billing/usage-metering'

const mockGetRoleUsageToday = vi.mocked(getRoleUsageToday)

function createMockSupabase() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {}
  const chainMethods = ['from', 'select', 'insert', 'eq', 'gte', 'order', 'limit']
  for (const m of chainMethods) {
    mock[m] = vi.fn().mockImplementation(() => mock)
  }
  mock.single = vi.fn()
  return mock
}

describe('cost-guard', () => {
  describe('canProceed', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('allows proceeding when spent is below daily limit', async () => {
      // org_settings returns limit of 50
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      // agent_runs returns spent of 20
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          { cost_estimate: 10 },
          { cost_estimate: 10 },
        ],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.allowed).toBe(true)
      expect(result.dailyLimit).toBe(50)
      expect(result.spentToday).toBe(20)
      expect(result.remainingBudget).toBe(30)
      expect(result.reason).toBeUndefined()
    })

    it('blocks proceeding when spent equals or exceeds daily limit', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [{ cost_estimate: 50 }],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.allowed).toBe(false)
      expect(result.dailyLimit).toBe(50)
      expect(result.spentToday).toBe(50)
      expect(result.remainingBudget).toBe(0)
      expect(result.reason).toContain('Daily cost limit $50 reached')
    })

    it('uses default limit when org_settings row is missing', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [{ cost_estimate: 5 }],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.dailyLimit).toBe(10.0) // DEFAULT_DAILY_LIMIT
      expect(result.spentToday).toBe(5)
      expect(result.allowed).toBe(true)
    })

    it('uses default limit when daily_cost_limit is null or zero', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 0 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.dailyLimit).toBe(10.0)
      expect(result.spentToday).toBe(0)
      expect(result.allowed).toBe(true)
    })

    it('sums all agent_runs cost_estimate correctly', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 100 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          { cost_estimate: 10.5 },
          { cost_estimate: 20.3 },
          { cost_estimate: 5.2 },
        ],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.spentToday).toBeCloseTo(36, 0)
      expect(result.remainingBudget).toBeCloseTo(64, 0)
    })

    it('handles null cost_estimate values by treating as zero', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          { cost_estimate: 10 },
          { cost_estimate: null },
          { cost_estimate: 15 },
        ],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.spentToday).toBe(25)
      expect(result.allowed).toBe(true)
    })

    it('returns empty array when no runs exist today', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.spentToday).toBe(0)
      expect(result.allowed).toBe(true)
    })

    it('fails open (allows proceeding) when org_settings query fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSupabase.single.mockRejectedValueOnce(new Error('Table does not exist'))
      mockSupabase.gte.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.dailyLimit).toBe(10.0) // Falls back to default
      expect(result.allowed).toBe(true)
      spy.mockRestore()
    })

    it('fails open (allows proceeding) when agent_runs query fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      mockSupabase.gte.mockRejectedValueOnce(new Error('Network error'))

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.spentToday).toBe(0)
      expect(result.allowed).toBe(true)
      spy.mockRestore()
    })

    it('queries agent_runs with correct org_id and date range', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await canProceed(mockSupabase as any, 'org-test-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('agent_runs')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', 'org-test-123')
      // gte should be called with 'created_at' and a date string starting at 00:00:00 UTC
      const gteCall = mockSupabase.gte.mock.calls[0]
      expect(gteCall?.[0]).toBe('created_at')
      expect(typeof gteCall?.[1]).toBe('string')
      expect(gteCall?.[1]).toMatch(/T00:00:00\.000Z$/)
    })

    it('returns reason string with formatted cost amounts', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50.5 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          { cost_estimate: 25.25 },
          { cost_estimate: 25.25 },
        ],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('$50.5')
      expect(result.reason).toContain('$50.50')
    })

    it('remainingBudget never goes negative', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { daily_cost_limit: 50 },
        error: null,
      })
      mockSupabase.gte.mockResolvedValueOnce({
        data: [{ cost_estimate: 100 }],
        error: null,
      })

      const result = await canProceed(mockSupabase as any, 'org-1')

      expect(result.remainingBudget).toBe(0)
      expect(result.allowed).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Per-role budget tests
// ---------------------------------------------------------------------------

describe('ROLE_BUDGET_CONFIG', () => {
  it('has entries for ads, seo, content, tenders', () => {
    expect(ROLE_BUDGET_CONFIG).toHaveProperty('ads')
    expect(ROLE_BUDGET_CONFIG).toHaveProperty('seo')
    expect(ROLE_BUDGET_CONFIG).toHaveProperty('content')
    expect(ROLE_BUDGET_CONFIG).toHaveProperty('tenders')
  })

  it('ads: 50K per exec, 500K daily', () => {
    expect(ROLE_BUDGET_CONFIG.ads.maxTokensPerExecution).toBe(50_000)
    expect(ROLE_BUDGET_CONFIG.ads.dailyTokenBudget).toBe(500_000)
  })

  it('seo: 30K per exec, 300K daily', () => {
    expect(ROLE_BUDGET_CONFIG.seo.maxTokensPerExecution).toBe(30_000)
    expect(ROLE_BUDGET_CONFIG.seo.dailyTokenBudget).toBe(300_000)
  })

  it('content: 80K per exec, 800K daily', () => {
    expect(ROLE_BUDGET_CONFIG.content.maxTokensPerExecution).toBe(80_000)
    expect(ROLE_BUDGET_CONFIG.content.dailyTokenBudget).toBe(800_000)
  })

  it('tenders: 60K per exec, 600K daily', () => {
    expect(ROLE_BUDGET_CONFIG.tenders.maxTokensPerExecution).toBe(60_000)
    expect(ROLE_BUDGET_CONFIG.tenders.dailyTokenBudget).toBe(600_000)
  })

  it('all roles have warningThresholdPct of 0.8', () => {
    for (const role of ['ads', 'seo', 'content', 'tenders'] as const) {
      expect(ROLE_BUDGET_CONFIG[role].warningThresholdPct).toBe(0.8)
    }
  })
})

describe('checkRoleBudget', () => {
  const roleMockSupabase = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns allowed=true, warning=false when usage is below 80% of daily budget', async () => {
    mockGetRoleUsageToday.mockResolvedValue(100_000) // 20% of 500K ads budget
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'ads')
    expect(result.allowed).toBe(true)
    expect(result.warning).toBe(false)
    expect(result.dailyUsed).toBe(100_000)
    expect(result.dailyLimit).toBe(500_000)
    expect(result.remainingTokens).toBe(400_000)
  })

  it('returns allowed=true, warning=true when usage is 80-99% of daily budget', async () => {
    mockGetRoleUsageToday.mockResolvedValue(420_000) // 84% of 500K ads budget
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'ads')
    expect(result.allowed).toBe(true)
    expect(result.warning).toBe(true)
    expect(result.dailyUsed).toBe(420_000)
    expect(result.remainingTokens).toBe(80_000)
  })

  it('returns allowed=false when usage >= 100% of daily budget', async () => {
    mockGetRoleUsageToday.mockResolvedValue(500_000) // 100% of 500K ads budget
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'ads')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('ads')
    expect(result.reason).toContain('exhausted')
  })

  it('returns allowed=false when usage exceeds daily budget', async () => {
    mockGetRoleUsageToday.mockResolvedValue(600_000) // 120% of 500K ads budget
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'ads')
    expect(result.allowed).toBe(false)
  })

  it('returns allowed=true for unknown roles (non-growth tools are unbounded)', async () => {
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'unknown_role')
    expect(result.allowed).toBe(true)
    expect(result.warning).toBe(false)
    expect(result.dailyLimit).toBe(Infinity)
    expect(result.remainingTokens).toBe(Infinity)
  })

  it('returns allowed=true when no usage events exist (0 usage)', async () => {
    mockGetRoleUsageToday.mockResolvedValue(0)
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'seo')
    expect(result.allowed).toBe(true)
    expect(result.warning).toBe(false)
    expect(result.dailyUsed).toBe(0)
    expect(result.dailyLimit).toBe(300_000)
  })

  it('returns warning=true at exactly 80% threshold', async () => {
    mockGetRoleUsageToday.mockResolvedValue(400_000) // exactly 80% of 500K
    const result = await checkRoleBudget(roleMockSupabase, 'org-1', 'ads')
    expect(result.allowed).toBe(true)
    expect(result.warning).toBe(true)
  })

  it('works for all known roles', async () => {
    for (const role of ['ads', 'seo', 'content', 'tenders']) {
      mockGetRoleUsageToday.mockResolvedValue(0)
      const result = await checkRoleBudget(roleMockSupabase, 'org-1', role)
      expect(result.allowed).toBe(true)
      expect(result.dailyLimit).toBe(ROLE_BUDGET_CONFIG[role].dailyTokenBudget)
    }
  })
})

describe('getExecutionTokenCap', () => {
  it('returns maxTokensPerExecution for known roles', () => {
    expect(getExecutionTokenCap('ads')).toBe(50_000)
    expect(getExecutionTokenCap('seo')).toBe(30_000)
    expect(getExecutionTokenCap('content')).toBe(80_000)
    expect(getExecutionTokenCap('tenders')).toBe(60_000)
  })

  it('returns undefined for unknown roles', () => {
    expect(getExecutionTokenCap('search_tasks')).toBeUndefined()
    expect(getExecutionTokenCap('random')).toBeUndefined()
  })
})
