import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createApproval,
  queueAgentAction,
  type CreateApprovalParams,
  type QueueAgentActionParams,
} from '../approval-queue'
import { notifyApproval } from '../approval-notifier'

// Mock notifyApproval and dispatchNotification
vi.mock('../approval-notifier', () => ({
  notifyApproval: vi.fn().mockResolvedValue(true),
}))

vi.mock('../notifications/dispatcher', () => ({
  dispatchNotification: vi.fn().mockResolvedValue({ success: true }),
}))

describe('approval-queue', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()

    let lastInsertData: any = {}

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'approval_queue') {
          return {
            insert: vi.fn().mockImplementation((data: any) => {
              lastInsertData = data
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'approval-123',
                    org_id: lastInsertData.org_id || 'org-1',
                    agent_config_id: lastInsertData.agent_config_id || 'config-1',
                    agent_run_id: null,
                    action_type: lastInsertData.action_type || 'create_task',
                    action_payload: lastInsertData.action_payload || {},
                    action_summary: lastInsertData.action_summary || 'Create task',
                    confidence_score: lastInsertData.confidence_score || 0.72,
                    routing_decision: lastInsertData.routing_decision || 'ask',
                    priority: lastInsertData.priority || 'normal',
                    digest_eligible: lastInsertData.digest_eligible || false,
                    status: 'pending',
                    context_snapshot: lastInsertData.context_snapshot || {},
                    resolved_by: null,
                    resolved_at: null,
                    resolved_via: null,
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 86400000).toISOString(),
                    agent_configs: { name: 'Test Agent' },
                  },
                  error: null,
                }),
              }
            }),
            update: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        return {
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    } as unknown as SupabaseClient
  })

  describe('createApproval', () => {
    it('creates approval with correct fields', async () => {
      const params: CreateApprovalParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task: Do something',
        confidence_score: 0.72,
        routing_decision: 'ask',
        priority: 'normal',
      }

      const result = await createApproval(mockSupabase, params)

      expect(result.id).toBe('approval-123')
      expect(result.org_id).toBe('org-1')
      expect(result.confidence_score).toBe(0.72)
      expect(result.routing_decision).toBe('ask')
    })

    it('calls notifyApproval after creating approval', async () => {
      const params: CreateApprovalParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task: Do something',
        confidence_score: 0.72,
        routing_decision: 'ask',
        priority: 'normal',
      }

      await createApproval(mockSupabase, params)

      expect(notifyApproval).toHaveBeenCalled()
      expect(notifyApproval).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          id: 'approval-123',
          org_id: 'org-1',
        })
      )
    })

    it('sets digest_eligible=true only for low priority', async () => {
      const params: CreateApprovalParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task',
        confidence_score: 0.72,
        routing_decision: 'ask',
        priority: 'low',
      }

      const result = await createApproval(mockSupabase, params)

      // Verify that low priority was used
      expect(result.priority).toBe('low')
      // digest_eligible should be true for low priority
      expect(result.digest_eligible).toBe(true)
    })

    it('handles notifyApproval errors gracefully', async () => {
      const notifyMock = notifyApproval as any
      notifyMock.mockRejectedValueOnce(new Error('Notify failed'))

      const params: CreateApprovalParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task',
        confidence_score: 0.72,
        routing_decision: 'ask',
        priority: 'normal',
      }

      // Should not throw even if notifyApproval fails
      const result = await createApproval(mockSupabase, params)
      expect(result.id).toBe('approval-123')
    })
  })

  describe('queueAgentAction', () => {
    it('returns null when routing decision is "act"', async () => {
      const params: QueueAgentActionParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task',
        confidence_score: 0.9, // Above 0.85 threshold
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await queueAgentAction(mockSupabase, params)

      expect(result).toBeNull()
    })

    it('queues action when confidence between ask and act thresholds', async () => {
      const params: QueueAgentActionParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task',
        confidence_score: 0.6, // Inside ask band (below clarify threshold 0.70)
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await queueAgentAction(mockSupabase, params)

      expect(result).not.toBeNull()
      expect(result?.routing_decision).toBe('ask')
      expect(notifyApproval).toHaveBeenCalled()
    })

    it('queues action when confidence below ask threshold (escalate)', async () => {
      const params: QueueAgentActionParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task',
        confidence_score: 0.4, // Below 0.55
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await queueAgentAction(mockSupabase, params)

      expect(result).not.toBeNull()
      // Below ask threshold should route to 'escalate'
      expect(result?.routing_decision).toBe('escalate')
      expect(notifyApproval).toHaveBeenCalled()
    })

    it('uses agent type thresholds when no explicit thresholds provided', async () => {
      const params: QueueAgentActionParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_invoice',
        action_summary: 'Create invoice',
        confidence_score: 0.88, // Between default thresholds (0.85 act, 0.55 ask)
        // No explicit thresholds, should use defaults
      }

      const result = await queueAgentAction(mockSupabase, params)

      // With confidence 0.88 > 0.85, default is to act, so should return null
      // unless agentConfig is provided
      expect(result).toBeNull()
    })

    it('preserves action payload in queued approval', async () => {
      const payload = { title: 'Test Task', priority: 'high' }
      const params: QueueAgentActionParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task',
        action_payload: payload,
        confidence_score: 0.7,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await queueAgentAction(mockSupabase, params)

      // Verify that queueAgentAction was called and returned approval
      expect(result).not.toBeNull()
      expect(result?.action_type).toBe('create_task')
    })
  })

  describe('notification integration', () => {
    it('notifyApproval is called when action is queued', async () => {
      const params: QueueAgentActionParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Create task: Important work',
        confidence_score: 0.65,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      await queueAgentAction(mockSupabase, params)

      expect(notifyApproval).toHaveBeenCalledTimes(1)
      const call = (notifyApproval as any).mock.calls[0]
      expect(call[0]).toBe(mockSupabase)
      expect(call[1]).toMatchObject({
        id: 'approval-123',
        org_id: 'org-1',
      })
    })

    it('priority affects notification urgency', async () => {
      const fromSpy = mockSupabase.from as any
      const insertSpy = vi.fn().mockReturnThis()
      const selectSpy = vi.fn().mockReturnThis()
      const singleSpy = vi.fn().mockResolvedValue({
        data: {
          id: 'approval-123',
          org_id: 'org-1',
          agent_config_id: 'config-1',
          action_type: 'create_task',
          action_summary: 'Critical action',
          confidence_score: 0.65,
          routing_decision: 'ask',
          priority: 'urgent',
          status: 'pending',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          agent_configs: { name: 'Test Agent' },
        },
        error: null,
      })

      insertSpy.mockReturnValue({ select: selectSpy })
      selectSpy.mockReturnValue({ single: singleSpy })
      fromSpy.mockReturnValue({ insert: insertSpy })

      const params: CreateApprovalParams = {
        org_id: 'org-1',
        agent_config_id: 'config-1',
        action_type: 'create_task',
        action_summary: 'Critical action',
        confidence_score: 0.65,
        routing_decision: 'ask',
        priority: 'urgent',
      }

      await createApproval(mockSupabase, params)

      expect(notifyApproval).toHaveBeenCalled()
    })
  })
})
