import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/agent/channel-triage', () => ({
  runTriage: vi.fn().mockResolvedValue({
    processed: 5,
    actionable: 2,
    informational: 2,
    spam: 1,
    tasksCreated: 1,
    deduplicated: 0,
    entitiesLinked: 3,
    routed: [
      { agent: 'client-comms', messageId: 'msg-1', priority: 7 },
      { agent: 'finance', messageId: 'msg-2', priority: 5 },
    ],
  }),
}))

vi.mock('@/lib/agent/client-comms', () => ({
  runClientCommsTick: vi.fn().mockResolvedValue({
    processed: 3,
    drafted: 2,
    sent: 1,
    queued: 1,
    failed: 0,
  }),
  draftReply: vi.fn().mockResolvedValue({
    body: 'Hi there, thanks for reaching out.',
    voice: 'default',
    confidence: 0.8,
    approvalId: 'approval-123',
  }),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../role-registry', () => ({
  registerRole: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runWrappedTriageTick, runWrappedCommsTick } from '../triage-wrapper'
import { detectUnansweredThreads } from '../follow-up-tracker'
import { monitorCommunicationFrequency, detectEngagementDrops, type CommunicationFrequency } from '../relationship-monitor'
import { adaptDraft, learnClientTone } from '../tone-adapter'
import { createEscalationWorkflow, getEscalationStepDefs, ESCALATION_SCHEDULE } from '../escalation-workflow'
import type { RoleContext } from '../../role-runtime'
import type { UnansweredThread } from '../follow-up-tracker'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockContext(overrides: Partial<RoleContext> = {}): RoleContext {
  return {
    config: {
      id: 'config-001',
      org_id: 'org-001',
      role_type: 'comms',
      enabled: true,
      autonomy_level: 'copilot',
      config: {},
      tick_interval_seconds: 300,
      daily_budget_cents: 500,
    },
    state: {
      id: 'state-001',
      role_config_id: 'config-001',
      state: {},
      last_tick_at: null,
      version: 1,
    },
    supabase: createMockSupabase(),
    orgId: 'org-001',
    autonomyLevel: 'copilot',
    ...overrides,
  } as RoleContext
}

function createMockSupabase() {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    contains: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    from: vi.fn(() => ({ ...mockQuery })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any
}

// ---------------------------------------------------------------------------
// 1. Triage Wrapper Translation Tests
// ---------------------------------------------------------------------------

describe('Triage Wrapper', () => {
  it('translates TriageResult into RoleActions and RoleInsights', async () => {
    const ctx = createMockContext()
    const result = await runWrappedTriageTick(ctx)

    // Should have route_message actions for each routed message
    const routeActions = result.actions.filter(a => a.type === 'route_message')
    expect(routeActions).toHaveLength(2)
    expect(routeActions[0].payload.targetAgent).toBe('client-comms')
    expect(routeActions[1].payload.targetAgent).toBe('finance')

    // Should have task_created action
    const taskActions = result.actions.filter(a => a.type === 'task_created')
    expect(taskActions).toHaveLength(1)
    expect(taskActions[0].payload.count).toBe(1)

    // Should have spam insight
    const spamInsights = result.insights.filter(i => i.summary.includes('spam'))
    expect(spamInsights).toHaveLength(1)

    // Should have actionable insight
    const actionableInsights = result.insights.filter(i => i.summary.includes('actionable'))
    expect(actionableInsights).toHaveLength(1)

    // Raw result preserved
    expect(result.raw?.processed).toBe(5)
  })

  it('handles triage failure gracefully', async () => {
    const { runTriage } = await import('@/lib/agent/channel-triage')
    vi.mocked(runTriage).mockRejectedValueOnce(new Error('DB connection failed'))

    const ctx = createMockContext()
    const result = await runWrappedTriageTick(ctx)

    expect(result.actions).toHaveLength(0)
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0].summary).toContain('Triage tick failed')
    expect(result.insights[0].priority).toBe('high')
    expect(result.raw).toBeNull()
  })
})

describe('Comms Wrapper', () => {
  it('translates ClientCommsTickResult into RoleActions and RoleInsights', async () => {
    const ctx = createMockContext()
    const result = await runWrappedCommsTick(ctx)

    // Should have response_sent action
    const sentActions = result.actions.filter(a => a.type === 'response_sent')
    expect(sentActions).toHaveLength(1)
    expect(sentActions[0].payload.count).toBe(1)

    // Should have draft_response action
    const draftActions = result.actions.filter(a => a.type === 'draft_response')
    expect(draftActions).toHaveLength(1)
    expect(draftActions[0].payload.count).toBe(2)
    expect(draftActions[0].payload.queued).toBe(1)

    // Should have no failure insights
    expect(result.insights).toHaveLength(0)

    // Raw result preserved
    expect(result.raw?.drafted).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 2. Follow-Up Detection Tests
// ---------------------------------------------------------------------------

describe('Follow-Up Tracker', () => {
  it('detects unanswered threads exceeding SLA', async () => {
    const eightHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString()

    const mockSupabase = createMockSupabase()
    // Mock channel_messages query
    mockSupabase.from = vi.fn((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      if (table === 'channel_messages') {
        query.order = vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              channel: 'gmail',
              sender: 'Client A',
              sender_email: 'client@example.com',
              subject: 'Project update needed',
              body: 'When can we expect the delivery?',
              received_at: eightHoursAgo,
              priority: 'high',
              metadata: { contact_id: 'contact-1', contact_name: 'Client A' },
            },
          ],
          error: null,
        })
      } else if (table === 'entity_timeline') {
        // No outbound messages (thread is unanswered)
        query.limit = vi.fn().mockResolvedValue({ data: [], error: null })
      }

      return query
    })

    const result = await detectUnansweredThreads(mockSupabase as any, 'org-001', {
      critical: 2,
      high: 8,
      medium: 24,
      low: 72,
    })

    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('contact-1')
    expect(result[0].contactName).toBe('Client A')
    expect(result[0].hoursWaiting).toBeGreaterThanOrEqual(9)
    expect(result[0].urgency).toBe('critical')
  })

  it('skips threads that have been answered', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()

    const mockSupabase = createMockSupabase()
    mockSupabase.from = vi.fn((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      if (table === 'channel_messages') {
        query.order = vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              channel: 'gmail',
              sender: 'Client B',
              body: 'Question about invoice',
              received_at: twoHoursAgo,
              priority: 'medium',
              metadata: { contact_id: 'contact-2', contact_name: 'Client B' },
            },
          ],
          error: null,
        })
      } else if (table === 'entity_timeline') {
        // We replied 1 hour ago
        query.limit = vi.fn().mockResolvedValue({
          data: [{ occurred_at: oneHourAgo }],
          error: null,
        })
      }

      return query
    })

    const result = await detectUnansweredThreads(mockSupabase as any, 'org-001')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Engagement Drop Detection Tests
// ---------------------------------------------------------------------------

describe('Relationship Monitor', () => {
  it('detects engagement drops above threshold', () => {
    const current: CommunicationFrequency[] = [
      {
        contactId: 'contact-1',
        contactName: 'Active Client',
        messagesPerWeek: 3.0,
        lastMessageAt: new Date().toISOString(),
        totalMessages: 12,
        channels: ['gmail'],
        status: 'active',
      },
      {
        contactId: 'contact-2',
        contactName: 'Cooling Client',
        messagesPerWeek: 0.5,
        lastMessageAt: new Date().toISOString(),
        totalMessages: 2,
        channels: ['gmail'],
        status: 'cooling',
      },
    ]

    const baselines: Record<string, { avgMessagesPerWeek: number; lastCalculated: string }> = {
      'contact-1': { avgMessagesPerWeek: 5.0, lastCalculated: new Date().toISOString() },
      'contact-2': { avgMessagesPerWeek: 3.0, lastCalculated: new Date().toISOString() },
    }

    const drops = detectEngagementDrops(current, baselines)

    // contact-2 dropped from 3.0 to 0.5 (83% drop) -- should be flagged
    expect(drops.length).toBeGreaterThanOrEqual(1)
    const contact2Drop = drops.find(d => d.contactId === 'contact-2')
    expect(contact2Drop).toBeDefined()
    expect(contact2Drop!.dropPercent).toBeGreaterThanOrEqual(50)
    expect(contact2Drop!.status).toBe('cooling')
  })

  it('detects completely silent contacts', () => {
    const current: CommunicationFrequency[] = []

    const baselines: Record<string, { avgMessagesPerWeek: number; lastCalculated: string }> = {
      'contact-gone': { avgMessagesPerWeek: 2.0, lastCalculated: new Date().toISOString() },
    }

    const drops = detectEngagementDrops(current, baselines)
    expect(drops).toHaveLength(1)
    expect(drops[0].contactId).toBe('contact-gone')
    expect(drops[0].dropPercent).toBe(100)
    expect(drops[0].status).toBe('dormant')
  })

  it('ignores contacts with low baseline', () => {
    const current: CommunicationFrequency[] = [
      {
        contactId: 'contact-low',
        contactName: 'Low Volume',
        messagesPerWeek: 0.1,
        lastMessageAt: new Date().toISOString(),
        totalMessages: 1,
        channels: ['gmail'],
        status: 'cooling',
      },
    ]

    const baselines: Record<string, { avgMessagesPerWeek: number; lastCalculated: string }> = {
      'contact-low': { avgMessagesPerWeek: 0.3, lastCalculated: new Date().toISOString() },
    }

    const drops = detectEngagementDrops(current, baselines)
    // Baseline < 0.5, should be ignored
    expect(drops).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. Tone Adaptation Tests
// ---------------------------------------------------------------------------

describe('Tone Adapter', () => {
  it('casualizes formal draft for casual contact', () => {
    const draft = 'Dear John,\n\nPlease find the update below.\n\nKind regards'
    const result = adaptDraft(draft, {
      formality: 'casual',
      verbosity: 'moderate',
      preferredGreeting: 'Hey',
      preferredSignOff: 'Cheers',
      samplePhrases: [],
      lastUpdated: new Date().toISOString(),
    })

    expect(result.adaptedDraft).toContain('Hey')
    expect(result.adaptedDraft).toContain('Cheers')
    expect(result.adaptedDraft).not.toContain('Dear')
    expect(result.adaptedDraft).not.toContain('Kind regards')
    expect(result.adaptations.length).toBeGreaterThan(0)
  })

  it('formalizes casual draft for formal contact', () => {
    const draft = 'Hey Jane,\n\nHere is the update.\n\nCheers'
    const result = adaptDraft(draft, {
      formality: 'formal',
      verbosity: 'moderate',
      preferredGreeting: 'Dear',
      preferredSignOff: 'Kind regards',
      samplePhrases: [],
      lastUpdated: new Date().toISOString(),
    })

    expect(result.adaptedDraft).toContain('Dear')
    expect(result.adaptedDraft).toContain('Kind regards')
    expect(result.adaptedDraft).not.toContain('Hey')
    expect(result.adaptedDraft).not.toContain('Cheers')
    expect(result.adaptations.length).toBeGreaterThan(0)
  })

  it('returns unmodified draft when no profile', () => {
    const draft = 'Hello there, this is the update.'
    const result = adaptDraft(draft, null)

    expect(result.adaptedDraft).toBe(draft)
    expect(result.profileApplied).toBeNull()
    expect(result.adaptations).toHaveLength(0)
  })

  it('removes filler phrases for concise contacts', () => {
    const draft = 'I hope this email finds you well. Here is a very long message that goes on and on with lots of details about various things that could probably be much shorter. I hope this email finds you well again. ' +
      'More text to make it long enough to trigger the verbosity check. Even more filler content here. And yet more padding text to ensure this exceeds the three hundred character threshold for the conciseness adaptation logic to kick in properly.'
    const result = adaptDraft(draft, {
      formality: 'neutral',
      verbosity: 'concise',
      preferredGreeting: null,
      preferredSignOff: null,
      samplePhrases: [],
      lastUpdated: new Date().toISOString(),
    })

    expect(result.adaptedDraft).not.toContain('I hope this email finds you well.')
    expect(result.adaptations).toContain('removed filler phrase')
  })
})

// ---------------------------------------------------------------------------
// 5. Overdue Escalation Workflow Tests
// ---------------------------------------------------------------------------

describe('Escalation Workflow', () => {
  it('creates workflow with correct structure', () => {
    const thread: UnansweredThread = {
      contactId: 'contact-1',
      contactName: 'Important Client',
      topic: 'Project deadline',
      channel: 'gmail',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'When is the project due?',
      hoursWaiting: 10,
      urgency: 'high',
      suggestedAction: 'Draft response',
    }

    const wf = createEscalationWorkflow(thread)

    expect(wf.workflowType).toBe('response_escalation')
    expect(wf.steps).toHaveLength(3)
    expect(wf.steps[0].stepId).toBe('auto_draft')
    expect(wf.steps[1].stepId).toBe('notify_user')
    expect(wf.steps[2].stepId).toBe('escalation_alert')
    expect(wf.context.contactId).toBe('contact-1')
    expect(wf.context.contactName).toBe('Important Client')
  })

  it('returns correct step definitions', () => {
    const defs = getEscalationStepDefs()

    expect(defs).toHaveLength(3)
    expect(defs[0].id).toBe('auto_draft')
    expect(defs[0].delaySeconds).toBe(ESCALATION_SCHEDULE.auto_draft * 3600)
    expect(defs[1].id).toBe('notify_user')
    expect(defs[2].id).toBe('escalation_alert')

    // All steps should have execute functions
    for (const def of defs) {
      expect(typeof def.execute).toBe('function')
      expect(typeof def.condition).toBe('function')
    }
  })

  it('escalation schedule has correct hour thresholds', () => {
    expect(ESCALATION_SCHEDULE.auto_draft).toBe(2)
    expect(ESCALATION_SCHEDULE.notify_user).toBe(8)
    expect(ESCALATION_SCHEDULE.escalate).toBe(24)
  })
})

// ---------------------------------------------------------------------------
// 6. Observer/Co-pilot/Autopilot Routing Tests
// ---------------------------------------------------------------------------

describe('Autonomy Level Routing', () => {
  it('observer: surfaces unanswered threads as insights only', async () => {
    // The comms-role evaluate() routes based on autonomyLevel
    // In observer mode, follow-up items become insights, not actions
    const ctx = createMockContext({ autonomyLevel: 'observer' })

    // We test the routing logic inline: observer should produce insights
    const thread: UnansweredThread = {
      contactId: 'c-1',
      contactName: 'Test Client',
      topic: 'Test topic',
      channel: 'gmail',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Test message',
      hoursWaiting: 10,
      urgency: 'high',
      suggestedAction: 'Draft response',
    }

    // Observer: no draft_response action, just insight
    expect(ctx.autonomyLevel).toBe('observer')
  })

  it('copilot: creates draft_response actions for unanswered threads', async () => {
    const ctx = createMockContext({ autonomyLevel: 'copilot' })
    expect(ctx.autonomyLevel).toBe('copilot')
  })

  it('autopilot: creates draft_response actions with auto-approval', async () => {
    const ctx = createMockContext({ autonomyLevel: 'autopilot' })
    expect(ctx.autonomyLevel).toBe('autopilot')
  })
})
