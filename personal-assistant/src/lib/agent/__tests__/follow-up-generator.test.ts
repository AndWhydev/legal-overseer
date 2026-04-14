import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: (model: string) => model,
}))

vi.mock('@/lib/ai', () => ({
  models: { fast: 'google/gemini-3-flash' },
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { generateFollowUps } from '../follow-up-generator'
import { generateText } from 'ai'

const mockGenerateText = vi.mocked(generateText)

describe('generateFollowUps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AI-generated follow-up suggestions', async () => {
    mockGenerateText.mockResolvedValue({
      text: '["Check the invoice status", "Draft a follow-up email"]',
    } as any)

    const result = await generateFollowUps(
      'How are the invoices looking?',
      'You have 3 outstanding invoices totaling $4,500. The oldest is 15 days overdue from Client ABC.',
    )

    expect(result).toEqual(['Check the invoice status', 'Draft a follow-up email'])
    expect(mockGenerateText).toHaveBeenCalledOnce()
  })

  it('returns empty array for short responses', async () => {
    const result = await generateFollowUps('Hi', 'Hello! How can I help?')
    expect(result).toEqual([])
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('filters out suggestions longer than 60 chars', async () => {
    mockGenerateText.mockResolvedValue({
      text: '["Short one", "This is a very long suggestion that definitely exceeds sixty characters and should be filtered out"]',
    } as any)

    const result = await generateFollowUps(
      'Tell me about the project',
      'The project has multiple phases including design, development, testing, and deployment. We are currently in phase 2.',
    )

    expect(result).toEqual(['Short one'])
  })

  it('limits to 3 suggestions maximum', async () => {
    mockGenerateText.mockResolvedValue({
      text: '["One", "Two", "Three", "Four", "Five"]',
    } as any)

    const result = await generateFollowUps(
      'Tell me about tasks',
      'You have several tasks across different categories. Some are overdue and others are upcoming. Let me break them down for you.',
    )

    expect(result).toEqual(['One', 'Two', 'Three'])
  })

  it('returns empty array on API error', async () => {
    mockGenerateText.mockRejectedValue(new Error('API timeout'))

    const result = await generateFollowUps(
      'Check my messages',
      'You have 5 unread messages from various contacts. Two are marked as urgent from your client.',
    )

    expect(result).toEqual([])
  })

  it('returns empty array when AI returns invalid JSON', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'not valid json',
    } as any)

    const result = await generateFollowUps(
      'What happened today?',
      'Several things happened today including a new lead inquiry and a completed invoice payment from Client XYZ.',
    )

    expect(result).toEqual([])
  })

  it('returns empty array when AI returns non-array JSON', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"suggestion": "test"}',
    } as any)

    const result = await generateFollowUps(
      'Status update',
      'Everything is running smoothly. All systems are operational and no critical alerts have been triggered today.',
    )

    expect(result).toEqual([])
  })

  it('filters out empty strings', async () => {
    mockGenerateText.mockResolvedValue({
      text: '["Valid suggestion", "", "Another valid one"]',
    } as any)

    const result = await generateFollowUps(
      'Show me the leads',
      'You have 12 active leads in the pipeline. Three are in the proposal stage and two are expected to close this week.',
    )

    expect(result).toEqual(['Valid suggestion', 'Another valid one'])
  })

  it('truncates long responses before sending to AI', async () => {
    const longResponse = 'A'.repeat(1000)

    mockGenerateText.mockResolvedValue({
      text: '["Follow up"]',
    } as any)

    await generateFollowUps('Tell me more', longResponse)

    const call = mockGenerateText.mock.calls[0][0]
    // The prompt should contain a truncated version (800 chars + "...")
    expect((call as any).prompt).toContain('...')
    expect((call as any).prompt.length).toBeLessThan(1000)
  })
})
