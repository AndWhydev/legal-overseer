import { describe, it, expect, vi } from 'vitest'
import {
  buildLLMJudgePrompt,
  judgeSubmission,
  parseLLMJudgeOutput,
} from '../eval-driver'
import { MODE_RUBRICS } from '../mode-eval-rubric'
import { SEED_DATASET, getCaseById } from '../mode-eval-dataset'

const MONEY_CASE = getCaseById('money-001-invoice-from-thread')!

describe('buildLLMJudgePrompt', () => {
  it('includes the case input + expected behavior + model output', () => {
    const prompt = buildLLMJudgePrompt(
      MODE_RUBRICS.money,
      MONEY_CASE,
      'AUD 2,640.00 invoice draft generated.',
    )
    expect(prompt).toContain('Mode: money')
    expect(prompt).toContain(MONEY_CASE.id)
    expect(prompt).toContain(MONEY_CASE.input)
    expect(prompt).toContain(MONEY_CASE.expectedBehavior)
    expect(prompt).toContain('AUD 2,640.00 invoice draft generated.')
  })

  it('lists every dimension declared on the case', () => {
    const prompt = buildLLMJudgePrompt(MODE_RUBRICS.money, MONEY_CASE, 'output')
    for (const d of MONEY_CASE.dimensions) {
      expect(prompt).toContain(`- ${d}`)
    }
  })

  it('falls back to rubric dimensions when the case declares none', () => {
    const sparseCase = { ...SEED_DATASET[0], dimensions: [] as never[] }
    const prompt = buildLLMJudgePrompt(MODE_RUBRICS.chat, sparseCase, 'output')
    for (const d of MODE_RUBRICS.chat.dimensions) {
      expect(prompt).toContain(`- ${d}`)
    }
  })

  it('is deterministic for the same inputs', () => {
    const a = buildLLMJudgePrompt(MODE_RUBRICS.money, MONEY_CASE, 'X')
    const b = buildLLMJudgePrompt(MODE_RUBRICS.money, MONEY_CASE, 'X')
    expect(a).toBe(b)
  })
})

describe('parseLLMJudgeOutput — happy path', () => {
  it('returns scores + rationale from a clean JSON reply', () => {
    const out = parseLLMJudgeOutput(JSON.stringify({
      scores: [
        { dimension: 'numeric_correctness', score: 5, evidence: 'exact total' },
        { dimension: 'currency_handling',   score: 4, evidence: 'AUD shown' },
      ],
      rationale: 'Hit the total exactly.',
    }))
    expect(out.scores).toEqual([
      { dimension: 'numeric_correctness', score: 5, evidence: 'exact total' },
      { dimension: 'currency_handling',   score: 4, evidence: 'AUD shown' },
    ])
    expect(out.rationale).toBe('Hit the total exactly.')
  })

  it('strips leading ```json fences', () => {
    const out = parseLLMJudgeOutput([
      '```json',
      '{ "scores": [{ "dimension": "helpfulness", "score": 3 }], "rationale": "ok" }',
      '```',
    ].join('\n'))
    expect(out.scores).toEqual([{ dimension: 'helpfulness', score: 3, evidence: undefined }])
  })

  it('strips bare ``` fences (some models drop the json hint)', () => {
    const out = parseLLMJudgeOutput([
      '```',
      '{ "scores": [{ "dimension": "helpfulness", "score": 3 }] }',
      '```',
    ].join('\n'))
    expect(out.scores.length).toBe(1)
  })
})

describe('parseLLMJudgeOutput — defensive', () => {
  it('drops entries with unknown dimensions silently', () => {
    const out = parseLLMJudgeOutput(JSON.stringify({
      scores: [
        { dimension: 'helpfulness', score: 4 },
        { dimension: 'vibes',       score: 5 }, // not a real dimension
      ],
    }))
    expect(out.scores.map(s => s.dimension)).toEqual(['helpfulness'])
  })

  it('drops entries with non-finite scores', () => {
    const out = parseLLMJudgeOutput(JSON.stringify({
      scores: [
        { dimension: 'helpfulness',         score: 4 },
        { dimension: 'conversational_tone', score: 'high' }, // not a number
      ],
    }))
    expect(out.scores.length).toBe(1)
  })

  it('throws TypeError on non-JSON text', () => {
    expect(() => parseLLMJudgeOutput('not json at all')).toThrow(TypeError)
  })

  it('throws TypeError when scores key is missing', () => {
    expect(() => parseLLMJudgeOutput(JSON.stringify({ rationale: 'oops' }))).toThrow(/scores/)
  })

  it('returns empty rationale when missing', () => {
    const out = parseLLMJudgeOutput(JSON.stringify({
      scores: [{ dimension: 'helpfulness', score: 3 }],
    }))
    expect(out.rationale).toBe('')
  })
})

describe('judgeSubmission — async with mocked SDK', () => {
  function mockClient(replyText: string) {
    return {
      messages: {
        create: vi.fn(async () => ({
          content: [{ type: 'text', text: replyText }],
        })),
      },
    } as unknown as import('@anthropic-ai/sdk').default
  }

  it('builds the prompt, sends it, parses the reply, and aggregates', async () => {
    const reply = JSON.stringify({
      scores: [
        { dimension: 'numeric_correctness', score: 5, evidence: 'good' },
        { dimension: 'currency_handling',   score: 5, evidence: 'good' },
      ],
      rationale: 'Hit the total exactly with the right currency.',
    })
    const client = mockClient(reply)

    const judged = await judgeSubmission(
      client,
      MODE_RUBRICS.money,
      MONEY_CASE,
      { caseId: MONEY_CASE.id, modelOutput: 'AUD 2,640.00 invoice', candidateModel: 'sonnet-4-7' },
    )

    expect(judged.caseId).toBe(MONEY_CASE.id)
    expect(judged.candidateModel).toBe('sonnet-4-7')
    expect(judged.scores.length).toBe(2)
    expect(judged.result.normalized).toBe(100) // 10 / 10
    expect(judged.rationale).toContain('total exactly')
  })

  it('forwards the judge model id to the SDK', async () => {
    const client = mockClient(JSON.stringify({
      scores: [{ dimension: 'numeric_correctness', score: 3 }],
    }))
    await judgeSubmission(
      client,
      MODE_RUBRICS.money,
      MONEY_CASE,
      { caseId: MONEY_CASE.id, modelOutput: 'output' },
      'claude-opus-4-7',
    )

    const { mock } = client.messages.create as unknown as ReturnType<typeof vi.fn>
    expect(mock.calls[0][0].model).toBe('claude-opus-4-7')
  })

  it('aggregates via scoreSubmission so missing dimensions surface', async () => {
    const reply = JSON.stringify({
      scores: [{ dimension: 'numeric_correctness', score: 4 }],
      // currency_handling intentionally omitted
    })
    const client = mockClient(reply)

    const judged = await judgeSubmission(
      client,
      MODE_RUBRICS.money,
      MONEY_CASE,
      { caseId: MONEY_CASE.id, modelOutput: 'output' },
    )

    expect(judged.result.missing).toContain('currency_handling')
    expect(judged.scores.length).toBe(1)
  })

  it('rationale is undefined when the judge omits it', async () => {
    const client = mockClient(JSON.stringify({
      scores: [{ dimension: 'helpfulness', score: 3 }],
    }))
    const judged = await judgeSubmission(
      client,
      MODE_RUBRICS.chat,
      SEED_DATASET[0], // chat case
      { caseId: SEED_DATASET[0].id, modelOutput: 'short reply' },
    )
    expect(judged.rationale).toBeUndefined()
  })
})
