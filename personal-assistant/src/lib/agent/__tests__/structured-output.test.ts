import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// Mock logger before imports
vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  createStructuredTool,
  parseStructuredOutput,
} from '../schemas/structured-output'
import { ActionPlanSchema } from '../schemas/action-plan'
import { RoleEvaluationSchema } from '../schemas/role-evaluation'
import { ConfidenceDecisionSchema } from '../schemas/confidence-decision'
import type Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Anthropic.Message with a tool_use content block.
 */
function mockToolUseResponse(
  toolName: string,
  input: unknown,
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-3-20250317',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: toolName,
        input,
      },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  } as unknown as Anthropic.Message
}

/**
 * Build a mock Anthropic.Message with only a text block (no tool_use).
 */
function mockTextResponse(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-3-20250317',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  } as unknown as Anthropic.Message
}

// ---------------------------------------------------------------------------
// Tests: createStructuredTool
// ---------------------------------------------------------------------------

describe('createStructuredTool', () => {
  it('should create a valid Anthropic tool from a Zod schema', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    })

    const result = createStructuredTool(schema, {
      name: 'test_tool',
      description: 'A test tool.',
    })

    expect(result.name).toBe('test_tool')
    expect(result.tool.name).toBe('test_tool')
    expect(result.tool.description).toBe('A test tool.')
    expect(result.tool.input_schema.type).toBe('object')
    expect(result.tool.input_schema.properties).toBeDefined()
    expect(result.tool.input_schema.required).toContain('name')
    expect(result.tool.input_schema.required).toContain('count')
  })

  it('should default name to "structured_output" when not specified', () => {
    const schema = z.object({ x: z.number() })
    const result = createStructuredTool(schema)

    expect(result.name).toBe('structured_output')
    expect(result.toolChoice).toEqual({ type: 'tool', name: 'structured_output' })
  })

  it('should strip $schema from the JSON schema', () => {
    const schema = z.object({ val: z.string() })
    const result = createStructuredTool(schema)

    // The $schema key should NOT be in the input_schema
    expect('$schema' in result.tool.input_schema).toBe(false)
    expect(result.tool.input_schema.type).toBe('object')
  })

  it('should handle enum types correctly', () => {
    const schema = z.object({
      route: z.enum(['act', 'ask', 'escalate']),
    })
    const result = createStructuredTool(schema)

    const props = result.tool.input_schema.properties as Record<string, unknown>
    expect(props).toBeDefined()

    const routeProp = props.route as { type: string; enum: string[] }
    expect(routeProp.type).toBe('string')
    expect(routeProp.enum).toEqual(['act', 'ask', 'escalate'])
  })

  it('should handle optional fields', () => {
    const schema = z.object({
      required_field: z.string(),
      optional_field: z.string().optional(),
    })
    const result = createStructuredTool(schema)

    const required = result.tool.input_schema.required as string[]
    expect(required).toContain('required_field')
    expect(required).not.toContain('optional_field')
  })

  it('should handle nested arrays of objects', () => {
    const schema = z.object({
      items: z.array(z.object({
        name: z.string(),
        value: z.number(),
      })),
    })
    const result = createStructuredTool(schema)

    const props = result.tool.input_schema.properties as Record<string, unknown>
    const itemsProp = props.items as { type: string; items: Record<string, unknown> }
    expect(itemsProp.type).toBe('array')
    expect(itemsProp.items).toBeDefined()
  })

  it('should handle min/max constraints on numbers', () => {
    const schema = z.object({
      confidence: z.number().min(0).max(1),
    })
    const result = createStructuredTool(schema)

    const props = result.tool.input_schema.properties as Record<string, unknown>
    const confProp = props.confidence as { type: string; minimum: number; maximum: number }
    expect(confProp.minimum).toBe(0)
    expect(confProp.maximum).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: parseStructuredOutput
// ---------------------------------------------------------------------------

describe('parseStructuredOutput', () => {
  it('should parse valid tool_use output', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    })
    const tool = createStructuredTool(schema, { name: 'test_tool' })

    const response = mockToolUseResponse('test_tool', {
      name: 'hello',
      count: 42,
    })

    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('hello')
      expect(result.data.count).toBe(42)
    }
  })

  it('should return error when tool_use block is missing', () => {
    const schema = z.object({ x: z.number() })
    const tool = createStructuredTool(schema, { name: 'test_tool' })

    const response = mockTextResponse('Just some text')

    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('No tool_use block found')
    }
  })

  it('should return error when tool name does not match', () => {
    const schema = z.object({ x: z.number() })
    const tool = createStructuredTool(schema, { name: 'expected_tool' })

    const response = mockToolUseResponse('wrong_tool', { x: 1 })

    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('No tool_use block found')
    }
  })

  it('should return error when schema validation fails', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    })
    const tool = createStructuredTool(schema, { name: 'test_tool' })

    // Missing required field 'count'
    const response = mockToolUseResponse('test_tool', {
      name: 'hello',
    })

    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Schema validation failed')
    }
  })

  it('should return error when field has wrong type', () => {
    const schema = z.object({
      confidence: z.number().min(0).max(1),
    })
    const tool = createStructuredTool(schema, { name: 'test_tool' })

    const response = mockToolUseResponse('test_tool', {
      confidence: 'not a number',
    })

    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Schema validation failed')
    }
  })

  it('should preserve raw input in both success and failure cases', () => {
    const schema = z.object({ x: z.number() })
    const tool = createStructuredTool(schema, { name: 'test_tool' })

    // Success case
    const successResponse = mockToolUseResponse('test_tool', { x: 42 })
    const successResult = parseStructuredOutput(successResponse, tool)
    expect(successResult.raw).toEqual({ x: 42 })

    // Failure case
    const failResponse = mockToolUseResponse('test_tool', { x: 'bad' })
    const failResult = parseStructuredOutput(failResponse, tool)
    expect(failResult.raw).toEqual({ x: 'bad' })
  })
})

// ---------------------------------------------------------------------------
// Tests: Schema Definitions
// ---------------------------------------------------------------------------

describe('ActionPlanSchema', () => {
  it('should validate a well-formed action plan', () => {
    const plan = {
      action: 'execute_tools',
      confidence: 0.92,
      reasoning: 'User wants to search contacts, clear intent',
      tool_calls: [
        { tool_name: 'search_contacts', purpose: 'Find the requested contact' },
      ],
      risks: [],
    }

    const result = ActionPlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
  })

  it('should reject invalid action enum', () => {
    const plan = {
      action: 'invalid_action',
      confidence: 0.5,
      reasoning: 'test',
      tool_calls: [],
      risks: [],
    }

    const result = ActionPlanSchema.safeParse(plan)
    expect(result.success).toBe(false)
  })

  it('should reject confidence out of range', () => {
    const plan = {
      action: 'execute_tools',
      confidence: 1.5,
      reasoning: 'test',
      tool_calls: [],
      risks: [],
    }

    const result = ActionPlanSchema.safeParse(plan)
    expect(result.success).toBe(false)
  })

  it('should accept optional tool_groups', () => {
    const plan = {
      action: 'execute_tools',
      confidence: 0.9,
      reasoning: 'test',
      tool_calls: [],
      risks: [],
      tool_groups: ['web', 'memory'],
    }

    const result = ActionPlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tool_groups).toEqual(['web', 'memory'])
    }
  })

  it('should validate tool calls with optional key_params', () => {
    const plan = {
      action: 'execute_tools',
      confidence: 0.85,
      reasoning: 'Search and create',
      tool_calls: [
        { tool_name: 'search_contacts', purpose: 'Find Steve', key_params: { query: 'Steve' } },
        { tool_name: 'create_task', purpose: 'Make the task' },
      ],
      risks: [
        { description: 'Contact may not exist', severity: 'low' },
      ],
    }

    const result = ActionPlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tool_calls).toHaveLength(2)
      expect(result.data.risks).toHaveLength(1)
    }
  })
})

describe('RoleEvaluationSchema', () => {
  it('should validate a well-formed role evaluation', () => {
    const evaluation = {
      actions: [
        {
          type: 'send_reminder',
          summary: 'Send invoice reminder to client',
          payload: { invoiceId: '42', contactId: 'abc' },
          confidence: 0.88,
          reversible: true,
        },
      ],
      insights: [
        {
          summary: 'Cash flow positive',
          details: { revenue: 50000 },
          priority: 'medium',
        },
      ],
      workflows_to_start: [],
    }

    const result = RoleEvaluationSchema.safeParse(evaluation)
    expect(result.success).toBe(true)
  })

  it('should accept empty arrays', () => {
    const evaluation = {
      actions: [],
      insights: [],
      workflows_to_start: [],
    }

    const result = RoleEvaluationSchema.safeParse(evaluation)
    expect(result.success).toBe(true)
  })

  it('should reject invalid priority', () => {
    const evaluation = {
      actions: [],
      insights: [{
        summary: 'test',
        details: {},
        priority: 'critical', // not a valid priority
      }],
      workflows_to_start: [],
    }

    const result = RoleEvaluationSchema.safeParse(evaluation)
    expect(result.success).toBe(false)
  })

  it('should validate workflows with steps', () => {
    const evaluation = {
      actions: [],
      insights: [],
      workflows_to_start: [{
        workflowType: 'collection_reminder',
        steps: [
          { stepId: 'send_reminder', name: 'Send Reminder' },
          { stepId: 'follow_up', name: 'Follow Up' },
        ],
        context: { invoiceId: '42' },
      }],
    }

    const result = RoleEvaluationSchema.safeParse(evaluation)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.workflows_to_start[0].steps).toHaveLength(2)
    }
  })

  it('should accept optional state_updates', () => {
    const evaluation = {
      actions: [],
      insights: [],
      workflows_to_start: [],
      state_updates: { last_checked: '2026-03-30T00:00:00Z', count: 5 },
    }

    const result = RoleEvaluationSchema.safeParse(evaluation)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.state_updates).toEqual({ last_checked: '2026-03-30T00:00:00Z', count: 5 })
    }
  })
})

describe('ConfidenceDecisionSchema', () => {
  it('should validate an act decision', () => {
    const decision = {
      route: 'act',
      confidence: 0.95,
      reasoning: 'Clear intent, all information available',
    }

    const result = ConfidenceDecisionSchema.safeParse(decision)
    expect(result.success).toBe(true)
  })

  it('should validate an ask decision with missing context', () => {
    const decision = {
      route: 'ask',
      confidence: 0.65,
      reasoning: 'Need clarification on which contact',
      missing_context: ['contact name is ambiguous', 'multiple matches found'],
    }

    const result = ConfidenceDecisionSchema.safeParse(decision)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.missing_context).toHaveLength(2)
    }
  })

  it('should validate an escalate decision with risk factors', () => {
    const decision = {
      route: 'escalate',
      confidence: 0.3,
      reasoning: 'Financial operation with high stakes',
      risk_factors: ['involves payment', 'irreversible action', 'large amount'],
    }

    const result = ConfidenceDecisionSchema.safeParse(decision)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.risk_factors).toHaveLength(3)
    }
  })

  it('should reject invalid route', () => {
    const decision = {
      route: 'deny',
      confidence: 0.5,
      reasoning: 'test',
    }

    const result = ConfidenceDecisionSchema.safeParse(decision)
    expect(result.success).toBe(false)
  })

  it('should reject confidence below 0', () => {
    const decision = {
      route: 'act',
      confidence: -0.1,
      reasoning: 'test',
    }

    const result = ConfidenceDecisionSchema.safeParse(decision)
    expect(result.success).toBe(false)
  })

  it('should reject confidence above 1', () => {
    const decision = {
      route: 'act',
      confidence: 1.01,
      reasoning: 'test',
    }

    const result = ConfidenceDecisionSchema.safeParse(decision)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: Integration — createStructuredTool + parseStructuredOutput
// ---------------------------------------------------------------------------

describe('End-to-end: structured tool creation and parsing', () => {
  it('should round-trip through ActionPlanSchema', () => {
    const tool = createStructuredTool(ActionPlanSchema, {
      name: 'generate_plan',
      description: 'Generate an execution plan.',
    })

    const validPlan = {
      action: 'execute_tools',
      confidence: 0.9,
      reasoning: 'Search contacts then create task',
      tool_calls: [
        { tool_name: 'search_contacts', purpose: 'Find Steve' },
      ],
      risks: [
        { description: 'Contact not found', severity: 'low', mitigation: 'Ask user to clarify' },
      ],
      tool_groups: ['memory'],
    }

    const response = mockToolUseResponse('generate_plan', validPlan)
    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('execute_tools')
      expect(result.data.tool_calls).toHaveLength(1)
      expect(result.data.risks[0].mitigation).toBe('Ask user to clarify')
    }
  })

  it('should round-trip through ConfidenceDecisionSchema', () => {
    const tool = createStructuredTool(ConfidenceDecisionSchema, {
      name: 'confidence_decision',
    })

    const validDecision = {
      route: 'ask',
      confidence: 0.6,
      reasoning: 'Ambiguous request',
      missing_context: ['Which project?'],
    }

    const response = mockToolUseResponse('confidence_decision', validDecision)
    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.route).toBe('ask')
      expect(result.data.missing_context).toEqual(['Which project?'])
    }
  })

  it('should round-trip through RoleEvaluationSchema', () => {
    const tool = createStructuredTool(RoleEvaluationSchema, {
      name: 'role_evaluation',
    })

    const evaluation = {
      actions: [{
        type: 'draft_invoice',
        summary: 'Draft invoice for Q1 work',
        payload: { contactId: 'c1', amount: 5000 },
        confidence: 0.92,
        reversible: true,
      }],
      insights: [{
        summary: 'Revenue up 15% this quarter',
        details: { increase: 0.15, period: 'Q1' },
        priority: 'high',
      }],
      workflows_to_start: [{
        workflowType: 'collection_reminder',
        steps: [{ stepId: 'reminder_1', name: 'First Reminder' }],
        context: { invoiceId: '123' },
      }],
      state_updates: { last_scan: '2026-03-30' },
    }

    const response = mockToolUseResponse('role_evaluation', evaluation)
    const result = parseStructuredOutput(response, tool)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.actions).toHaveLength(1)
      expect(result.data.insights[0].priority).toBe('high')
      expect(result.data.workflows_to_start[0].steps).toHaveLength(1)
    }
  })

  it('should correctly generate tool_choice that forces the structured tool', () => {
    const tool = createStructuredTool(ConfidenceDecisionSchema, {
      name: 'my_decision',
    })

    expect(tool.toolChoice).toEqual({
      type: 'tool',
      name: 'my_decision',
    })
  })

  it('should handle the Anthropic Tool type correctly', () => {
    const tool = createStructuredTool(ActionPlanSchema, {
      name: 'plan',
      description: 'Plan it.',
    })

    // Verify the tool definition has the right shape
    const t = tool.tool
    expect(t.name).toBe('plan')
    expect(t.description).toBe('Plan it.')
    expect(t.input_schema).toBeDefined()
    expect(t.input_schema.type).toBe('object')

    // Verify enum values are embedded in the schema
    const props = t.input_schema.properties as Record<string, { enum?: string[] }>
    expect(props.action.enum).toContain('execute_tools')
    expect(props.action.enum).toContain('respond_directly')
  })
})
