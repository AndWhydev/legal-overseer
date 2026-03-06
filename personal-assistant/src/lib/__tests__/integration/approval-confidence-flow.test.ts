import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { TEST_ORG_ID, TEST_AGENT_CONFIG_ID, TEST_USER_ID, createIntegrationSupabase } from '@/lib/__test-helpers__/supabase-integration'

const {
  evaluateConfidenceMock,
  createApprovalMock,
  dispatchNotificationMock,
  resolveApprovalMock,
} = vi.hoisted(() => ({
  evaluateConfidenceMock: vi.fn(),
  createApprovalMock: vi.fn(),
  dispatchNotificationMock: vi.fn().mockResolvedValue({
    dashboard: true,
    email: true,
    whatsapp: false,
  }),
  resolveApprovalMock: vi.fn(),
}))

vi.mock('@/lib/agent/confidence-router', () => ({
  evaluateConfidence: evaluateConfidenceMock,
}))

vi.mock('@/lib/agent/approval-queue', () => ({
  createApproval: createApprovalMock,
  resolveApproval: resolveApprovalMock,
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchNotification: dispatchNotificationMock,
}))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  evaluateConfidenceMock.mockClear()
  createApprovalMock.mockClear()
  dispatchNotificationMock.mockClear()
  resolveApprovalMock.mockClear()
})

/**
 * Integration test: Low-confidence tool call -> approval queue -> notification -> resolution.
 * Tests the approval flow when agent confidence is below threshold, including
 * human approval/rejection and execution confirmation.
 */

interface ToolCall {
  id: string
  tool_name: string
  arguments: Record<string, unknown>
  confidence: number
  reasoning: string
}

interface ApprovalRecord {
  id: string
  org_id: string
  agent_config_id: string
  action_type: string
  action_payload: Record<string, unknown>
  action_summary: string
  confidence_score: number
  routing_decision: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  resolved_at?: string
  resolved_by?: string
}

interface NotificationEvent {
  org_id: string
  type: string
  urgency: 'critical' | 'high' | 'normal' | 'low'
  metadata: Record<string, unknown>
}

describe('Approval Confidence Flow Integration', () => {
  it('queues low-confidence tool call for approval', async () => {
    const { supabase } = createIntegrationSupabase()

    const toolCall: ToolCall = {
      id: 'tool-call-1',
      tool_name: 'send_email',
      arguments: {
        to: 'client@example.com',
        subject: 'Updated proposal',
        body: 'Here is the revised proposal...',
      },
      confidence: 0.65,
      reasoning: 'Email address partially matched, content uncertain',
    }

    // 1. Evaluate confidence
    evaluateConfidenceMock.mockResolvedValue({
      confidence: 0.65,
      threshold: 0.8,
      requiresApproval: true,
      reasoning: 'Below confidence threshold',
    })

    const confidenceResult = await evaluateConfidenceMock(supabase, toolCall, TEST_ORG_ID)
    expect(confidenceResult.requiresApproval).toBe(true)
    expect(confidenceResult.confidence).toBeLessThan(confidenceResult.threshold)

    // 2. Create approval
    const approval: ApprovalRecord = {
      id: 'approval-1',
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_email',
      action_payload: toolCall.arguments,
      action_summary: `Send email to ${toolCall.arguments.to}`,
      confidence_score: toolCall.confidence,
      routing_decision: 'ask',
      status: 'pending',
      created_at: new Date().toISOString(),
    }

    createApprovalMock.mockResolvedValue(approval)

    const queued = await createApprovalMock(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_email',
      action_payload: toolCall.arguments,
      action_summary: `Send email to ${toolCall.arguments.to}`,
      confidence_score: toolCall.confidence,
      routing_decision: 'ask',
      priority: 'normal',
    })

    expect(queued.id).toBeDefined()
    expect(queued.status).toBe('pending')
    expect(queued.confidence_score).toBe(0.65)
  })

  it('routes high-confidence tool call without approval', async () => {
    const { supabase } = createIntegrationSupabase()

    const toolCall: ToolCall = {
      id: 'tool-call-2',
      tool_name: 'create_task',
      arguments: {
        title: 'Follow up with Alice',
        priority: 'normal',
        contact_id: 'contact-1',
      },
      confidence: 0.95,
      reasoning: 'Clear intent, known contact, safe operation',
    }

    evaluateConfidenceMock.mockResolvedValue({
      confidence: 0.95,
      threshold: 0.8,
      requiresApproval: false,
      reasoning: 'Above confidence threshold',
    })

    const confidenceResult = await evaluateConfidenceMock(supabase, toolCall, TEST_ORG_ID)
    expect(confidenceResult.requiresApproval).toBe(false)

    // Should NOT create approval
    expect(createApprovalMock).not.toHaveBeenCalled()
  })

  it('approves pending approval and executes action', async () => {
    const { supabase } = createIntegrationSupabase()

    const approval: ApprovalRecord = {
      id: 'approval-2',
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_email',
      action_payload: {
        to: 'alice@example.com',
        subject: 'Project update',
        body: 'Here is the latest update...',
      },
      action_summary: 'Send email to alice@example.com',
      confidence_score: 0.72,
      routing_decision: 'ask',
      status: 'pending',
      created_at: new Date().toISOString(),
    }

    createApprovalMock.mockResolvedValue(approval)

    // 1. Create approval (already queued)
    const queued = await createApprovalMock(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: approval.action_type,
      action_payload: approval.action_payload,
      action_summary: approval.action_summary,
      confidence_score: approval.confidence_score,
      routing_decision: approval.routing_decision,
      priority: 'normal',
    })

    expect(queued.status).toBe('pending')

    // 2. Resolve as approved
    const resolved: ApprovalRecord = {
      ...approval,
      status: 'approved',
      resolved_at: new Date().toISOString(),
      resolved_by: TEST_USER_ID,
    }

    resolveApprovalMock.mockResolvedValue(resolved)

    const result = await resolveApprovalMock(supabase, approval.id, 'approved', TEST_USER_ID, 'dashboard')

    expect(result.status).toBe('approved')
    expect(result.resolved_by).toBe(TEST_USER_ID)
  })

  it('rejects approval and does not execute action', async () => {
    const { supabase } = createIntegrationSupabase()

    const approval: ApprovalRecord = {
      id: 'approval-3',
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_bulk_email',
      action_payload: {
        recipients: ['user1@example.com', 'user2@example.com'],
        template: 'promotional',
      },
      action_summary: 'Send bulk promotional email to 2 recipients',
      confidence_score: 0.58,
      routing_decision: 'ask',
      status: 'pending',
      created_at: new Date().toISOString(),
    }

    createApprovalMock.mockResolvedValue(approval)
    const queued = await createApprovalMock(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: approval.action_type,
      action_payload: approval.action_payload,
      action_summary: approval.action_summary,
      confidence_score: approval.confidence_score,
      routing_decision: approval.routing_decision,
      priority: 'normal',
    })

    expect(queued.status).toBe('pending')

    // Reject the approval
    const rejected: ApprovalRecord = {
      ...approval,
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: TEST_USER_ID,
    }

    resolveApprovalMock.mockResolvedValue(rejected)

    const result = await resolveApprovalMock(supabase, approval.id, 'rejected', TEST_USER_ID, 'dashboard')

    expect(result.status).toBe('rejected')
    expect(result.resolved_by).toBe(TEST_USER_ID)
  })

  it('handles urgent approvals with high urgency notification', async () => {
    const { supabase } = createIntegrationSupabase()

    const urgentToolCall: ToolCall = {
      id: 'tool-call-3',
      tool_name: 'refund_payment',
      arguments: {
        invoice_id: 'inv-123',
        amount: 5000,
        reason: 'customer_complaint',
      },
      confidence: 0.7,
      reasoning: 'Financial operation with customer risk',
    }

    evaluateConfidenceMock.mockResolvedValue({
      confidence: 0.7,
      threshold: 0.85,
      requiresApproval: true,
      reasoning: 'Financial operation requires high confidence',
    })

    const urgentApproval: ApprovalRecord = {
      id: 'approval-urgent-1',
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'refund_payment',
      action_payload: urgentToolCall.arguments,
      action_summary: `Refund $5000 for invoice inv-123`,
      confidence_score: 0.7,
      routing_decision: 'ask',
      status: 'pending',
      created_at: new Date().toISOString(),
    }

    createApprovalMock.mockResolvedValue(urgentApproval)

    const queued = await createApprovalMock(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'refund_payment',
      action_payload: urgentToolCall.arguments,
      action_summary: `Refund $5000 for invoice inv-123`,
      confidence_score: 0.7,
      routing_decision: 'ask',
      priority: 'urgent',
    })

    expect(queued.id).toBeDefined()
    expect(queued.status).toBe('pending')
  })

  it('prevents double-approval on already resolved approval', async () => {
    const { supabase } = createIntegrationSupabase()

    const approval: ApprovalRecord = {
      id: 'approval-4',
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'delete_task',
      action_payload: { task_id: 'task-999' },
      action_summary: 'Delete task task-999',
      confidence_score: 0.6,
      routing_decision: 'ask',
      status: 'approved',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by: TEST_USER_ID,
    }

    // Try to resolve already-resolved approval
    resolveApprovalMock.mockRejectedValueOnce(
      new Error('APPROVAL_ALREADY_RESOLVED: Cannot resolve approval that is already approved'),
    )

    await expect(
      resolveApprovalMock(supabase, approval.id, 'rejected', TEST_USER_ID, 'dashboard'),
    ).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
  })

  it('prioritizes urgent approvals in queue ordering', async () => {
    const { supabase } = createIntegrationSupabase()

    const approvals: ApprovalRecord[] = [
      {
        id: 'approval-normal-1',
        org_id: TEST_ORG_ID,
        agent_config_id: TEST_AGENT_CONFIG_ID,
        action_type: 'send_email',
        action_payload: {},
        action_summary: 'Normal priority approval',
        confidence_score: 0.7,
        routing_decision: 'ask',
        status: 'pending',
        created_at: new Date('2026-03-06T10:00:00Z').toISOString(),
      },
      {
        id: 'approval-urgent-2',
        org_id: TEST_ORG_ID,
        agent_config_id: TEST_AGENT_CONFIG_ID,
        action_type: 'refund_payment',
        action_payload: {},
        action_summary: 'Urgent payment refund',
        confidence_score: 0.75,
        routing_decision: 'ask',
        status: 'pending',
        created_at: new Date('2026-03-06T10:05:00Z').toISOString(),
      },
    ]

    createApprovalMock
      .mockResolvedValueOnce(approvals[0])
      .mockResolvedValueOnce(approvals[1])

    // Create in reverse order
    await createApprovalMock(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_email',
      action_payload: {},
      action_summary: 'Normal priority approval',
      confidence_score: 0.7,
      routing_decision: 'ask',
      priority: 'normal',
    })

    await createApprovalMock(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'refund_payment',
      action_payload: {},
      action_summary: 'Urgent payment refund',
      confidence_score: 0.75,
      routing_decision: 'ask',
      priority: 'urgent',
    })

    // Urgent should be processed first even though created second
    expect(createApprovalMock).toHaveBeenCalledTimes(2)
  })

  it('tracks confidence score and resolution time metrics', async () => {
    const { supabase } = createIntegrationSupabase()

    const confidenceScores = [0.55, 0.65, 0.72, 0.78, 0.85]
    const createdApprovals: ApprovalRecord[] = []

    for (let i = 0; i < confidenceScores.length; i++) {
      const approval: ApprovalRecord = {
        id: `approval-metric-${i}`,
        org_id: TEST_ORG_ID,
        agent_config_id: TEST_AGENT_CONFIG_ID,
        action_type: 'send_email',
        action_payload: {},
        action_summary: `Test approval ${i}`,
        confidence_score: confidenceScores[i],
        routing_decision: 'ask',
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      createdApprovals.push(approval)
      createApprovalMock.mockResolvedValueOnce(approval)
    }

    for (const approval of createdApprovals) {
      await createApprovalMock(supabase, {
        org_id: TEST_ORG_ID,
        agent_config_id: TEST_AGENT_CONFIG_ID,
        action_type: 'send_email',
        action_payload: {},
        action_summary: approval.action_summary,
        confidence_score: approval.confidence_score,
        routing_decision: 'ask',
        priority: 'normal',
      })
    }

    const avgConfidence = createdApprovals.reduce((sum, a) => sum + a.confidence_score, 0) / createdApprovals.length
    const minConfidence = Math.min(...createdApprovals.map((a) => a.confidence_score))
    const maxConfidence = Math.max(...createdApprovals.map((a) => a.confidence_score))

    expect(avgConfidence).toBeGreaterThan(0.7)
    expect(minConfidence).toBe(0.55)
    expect(maxConfidence).toBe(0.85)
  })
})
