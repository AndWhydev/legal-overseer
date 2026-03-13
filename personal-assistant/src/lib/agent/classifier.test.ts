import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveModel } from '@/lib/agent/model-registry'
import type { ChannelMessage } from '@/lib/channels/types'

// Mock context assembler
vi.mock('@/lib/context/assembler', () => ({
  assembleContext: vi.fn().mockResolvedValue({
    resolvedEntities: [],
    briefings: [],
    summary: '',
  }),
}))

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn()
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  return {
    default: MockAnthropic,
    __mockCreate: mockCreate,
  }
})

import Anthropic from '@anthropic-ai/sdk'
import {
  classifyMessage,
  buildClassificationPrompt,
  parseClassificationResponse,
  DEFAULT_RESULT,
} from './classifier'

const { __mockCreate } = await import('@anthropic-ai/sdk') as any

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'gmail',
    externalId: 'ext-1',
    sender: 'Jane Doe',
    senderEmail: 'jane@example.com',
    subject: 'Invoice for project',
    body: 'Please find attached the invoice for last month.',
    receivedAt: new Date(),
    isActionable: false,
    priority: 'medium',
    metadata: {},
    ...overrides,
  }
}

function mockSupabase() {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  return {
    from: vi.fn().mockReturnValue({ update }),
    __update: update,
  } as any
}

describe('buildClassificationPrompt', () => {
  it('includes sender, subject, and body', () => {
    const msg = makeMessage()
    const prompt = buildClassificationPrompt(msg, '')
    expect(prompt).toContain('Jane Doe')
    expect(prompt).toContain('jane@example.com')
    expect(prompt).toContain('Invoice for project')
    expect(prompt).toContain('Please find attached')
  })

  it('truncates long bodies', () => {
    const longBody = 'x'.repeat(3000)
    const msg = makeMessage({ body: longBody })
    const prompt = buildClassificationPrompt(msg, '')
    expect(prompt).toContain('...[truncated]')
    expect(prompt.length).toBeLessThan(longBody.length)
  })
})

describe('parseClassificationResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      significance: 8,
      timeSensitivity: 'immediate',
      resolves: [],
      unblocks: [],
      recommendedActions: ['reply', 'create_task'],
      reasoning: 'Important client email',
      category: 'client',
    })
    const result = parseClassificationResponse(json)
    expect(result.significance).toBe(8)
    expect(result.timeSensitivity).toBe('immediate')
    expect(result.recommendedActions).toEqual(['reply', 'create_task'])
    expect(result.category).toBe('client')
  })

  it('clamps significance to 1-10', () => {
    const result = parseClassificationResponse(JSON.stringify({
      significance: 15,
      timeSensitivity: 'today',
      resolves: [],
      unblocks: [],
      recommendedActions: [],
      reasoning: '',
      category: 'client',
    }))
    expect(result.significance).toBe(10)
  })

  it('defaults invalid timeSensitivity to none', () => {
    const result = parseClassificationResponse(JSON.stringify({
      significance: 5,
      timeSensitivity: 'invalid',
      resolves: [],
      unblocks: [],
      recommendedActions: [],
      reasoning: '',
      category: 'client',
    }))
    expect(result.timeSensitivity).toBe('none')
  })
})

describe('classifyMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies message and stores result', async () => {
    __mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          significance: 7,
          timeSensitivity: 'today',
          resolves: [],
          unblocks: [],
          recommendedActions: ['reply'],
          reasoning: 'Client follow-up',
          category: 'client',
        }),
      }],
    })

    const supabase = mockSupabase()
    const msg = makeMessage()
    const result = await classifyMessage(supabase, msg, 'org-1')

    expect(result.significance).toBe(7)
    expect(result.timeSensitivity).toBe('today')
    expect(supabase.from).toHaveBeenCalledWith('channel_messages')
    expect(supabase.__update).toHaveBeenCalledWith(
      expect.objectContaining({
        significance: 7,
        time_sensitivity: 'today',
        classification_model: resolveModel('classification'),
      }),
    )
  })

  it('returns default result on LLM error', async () => {
    __mockCreate.mockRejectedValue(new Error('API error'))

    const supabase = mockSupabase()
    const result = await classifyMessage(supabase, makeMessage(), 'org-1')

    expect(result).toEqual(DEFAULT_RESULT)
  })
})
