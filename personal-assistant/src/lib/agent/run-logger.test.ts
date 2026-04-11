import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estimateRunCost, logAgentRun, getRecentRuns } from './run-logger'

function createMockSupabase() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {}
  const chainMethods = ['from', 'select', 'insert', 'eq', 'order', 'limit']
  for (const m of chainMethods) {
    mock[m] = vi.fn().mockImplementation(() => mock)
  }
  mock.single = vi.fn()
  return mock
}

describe('run-logger', () => {
  describe('estimateRunCost', () => {
    it('calculates classification cost correctly', () => {
      const cost = estimateRunCost(1000, 500, 'classification')
      expect(cost).toBeGreaterThan(0)
    })

    it('calculates conversation cost correctly', () => {
      const cost = estimateRunCost(1_000_000, 1_000_000, 'conversation')
      expect(cost).toBeGreaterThan(0)
    })

    it('calculates synthesis cost correctly', () => {
      const cost = estimateRunCost(10000, 5000, 'synthesis')
      expect(cost).toBeGreaterThan(0)
    })

    it('returns 0 for zero tokens', () => {
      expect(estimateRunCost(0, 0, 'classification')).toBe(0)
    })
  })

  describe('logAgentRun', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    const sampleRun = {
      org_id: 'org-1',
      agent_config_id: 'agent-1',
      trigger_type: 'manual' as const,
      status: 'success',
      result_summary: 'Test output',
      model_purpose: 'conversation' as const,
      tokens_in: 1000,
      tokens_out: 500,
      cost_estimate: estimateRunCost(1000, 500, 'conversation'),
      duration_ms: 3000,
      tool_calls: 1,
      iterations: 1,
    }

    it('inserts into agent_runs table with cost_estimate', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'run-1' }, error: null })

      const result = await logAgentRun(mockSupabase as any, sampleRun)

      expect(result).toEqual({ id: 'run-1' })
      expect(mockSupabase.from).toHaveBeenCalledWith('agent_runs')
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-1',
          tokens_in: 1000,
          tokens_out: 500,
          model_used: 'conversation',
          cost_estimate: estimateRunCost(1000, 500, 'conversation'),
        }),
      )
    })

    it('returns null on Supabase error without throwing', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })

      const result = await logAgentRun(mockSupabase as any, sampleRun)

      expect(result).toBeNull()
      spy.mockRestore()
    })

    it('returns null on unexpected exception without throwing', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.single.mockRejectedValueOnce(new Error('network down'))

      const result = await logAgentRun(mockSupabase as any, sampleRun)

      expect(result).toBeNull()
      spy.mockRestore()
    })
  })

  describe('getRecentRuns', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('queries with correct org_id, ordering, and limit', async () => {
      const runs = [{ id: 'r1' }, { id: 'r2' }]
      mockSupabase.limit.mockResolvedValueOnce({ data: runs, error: null })

      const result = await getRecentRuns(mockSupabase as any, 'org-1', 10)

      expect(result).toEqual(runs)
      expect(mockSupabase.from).toHaveBeenCalledWith('agent_runs')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', 'org-1')
      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockSupabase.limit).toHaveBeenCalledWith(10)
    })

    it('uses default limit of 20', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      await getRecentRuns(mockSupabase as any, 'org-1')

      expect(mockSupabase.limit).toHaveBeenCalledWith(20)
    })

    it('returns empty array on error', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: 'fail' } })

      const result = await getRecentRuns(mockSupabase as any, 'org-1')

      expect(result).toEqual([])
      spy.mockRestore()
    })
  })
})
