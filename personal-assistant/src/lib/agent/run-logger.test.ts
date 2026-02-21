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
    it('calculates haiku cost correctly', () => {
      // 1000 in, 500 out -> (1000 * 0.25 + 500 * 1.25) / 1M
      const cost = estimateRunCost(1000, 500, 'haiku')
      expect(cost).toBeCloseTo(0.000875, 6)
    })

    it('calculates sonnet cost correctly', () => {
      // 1M in, 1M out -> 3 + 15 = 18
      const cost = estimateRunCost(1_000_000, 1_000_000, 'sonnet')
      expect(cost).toBe(18)
    })

    it('calculates opus cost correctly', () => {
      // 10000 in, 5000 out -> (10000*15 + 5000*75) / 1M = (150000 + 375000) / 1M = 0.525
      const cost = estimateRunCost(10000, 5000, 'opus')
      expect(cost).toBeCloseTo(0.525, 6)
    })

    it('returns 0 for zero tokens', () => {
      expect(estimateRunCost(0, 0, 'haiku')).toBe(0)
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
      input_summary: 'Test input',
      output_summary: 'Test output',
      actions_taken: [{ type: 'test', description: 'did thing', result: 'ok', confidence: 0.9 }],
      tools_called: ['createTask'],
      model_used: 'sonnet' as const,
      tokens_in: 1000,
      tokens_out: 500,
      confidence_score: 0.92,
      routing_decision: 'act' as const,
      duration_ms: 3000,
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
          model_used: 'sonnet',
          cost_estimate: estimateRunCost(1000, 500, 'sonnet'),
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
