import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateNarration, type NarrationContext } from './narration'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Found someone interesting in your inbox.' }],
        }),
      },
    }
  }),
}))

describe('generateNarration', () => {
  const baseContext: NarrationContext = {
    conversationHistory: [],
    userCorrections: [],
    currentPhase: 'crawling',
  }

  it('generates narration for a contact discovery event', async () => {
    const result = await generateNarration(
      { type: 'contact_found', name: 'Steve West', messageCount: 47, relationship: 'client' },
      baseContext,
    )
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
    expect(result.length).toBeLessThan(500)
  })

  it('generates narration for crawl progress', async () => {
    const result = await generateNarration(
      { type: 'crawl_progress', channel: 'gmail', messagesFound: 142 },
      baseContext,
    )
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('generates narration for synthesis start', async () => {
    const result = await generateNarration(
      { type: 'synthesis_start', totalMessages: 347, channels: ['gmail', 'calendar'] },
      { ...baseContext, currentPhase: 'synthesizing' },
    )
    expect(result).toBeTruthy()
  })

  it('incorporates user corrections into context', async () => {
    const result = await generateNarration(
      { type: 'contact_found', name: 'Maya', messageCount: 12, relationship: 'unknown' },
      {
        ...baseContext,
        userCorrections: [{ original: 'Steve West', correction: "He's my biggest client" }],
        conversationHistory: [
          { role: 'assistant' as const, content: 'Found Steve West — 47 messages.' },
          { role: 'user' as const, content: "He's my biggest client" },
        ],
      },
    )
    expect(result).toBeTruthy()
  })

  it('generates reveal narration', async () => {
    const result = await generateNarration(
      { type: 'reveal', peopleCount: 23, projectCount: 4, financialTotal: '$1,200' },
      { ...baseContext, currentPhase: 'complete' },
    )
    expect(result).toBeTruthy()
  })
})
