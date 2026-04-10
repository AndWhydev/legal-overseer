/**
 * Human Handoff Tool Tests
 *
 * Tests the tool definition shape, handler approval creation,
 * urgency mapping, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (must be declared before imports that reference them)
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const mockCreateApproval = vi.fn()
const mockNotifyApproval = vi.fn()

vi.mock('../../approval-queue', () => ({
  createApproval: (...args: unknown[]) => mockCreateApproval(...args),
}))

vi.mock('../../approval-notifier', () => ({
  notifyApproval: (...args: unknown[]) => mockNotifyApproval(...args),
}))

import { humanHandoffToolDefinition, handleHumanHandoff } from '../../tools/human-handoff'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeSupabase() {
  return {} as Parameters<typeof handleHumanHandoff>[2]
}

const ORG_ID = 'org-test-123'

// ---------------------------------------------------------------------------
// Tool definition shape
// ---------------------------------------------------------------------------

describe('humanHandoffToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(humanHandoffToolDefinition.name).toBe('request_human_handoff')
  })

  it('requires description and expected_result fields', () => {
    const schema = humanHandoffToolDefinition.input_schema as {
      required: string[]
      properties: Record<string, unknown>
    }
    expect(schema.required).toContain('description')
    expect(schema.required).toContain('expected_result')
  })

  it('includes optional context and urgency fields', () => {
    const schema = humanHandoffToolDefinition.input_schema as {
      properties: Record<string, unknown>
    }
    expect(schema.properties).toHaveProperty('context')
    expect(schema.properties).toHaveProperty('urgency')
  })

  it('defines urgency enum as urgent/normal/low', () => {
    const schema = humanHandoffToolDefinition.input_schema as {
      properties: Record<string, { enum?: string[] }>
    }
    expect(schema.properties.urgency.enum).toEqual(['urgent', 'normal', 'low'])
  })
})

// ---------------------------------------------------------------------------
// Handler behaviour
// ---------------------------------------------------------------------------

describe('handleHumanHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotifyApproval.mockResolvedValue(true)
  })

  it('creates approval with action_type=human_handoff and confidence_score=0', async () => {
    const fakeApproval = { id: 'approval-001', action_summary: 'Human handoff: test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    await handleHumanHandoff(
      { description: 'Please verify the bank transfer', expected_result: 'Confirmation screenshot' },
      ORG_ID,
      fakeSupabase(),
    )

    expect(mockCreateApproval).toHaveBeenCalledTimes(1)
    const params = mockCreateApproval.mock.calls[0][1]
    expect(params.action_type).toBe('human_handoff')
    expect(params.confidence_score).toBe(0)
    expect(params.routing_decision).toBe('escalate')
    expect(params.org_id).toBe(ORG_ID)
  })

  it('returns success:true and queued:true with approvalId', async () => {
    const fakeApproval = { id: 'approval-002', action_summary: 'Human handoff: pay invoice' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    const result = await handleHumanHandoff(
      { description: 'Pay the invoice', expected_result: 'Payment confirmation' },
      ORG_ID,
      fakeSupabase(),
    )

    expect(result.success).toBe(true)
    expect(result.queued).toBe(true)
    expect(result.approvalId).toBe('approval-002')
  })

  it('maps urgency to approval priority correctly', async () => {
    const fakeApproval = { id: 'approval-003', action_summary: 'test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    // Test urgent
    await handleHumanHandoff(
      { description: 'Urgent task', expected_result: 'Done', urgency: 'urgent' },
      ORG_ID,
      fakeSupabase(),
    )
    expect(mockCreateApproval.mock.calls[0][1].priority).toBe('urgent')

    // Test low
    mockCreateApproval.mockResolvedValue({ id: 'approval-004', action_summary: 'test' })
    await handleHumanHandoff(
      { description: 'Low task', expected_result: 'Done', urgency: 'low' },
      ORG_ID,
      fakeSupabase(),
    )
    expect(mockCreateApproval.mock.calls[1][1].priority).toBe('low')
  })

  it('defaults urgency to normal when not specified', async () => {
    const fakeApproval = { id: 'approval-005', action_summary: 'test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    await handleHumanHandoff(
      { description: 'Regular task', expected_result: 'Done' },
      ORG_ID,
      fakeSupabase(),
    )

    expect(mockCreateApproval.mock.calls[0][1].priority).toBe('normal')
  })

  it('includes context fields in action_payload and context_snapshot', async () => {
    const fakeApproval = { id: 'approval-006', action_summary: 'test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    await handleHumanHandoff(
      {
        description: 'Log in to Stripe',
        expected_result: 'API key',
        context: {
          service: 'Stripe',
          attempted_tiers: ['api', 'browser'],
          reason: 'MFA required',
          url: 'https://dashboard.stripe.com',
        },
      },
      ORG_ID,
      fakeSupabase(),
    )

    const params = mockCreateApproval.mock.calls[0][1]
    expect(params.action_payload.service).toBe('Stripe')
    expect(params.action_payload.attempted_tiers).toEqual(['api', 'browser'])
    expect(params.context_snapshot.url).toBe('https://dashboard.stripe.com')
    expect(params.context_snapshot.reason).toBe('MFA required')
  })

  it('handles errors gracefully and returns success:false', async () => {
    mockCreateApproval.mockRejectedValue(new Error('DB connection failed'))

    const result = await handleHumanHandoff(
      { description: 'Task', expected_result: 'Result' },
      ORG_ID,
      fakeSupabase(),
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB connection failed')
  })

  it('returns error when description is missing', async () => {
    const result = await handleHumanHandoff(
      { description: '', expected_result: 'Something' },
      ORG_ID,
      fakeSupabase(),
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('required')
  })

  it('returns error when expected_result is missing', async () => {
    const result = await handleHumanHandoff(
      { description: 'Do something', expected_result: '' },
      ORG_ID,
      fakeSupabase(),
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('required')
  })

  it('uses agentConfigId from execOptions when provided', async () => {
    const fakeApproval = { id: 'approval-007', action_summary: 'test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    await handleHumanHandoff(
      { description: 'Task', expected_result: 'Result' },
      ORG_ID,
      fakeSupabase(),
      { agentConfigId: 'real-agent-config-id' },
    )

    const params = mockCreateApproval.mock.calls[0][1]
    expect(params.agent_config_id).toBe('real-agent-config-id')
  })

  it('uses sentinel agent_config_id when execOptions lacks agentConfigId', async () => {
    const fakeApproval = { id: 'approval-008', action_summary: 'test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    await handleHumanHandoff(
      { description: 'Task', expected_result: 'Result' },
      ORG_ID,
      fakeSupabase(),
    )

    const params = mockCreateApproval.mock.calls[0][1]
    expect(params.agent_config_id).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('truncates long summaries to 200 characters', async () => {
    const fakeApproval = { id: 'approval-009', action_summary: 'test' }
    mockCreateApproval.mockResolvedValue(fakeApproval)

    const longDesc = 'A'.repeat(250)
    await handleHumanHandoff(
      { description: longDesc, expected_result: 'Result' },
      ORG_ID,
      fakeSupabase(),
    )

    const params = mockCreateApproval.mock.calls[0][1]
    expect(params.action_summary.length).toBe(200)
    expect(params.action_summary.endsWith('...')).toBe(true)
  })
})
