import { describe, it, expect, vi } from 'vitest'
import {
  makeProductionCandidate,
  PRODUCTION_CANDIDATE_LABEL,
} from '../production-candidate'
import { getCaseById, getCasesByMode } from '../mode-eval-dataset'

const MONEY_CASE = getCaseById('money-001-invoice-from-thread')!

function makeMockClient(replyText: string) {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: replyText }],
      })),
    },
  } as unknown as import('@anthropic-ai/sdk').default
}

describe('makeProductionCandidate', () => {
  it('returns the model text from a successful reply', async () => {
    const client = makeMockClient('AUD 2,640.00 invoice draft')
    const candidate = makeProductionCandidate(client)

    const output = await candidate(MONEY_CASE)
    expect(output).toBe('AUD 2,640.00 invoice draft')
  })

  it('passes case.input as the user message', async () => {
    const client = makeMockClient('reply')
    const candidate = makeProductionCandidate(client)

    await candidate(MONEY_CASE)

    const create = client.messages.create as unknown as ReturnType<typeof vi.fn>
    const call = create.mock.calls[0][0]
    expect(call.messages).toEqual([{ role: 'user', content: MONEY_CASE.input }])
  })

  it('attaches the per-mode persona system prompt', async () => {
    const client = makeMockClient('reply')
    const candidate = makeProductionCandidate(client)

    await candidate(MONEY_CASE)

    const create = client.messages.create as unknown as ReturnType<typeof vi.fn>
    const call = create.mock.calls[0][0]
    expect(typeof call.system).toBe('string')
    expect(call.system.length).toBeGreaterThan(0)
  })

  it('uses synthesis-class model for money mode', async () => {
    const client = makeMockClient('reply')
    const candidate = makeProductionCandidate(client)

    await candidate(MONEY_CASE)

    const create = client.messages.create as unknown as ReturnType<typeof vi.fn>
    const model = create.mock.calls[0][0].model
    expect(model).toContain('opus')
  })

  it('uses classification-class model for inbox mode', async () => {
    const client = makeMockClient('reply')
    const candidate = makeProductionCandidate(client)
    const inboxCase = getCasesByMode('inbox')[0]

    await candidate(inboxCase)

    const create = client.messages.create as unknown as ReturnType<typeof vi.fn>
    const model = create.mock.calls[0][0].model
    expect(model).toContain('haiku')
  })

  it('uses conversation-class model for chat mode', async () => {
    const client = makeMockClient('reply')
    const candidate = makeProductionCandidate(client)
    const chatCase = getCasesByMode('chat')[0]

    await candidate(chatCase)

    const create = client.messages.create as unknown as ReturnType<typeof vi.fn>
    const model = create.mock.calls[0][0].model
    expect(model).toContain('sonnet')
  })

  it('returns empty string when the reply has no text block', async () => {
    const client = {
      messages: {
        create: vi.fn(async () => ({ content: [] })),
      },
    } as unknown as import('@anthropic-ai/sdk').default
    const candidate = makeProductionCandidate(client)

    const output = await candidate(MONEY_CASE)
    expect(output).toBe('')
  })
})

describe('PRODUCTION_CANDIDATE_LABEL', () => {
  it('is a stable, recognisable string for trend grouping', () => {
    expect(PRODUCTION_CANDIDATE_LABEL).toBe('production:per-mode-routed')
  })
})
