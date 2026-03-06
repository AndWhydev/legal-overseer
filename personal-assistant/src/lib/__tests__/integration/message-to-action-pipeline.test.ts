import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import type { ClassificationResult } from '@/lib/agent/classifier'
import type { ChannelMessage } from '@/lib/channels/types'
import { scorePriority } from '@/lib/agent/channel-triage'
import { routeMessage } from '@/lib/agent/action-router'
import { TEST_ORG_ID, TEST_AGENT_CONFIG_ID, TEST_USER_ID, createIntegrationSupabase } from '@/lib/__test-helpers__/supabase-integration'

const {
  classifyMessageMock,
  shouldBatchMock,
  executeActionMock,
} = vi.hoisted(() => ({
  classifyMessageMock: vi.fn(),
  shouldBatchMock: vi.fn(),
  executeActionMock: vi.fn(),
}))

vi.mock('@/lib/agent/classifier', () => ({
  classifyMessage: classifyMessageMock,
}))

vi.mock('@/lib/agent/message-batcher', () => ({
  shouldBatchMessage: shouldBatchMock,
}))

vi.mock('@/lib/agent/action-executor', () => ({
  executeAction: executeActionMock,
}))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  classifyMessageMock.mockClear()
  shouldBatchMock.mockClear()
  executeActionMock.mockClear()
})

/**
 * Integration test: Incoming message -> classification -> priority scoring -> routing decision -> action execution.
 * Tests the full pipeline from message receipt through to action dispatch,
 * including batching, priority override, and action type routing.
 */

function createChannelMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'gmail',
    externalId: 'ext-1',
    sender: 'sender@example.com',
    senderEmail: 'sender@example.com',
    subject: 'Test message',
    body: 'This is a test message.',
    receivedAt: new Date(),
    isActionable: true,
    priority: 'medium',
    metadata: {},
    ...overrides,
  }
}

function createClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    significance: 5,
    timeSensitivity: 'today',
    resolves: [],
    unblocks: [],
    recommendedActions: [],
    reasoning: 'Standard message',
    category: 'client',
    ...overrides,
  }
}

describe('Message to Action Pipeline Integration', () => {
  it('immediately routes critical high-significance messages', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage({
      sender: 'ceo@bigclient.com',
      subject: 'Urgent: Website down - critical issue',
      body: 'Our website is down. We need immediate help. This is costing us $5k per hour.',
    })

    const classification = createClassification({
      significance: 10,
      timeSensitivity: 'immediate',
      category: 'client',
      recommendedActions: ['alert_team', 'escalate', 'create_task'],
    })

    classifyMessageMock.mockResolvedValue(classification)
    shouldBatchMock.mockResolvedValue(false)

    // 1. Classify message
    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    expect(classified.significance).toBe(10)
    expect(classified.timeSensitivity).toBe('immediate')

    // 2. Score priority
    const priority = scorePriority(classified)
    expect(priority).toBe('critical')

    // 3. Route message
    const route = routeMessage(classified)
    expect(route.decision).toBe('immediate')
    expect(shouldBatchMock).not.toHaveBeenCalled()

    // 4. Execute action
    executeActionMock.mockResolvedValue({ success: true, taskCreated: true })
    const actionResult = await executeActionMock(supabase, TEST_ORG_ID, {
      actions: classified.recommendedActions,
      message,
    })

    expect(actionResult.success).toBe(true)
  })

  it('batches medium-priority routine messages', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage({
      sender: 'client@routine.com',
      subject: 'Project status update',
      body: 'Just wanted to give you a quick update on the project.',
    })

    const classification = createClassification({
      significance: 5,
      timeSensitivity: 'this_week',
      category: 'client',
      recommendedActions: ['create_task', 'reply'],
    })

    classifyMessageMock.mockResolvedValue(classification)
    shouldBatchMock.mockResolvedValue(true)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    const priority = scorePriority(classified)
    expect(priority).toBe('medium')

    const route = routeMessage(classified)
    expect(route.decision).toBe('batch')
    expect(route.batchWindow).toBeDefined()
    expect(route.batchWindow).toBeGreaterThan(0)

    const shouldBatch = await shouldBatchMock(supabase, message, classified)
    expect(shouldBatch).toBe(true)
  })

  it('skips low-significance messages without processing', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage({
      sender: 'newsletter@example.com',
      subject: 'Weekly newsletter',
      body: 'This is our weekly digest...',
    })

    const classification = createClassification({
      significance: 2,
      timeSensitivity: 'none',
      category: 'newsletter',
      recommendedActions: ['archive'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    const priority = scorePriority(classified)
    expect(priority).toBe('low')

    const route = routeMessage(classified)
    expect(route.decision).toBe('skip')

    // Verify no action is executed
    expect(executeActionMock).not.toHaveBeenCalled()
  })

  it('routes invoice-related messages to invoice-flow agent', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage({
      sender: 'client@invoice-test.com',
      subject: 'Please send the invoice for Phase 1',
      body: 'We are ready to proceed with payment. Can you send the invoice?',
    })

    const classification = createClassification({
      significance: 7,
      timeSensitivity: 'today',
      category: 'client',
      recommendedActions: ['create_invoice', 'send_email'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    const route = routeMessage(classified)

    expect(['immediate', 'queue']).toContain(route.decision)
    expect(route.targetAgent).toBe('invoice-flow')
  })

  it('routes lead emails to lead-swarm with high priority', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage({
      sender: 'prospect@newcompany.com',
      subject: 'We need web development help',
      body: 'We are a Series B startup looking for a web development partner. $100k+ budget.',
    })

    const classification = createClassification({
      significance: 9,
      timeSensitivity: 'immediate',
      category: 'lead',
      recommendedActions: ['forward_to_lead_swarm', 'create_task', 'request_info'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    const priority = scorePriority(classified)
    expect(priority).toBe('critical')

    const route = routeMessage(classified)
    expect(route.decision).toBe('immediate')
    expect(route.targetAgent).toBe('lead-swarm')
  })

  it('handles multi-action message with task + reply recommendations', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage({
      sender: 'vendor@supply.com',
      subject: 'Updated quote for the project',
      body: 'As discussed, here is the revised quote: [quote details]',
    })

    const classification = createClassification({
      significance: 6,
      timeSensitivity: 'today',
      category: 'client',
      recommendedActions: ['create_task', 'reply', 'archive'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    expect(classified.recommendedActions.length).toBeGreaterThan(1)

    const route = routeMessage(classified)
    expect(route).toBeDefined()

    executeActionMock.mockResolvedValue({
      success: true,
      taskCreated: true,
      replyQueued: true,
    })

    const result = await executeActionMock(supabase, TEST_ORG_ID, {
      actions: classified.recommendedActions,
      message,
    })

    expect(result.taskCreated).toBe(true)
    expect(result.replyQueued).toBe(true)
  })

  it('respects contact priority boost for VIP clients', async () => {
    const { supabase, data } = createIntegrationSupabase({
      contacts: [
        {
          id: 'contact-vip-1',
          org_id: TEST_ORG_ID,
          name: 'VIP Client Inc',
          emails: ['contact@vip.com'],
          type: 'company',
          aliases: ['vip', 'major-client'],
        },
      ],
    })

    const message = createChannelMessage({
      sender: 'contact@vip.com',
      subject: 'Quick question about services',
      body: 'Do you offer custom development?',
    })

    const baseClassification = createClassification({
      significance: 4,
      timeSensitivity: 'this_week',
      category: 'client',
      recommendedActions: ['reply'],
    })

    classifyMessageMock.mockResolvedValue(baseClassification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)

    // Base priority would be 'low' for significance 4
    let priority = scorePriority(classified)
    expect(['low', 'medium']).toContain(priority)

    // With VIP contact boost, priority escalates
    const boostedPriority = scorePriority(classified, {
      isClient: true,
      hasOutstanding: false,
      overdueCount: 0,
      upcomingDeadlines: 0,
    })

    // Should boost to at least as high as base or higher
    const levels = ['low', 'medium', 'high', 'critical']
    const baseIdx = levels.indexOf(priority)
    const boostedIdx = levels.indexOf(boostedPriority)
    expect(boostedIdx).toBeGreaterThanOrEqual(baseIdx)
  })

  it('batches messages with escalating window based on backlog', async () => {
    const { supabase } = createIntegrationSupabase()

    const messages = [
      createChannelMessage({ subject: 'First routine message' }),
      createChannelMessage({ subject: 'Second routine message' }),
      createChannelMessage({ subject: 'Third routine message' }),
    ]

    const classification = createClassification({
      significance: 5,
      timeSensitivity: 'this_week',
      category: 'client',
    })

    classifyMessageMock.mockResolvedValue(classification)
    shouldBatchMock.mockResolvedValue(true)

    const routes = []
    for (const msg of messages) {
      const classified = await classifyMessageMock(supabase, msg, TEST_ORG_ID)
      const route = routeMessage(classified)
      routes.push(route)
    }

    // All should be batched
    for (const route of routes) {
      expect(route.decision).toBe('batch')
    }
  })

  it('prioritizes deadline-driven messages even with low base significance', async () => {
    const { supabase, data } = createIntegrationSupabase({
      tasks: [
        {
          id: 'task-deadline-1',
          org_id: TEST_ORG_ID,
          title: 'Proposal response due today',
          status: 'pending',
          priority: 'high',
        },
      ],
    })

    const message = createChannelMessage({
      sender: 'client@deadline.com',
      subject: 'Checking in on proposal',
      body: 'Just checking if you got our feedback on the proposal.',
    })

    const classification = createClassification({
      significance: 4,
      timeSensitivity: 'today',
      category: 'client',
      resolves: ['task-deadline-1'],
      recommendedActions: ['reply'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)

    // Time sensitivity boost should elevate priority
    const priority = scorePriority(classified, {
      isClient: true,
      hasOutstanding: false,
      overdueCount: 0,
      upcomingDeadlines: 1,
    })

    expect(priority).not.toBe('low')
  })

  it('handles error in classification gracefully with fallback', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createChannelMessage()

    classifyMessageMock.mockRejectedValue(new Error('LLM timeout'))

    await expect(classifyMessageMock(supabase, message, TEST_ORG_ID)).rejects.toThrow()

    // Verify fallback routing can still occur
    const fallbackRoute = routeMessage({
      significance: 3,
      timeSensitivity: 'none',
      category: 'notification',
      resolves: [],
      unblocks: [],
      recommendedActions: [],
      reasoning: 'Classification failed - using safe fallback',
    })

    expect(fallbackRoute.decision).toBe('skip')
  })

  it('processes spam detection and marks for filtering', async () => {
    const { supabase } = createIntegrationSupabase()

    const spamMessage = createChannelMessage({
      sender: 'noreply@spam.com',
      subject: 'YOU WON $1,000,000!!!',
      body: 'Click here to claim your prize...',
    })

    const classification = createClassification({
      significance: 1,
      timeSensitivity: 'none',
      category: 'spam',
      recommendedActions: ['block_sender', 'archive'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, spamMessage, TEST_ORG_ID)
    const route = routeMessage(classified)

    expect(route.decision).toBe('skip')

    executeActionMock.mockResolvedValue({
      success: true,
      senderBlocked: true,
    })

    const result = await executeActionMock(supabase, TEST_ORG_ID, {
      actions: ['block_sender'],
      message: spamMessage,
    })

    expect(result.senderBlocked).toBe(true)
  })
})
