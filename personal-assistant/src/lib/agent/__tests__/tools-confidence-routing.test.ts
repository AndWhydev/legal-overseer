import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeAgentTool, type ExecuteToolOptions } from '../tools'
import * as confidenceRouter from '../confidence-router'
import * as approvalQueue from '../approval-queue'
import * as approvalNotifier from '../approval-notifier'

// Mock the imported modules
vi.mock('../confidence-router')
vi.mock('../approval-queue')
vi.mock('../approval-notifier')

// Mock shared-tools
vi.mock('../shared-tools', () => ({
  createTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1' } }),
  updateTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1' } }),
  searchTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
  searchContacts: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getContact: vi.fn().mockResolvedValue({ success: true, data: {} }),
  logActivity: vi.fn().mockResolvedValue({ success: true, data: {} }),
}))

// Mock channel tools
vi.mock('../tools/channel-tools', () => ({
  channelToolDefinitions: [],
  channelToolHandlers: {},
}))

// Mock creator studio
vi.mock('@/lib/creator-studio', () => ({
  composeCreatorStudioDeck: vi.fn().mockReturnValue({}),
}))

describe('tools with confidence routing', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()

    mockSupabase = {
      from: vi.fn(),
    } as unknown as SupabaseClient

    // Set up default mock return values
    vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
      decision: 'act',
      confidence: 0.9,
      thresholds: { act: 0.85, ask: 0.55 },
      reasoning: 'High confidence',
    })

    vi.mocked(approvalQueue.queueAgentAction).mockResolvedValue({
      id: 'approval-1',
      org_id: 'org-1',
      agent_config_id: 'config-1',
      agent_run_id: null,
      action_type: 'create_task',
      action_payload: {},
      action_summary: 'Create task',
      confidence_score: 0.72,
      routing_decision: 'ask',
      priority: 'normal',
      digest_eligible: false,
      status: 'pending',
      context_snapshot: {},
      resolved_by: null,
      resolved_at: null,
      resolved_via: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      agent_configs: { name: 'Test Agent' },
      agent_name: 'Test Agent',
    })

    vi.mocked(approvalNotifier.notifyApproval).mockResolvedValue(true)
  })

  describe('executeAgentTool with confidence routing', () => {
    it('executes tool when routing decision is "act"', async () => {
      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.9,
        orgSettings: undefined,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBeUndefined()
      expect(confidenceRouter.routeAgentAction).toHaveBeenCalledWith(
        0.9,
        options.agentConfig,
        options.orgSettings,
        options.agentType
      )
    })

    it('queues action when routing decision is "ask"', async () => {
      vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
        decision: 'ask',
        confidence: 0.72,
        thresholds: { act: 0.85, ask: 0.55 },
        reasoning: 'Medium confidence',
      })

      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.72,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(result.queued).toBe(true)
      expect(result.approvalId).toBe('approval-1')
      expect(approvalQueue.queueAgentAction).toHaveBeenCalled()
      expect(approvalNotifier.notifyApproval).toHaveBeenCalled()
    })

    it('queues action when routing decision is "escalate"', async () => {
      vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
        decision: 'escalate',
        confidence: 0.4,
        thresholds: { act: 0.85, ask: 0.55 },
        reasoning: 'Low confidence',
      })

      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.4,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(result.queued).toBe(true)
      expect(result.approvalId).toBe('approval-1')
      expect(approvalQueue.queueAgentAction).toHaveBeenCalled()
    })

    it('does not queue when confidenceScore not provided', async () => {
      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBeUndefined()
      expect(approvalQueue.queueAgentAction).not.toHaveBeenCalled()
    })

    it('does not queue when agentConfigId not provided', async () => {
      const options: ExecuteToolOptions = {
        confidenceScore: 0.72,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBeUndefined()
      expect(approvalQueue.queueAgentAction).not.toHaveBeenCalled()
    })

    it('calls notifyApproval when action is queued', async () => {
      vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
        decision: 'ask',
        confidence: 0.72,
        thresholds: { act: 0.85, ask: 0.55 },
        reasoning: 'Medium confidence',
      })

      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.72,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(approvalNotifier.notifyApproval).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          id: 'approval-1',
          org_id: 'org-1',
        })
      )
    })

    it('handles tool not found error', async () => {
      const result = await executeAgentTool(
        'nonexistent_tool',
        {},
        'org-1',
        mockSupabase
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown tool')
    })

    it('handles queueAgentAction failure gracefully (fails open)', async () => {
      vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
        decision: 'ask',
        confidence: 0.72,
        thresholds: { act: 0.85, ask: 0.55 },
        reasoning: 'Medium confidence',
      })

      vi.mocked(approvalQueue.queueAgentAction).mockRejectedValueOnce(
        new Error('Queue failed')
      )

      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.72,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      // Should execute tool despite queueing failure (fail open)
      expect(result.success).toBe(true)
    })

    it('passes agent type to routeAgentAction', async () => {
      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.9,
        agentType: 'invoice-flow',
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(confidenceRouter.routeAgentAction).toHaveBeenCalledWith(
        0.9,
        options.agentConfig,
        options.orgSettings,
        'invoice-flow'
      )
    })

    it('includes approval info in queued response', async () => {
      vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
        decision: 'ask',
        confidence: 0.72,
        thresholds: { act: 0.85, ask: 0.55 },
        reasoning: 'Medium confidence',
      })

      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0.72,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(result).toMatchObject({
        success: true,
        queued: true,
        approvalId: 'approval-1',
        data: {
          routing: 'ask',
          confidence: 0.72,
        },
      })
    })
  })

  describe('confidence score validation', () => {
    it('ignores invalid confidence scores (NaN)', async () => {
      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: NaN,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      const result = await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(result.success).toBe(true)
      expect(approvalQueue.queueAgentAction).not.toHaveBeenCalled()
    })

    it('allows confidence score of 0', async () => {
      vi.mocked(confidenceRouter.routeAgentAction).mockReturnValue({
        decision: 'escalate',
        confidence: 0,
        thresholds: { act: 0.85, ask: 0.55 },
        reasoning: 'No confidence',
      })

      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 0,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(confidenceRouter.routeAgentAction).toHaveBeenCalledWith(
        0,
        options.agentConfig,
        options.orgSettings,
        options.agentType
      )
    })

    it('allows confidence score of 1.0', async () => {
      const options: ExecuteToolOptions = {
        agentConfigId: 'config-1',
        confidenceScore: 1.0,
        agentConfig: { confidence_thresholds: { act: 0.85, ask: 0.55 } },
      }

      await executeAgentTool(
        'create_task',
        { title: 'Test Task' },
        'org-1',
        mockSupabase,
        options
      )

      expect(confidenceRouter.routeAgentAction).toHaveBeenCalledWith(
        1.0,
        options.agentConfig,
        options.orgSettings,
        options.agentType
      )
    })
  })
})
