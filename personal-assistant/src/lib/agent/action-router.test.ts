import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClassificationResult } from './classifier'
import { routeMessage, routeMessages, type RoutedMessage } from './action-router'
import type { ChannelMessage } from '@/lib/channels/types'

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    significance: 5,
    timeSensitivity: 'today',
    resolves: [],
    unblocks: [],
    recommendedActions: [],
    reasoning: 'Test',
    category: 'client',
    summary: '',
    ...overrides,
  }
}

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'gmail',
    externalId: 'ext-1',
    sender: 'Test',
    body: 'Test body',
    receivedAt: new Date(),
    isActionable: false,
    priority: 'medium',
    metadata: {},
    ...overrides,
  }
}

describe('routeMessage', () => {
  it('routes high significance + immediate to immediate', () => {
    const result = routeMessage(makeClassification({ significance: 9, timeSensitivity: 'immediate' }))
    expect(result.decision).toBe('immediate')
    expect(result.priority).toBe(9)
  })

  it('routes significance 7 + today to queue', () => {
    const result = routeMessage(makeClassification({ significance: 7, timeSensitivity: 'today' }))
    expect(result.decision).toBe('queue')
  })

  it('routes significance 5 + this_week to batch with window 30', () => {
    const result = routeMessage(makeClassification({ significance: 5, timeSensitivity: 'this_week' }))
    expect(result.decision).toBe('batch')
    expect(result.batchWindow).toBe(30)
  })

  it('routes significance 5 + whenever to batch with window 120', () => {
    const result = routeMessage(makeClassification({ significance: 5, timeSensitivity: 'whenever' }))
    expect(result.decision).toBe('batch')
    expect(result.batchWindow).toBe(120)
  })

  it('routes significance 2 to skip', () => {
    const result = routeMessage(makeClassification({ significance: 2 }))
    expect(result.decision).toBe('skip')
  })

  it('routes spam to skip regardless of significance', () => {
    const result = routeMessage(makeClassification({ significance: 9, timeSensitivity: 'immediate', category: 'spam' }))
    expect(result.decision).toBe('skip')
  })

  it('routes newsletter to skip regardless of significance', () => {
    const result = routeMessage(makeClassification({ significance: 8, category: 'newsletter' }))
    expect(result.decision).toBe('skip')
  })

  it('targets lead-swarm for lead category', () => {
    const result = routeMessage(makeClassification({ significance: 8, timeSensitivity: 'immediate', category: 'lead' }))
    expect(result.targetAgent).toBe('lead-swarm')
  })

  it('targets invoice-flow for client with invoice action', () => {
    const result = routeMessage(makeClassification({
      significance: 7,
      timeSensitivity: 'today',
      category: 'client',
      recommendedActions: ['send_invoice'],
    }))
    expect(result.targetAgent).toBe('invoice-flow')
  })

  it('targets sentry for alert actions', () => {
    const result = routeMessage(makeClassification({
      significance: 8,
      timeSensitivity: 'immediate',
      recommendedActions: ['handle_error'],
    }))
    expect(result.targetAgent).toBe('sentry')
  })
})

describe('routeMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks messages as processed', async () => {
    // Mock classifyMessage at module level
    vi.mock('./classifier', () => ({
      classifyMessage: vi.fn().mockResolvedValue({
        significance: 5,
        timeSensitivity: 'today',
        resolves: [],
        unblocks: [],
        recommendedActions: [],
        reasoning: 'test',
        category: 'client',
      }),
    }))

    const updateMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as any

    const messages = [makeMessage({ id: 'msg-1' }), makeMessage({ id: 'msg-2' })]
    const result = await routeMessages(supabase, messages, 'org-1')

    expect(result).toHaveLength(2)
    expect(supabase.from).toHaveBeenCalledWith('channel_messages')
    expect(updateMock).toHaveBeenCalledWith({ processed: true })
  })
})
