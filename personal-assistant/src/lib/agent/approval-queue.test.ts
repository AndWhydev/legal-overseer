import { describe, expect, it, vi } from 'vitest'
import {
  getPendingApprovals,
  queueAgentAction,
  resolveApproval,
  type ApprovalRecord,
} from './approval-queue'

function makeApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: 'approval-1',
    org_id: 'org-1',
    agent_config_id: 'agent-1',
    agent_run_id: null,
    action_type: 'send_email',
    action_payload: {},
    action_summary: 'Send proposal follow-up',
    confidence_score: 0.7,
    routing_decision: 'ask',
    priority: 'normal',
    digest_eligible: false,
    status: 'pending',
    context_snapshot: {},
    resolved_by: null,
    resolved_at: null,
    resolved_via: null,
    expires_at: '2026-02-23T00:00:00Z',
    created_at: '2026-02-22T00:00:00Z',
    ...overrides,
  }
}

describe('approval-queue', () => {
  it('queueAgentAction returns null for confidence > 0.85', async () => {
    const insert = vi.fn()
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as any

    const result = await queueAgentAction(supabase, {
      org_id: 'org-1',
      agent_config_id: 'agent-1',
      action_type: 'send_email',
      action_summary: 'Send follow-up',
      confidence_score: 0.9,
    })

    expect(result).toBeNull()
    expect(insert).not.toHaveBeenCalled()
  })

  it('queueAgentAction creates ask approval for confidence 0.55-0.85', async () => {
    const created = makeApproval({ routing_decision: 'ask', confidence_score: 0.7 })
    const single = vi.fn().mockResolvedValue({ data: created, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as any

    const result = await queueAgentAction(supabase, {
      org_id: 'org-1',
      agent_config_id: 'agent-1',
      action_type: 'send_email',
      action_summary: 'Send follow-up',
      confidence_score: 0.7,
    })

    expect(result?.routing_decision).toBe('ask')
  })

  it('queueAgentAction creates escalate approval for confidence < 0.55', async () => {
    const created = makeApproval({ routing_decision: 'escalate', confidence_score: 0.4 })
    const single = vi.fn().mockResolvedValue({ data: created, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as any

    const result = await queueAgentAction(supabase, {
      org_id: 'org-1',
      agent_config_id: 'agent-1',
      action_type: 'send_email',
      action_summary: 'Send follow-up',
      confidence_score: 0.4,
    })

    expect(result?.routing_decision).toBe('escalate')
  })

  it('auto-sets digest_eligible for low priority', async () => {
    const created = makeApproval({ priority: 'low', digest_eligible: true })
    const single = vi.fn().mockResolvedValue({ data: created, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as any

    await queueAgentAction(supabase, {
      org_id: 'org-1',
      agent_config_id: 'agent-1',
      action_type: 'send_email',
      action_summary: 'Send low-priority follow-up',
      confidence_score: 0.7,
      priority: 'low',
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ digest_eligible: true }))
  })

  it('resolveApproval rejects already-resolved items', async () => {
    const firstSingle = vi.fn().mockResolvedValue({
      data: { id: 'approval-1', status: 'approved' },
      error: null,
    })
    const firstSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: firstSingle }),
    })

    const supabase = {
      from: vi.fn().mockReturnValue({ select: firstSelect }),
    } as any

    await expect(
      resolveApproval(supabase, 'approval-1', 'approved', 'user-1', 'dashboard'),
    ).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
  })

  it('getPendingApprovals sorts urgent first', async () => {
    const rows = [
      makeApproval({ id: '1', priority: 'normal', created_at: '2026-02-22T00:00:00Z' }),
      makeApproval({ id: '2', priority: 'urgent', created_at: '2026-02-22T01:00:00Z' }),
      makeApproval({ id: '3', priority: 'low', created_at: '2026-02-22T02:00:00Z' }),
    ]

    const range = vi.fn().mockResolvedValue({ data: rows, error: null })
    const order = vi.fn().mockReturnValue({ range })
    const eqStatus = vi.fn().mockReturnValue({ order })
    const eqOrg = vi.fn().mockReturnValue({ eq: eqStatus })
    const select = vi.fn().mockReturnValue({ eq: eqOrg })

    const supabase = {
      from: vi.fn().mockReturnValue({ select }),
    } as any

    const result = await getPendingApprovals(supabase, 'org-1')
    expect(result.map((approval) => approval.id)).toEqual(['2', '1', '3'])
  })
})
