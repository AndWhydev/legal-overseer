import { describe, it, expect, vi } from 'vitest'
import { persistEvalRun, runEvalBatch } from '../eval-runner'
import { SEED_DATASET } from '../mode-eval-dataset'
import type { EvalRunReport } from '../eval-runner'

/**
 * The runner calls the real `judgeSubmission` (which calls the SDK), so we
 * stub the Anthropic client. Each call returns a fixed score reply that
 * scores every case at 4/5 across both dimensions — predictable mean.
 */
function makeMockClient(scoreReply: { dimension: string; score: number }[]) {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: JSON.stringify({ scores: scoreReply, rationale: 'stub' }) }],
      })),
    },
  } as unknown as import('@anthropic-ai/sdk').default
}

describe('runEvalBatch — happy path', () => {
  it('runs every case in the dataset when no mode filter is given', async () => {
    const client = makeMockClient([
      { dimension: 'helpfulness', score: 4 },
      { dimension: 'conversational_tone', score: 4 },
      { dimension: 'triage_accuracy', score: 4 },
      { dimension: 'urgency_calibration', score: 4 },
      { dimension: 'task_extraction', score: 4 },
      { dimension: 'due_date_inference', score: 4 },
      { dimension: 'numeric_correctness', score: 4 },
      { dimension: 'currency_handling', score: 4 },
    ])
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate, { runId: 'r1' })

    expect(report.runId).toBe('r1')
    expect(candidate).toHaveBeenCalledTimes(SEED_DATASET.length)
    expect(report.results.length).toBe(SEED_DATASET.length)
    expect(report.errors).toEqual([])
  })

  it('filters to a single mode when mode option is set', async () => {
    const client = makeMockClient([
      { dimension: 'numeric_correctness', score: 5 },
      { dimension: 'currency_handling', score: 5 },
    ])
    const candidate = vi.fn().mockResolvedValue('AUD 1,000.00')
    const moneyCount = SEED_DATASET.filter(c => c.mode === 'money').length

    const report = await runEvalBatch(client, candidate, { mode: 'money' })

    expect(candidate).toHaveBeenCalledTimes(moneyCount)
    expect(report.results.length).toBe(moneyCount)
    for (const r of report.results) {
      expect(r.caseId).toMatch(/^money-/)
    }
  })

  it('records candidate errors and continues with the rest', async () => {
    const client = makeMockClient([
      { dimension: 'numeric_correctness', score: 4 },
      { dimension: 'currency_handling', score: 4 },
    ])
    let callCount = 0
    const candidate = vi.fn(async () => {
      callCount += 1
      if (callCount === 1) throw new Error('candidate boom')
      return 'recovered output'
    })

    const report = await runEvalBatch(client, candidate, { mode: 'money' })

    expect(report.errors.length).toBe(1)
    expect(report.errors[0].phase).toBe('candidate')
    expect(report.errors[0].message).toBe('candidate boom')
    // Money mode has 3 cases; one failed → 2 succeeded.
    expect(report.results.length).toBe(2)
  })

  it('records judge errors when the judge reply is unparseable', async () => {
    const client = {
      messages: {
        create: vi.fn(async () => ({
          content: [{ type: 'text', text: 'not json' }],
        })),
      },
    } as unknown as import('@anthropic-ai/sdk').default
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate, { mode: 'money' })

    expect(report.errors.every(e => e.phase === 'judge')).toBe(true)
    expect(report.results.length).toBe(0)
  })
})

describe('runEvalBatch — aggregation', () => {
  it('computes overallMean as the mean of normalized scores', async () => {
    const client = makeMockClient([
      // Both money-rubric dimensions at 4 → 8/10 → 80
      { dimension: 'numeric_correctness', score: 4 },
      { dimension: 'currency_handling', score: 4 },
    ])
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate, { mode: 'money' })

    expect(report.overallMean).toBe(80)
    expect(report.byMode.money).toEqual({ count: 3, mean: 80 })
  })

  it('byMode buckets aggregate per-mode means independently', async () => {
    // Same reply (4/4 = 80) for every case across all modes — trivial
    // verification that byMode keys + counts line up.
    const client = makeMockClient([
      { dimension: 'helpfulness', score: 4 },
      { dimension: 'conversational_tone', score: 4 },
      { dimension: 'triage_accuracy', score: 4 },
      { dimension: 'urgency_calibration', score: 4 },
      { dimension: 'task_extraction', score: 4 },
      { dimension: 'due_date_inference', score: 4 },
      { dimension: 'numeric_correctness', score: 4 },
      { dimension: 'currency_handling', score: 4 },
    ])
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate)

    expect(report.byMode.chat?.count).toBe(SEED_DATASET.filter(c => c.mode === 'chat').length)
    expect(report.byMode.inbox?.count).toBe(SEED_DATASET.filter(c => c.mode === 'inbox').length)
    expect(report.byMode.work?.count).toBe(SEED_DATASET.filter(c => c.mode === 'work').length)
    expect(report.byMode.money?.count).toBe(SEED_DATASET.filter(c => c.mode === 'money').length)
  })

  it('returns 0 mean when the batch has no successful results', async () => {
    const client = {
      messages: {
        create: vi.fn(async () => ({
          content: [{ type: 'text', text: 'not json' }],
        })),
      },
    } as unknown as import('@anthropic-ai/sdk').default
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate, { mode: 'money' })

    expect(report.results.length).toBe(0)
    expect(report.overallMean).toBe(0)
    expect(report.byMode).toEqual({})
  })
})

describe('runEvalBatch — metadata', () => {
  it('forwards candidateModel into every JudgedSubmission', async () => {
    const client = makeMockClient([
      { dimension: 'numeric_correctness', score: 5 },
      { dimension: 'currency_handling', score: 5 },
    ])
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate, {
      mode: 'money',
      candidateModel: 'sonnet-4-7',
    })

    for (const r of report.results) {
      expect(r.candidateModel).toBe('sonnet-4-7')
    }
  })

  it('forwards judgeModel into the SDK call when provided', async () => {
    const client = makeMockClient([
      { dimension: 'numeric_correctness', score: 5 },
      { dimension: 'currency_handling', score: 5 },
    ])
    const candidate = vi.fn().mockResolvedValue('output')

    await runEvalBatch(client, candidate, {
      mode: 'money',
      judgeModel: 'claude-opus-4-7',
    })

    const { mock } = client.messages.create as unknown as ReturnType<typeof vi.fn>
    for (const call of mock.calls) {
      expect(call[0].model).toBe('claude-opus-4-7')
    }
  })

  it('generates a runId when none is supplied', async () => {
    const client = makeMockClient([
      { dimension: 'numeric_correctness', score: 5 },
      { dimension: 'currency_handling', score: 5 },
    ])
    const candidate = vi.fn().mockResolvedValue('output')

    const report = await runEvalBatch(client, candidate, { mode: 'money' })

    expect(report.runId).toMatch(/^eval-\d+-[a-z0-9]+$/)
  })
})

// ─── persistEvalRun ──────────────────────────────────────────────────────────

function fakeReport(overrides: Partial<EvalRunReport> = {}): EvalRunReport {
  return {
    runId: 'eval-test-1',
    startedAt: '2026-05-09T00:00:00.000Z',
    finishedAt: '2026-05-09T00:01:00.000Z',
    overallMean: 80,
    byMode: { money: { count: 1, mean: 80 } },
    errors: [],
    results: [{
      caseId: 'money-001-invoice-from-thread',
      candidateModel: 'sonnet-4-7',
      scores: [
        { dimension: 'numeric_correctness', score: 4 },
        { dimension: 'currency_handling', score: 4 },
      ],
      result: { total: 8, normalized: 80, missing: [], ignored: [] },
      rationale: 'good',
    }],
    ...overrides,
  }
}

interface FromCall {
  table: string
  rows: unknown[]
  options?: { count?: 'exact' | 'planned' | 'estimated' }
}

function makeMockSupabase(
  errors: { runs?: { message: string }; results?: { message: string } } = {},
  resultsCount = 1,
) {
  const calls: FromCall[] = []
  const api = {
    from(table: string) {
      return {
        insert: (rows: unknown, options?: { count?: 'exact' | 'planned' | 'estimated' }) => {
          calls.push({
            table,
            rows: Array.isArray(rows) ? rows : [rows],
            options,
          })
          if (table === 'eval_runs' && errors.runs) {
            return Promise.resolve({ data: null, error: errors.runs, count: null })
          }
          if (table === 'eval_results' && errors.results) {
            return Promise.resolve({ data: null, error: errors.results, count: null })
          }
          if (table === 'eval_results') {
            return Promise.resolve({ data: null, error: null, count: resultsCount })
          }
          return Promise.resolve({ data: null, error: null, count: null })
        },
      }
    },
    _calls: calls,
  }
  return api as unknown as import('@supabase/supabase-js').SupabaseClient & { _calls: FromCall[] }
}

describe('persistEvalRun', () => {
  it('inserts one eval_runs row plus one eval_results row per result', async () => {
    const supabase = makeMockSupabase({}, 1)
    const outcome = await persistEvalRun(supabase, fakeReport(), {
      mode: 'money',
      candidateModel: 'sonnet-4-7',
      metadata: { source: 'test' },
    })

    expect(outcome.runRowInserted).toBe(true)
    expect(outcome.resultRowsInserted).toBe(1)
    expect(outcome.errors).toEqual([])

    const calls = (supabase as unknown as { _calls: FromCall[] })._calls
    expect(calls.map(c => c.table)).toEqual(['eval_runs', 'eval_results'])

    const runRow = calls[0].rows[0] as Record<string, unknown>
    expect(runRow.run_id).toBe('eval-test-1')
    expect(runRow.mode).toBe('money')
    expect(runRow.candidate_model).toBe('sonnet-4-7')
    expect(runRow.overall_mean).toBe(80)
    expect(runRow.metadata).toEqual({ source: 'test' })

    const resultRow = calls[1].rows[0] as Record<string, unknown>
    expect(resultRow.run_id).toBe('eval-test-1')
    expect(resultRow.case_id).toBe('money-001-invoice-from-thread')
    expect(resultRow.mode).toBe('money')
    expect(resultRow.normalized_score).toBe(80)
    expect(resultRow.rationale).toBe('good')
  })

  it('skips eval_results insert and surfaces error when eval_runs insert fails', async () => {
    const supabase = makeMockSupabase({ runs: { message: 'duplicate key' } })
    const outcome = await persistEvalRun(supabase, fakeReport())

    expect(outcome.runRowInserted).toBe(false)
    expect(outcome.resultRowsInserted).toBe(0)
    expect(outcome.errors[0]).toContain('eval_runs insert failed')
    expect(outcome.errors[0]).toContain('duplicate key')

    // eval_results should not have been called.
    const calls = (supabase as unknown as { _calls: FromCall[] })._calls
    expect(calls.map(c => c.table)).toEqual(['eval_runs'])
  })

  it('surfaces eval_results error but keeps run row', async () => {
    const supabase = makeMockSupabase({ results: { message: 'fk violation' } })
    const outcome = await persistEvalRun(supabase, fakeReport())

    expect(outcome.runRowInserted).toBe(true)
    expect(outcome.resultRowsInserted).toBe(0)
    expect(outcome.errors[0]).toContain('eval_results insert failed')
  })

  it('returns early when the report has zero results', async () => {
    const supabase = makeMockSupabase()
    const outcome = await persistEvalRun(supabase, fakeReport({ results: [] }))

    expect(outcome.runRowInserted).toBe(true)
    expect(outcome.resultRowsInserted).toBe(0)

    const calls = (supabase as unknown as { _calls: FromCall[] })._calls
    expect(calls.map(c => c.table)).toEqual(['eval_runs'])
  })

  it('falls back to options.candidateModel when result has none', async () => {
    const supabase = makeMockSupabase()
    const reportNoCandidate = fakeReport({
      results: [{
        caseId: 'money-001-invoice-from-thread',
        scores: [],
        result: { total: 0, normalized: 0, missing: [], ignored: [] },
      }],
    })
    await persistEvalRun(supabase, reportNoCandidate, {
      candidateModel: 'fallback-model',
    })

    const calls = (supabase as unknown as { _calls: FromCall[] })._calls
    const resultRow = calls[1].rows[0] as Record<string, unknown>
    expect(resultRow.candidate_model).toBe('fallback-model')
  })
})
