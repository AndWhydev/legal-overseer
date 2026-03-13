import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import type { ChannelMessage } from '@/lib/channels/types'
import type { ClassificationResult } from '@/lib/agent/classifier'
import { scorePriority } from '@/lib/agent/channel-triage'
import { routeMessage } from '@/lib/agent/action-router'
import { TEST_ORG_ID, TEST_AGENT_CONFIG_ID, createIntegrationSupabase } from '@/lib/__test-helpers__/supabase-integration'

const {
  classifyMessageMock,
  resolveEntityMock,
  dispatchNotificationMock,
} = vi.hoisted(() => ({
  classifyMessageMock: vi.fn(),
  resolveEntityMock: vi.fn(),
  dispatchNotificationMock: vi.fn().mockResolvedValue({
    dashboard: true,
    email: false,
    whatsapp: false,
  }),
}))

vi.mock('@/lib/agent/classifier', () => ({
  classifyMessage: classifyMessageMock,
}))

vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntity: resolveEntityMock,
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchNotification: dispatchNotificationMock,
}))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  classifyMessageMock.mockClear()
  resolveEntityMock.mockClear()
  dispatchNotificationMock.mockClear()
})

/**
 * Integration test: Gmail message reception -> classification -> entity resolution -> routing.
 * Tests the full pipeline from incoming email to action dispatch decision.
 */

function createGmailMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'gmail-msg-1',
    channel: 'gmail',
    externalId: 'gmail-ext-1',
    sender: 'alice@acme.com',
    senderEmail: 'alice@acme.com',
    subject: 'Website project quote',
    body: 'Hi, we are interested in a website project. Can you send us a quote?',
    receivedAt: new Date('2026-03-06T10:00:00Z'),
    isActionable: true,
    priority: 'medium',
    metadata: {},
    ...overrides,
  }
}

function createClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    significance: 7,
    timeSensitivity: 'today',
    resolves: [],
    unblocks: [],
    recommendedActions: ['create_task', 'reply'],
    reasoning: 'Client inquiry about services',
    category: 'client',
    summary: '',
    ...overrides,
  }
}

describe('Gmail Pipeline Integration', () => {
  it('classifies incoming client email and routes to immediate decision', async () => {
    const { supabase, data } = createIntegrationSupabase({
      contacts: [
        {
          id: 'contact-alice',
          org_id: TEST_ORG_ID,
          name: 'Alice Chen',
          emails: ['alice@acme.com'],
          type: 'individual',
          aliases: ['alice'],
        },
      ],
    })

    const message = createGmailMessage()
    const classification = createClassification({
      significance: 7,
      timeSensitivity: 'today',
      category: 'client',
    })

    classifyMessageMock.mockResolvedValue(classification)
    resolveEntityMock.mockResolvedValue(data.contacts[0])

    // 1. Classify the message
    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    expect(classified.significance).toBe(7)
    expect(classified.category).toBe('client')

    // 2. Score priority
    const priority = scorePriority(classified)
    expect(['medium', 'high']).toContain(priority)

    // 3. Route message
    const route = routeMessage(classified)
    expect(['batch', 'queue']).toContain(route.decision)
    if (route.decision === 'batch') {
      expect(route.batchWindow).toBeDefined()
    }
  })

  it('detects new lead and routes to lead-swarm immediately', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createGmailMessage({
      sender: 'david@newcompany.com',
      subject: 'We need a mobile app',
      body: 'We are a startup looking for a mobile app development partner. Our budget is $50k.',
    })

    const classification = createClassification({
      significance: 9,
      timeSensitivity: 'immediate',
      category: 'lead',
      recommendedActions: ['create_task', 'forward_to_lead_swarm', 'request_more_info'],
    })

    classifyMessageMock.mockResolvedValue(classification)
    resolveEntityMock.mockRejectedValue(new Error('Contact not found'))

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    expect(classified.category).toBe('lead')
    expect(classified.significance).toBe(9)

    const priority = scorePriority(classified)
    expect(priority).toBe('critical')

    const route = routeMessage(classified)
    expect(route.decision).toBe('immediate')
    expect(route.targetAgent).toBe('lead-swarm')
  })

  it('filters spam and assigns low priority', async () => {
    const { supabase } = createIntegrationSupabase()

    const message = createGmailMessage({
      sender: 'noreply@newsletter.com',
      subject: 'Weekly digest - 50% off everything!',
      body: 'Limited time offer...',
    })

    const classification = createClassification({
      significance: 1,
      timeSensitivity: 'none',
      category: 'spam',
      recommendedActions: ['archive'],
    })

    classifyMessageMock.mockResolvedValue(classification)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    const priority = scorePriority(classified)
    expect(priority).toBe('low')

    const route = routeMessage(classified)
    expect(route.decision).toBe('skip')
  })

  it('resolves existing contact and maintains relationship context', async () => {
    const contact = {
      id: 'contact-alice',
      org_id: TEST_ORG_ID,
      name: 'Alice Chen',
      emails: ['alice@acme.com'],
      type: 'individual',
      aliases: ['alice'],
    }

    const { supabase } = createIntegrationSupabase({
      contacts: [contact],
    })

    const message = createGmailMessage({
      sender: 'alice@acme.com',
      subject: 'Follow-up on last proposal',
    })

    classifyMessageMock.mockResolvedValue(createClassification())
    resolveEntityMock.mockResolvedValue(contact)

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    const resolved = await resolveEntityMock(supabase, message.senderEmail, TEST_ORG_ID)

    expect(resolved).toBeDefined()
    expect(resolved.id).toBe('contact-alice')
    expect(resolved.emails).toContain('alice@acme.com')
  })

  it('handles message with attached invoice action', async () => {
    const { supabase } = createIntegrationSupabase({
      contacts: [
        {
          id: 'contact-bob',
          org_id: TEST_ORG_ID,
          name: 'Bob Wilson',
          emails: ['bob@example.com'],
          type: 'individual',
          aliases: [],
        },
      ],
    })

    const message = createGmailMessage({
      sender: 'bob@example.com',
      subject: 'Can you send the invoice for the website project?',
      body: 'We are ready to proceed. Please send the invoice.',
    })

    const classification = createClassification({
      significance: 8,
      timeSensitivity: 'today',
      category: 'client',
      recommendedActions: ['create_invoice', 'reply'],
    })

    classifyMessageMock.mockResolvedValue(classification)
    resolveEntityMock.mockResolvedValue({ id: 'contact-bob' })

    const classified = await classifyMessageMock(supabase, message, TEST_ORG_ID)
    expect(classified.recommendedActions).toContain('create_invoice')

    const route = routeMessage(classified)
    expect(['immediate', 'queue']).toContain(route.decision)
    expect(route.targetAgent).toBe('invoice-flow')
  })
})
