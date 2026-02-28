import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canProceed } from './cost-guard'

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
