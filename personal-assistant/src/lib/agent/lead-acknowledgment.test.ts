import { describe, expect, it, vi } from 'vitest'
import {
  autoApproveLeadAcknowledgment,
  escalateHighValueLead,
  processPendingLeadAcks,
  queueLeadAcknowledgment,
} from './lead-acknowledgment'

const { notifyApprovalMock } = vi.hoisted(() => ({
  notifyApprovalMock: vi.fn().mockResolvedValue(true),
}))

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}))

vi.mock('./approval-notifier', () => ({
  notifyApproval: notifyApprovalMock,
}))

vi.mock('../channels/whatsapp', () => ({
  sendMessage: sendMessageMock,
}))

interface LeadRow {
  id: string
  org_id: string
  source_channel: string
  source_detail: string | null
  status: string
  ack_status: string
  created_at: string
  estimated_value: number | null
  service_interest: string[] | null
  timeline_days: number | null
  metadata: Record<string, unknown> | null
  ack_draft_created_at?: string | null
}

interface ApprovalRow {
  id: string
  org_id: string
  agent_config_id: string
  action_type: string
  action_payload: Record<string, unknown>
  action_summary: string
  confidence_score: number
  routing_decision: 'ask' | 'escalate'
  priority: 'urgent' | 'normal' | 'low'
  digest_eligible: boolean
  status: 'pending' | 'approved'
  context_snapshot: Record<string, unknown>
  created_at: string
  agent_configs?: { name: string | null }
}

interface AgentConfigRow {
  id: string
  org_id: string
  agent_type: string
}

function createApprovedAck(input: {
  id: string
  orgId: string
  leadId: string
  payload?: Record<string, unknown>
}): ApprovalRow {
  return {
    id: input.id,
    org_id: input.orgId,
    agent_config_id: 'cfg-1',
    action_type: 'lead_ack_send',
    action_payload: {
      lead_id: input.leadId,
      message_channel: 'whatsapp',
      recipient: '+15551234567',
      draft_body: 'Thanks for reaching out.',
      ...(input.payload ?? {}),
    },
    action_summary: 'Send lead acknowledgment draft',
    confidence_score: 0,
    routing_decision: 'ask',
    priority: 'normal',
    digest_eligible: false,
    status: 'approved',
    context_snapshot: {},
    created_at: new Date().toISOString(),
    agent_configs: { name: null },
  }
}

function createMockSupabase(input: {
  leads?: LeadRow[]
  approvals?: ApprovalRow[]
  agentConfigs?: AgentConfigRow[]
}) {
  const state = {
    leads: [...(input.leads ?? [])],
    approvals: [...(input.approvals ?? [])],
    agentConfigs: [...(input.agentConfigs ?? [])],
    approvalSeq: 1,
  }

  const api = {
    from(table: string) {
      if (table === 'leads') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              in(key: string, values: unknown[]) {
                filters[key] = values
                const rows = state.leads.filter((lead) => {
                  if (filters.org_id && lead.org_id !== String(filters.org_id)) return false
                  if (filters.status && lead.status !== String(filters.status)) return false
                  const allowed = (values as string[]).map(String)
                  return allowed.includes(String((lead as unknown as Record<string, unknown>)[key]))
                })
                return Promise.resolve({ data: rows, error: null })
              },
              single() {
                const row = state.leads.find(
                  (lead) =>
                    (filters.id ? lead.id === String(filters.id) : true) &&
                    (filters.org_id ? lead.org_id === String(filters.org_id) : true),
                )
                if (!row) {
                  return Promise.resolve({ data: null, error: { message: 'not found' } })
                }
                return Promise.resolve({ data: row, error: null })
              },
            }
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            const runUpdate = () => {
              const lead = state.leads.find(
                (candidate) =>
                  (filters.id ? candidate.id === String(filters.id) : true) &&
                  (filters.org_id ? candidate.org_id === String(filters.org_id) : true),
              )
              if (!lead) {
                return { data: null, error: { message: 'not found' } }
              }
              Object.assign(lead, patch)
              return { data: null, error: null }
            }

            const chain = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return chain
              },
              then(resolve: (value: { data: null; error: { message: string } | null }) => unknown) {
                return Promise.resolve(runUpdate()).then(resolve)
              },
            }

            return chain
          },
        }
      }

      if (table === 'approval_queue') {
        return {
          insert(payload: Record<string, unknown>) {
            const row: ApprovalRow = {
              id: `approval-${state.approvalSeq++}`,
              org_id: String(payload.org_id),
              agent_config_id: String(payload.agent_config_id),
              action_type: String(payload.action_type),
              action_payload: (payload.action_payload as Record<string, unknown>) ?? {},
              action_summary: String(payload.action_summary),
              confidence_score: Number(payload.confidence_score ?? 0),
              routing_decision: payload.routing_decision as 'ask' | 'escalate',
              priority: (payload.priority as 'urgent' | 'normal' | 'low') ?? 'normal',
              digest_eligible: Boolean(payload.digest_eligible ?? false),
              status: (payload.status as 'pending' | 'approved') ?? 'pending',
              context_snapshot: (payload.context_snapshot as Record<string, unknown>) ?? {},
              created_at: new Date().toISOString(),
              agent_configs: { name: null },
            }
            state.approvals.push(row)
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: row, error: null })
                  },
                }
              },
            }
          },
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                if (Object.keys(filters).length >= 3) {
                  const rows = state.approvals.filter((approval) => {
                    if (filters.org_id && approval.org_id !== String(filters.org_id)) return false
                    if (filters.action_type && approval.action_type !== String(filters.action_type)) return false
                    if (filters.status && approval.status !== String(filters.status)) return false
                    return true
                  })
                  return Promise.resolve({ data: rows, error: null })
                }
                return this
              },
            }
          },
        }
      }

      if (table === 'agent_configs') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              limit(value: number) {
                const rows = state.agentConfigs
                  .filter((cfg) => {
                    if (filters.org_id && cfg.org_id !== String(filters.org_id)) return false
                    if (filters.agent_type && cfg.agent_type !== String(filters.agent_type)) return false
                    return true
                  })
                  .slice(0, value)
                return Promise.resolve({ data: rows, error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
    state,
  }
}

describe('queueLeadAcknowledgment', () => {
  it('queues draft approvals inside the 2-minute SLA window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T14:00:00.000Z'))

    const { supabase, state } = createMockSupabase({
      leads: [
        {
          id: 'lead-1',
          org_id: 'org-1',
          source_channel: 'gmail',
          source_detail: 'buyer@example.com',
          status: 'qualified',
          ack_status: 'pending',
          created_at: '2026-02-22T13:59:10.000Z',
          estimated_value: 4500,
          service_interest: ['seo'],
          timeline_days: 14,
          metadata: {},
        },
      ],
    })

    const result = await queueLeadAcknowledgment(supabase, {
      lead: state.leads[0],
      agentConfigId: 'cfg-1',
    })

    expect(result).toEqual({ queued: true, skippedOverdue: false, approvalId: 'approval-1' })
    expect(state.approvals).toHaveLength(1)
    expect(state.approvals[0].action_type).toBe('lead_ack_send')
    expect(state.leads[0].ack_status).toBe('draft_queued')

    vi.useRealTimers()
  })
})

describe('processPendingLeadAcks', () => {
  it('does not mark leads as sent before approval', async () => {
    sendMessageMock.mockReset()

    const { supabase, state } = createMockSupabase({
      agentConfigs: [{ id: 'cfg-1', org_id: 'org-1', agent_type: 'lead-swarm' }],
      leads: [
        {
          id: 'lead-2',
          org_id: 'org-1',
          source_channel: 'gmail',
          source_detail: 'prospect@example.com',
          status: 'qualified',
          ack_status: 'pending',
          created_at: new Date(Date.now() - 30_000).toISOString(),
          estimated_value: 3000,
          service_interest: ['web-development'],
          timeline_days: 20,
          metadata: {},
        },
      ],
    })

    const result = await processPendingLeadAcks(supabase, 'org-1')

    expect(result.sent).toBe(0)
    expect(result.queued).toBe(1)
    expect(state.leads[0].ack_status).toBe('draft_queued')
  })

  it('marks lead sent and stores ackDelivery metadata when provider send succeeds', async () => {
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue('wamid.12345')

    const { supabase, state } = createMockSupabase({
      agentConfigs: [{ id: 'cfg-1', org_id: 'org-1', agent_type: 'lead-swarm' }],
      leads: [
        {
          id: 'lead-approved-success',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: '+15551234567',
          status: 'qualified',
          ack_status: 'draft_queued',
          created_at: new Date(Date.now() - 30_000).toISOString(),
          estimated_value: 2500,
          service_interest: ['seo'],
          timeline_days: 10,
          metadata: {},
        },
      ],
      approvals: [
        createApprovedAck({
          id: 'approval-success',
          orgId: 'org-1',
          leadId: 'lead-approved-success',
        }),
      ],
    })

    const result = await processPendingLeadAcks(supabase, 'org-1')

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(state.leads[0].ack_status).toBe('sent')
    expect(state.leads[0].metadata?.ackDelivery).toMatchObject({
      status: 'sent',
      providerMessageId: 'wamid.12345',
      channel: 'whatsapp',
      approvalId: 'approval-success',
    })
    expect(sendMessageMock).toHaveBeenCalledWith('+15551234567', 'Thanks for reaching out.')
  })

  it('records failed ackDelivery and keeps lead non-sent when provider send fails', async () => {
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue(null)

    const { supabase, state } = createMockSupabase({
      agentConfigs: [{ id: 'cfg-1', org_id: 'org-1', agent_type: 'lead-swarm' }],
      leads: [
        {
          id: 'lead-approved-failure',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: '+15551234567',
          status: 'qualified',
          ack_status: 'draft_queued',
          created_at: new Date(Date.now() - 30_000).toISOString(),
          estimated_value: 2500,
          service_interest: ['seo'],
          timeline_days: 10,
          metadata: {},
        },
      ],
      approvals: [
        createApprovedAck({
          id: 'approval-failure',
          orgId: 'org-1',
          leadId: 'lead-approved-failure',
        }),
      ],
    })

    const result = await processPendingLeadAcks(supabase, 'org-1')

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    expect(state.leads[0].ack_status).toBe('draft_queued')
    expect(state.leads[0].metadata?.ackDelivery).toMatchObject({
      status: 'failed',
      channel: 'whatsapp',
      reason: 'provider_send_failed',
      approvalId: 'approval-failure',
    })
  })

  it('records missing-recipient failure metadata and keeps lead non-sent', async () => {
    sendMessageMock.mockReset()

    const { supabase, state } = createMockSupabase({
      agentConfigs: [{ id: 'cfg-1', org_id: 'org-1', agent_type: 'lead-swarm' }],
      leads: [
        {
          id: 'lead-approved-missing-recipient',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: null,
          status: 'qualified',
          ack_status: 'draft_queued',
          created_at: new Date(Date.now() - 30_000).toISOString(),
          estimated_value: 2500,
          service_interest: ['seo'],
          timeline_days: 10,
          metadata: {},
        },
      ],
      approvals: [
        createApprovedAck({
          id: 'approval-missing-recipient',
          orgId: 'org-1',
          leadId: 'lead-approved-missing-recipient',
          payload: {
            recipient: '',
          },
        }),
      ],
    })

    const result = await processPendingLeadAcks(supabase, 'org-1')

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    expect(state.leads[0].ack_status).toBe('draft_queued')
    expect(state.leads[0].metadata?.ackDelivery).toMatchObject({
      status: 'failed',
      channel: 'whatsapp',
      reason: 'missing_recipient',
      approvalId: 'approval-missing-recipient',
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})

describe('autoApproveLeadAcknowledgment', () => {
  it('auto-approves high-confidence lead within SLA and sets ack_status to sent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T14:00:30.000Z'))
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue('wamid.auto-1')

    const { supabase, state } = createMockSupabase({
      leads: [
        {
          id: 'lead-auto-1',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: '+15559876543',
          status: 'qualified',
          ack_status: 'pending',
          created_at: '2026-02-22T14:00:00.000Z',
          estimated_value: 15000,
          service_interest: ['seo', 'web-development'],
          timeline_days: 14,
          metadata: {},
        },
      ],
    })

    const result = await autoApproveLeadAcknowledgment(supabase, {
      lead: state.leads[0],
      agentConfigId: 'cfg-1',
    })

    expect(result).toEqual({ sent: true })
    expect(state.leads[0].ack_status).toBe('sent')
    expect(sendMessageMock).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('marks overdue and returns sla_exceeded when outside SLA window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T14:05:00.000Z'))
    sendMessageMock.mockReset()

    const { supabase, state } = createMockSupabase({
      leads: [
        {
          id: 'lead-auto-2',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: '+15559876543',
          status: 'qualified',
          ack_status: 'pending',
          created_at: '2026-02-22T14:00:00.000Z',
          estimated_value: 10000,
          service_interest: ['ads'],
          timeline_days: 7,
          metadata: {},
        },
      ],
    })

    const result = await autoApproveLeadAcknowledgment(supabase, {
      lead: state.leads[0],
      agentConfigId: 'cfg-1',
    })

    expect(result).toEqual({ sent: false, error: 'sla_exceeded' })
    expect(state.leads[0].ack_status).toBe('overdue')
    expect(sendMessageMock).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('sets autoApproved: true in lead metadata', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T14:00:30.000Z'))
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue('wamid.auto-2')

    const { supabase, state } = createMockSupabase({
      leads: [
        {
          id: 'lead-auto-3',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: '+15559876543',
          status: 'qualified',
          ack_status: 'pending',
          created_at: '2026-02-22T14:00:00.000Z',
          estimated_value: 8000,
          service_interest: ['seo'],
          timeline_days: 14,
          metadata: {},
        },
      ],
    })

    await autoApproveLeadAcknowledgment(supabase, {
      lead: state.leads[0],
      agentConfigId: 'cfg-1',
    })

    expect(state.leads[0].metadata?.autoApproved).toBe(true)
    expect(state.leads[0].metadata?.autoApprovedAt).toBeDefined()

    vi.useRealTimers()
  })

  it('skips already-sent leads without duplicate send', async () => {
    sendMessageMock.mockReset()

    const { supabase, state } = createMockSupabase({
      leads: [
        {
          id: 'lead-auto-4',
          org_id: 'org-1',
          source_channel: 'whatsapp',
          source_detail: '+15559876543',
          status: 'qualified',
          ack_status: 'sent',
          created_at: new Date(Date.now() - 30_000).toISOString(),
          estimated_value: 12000,
          service_interest: ['ads'],
          timeline_days: 7,
          metadata: {},
        },
      ],
    })

    const result = await autoApproveLeadAcknowledgment(supabase, {
      lead: state.leads[0],
      agentConfigId: 'cfg-1',
    })

    expect(result).toEqual({ sent: false, error: 'already_sent' })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})

describe('escalateHighValueLead', () => {
  it('creates urgent escalation for leads above $5k and notifies Andy', async () => {
    notifyApprovalMock.mockClear()

    const { supabase, state } = createMockSupabase({
      leads: [
        {
          id: 'lead-3',
          org_id: 'org-1',
          source_channel: 'gmail',
          source_detail: 'vip@example.com',
          status: 'qualified',
          ack_status: 'pending',
          created_at: '2026-02-22T14:00:00.000Z',
          estimated_value: 7000,
          service_interest: ['ads'],
          timeline_days: 10,
          metadata: {},
        },
      ],
    })

    const escalated = await escalateHighValueLead(supabase, state.leads[0], 'cfg-1')

    expect(escalated).toBe(true)
    expect(state.approvals).toHaveLength(1)
    expect(state.approvals[0].action_type).toBe('lead_high_value_escalation')
    expect(state.approvals[0].priority).toBe('urgent')
    expect(state.approvals[0].routing_decision).toBe('escalate')
    expect(notifyApprovalMock).toHaveBeenCalledTimes(1)
  })
})
