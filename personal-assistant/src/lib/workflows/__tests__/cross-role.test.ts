import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecuteAgentTool = vi.fn()
const mockCanProceed = vi.fn()

vi.mock('@/lib/agent/tools', () => ({
  TOOL_GROUPS: {
    core: { id: 'core', label: 'Core', description: '', tools: ['create_task', 'update_task'] },
    seo: { id: 'seo', label: 'SEO', description: '', tools: ['audit_visibility', 'generate_seo_content'] },
    comms: { id: 'comms', label: 'Comms', description: '', tools: ['send_email', 'send_sms'] },
    ads: { id: 'ads', label: 'Ads', description: '', tools: ['generate_ad_scripts'] },
  },
  executeAgentTool: (...args: unknown[]) => mockExecuteAgentTool(...args),
}))

vi.mock('@/lib/agent/cost-guard', () => ({
  canProceed: (...args: unknown[]) => mockCanProceed(...args),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  createWorkflowToolBridge,
  executeWorkflowStep,
  ruleToWorkflowDefinition,
} from '../workflow-tool-bridge'
import type { WorkflowAction, WorkflowRule } from '../workflow-rule-types'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const FAKE_SUPABASE = {} as any
const ORG_ID = 'org-123'

function makeAction(overrides: Partial<WorkflowAction> = {}): WorkflowAction {
  return {
    step_id: 'step-1',
    name: 'Test Step',
    tool_group: 'seo',
    tool_name: 'audit_visibility',
    parameters: { domain: 'example.com' },
    ...overrides,
  }
}

function makeRule(overrides: Partial<WorkflowRule> = {}): WorkflowRule {
  return {
    id: 'rule-1',
    org_id: ORG_ID,
    name: 'Test Rule',
    description: 'Test workflow rule',
    trigger: { type: 'event', event: 'new_lead' },
    conditions: [],
    actions: [
      makeAction({ step_id: 'step-1', name: 'Audit', tool_group: 'seo', tool_name: 'audit_visibility' }),
      makeAction({ step_id: 'step-2', name: 'Email', tool_group: 'comms', tool_name: 'send_email', parameters: { to: 'test@example.com' } }),
    ],
    enabled: true,
    created_by: 'user-1',
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowToolBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanProceed.mockResolvedValue({ allowed: true, dailyLimit: 10, spentToday: 0, remainingBudget: 10 })
    mockExecuteAgentTool.mockResolvedValue({ success: true, result: { data: 'ok' } })
  })

  describe('resolveTool', () => {
    it('returns true for known tool in valid group', () => {
      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      expect(bridge.resolveTool('seo', 'audit_visibility')).toBe(true)
    })

    it('returns false for unknown tool', () => {
      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      expect(bridge.resolveTool('seo', 'nonexistent_tool')).toBe(false)
    })

    it('returns false for unknown tool group', () => {
      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      expect(bridge.resolveTool('fake' as any, 'anything')).toBe(false)
    })
  })

  describe('executeTool', () => {
    it('checks org-level budget via canProceed before executing', async () => {
      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      await bridge.executeTool('seo', 'audit_visibility', { domain: 'example.com' })

      expect(mockCanProceed).toHaveBeenCalledWith(FAKE_SUPABASE, ORG_ID)
      expect(mockExecuteAgentTool).toHaveBeenCalledWith(
        'audit_visibility',
        { domain: 'example.com' },
        ORG_ID,
        FAKE_SUPABASE,
      )
    })

    it('returns budget error when canProceed returns ok=false', async () => {
      mockCanProceed.mockResolvedValue({ allowed: false, reason: 'Daily budget exceeded', dailyLimit: 10, spentToday: 10, remainingBudget: 0 })

      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      const result = await bridge.executeTool('seo', 'audit_visibility', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('budget')
      expect(mockExecuteAgentTool).not.toHaveBeenCalled()
    })

    it('returns tool result on success', async () => {
      mockExecuteAgentTool.mockResolvedValue({ success: true, result: { score: 85 } })

      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      const result = await bridge.executeTool('seo', 'audit_visibility', { domain: 'test.com' })

      expect(result.success).toBe(true)
      expect(result.result).toEqual({ success: true, result: { score: 85 } })
    })

    it('returns error for unresolvable tool', async () => {
      const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
      const result = await bridge.executeTool('fake' as any, 'nonexistent', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot resolve tool')
    })
  })
})

describe('executeWorkflowStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanProceed.mockResolvedValue({ allowed: true, dailyLimit: 10, spentToday: 0, remainingBudget: 10 })
    mockExecuteAgentTool.mockResolvedValue({ success: true, result: { data: 'ok' } })
  })

  it('executes action through the bridge', async () => {
    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const action = makeAction()
    const ctx = { supabase: FAKE_SUPABASE, orgId: ORG_ID, roleConfig: {} as any, workflow: {} as any, stepResults: {} }

    const result = await executeWorkflowStep(bridge, action, ctx)
    expect(result.success).toBe(true)
  })

  it('on_failure=skip returns success on tool error', async () => {
    mockExecuteAgentTool.mockResolvedValue({ success: false, error: 'Tool failed' })

    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const action = makeAction({ on_failure: 'skip' })
    const ctx = { supabase: FAKE_SUPABASE, orgId: ORG_ID, roleConfig: {} as any, workflow: {} as any, stepResults: {} }

    const result = await executeWorkflowStep(bridge, action, ctx)
    expect(result.success).toBe(true)
    expect(result.error).toContain('skipped')
  })

  it('on_failure=abort propagates error', async () => {
    mockExecuteAgentTool.mockResolvedValue({ success: false, error: 'Tool failed' })

    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const action = makeAction({ on_failure: 'abort' })
    const ctx = { supabase: FAKE_SUPABASE, orgId: ORG_ID, roleConfig: {} as any, workflow: {} as any, stepResults: {} }

    const result = await executeWorkflowStep(bridge, action, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Tool failed')
  })

  it('on_failure=retry retries once on failure', async () => {
    mockExecuteAgentTool
      .mockResolvedValueOnce({ success: false, error: 'Transient error' })
      .mockResolvedValueOnce({ success: true, result: { data: 'ok' } })

    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const action = makeAction({ on_failure: 'retry' })
    const ctx = { supabase: FAKE_SUPABASE, orgId: ORG_ID, roleConfig: {} as any, workflow: {} as any, stepResults: {} }

    const result = await executeWorkflowStep(bridge, action, ctx)
    expect(result.success).toBe(true)
    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(2)
  })

  it('evaluates condition based on prior step results', async () => {
    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const action = makeAction({ condition: 'step-0' })
    const ctx = {
      supabase: FAKE_SUPABASE,
      orgId: ORG_ID,
      roleConfig: {} as any,
      workflow: {} as any,
      stepResults: { 'step-0': { success: false } },
    }

    const result = await executeWorkflowStep(bridge, action, ctx)
    // Step should be skipped because referenced step failed
    expect(result.success).toBe(true)
    expect(result.error).toContain('skipped')
    expect(mockExecuteAgentTool).not.toHaveBeenCalled()
  })
})

describe('ruleToWorkflowDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanProceed.mockResolvedValue({ allowed: true, dailyLimit: 10, spentToday: 0, remainingBudget: 10 })
    mockExecuteAgentTool.mockResolvedValue({ success: true, result: {} })
  })

  it('converts WorkflowRule to WorkflowDefinition', () => {
    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const rule = makeRule()

    const def = ruleToWorkflowDefinition(rule, bridge, ORG_ID)

    expect(def.type).toBe('workflow_rule:rule-1')
    expect(def.steps).toHaveLength(2)
    expect(def.steps[0].id).toBe('step-1')
    expect(def.steps[0].name).toBe('Audit')
    expect(def.steps[1].id).toBe('step-2')
    expect(def.steps[1].name).toBe('Email')
    expect(def.context).toHaveProperty('ruleId', 'rule-1')
    expect(def.context).toHaveProperty('orgId', ORG_ID)
  })

  it('produced steps are executable', async () => {
    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const rule = makeRule()
    const def = ruleToWorkflowDefinition(rule, bridge, ORG_ID)

    const stepCtx = { supabase: FAKE_SUPABASE, orgId: ORG_ID, roleConfig: {} as any, workflow: {} as any, stepResults: {} }
    const result = await def.steps[0].execute(stepCtx)
    expect(result.success).toBe(true)
  })

  it('preserves delay_seconds from actions', () => {
    const bridge = createWorkflowToolBridge(FAKE_SUPABASE, ORG_ID)
    const rule = makeRule({
      actions: [
        makeAction({ step_id: 's1', delay_seconds: 300 }),
      ],
    })

    const def = ruleToWorkflowDefinition(rule, bridge, ORG_ID)
    expect(def.steps[0].delaySeconds).toBe(300)
  })
})
