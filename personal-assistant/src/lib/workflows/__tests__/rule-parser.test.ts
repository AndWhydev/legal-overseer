import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowRuleSchema, SUPPORTED_EVENTS } from '../workflow-rule-types'

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn()
  return {
    default: class {
      messages = { create: createMock }
    },
    __createMock: createMock,
  }
})

// Import after mock
import { parseWorkflowRule, RULE_PARSER_SYSTEM_PROMPT } from '../workflow-rule-parser'

function getCreateMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (vi.mocked(require('@anthropic-ai/sdk') as any).__createMock) as ReturnType<typeof vi.fn>
}

const ORG_CONTEXT = {
  roles: ['sales', 'finance'],
  tools: ['web_search', 'send_email', 'search_tasks'],
}

function mockLLMResponse(json: Record<string, unknown>) {
  const createMock = getCreateMock()
  createMock.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(json) }],
  })
}

describe('parseWorkflowRule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses a new lead research rule from natural language', async () => {
    mockLLMResponse({
      name: 'New Lead Research',
      description: 'When a new lead comes in, research their company',
      trigger: { type: 'event', event: 'new_lead' },
      conditions: [],
      actions: [
        {
          step_id: 'research',
          name: 'Research company',
          tool_group: 'web',
          tool_name: 'web_search',
          parameters: { query: '{{lead.company_name}}' },
        },
      ],
      confidence: 0.9,
    })

    const result = await parseWorkflowRule(
      'When a new lead comes in, research their company',
      ORG_CONTEXT,
    )

    expect(result.confidence).toBeGreaterThanOrEqual(0.5)
    expect(result.needsReview).toBe(false)
    expect(result.rule.trigger?.type).toBe('event')
    expect(result.rule.trigger?.event).toBe('new_lead')
    expect(result.rule.actions).toHaveLength(1)
  })

  it('parses a schedule-based rule', async () => {
    mockLLMResponse({
      name: 'Daily Digest',
      description: 'Every morning at 8am, summarize activity',
      trigger: { type: 'schedule', schedule: { cron: '08:00' } },
      conditions: [],
      actions: [
        {
          step_id: 'digest',
          name: 'Send digest',
          tool_group: 'comms',
          tool_name: 'send_email',
          parameters: { template: 'digest' },
        },
      ],
      confidence: 0.85,
    })

    const result = await parseWorkflowRule(
      'Every morning at 8am, send me a summary',
      ORG_CONTEXT,
    )

    expect(result.rule.trigger?.type).toBe('schedule')
    expect(result.rule.trigger?.schedule?.cron).toBe('08:00')
    expect(result.needsReview).toBe(false)
  })

  it('parses a rule with conditions', async () => {
    mockLLMResponse({
      name: 'High Value Lead Alert',
      description: 'When a new lead worth over $10k comes in, notify me',
      trigger: { type: 'event', event: 'new_lead' },
      conditions: [{ field: 'estimated_value', operator: 'gt', value: 10000 }],
      actions: [
        {
          step_id: 'notify',
          name: 'Send notification',
          tool_group: 'comms',
          tool_name: 'send_email',
          parameters: { urgent: true },
        },
      ],
      confidence: 0.8,
    })

    const result = await parseWorkflowRule(
      'When a new lead worth over $10k comes in, notify me',
      ORG_CONTEXT,
    )

    expect(result.rule.conditions).toHaveLength(1)
    expect(result.rule.conditions![0].operator).toBe('gt')
    expect(result.rule.conditions![0].value).toBe(10000)
  })

  it('flags low confidence output for review', async () => {
    mockLLMResponse({
      name: 'Unclear Rule',
      description: 'Do the thing when stuff happens',
      trigger: { type: 'event', event: 'new_message' },
      conditions: [],
      actions: [
        {
          step_id: 'thing',
          name: 'Do something',
          tool_group: 'core',
          tool_name: 'log_activity',
          parameters: {},
        },
      ],
      confidence: 0.3,
    })

    const result = await parseWorkflowRule(
      'Do the thing when stuff happens',
      ORG_CONTEXT,
    )

    expect(result.confidence).toBeLessThan(0.5)
    expect(result.needsReview).toBe(true)
  })

  it('handles malformed LLM output gracefully', async () => {
    mockLLMResponse({
      name: 'Bad Rule',
      description: 'Missing actions',
      trigger: { type: 'event' },
      // missing conditions and actions entirely
    })

    const result = await parseWorkflowRule(
      'Something incomprehensible',
      ORG_CONTEXT,
    )

    expect(result.needsReview).toBe(true)
    expect(result.confidence).toBe(0)
  })

  it('returns error state when LLM call fails', async () => {
    const createMock = getCreateMock()
    createMock.mockRejectedValueOnce(new Error('API timeout'))

    const result = await parseWorkflowRule(
      'When a lead comes in, research them',
      ORG_CONTEXT,
    )

    expect(result.needsReview).toBe(true)
    expect(result.confidence).toBe(0)
  })

  it('includes available tools in the system prompt', () => {
    expect(RULE_PARSER_SYSTEM_PROMPT).toContain('web')
    expect(RULE_PARSER_SYSTEM_PROMPT).toContain('comms')
    expect(RULE_PARSER_SYSTEM_PROMPT).toContain('core')
    // Should include supported events
    for (const event of SUPPORTED_EVENTS) {
      expect(RULE_PARSER_SYSTEM_PROMPT).toContain(event)
    }
  })
})
