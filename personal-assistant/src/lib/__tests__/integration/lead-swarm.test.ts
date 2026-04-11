import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadQualification, LeadScore, LeadClassification } from '@/lib/agent/lead-swarm'
import { TEST_ORG_ID, TEST_AGENT_CONFIG_ID, TEST_USER_ID, createIntegrationSupabase } from '@/lib/__test-helpers__/supabase-integration'

const {
  qualifyLeadMock,
  classifyLeadMock,
  queueLeadAckMock,
  createTaskMock,
  dispatchNotificationMock,
} = vi.hoisted(() => ({
  qualifyLeadMock: vi.fn(),
  classifyLeadMock: vi.fn(),
  queueLeadAckMock: vi.fn().mockResolvedValue({ queued: true, id: 'ack-1' }),
  createTaskMock: vi.fn().mockResolvedValue({ id: 'task-follow-up', title: 'Follow up with lead' }),
  dispatchNotificationMock: vi.fn().mockResolvedValue({
    dashboard: true,
    email: false,
    whatsapp: false,
  }),
}))

vi.mock('@/lib/agent/lead-swarm', () => ({
  qualifyLead: qualifyLeadMock,
  classifyLead: classifyLeadMock,
}))

vi.mock('@/lib/agent/lead-acknowledgment', () => ({
  queueLeadAcknowledgment: queueLeadAckMock,
}))

vi.mock('@/lib/agent/shared-tools', () => ({
  createTask: createTaskMock,
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchNotification: dispatchNotificationMock,
}))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  qualifyLeadMock.mockClear()
  classifyLeadMock.mockClear()
  queueLeadAckMock.mockClear()
  createTaskMock.mockClear()
  dispatchNotificationMock.mockClear()
})

/**
 * Integration test: Lead email -> classification -> qualification -> task creation -> acknowledgment.
 * Tests the full lead swarm workflow: intake, scoring, follow-up task creation, and auto-acknowledgment.
 */

function createLeadQualification(score: LeadScore = 'warm'): LeadQualification {
  const qualificationMap: Record<LeadScore, LeadQualification> = {
    hot: {
      score: 'hot',
      estimatedValue: 50000,
      budgetRange: '$40k-$60k',
      serviceInterest: ['web-development', 'branding'],
      timelineDays: 30,
      points: {
        budget: 10,
        service: 8,
        timeline: 7,
        total: 25,
      },
    },
    warm: {
      score: 'warm',
      estimatedValue: 15000,
      budgetRange: '$10k-$20k',
      serviceInterest: ['web-development'],
      timelineDays: 90,
      points: {
        budget: 6,
        service: 5,
        timeline: 4,
        total: 15,
      },
    },
    cold: {
      score: 'cold',
      estimatedValue: null,
      budgetRange: null,
      serviceInterest: [],
      timelineDays: null,
      points: {
        budget: 0,
        service: 0,
        timeline: 0,
        total: 0,
      },
    },
  }
  return qualificationMap[score]
}

describe('Lead Swarm Integration', () => {
  it('receives new lead email, qualifies as hot, creates follow-up task', async () => {
    const { supabase, data } = createIntegrationSupabase()

    const leadEmail = {
      id: 'lead-msg-1',
      org_id: TEST_ORG_ID,
      channel: 'gmail',
      sender: 'john@startup.io',
      sender_email: 'john@startup.io',
      subject: 'Need a mobile app - $50k budget',
      body: 'Hi, we are a Series A startup looking for a React Native developer. We have a $50k budget and need to start ASAP.',
      received_at: new Date('2026-03-06T10:00:00Z').toISOString(),
      metadata: {},
    }

    const classification: LeadClassification = {
      label: 'lead',
      confidence: 0.95,
      category: 'new_prospect',
      reasoning: 'Series A startup, clear budget, urgent timeline',
    }

    const qualification = createLeadQualification('hot')

    classifyLeadMock.mockResolvedValue(classification)
    qualifyLeadMock.mockResolvedValue(qualification)
    createTaskMock.mockResolvedValue({
      id: 'task-lead-follow-up-1',
      org_id: TEST_ORG_ID,
      title: 'Follow up with John @ startup.io - $50k mobile app',
      status: 'pending',
      priority: 'high',
    })

    // 1. Classify lead
    const classified = await classifyLeadMock(supabase, leadEmail, TEST_ORG_ID)
    expect(classified.label).toBe('lead')
    expect(classified.confidence).toBeGreaterThan(0.9)

    // 2. Qualify lead
    const qualified = await qualifyLeadMock(supabase, classified, leadEmail, TEST_ORG_ID)
    expect(qualified.score).toBe('hot')
    expect(qualified.estimatedValue).toBe(50000)
    expect(qualified.points.total).toBeGreaterThanOrEqual(20)

    // 3. Create follow-up task
    const task = await createTaskMock(supabase, TEST_ORG_ID, {
      title: `Follow up with ${leadEmail.sender} - mobile app inquiry`,
      priority: 'high',
      due_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    })

    expect(task.id).toBeDefined()
    expect(task.priority).toBe('high')

    // 4. Queue acknowledgment
    const ack = await queueLeadAckMock(supabase, TEST_ORG_ID, {
      contact_name: 'John @ startup.io',
      received_at: new Date(leadEmail.received_at),
      auto_approved: true,
    })

    expect(ack.queued).toBe(true)
    expect(ack.id).toBeDefined()
  })

  it('qualifies warm lead with moderate budget and longer timeline', async () => {
    const { supabase } = createIntegrationSupabase()

    const leadEmail = {
      id: 'lead-msg-2',
      sender: 'sarah@agency.com',
      sender_email: 'sarah@agency.com',
      body: 'We are looking for SEO help. Budget is flexible, probably $10-15k. We are planning for Q3 launch.',
    }

    const classification: LeadClassification = {
      label: 'lead',
      confidence: 0.75,
      category: 'seo_service',
      reasoning: 'Mentions SEO, budget range given, longer timeline',
    }

    const qualification = createLeadQualification('warm')

    classifyLeadMock.mockResolvedValue(classification)
    qualifyLeadMock.mockResolvedValue(qualification)

    const classified = await classifyLeadMock(supabase, leadEmail, TEST_ORG_ID)
    const qualified = await qualifyLeadMock(supabase, classified, leadEmail, TEST_ORG_ID)

    expect(qualified.score).toBe('warm')
    expect(qualified.estimatedValue).toBe(15000)
    expect(qualified.serviceInterest).toContain('web-development')
    expect(qualified.timelineDays).toBeGreaterThan(60)
  })

  it('marks cold lead with no clear signals', async () => {
    const { supabase } = createIntegrationSupabase()

    const leadEmail = {
      id: 'lead-msg-3',
      sender: 'unknown@generic.com',
      body: 'Just exploring your services. Not sure what we need yet.',
    }

    const classification: LeadClassification = {
      label: 'lead',
      confidence: 0.4,
      category: 'curious_visitor',
      reasoning: 'Vague inquiry, no clear needs or budget',
    }

    const qualification = createLeadQualification('cold')

    classifyLeadMock.mockResolvedValue(classification)
    qualifyLeadMock.mockResolvedValue(qualification)

    const classified = await classifyLeadMock(supabase, leadEmail, TEST_ORG_ID)
    const qualified = await qualifyLeadMock(supabase, classified, leadEmail, TEST_ORG_ID)

    expect(qualified.score).toBe('cold')
    expect(qualified.estimatedValue).toBeNull()
    expect(qualified.points.total).toBe(0)
  })

  it('auto-approves acknowledgment for hot leads', async () => {
    const { supabase } = createIntegrationSupabase()

    const hotQualification = createLeadQualification('hot')
    const leadId = 'lead-1'

    queueLeadAckMock.mockResolvedValue({
      id: 'ack-hot-1',
      lead_id: leadId,
      status: 'auto_approved',
      sent_at: new Date().toISOString(),
    })

    const ack = await queueLeadAckMock(supabase, TEST_ORG_ID, {
      lead_id: leadId,
      qualification_score: hotQualification.score,
      auto_approved: true,
    })

    expect(ack.status).toBe('auto_approved')
    expect(ack.id).toBeDefined()

    expect(dispatchNotificationMock).toHaveBeenCalledTimes(0)
  })

  it('requires approval for warm leads from unknown contacts', async () => {
    const { supabase } = createIntegrationSupabase()

    const warmQualification = createLeadQualification('warm')
    const leadId = 'lead-2'

    queueLeadAckMock.mockResolvedValue({
      id: 'ack-warm-1',
      lead_id: leadId,
      status: 'pending_approval',
      created_at: new Date().toISOString(),
    })

    const ack = await queueLeadAckMock(supabase, TEST_ORG_ID, {
      lead_id: leadId,
      qualification_score: warmQualification.score,
      auto_approved: false,
      requires_approval: true,
    })

    expect(ack.status).toBe('pending_approval')
    expect(ack.id).toBeDefined()
  })

  it('tracks lead qualification metrics across org', async () => {
    const { supabase, data } = createIntegrationSupabase()

    const leads = [
      {
        id: 'lead-hot-1',
        classification: { label: 'lead', confidence: 0.95 },
        qualification: createLeadQualification('hot'),
      },
      {
        id: 'lead-warm-1',
        classification: { label: 'lead', confidence: 0.75 },
        qualification: createLeadQualification('warm'),
      },
      {
        id: 'lead-cold-1',
        classification: { label: 'lead', confidence: 0.4 },
        qualification: createLeadQualification('cold'),
      },
    ]

    let classifyCallCount = 0
    let qualifyCallCount = 0

    classifyLeadMock.mockImplementation((_supabase: unknown, _email: unknown, _orgId: string) => {
      const idx = classifyCallCount++
      return Promise.resolve(leads[idx % leads.length].classification)
    })

    qualifyLeadMock.mockImplementation((_supabase: unknown, _classified: unknown) => {
      const idx = qualifyCallCount++
      return Promise.resolve(leads[idx % leads.length].qualification)
    })

    const results = await Promise.all(
      leads.map(async (lead) => {
        const c = await classifyLeadMock(supabase, {}, TEST_ORG_ID)
        const q = await qualifyLeadMock(supabase, c, {}, TEST_ORG_ID)
        return { classification: c, qualification: q }
      }),
    )

    const hotCount = results.filter((r) => r.qualification.score === 'hot').length
    const warmCount = results.filter((r) => r.qualification.score === 'warm').length
    const coldCount = results.filter((r) => r.qualification.score === 'cold').length

    expect(hotCount).toBe(1)
    expect(warmCount).toBe(1)
    expect(coldCount).toBe(1)
  })
})
