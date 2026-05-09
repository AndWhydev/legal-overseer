import { describe, it, expect, vi } from 'vitest'
import { runEvalBatch } from '../eval-runner'
import { SEED_DATASET } from '../mode-eval-dataset'

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
