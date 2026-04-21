import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnomalyBaseline, KnowledgeLogEntry } from '../types'

// Mock simple-statistics before import
vi.mock('simple-statistics', () => ({
  zScore: vi.fn((value: number, mean: number, stddev: number) => {
    if (stddev === 0) return 0
    return (value - mean) / stddev
  }),
  addToMean: vi.fn((oldMean: number, count: number, newValue: number) => {
    return (oldMean * count + newValue) / (count + 1)
  }),
}))

// Mock the ai module
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

// Mock the models export
vi.mock('@/lib/ai', () => ({
  models: { fast: 'gemini-flash' },
}))

// Mock logger
vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock notification dispatcher
vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchNotification: vi.fn().mockResolvedValue({ dashboard: true, whatsapp: false, email: true }),
}))

import { generateText } from 'ai'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import {
  computeZScore,
  updateBaseline,
  extractMetrics,
  isWithinAlertBudget,
  generateAnomalyExplanation,
  detectAndAlertAnomalies,
  detectCrossEntityPatternBreaks,
  MIN_SAMPLE_SIZE,
  ALERT_BUDGET_MAX,
  Z_SCORE_ALERT_THRESHOLD,
} from '../anomaly-detector'

const mockedGenerateText = vi.mocked(generateText)
const mockedDispatch = vi.mocked(dispatchNotification)

const makeBaseline = (partial: Partial<AnomalyBaseline> = {}): AnomalyBaseline => ({
  id: 'bl-1',
  org_id: 'org-1',
  entity_id: 'ent-1',
  metric_name: 'payment_timing',
  mean: 10,
  stddev: 2,
  sample_count: 10,
  last_computed: '2026-04-17T00:00:00Z',
  created_at: '2026-04-17T00:00:00Z',
  updated_at: '2026-04-17T00:00:00Z',
  ...partial,
})

describe('anomaly-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeZScore (ANOM-01)', () => {
    it('returns z-score for sufficient sample with non-zero stddev', () => {
      const baseline = makeBaseline({ mean: 10, stddev: 2, sample_count: 10 })
      expect(computeZScore(15, baseline)).toBe(2.5)
    })

    it('returns null when sample_count is below MIN_SAMPLE_SIZE', () => {
      const baseline = makeBaseline({ sample_count: 3 })
      expect(computeZScore(10, baseline)).toBeNull()
    })

    it('returns null when sample_count equals MIN_SAMPLE_SIZE - 1', () => {
      const baseline = makeBaseline({ sample_count: MIN_SAMPLE_SIZE - 1 })
      expect(computeZScore(10, baseline)).toBeNull()
    })

    it('returns null when stddev is zero (avoids infinity)', () => {
      const baseline = makeBaseline({ mean: 10, stddev: 0, sample_count: 10 })
      expect(computeZScore(12, baseline)).toBeNull()
    })

    it('returns negative z-score for below-mean values', () => {
      const baseline = makeBaseline({ mean: 10, stddev: 2, sample_count: 10 })
      expect(computeZScore(6, baseline)).toBe(-2)
    })
  })

  describe('updateBaseline (Welford incremental stats)', () => {
    it('handles first value (sample_count=0) — sets mean to value, stddev to 0, count to 1', () => {
      const result = updateBaseline({ mean: 0, stddev: 0, sample_count: 0 }, 10)
      expect(result.mean).toBe(10)
      expect(result.sample_count).toBe(1)
      expect(result.stddev).toBe(0)
    })

    it('updates running mean on subsequent value', () => {
      const result = updateBaseline({ mean: 5, stddev: 0, sample_count: 3 }, 8)
      // addToMean: (5*3 + 8) / (3+1) = 23/4 = 5.75
      expect(result.mean).toBeCloseTo(5.75, 2)
      expect(result.sample_count).toBe(4)
    })

    it('computes non-zero stddev after multiple updates', () => {
      let b = { mean: 0, stddev: 0, sample_count: 0 }
      b = updateBaseline(b, 1)
      b = updateBaseline(b, 2)
      b = updateBaseline(b, 3)
      expect(b.sample_count).toBe(3)
      expect(b.mean).toBeCloseTo(2, 2)
      expect(b.stddev).toBeGreaterThan(0)
    })
  })

  describe('extractMetrics (ANOM-01 — rule-based, no LLM)', () => {
    it('extracts payment_amount from invoice signal matching $X', () => {
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e1', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'invoice', content: 'Payment of $500 received',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      const out = extractMetrics(entries)
      expect(out).toContainEqual({ entity_id: 'ent-1', metric_name: 'payment_amount', value: 500 })
    })

    it('extracts payment_timing from invoice signal matching "N days late"', () => {
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e2', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'invoice', content: 'Invoice 15 days late',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      const out = extractMetrics(entries)
      expect(out).toContainEqual({ entity_id: 'ent-1', metric_name: 'payment_timing', value: 15 })
    })

    it('emits message_frequency value=1 per message signal entry per entity', () => {
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e3', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'message', content: 'Hello',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      const out = extractMetrics(entries)
      expect(out).toContainEqual({ entity_id: 'ent-1', metric_name: 'message_frequency', value: 1 })
    })

    it('skips entries with empty entity_ids', () => {
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e4', org_id: 'org-1', entity_ids: [],
          signal_type: 'calendar', content: 'Meeting',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      expect(extractMetrics(entries)).toEqual([])
    })

    it('does NOT extract response_latency (deferred to phase-47)', () => {
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e5', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'message', content: 'Hello',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      const out = extractMetrics(entries)
      expect(out.find((m) => m.metric_name === 'response_latency')).toBeUndefined()
    })
  })

  describe('isWithinAlertBudget (ANOM-03)', () => {
    // New query chain: .eq(org_id).eq(alert_type).gte(created_at).eq(entity_id?)
    // Last call in the chain resolves; earlier calls return `this` for chaining.
    const makeBudgetMock = (count: number | null, error: unknown = null) => {
      const resolved: any = Promise.resolve({ count, error })
      const chain: any = {
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
      }
      return {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as any
    }

    it('returns true when alert count < maxAlerts', async () => {
      expect(await isWithinAlertBudget(makeBudgetMock(1), 'org-1', 'ent-1', 'anomaly', 3)).toBe(true)
    })

    it('returns false when alert count >= maxAlerts', async () => {
      expect(await isWithinAlertBudget(makeBudgetMock(3), 'org-1', 'ent-1', 'anomaly', 3)).toBe(false)
    })

    it('returns false on Supabase error (fail closed)', async () => {
      expect(
        await isWithinAlertBudget(makeBudgetMock(null, new Error('db error')), 'org-1', 'ent-1', 'anomaly', 3),
      ).toBe(false)
    })

    it('uses ALERT_BUDGET_MAX default when maxAlerts not supplied', async () => {
      expect(
        await isWithinAlertBudget(makeBudgetMock(ALERT_BUDGET_MAX - 1), 'org-1', 'ent-1', 'anomaly'),
      ).toBe(true)
    })

    it('accepts null entityId for org-wide budget (cross-entity pattern break)', async () => {
      expect(
        await isWithinAlertBudget(makeBudgetMock(0), 'org-1', null, 'pattern_break'),
      ).toBe(true)
    })
  })

  describe('generateAnomalyExplanation (ANOM-05 — baseline comparison)', () => {
    it('returns generated explanation text', async () => {
      mockedGenerateText.mockResolvedValue({ text: 'Usually pays by day 5 — this invoice is 15 days late' } as any)
      const result = await generateAnomalyExplanation(
        'payment_timing',
        15,
        { mean: 5, stddev: 2 },
        3.2,
      )
      expect(result).toContain('pays')
      expect(mockedGenerateText).toHaveBeenCalledOnce()
    })

    it('returns fallback string on LLM error', async () => {
      mockedGenerateText.mockRejectedValue(new Error('llm down'))
      const result = await generateAnomalyExplanation(
        'payment_timing',
        15,
        { mean: 5, stddev: 2 },
        3.2,
      )
      expect(result).toContain('payment_timing')
      expect(result).toContain('z=3.2')
      expect(result).toContain('baseline')
    })
  })

  // Builds a chainable thenable where .eq/.gte return `this` and the whole
  // object resolves to the configured response. Lets us stop caring about
  // exactly how many .eq/.gte calls the production code makes.
  const makeChainable = (response: unknown) => {
    const resolved: any = Promise.resolve(response)
    const chain: any = {
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      in: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue(response),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      finally: resolved.finally.bind(resolved),
    }
    return chain
  }

  describe('detectAndAlertAnomalies (ANOM-02 delivery + ANOM-03 budget)', () => {
    const makeDetectSupabase = (opts: {
      baseline: any
      budgetCount: number
      insertMock?: ReturnType<typeof vi.fn>
      upsertMock?: ReturnType<typeof vi.fn>
    }) => {
      const insertMock = opts.insertMock ?? vi.fn().mockResolvedValue({ data: null, error: null })
      const upsertMock = opts.upsertMock ?? vi.fn().mockResolvedValue({ data: null, error: null })
      return {
        insertMock,
        upsertMock,
        supabase: {
          from: vi.fn((table: string) => {
            if (table === 'anomaly_baselines') {
              return {
                select: vi.fn().mockReturnValue(makeChainable({ data: opts.baseline, error: null })),
                upsert: upsertMock,
              }
            }
            if (table === 'brain_alerts') {
              return {
                select: vi.fn().mockReturnValue(makeChainable({ count: opts.budgetCount, error: null })),
                insert: insertMock,
              }
            }
            return {}
          }),
        } as any,
      }
    }

    it('inserts alert AND dispatches notification for z>threshold anomaly', async () => {
      mockedGenerateText.mockResolvedValue({ text: 'Explanation text' } as any)
      mockedDispatch.mockResolvedValue({ dashboard: true, whatsapp: false, email: true })

      const { supabase, insertMock } = makeDetectSupabase({
        baseline: {
          mean: 5, stddev: 2, sample_count: 10, metric_name: 'payment_timing',
          org_id: 'org-1', entity_id: 'ent-1', id: 'bl-1',
          last_computed: 'x', created_at: 'x', updated_at: 'x',
        },
        budgetCount: 0,
      })

      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e1', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'invoice', content: 'Invoice 15 days late',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]

      const result = await detectAndAlertAnomalies(supabase, 'org-1', 'ent-1', entries)

      expect(result.anomaliesDetected).toBeGreaterThan(0)
      expect(result.alertsSent).toBeGreaterThan(0)
      expect(insertMock).toHaveBeenCalled()
      expect(mockedDispatch).toHaveBeenCalledWith(supabase, expect.objectContaining({
        orgId: 'org-1',
        type: 'alert_escalation',
        title: expect.stringContaining('payment_timing'),
      }))
    })

    it('does not dispatch when budget exceeded', async () => {
      mockedGenerateText.mockResolvedValue({ text: 'Explanation' } as any)

      const { supabase } = makeDetectSupabase({
        baseline: { mean: 5, stddev: 2, sample_count: 10, metric_name: 'payment_timing', org_id: 'org-1', entity_id: 'ent-1', id: 'bl-1', last_computed: 'x', created_at: 'x', updated_at: 'x' },
        budgetCount: 5, // exceeds ALERT_BUDGET_MAX=3
      })

      mockedDispatch.mockClear()
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e1', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'invoice', content: 'Invoice 15 days late',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      const result = await detectAndAlertAnomalies(supabase, 'org-1', 'ent-1', entries)
      expect(result.alertsSent).toBe(0)
      expect(mockedDispatch).not.toHaveBeenCalled()
    })

    it('returns zero counts on top-level error (non-critical fail)', async () => {
      const mockSupabase: any = {
        from: vi.fn(() => { throw new Error('catastrophic') }),
      }
      const entries: KnowledgeLogEntry[] = [
        {
          id: 'e1', org_id: 'org-1', entity_ids: ['ent-1'],
          signal_type: 'invoice', content: 'Payment of $500',
          confidence: 0.9, source_memory_id: null, source_thread_id: null,
          consolidated_at: null, created_at: '2026-04-17T00:00:00Z',
        },
      ]
      const result = await detectAndAlertAnomalies(mockSupabase, 'org-1', 'ent-1', entries)
      expect(result).toEqual({ anomaliesDetected: 0, alertsSent: 0 })
    })
  })

  describe('detectCrossEntityPatternBreaks (ANOM-04)', () => {
    const makeCrossSupabase = (anomalies: Array<{ entity_id: string; metric_name: string; z_score: number }>, budgetCount = 0) => {
      let callIndex = 0
      const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
      return {
        insertMock,
        supabase: {
          from: vi.fn(() => ({
            select: vi.fn(() => {
              callIndex++
              // First select: recent anomalies. Subsequent selects: budget checks.
              if (callIndex === 1) return makeChainable({ data: anomalies, error: null })
              return makeChainable({ count: budgetCount, error: null })
            }),
            insert: insertMock,
          })),
        } as any,
      }
    }

    it('dispatches pattern_break alert when 3+ entities anomalous on same metric', async () => {
      mockedDispatch.mockClear()
      mockedDispatch.mockResolvedValue({ dashboard: true, whatsapp: false, email: true })

      const { supabase, insertMock } = makeCrossSupabase([
        { entity_id: 'ent-1', metric_name: 'payment_timing', z_score: 3.2 },
        { entity_id: 'ent-2', metric_name: 'payment_timing', z_score: 2.5 },
        { entity_id: 'ent-3', metric_name: 'payment_timing', z_score: 4.1 },
      ])

      const result = await detectCrossEntityPatternBreaks(supabase, 'org-1')
      expect(result.breaksDetected).toBeGreaterThan(0)
      expect(mockedDispatch).toHaveBeenCalled()
      // HI-02: dispatch payload exposes affected entity ids, not just count
      expect(mockedDispatch).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({
          metadata: expect.objectContaining({
            affectedEntityIds: expect.arrayContaining(['ent-1', 'ent-2', 'ent-3']),
          }),
        }),
      )
      // HI-02: alert row encodes affected entities in baseline_text
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseline_text: expect.stringContaining('ent-1'),
        }),
      )
    })

    it('does not alert when fewer than 3 entities anomalous on same metric', async () => {
      mockedDispatch.mockClear()
      const { supabase } = makeCrossSupabase([
        { entity_id: 'ent-1', metric_name: 'payment_timing', z_score: 3.2 },
        { entity_id: 'ent-2', metric_name: 'payment_timing', z_score: 2.5 },
      ])
      const result = await detectCrossEntityPatternBreaks(supabase, 'org-1')
      expect(result.breaksDetected).toBe(0)
      expect(mockedDispatch).not.toHaveBeenCalled()
    })
  })
})
