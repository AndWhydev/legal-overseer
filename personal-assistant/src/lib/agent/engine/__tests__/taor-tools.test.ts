/**
 * TAOR loop tests — tool execution, streaming, extended thinking, response guard.
 *
 * All imports from taor-loop.ts (and transitive deps) are vi.mock'd to
 * avoid runtime initialisation of Supabase, Anthropic, etc.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import type { AgentEvent, EngineConfig } from '../types'

// Shared reference to control the mock Anthropic client returned by `new Anthropic()`
let __mockClientInstance: { messages: { stream: Mock } }

// ---------------------------------------------------------------------------
// Mocks — every import the TAOR loop touches
// ---------------------------------------------------------------------------

// @anthropic-ai/sdk — factory returns a class whose instances delegate to __mockClientInstance
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages: { stream: Mock }
      constructor() {
        this.messages = __mockClientInstance.messages
      }
    },
  }
})

vi.mock('@/lib/agent/tools', () => ({
  getAgentTools: vi.fn(() => [
    { name: 'search_memory', description: 'search', input_schema: { type: 'object', properties: {} } },
    { name: 'send_message', description: 'send', input_schema: { type: 'object', properties: {} } },
  ]),
}))

vi.mock('@/lib/agent/tools/deferred-loader', () => ({
  getEagerTools: vi.fn(() => [
    { name: 'search_memory', description: 'search', input_schema: { type: 'object', properties: {} } },
    { name: 'send_message', description: 'send', input_schema: { type: 'object', properties: {} } },
    { name: 'fetch_url', description: 'fetch', input_schema: { type: 'object', properties: {} } },
  ]),
  buildDeferredToolsPrompt: vi.fn(() => '\n## Additional Tools (On-Demand)\nresolve_tool available\n'),
  resolveToolSchema: vi.fn(),
}))

vi.mock('@/lib/composio/mcp-session', () => ({
  getMCPTools: vi.fn(async () => []),
  isMCPEnabled: vi.fn(() => false),
}))

vi.mock('@/lib/agent/tool-rag', () => ({
  selectRelevantTools: vi.fn((_msg: string, tools: Anthropic.Tool[]) => ({
    tools,
    excluded: [],
    scores: {},
    toolSummary: null,
  })),
}))

vi.mock('@/lib/agent/prompt-builder', () => ({
  buildEntityAwarePrompt: vi.fn(async () => 'system prompt'),
}))

vi.mock('@/lib/context-assembly/context-assembler', () => ({
  ContextAssembler: vi.fn().mockImplementation(() => ({
    assemble: vi.fn(async () => ({
      systemPrompt: 'assembled prompt',
      messageHistory: [],
      metadata: { assemblyMs: 10, tiersLoaded: [], surfacedMemoryIds: [] },
    })),
  })),
}))

vi.mock('@/lib/agent/model-router', () => ({
  selectModel: vi.fn(() => ({
    model: 'claude-sonnet-4-20250514',
    purpose: 'conversation' as const,
    reasoning: 'test',
  })),
}))

vi.mock('@/lib/agent/model-registry', () => ({
  resolveModel: vi.fn(() => 'claude-sonnet-4-20250514'),
  resolveTokenLimit: vi.fn(() => 4096),
}))

vi.mock('@/lib/agent/run-logger', () => ({
  logAgentRun: vi.fn(async () => ({ id: 'run-123' })),
  estimateRunCost: vi.fn(() => 0.001),
}))

vi.mock('@/lib/agent/planner', () => ({
  generatePlan: vi.fn(async () => ({
    stages: [],
    toolGroups: [],
    complexity: 'medium' as const,
    skills: [],
  })),
  stageFromToolName: vi.fn(() => null),
  isTrivialMessage: vi.fn(() => false),
}))

vi.mock('@/lib/agent/circuit-breaker', () => ({
  withCircuitBreaker: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
  CircuitOpenError: class extends Error {
    circuitKey: string
    constructor(key: string) {
      super(`Circuit open: ${key}`)
      this.circuitKey = key
    }
  },
}))

vi.mock('@/lib/agent/dlq', () => ({
  writeToDeadLetterQueue: vi.fn(async () => {}),
}))

vi.mock('@/lib/agent/response-guard', () => ({
  detectLeak: vi.fn(() => ({ leaked: false, patterns: [] })),
  scrubLeaks: vi.fn((t: string) => t.replace(/\bclaude\b/gi, 'BitBit')),
  guardAndHumanize: vi.fn((t: string) => t),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/agent/citation-extractor', () => ({
  extractCitationsFromToolResult: vi.fn(() => []),
  extractRAGCitations: vi.fn(() => []),
  detectTopicShift: vi.fn(() => false),
}))

vi.mock('../turn-evaluator', () => ({
  evaluateTurnQuality: vi.fn(async () => {}),
}))

vi.mock('@/lib/memory-palace/service', () => ({
  MemoryPalaceService: vi.fn().mockImplementation(() => ({
    createMemory: vi.fn(async () => 'mem-1'),
    contradictMemory: vi.fn(async () => {}),
    corroborateMemory: vi.fn(async () => {}),
  })),
}))

vi.mock('@/lib/skills/registry', () => ({
  getAllSkills: vi.fn(() => []),
  getSkillsForRole: vi.fn(() => []),
  resolveSkill: vi.fn(async () => null),
  initializeSkillRegistry: vi.fn(async () => {}),
}))

vi.mock('@/lib/skills/skill-rag', () => ({
  selectRelevantSkills: vi.fn(() => ({ candidates: [], scores: {} })),
}))

vi.mock('../pre-flight', () => ({
  preFlightChecks: vi.fn(async () => ({
    blocked: false,
    events: [],
    calibratedThresholds: null,
  })),
}))

vi.mock('../tool-executor', () => ({
  executeToolBatchStreaming: vi.fn(),
}))

vi.mock('@/lib/agent/tier-prompts', () => ({
  getTierModifier: vi.fn(() => ''),
}))

vi.mock('@/lib/billing/plan-gates', () => ({
  getOrgPlan: vi.fn(async () => 'free'),
  checkToolPlanGate: vi.fn(() => ({ allowed: true })),
}))

vi.mock('@/lib/agent/cost-guard', () => ({
  checkRoleBudget: vi.fn(async () => ({ allowed: true, warning: false })),
  getExecutionTokenCap: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all events from an async generator. */
async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const e of gen) {
    events.push(e)
  }
  return events
}

/** Minimal EngineConfig for tests. */
function makeConfig(overrides?: Partial<EngineConfig> & { toolGroups?: string[] }): EngineConfig & { toolGroups?: string[] } {
  return {
    orgId: 'org-1',
    supabase: {} as EngineConfig['supabase'],
    agentConfigId: 'agent-1',
    ...overrides,
  }
}

/**
 * Build a mock Anthropic stream that yields `events` then returns `finalMessage`.
 */
function makeMockStream(
  events: Array<{ type: string; delta?: Record<string, unknown>; content_block?: Record<string, unknown> }>,
  finalMsg: Anthropic.Message,
) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) yield e
    },
    finalMessage: () => Promise.resolve(finalMsg),
  }
}

/**
 * Minimal Anthropic.Message with text content and end_turn stop_reason.
 */
function textMessage(text: string, usage = { input_tokens: 100, output_tokens: 50 }): Anthropic.Message {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage,
  } as Anthropic.Message
}

/**
 * Anthropic.Message with tool_use blocks, followed by a final text message.
 */
function toolUseMessage(
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  usage = { input_tokens: 100, output_tokens: 50 },
): Anthropic.Message {
  return {
    id: 'msg-2',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    content: toolCalls.map(tc => ({
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.name,
      input: tc.input,
    })),
    usage,
  } as Anthropic.Message
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TAOR loop — tools, thinking, streaming', () => {
  let mockStream: ReturnType<typeof makeMockStream>
  let mockClientInstance: { messages: { stream: Mock } }

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset mocks that tests override with mockReturnValue / mockResolvedValue
    // (clearAllMocks only clears calls/instances, not implementations)
    const { generatePlan, isTrivialMessage } = await import('@/lib/agent/planner')
    ;(generatePlan as Mock).mockResolvedValue({
      stages: [],
      toolGroups: [],
      complexity: 'medium' as const,
      skills: [],
    })
    ;(isTrivialMessage as Mock).mockReturnValue(false)

    const { resolveSkill } = await import('@/lib/skills/registry')
    ;(resolveSkill as Mock).mockResolvedValue(null)

    const { selectRelevantTools } = await import('@/lib/agent/tool-rag')
    ;(selectRelevantTools as Mock).mockImplementation((_msg: string, tools: Anthropic.Tool[]) => ({
      tools,
      excluded: [],
      scores: {},
      toolSummary: null,
    }))

    const { buildDeferredToolsPrompt } = await import('@/lib/agent/tools/deferred-loader')
    ;(buildDeferredToolsPrompt as Mock).mockReturnValue('\n## Additional Tools (On-Demand)\nresolve_tool available\n')

    const { scrubLeaks, detectLeak, guardAndHumanize } = await import('@/lib/agent/response-guard')
    ;(scrubLeaks as Mock).mockImplementation((t: string) => t.replace(/\bclaude\b/gi, 'BitBit'))
    ;(detectLeak as Mock).mockReturnValue({ leaked: false, patterns: [] })
    ;(guardAndHumanize as Mock).mockImplementation((t: string) => t)

    // Default: model returns a simple text response
    mockStream = makeMockStream(
      [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello there' } }],
      textMessage('Hello there'),
    )

    // Wire the Anthropic constructor to delegate to our mock
    mockClientInstance = {
      messages: { stream: vi.fn().mockReturnValue(mockStream) },
    }
    __mockClientInstance = mockClientInstance
  })

  // ── 1. Tool execution: executeToolBatchStreaming called on tool_use ──
  it('calls executeToolBatchStreaming when model returns tool_use blocks', async () => {
    const { executeToolBatchStreaming } = await import('../tool-executor')
    const { runTAORLoop } = await import('../taor-loop')

    const toolMsg = toolUseMessage([{ id: 'call-1', name: 'search_memory', input: { query: 'test' } }])
    const finalTextMsg = textMessage('Here is the result')

    // First call returns tool_use, second returns text
    let callCount = 0
    mockClientInstance.messages.stream.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeMockStream([], toolMsg)
      }
      return makeMockStream(
        [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Here is the result' } }],
        finalTextMsg,
      )
    })

    // Mock executeToolBatchStreaming as an async generator
    const mockToolResults: Anthropic.ToolResultBlockParam[] = [
      { type: 'tool_result', tool_use_id: 'call-1', content: '{"found": true}' },
    ]
    ;(executeToolBatchStreaming as Mock).mockImplementation(function* () {
      yield { type: 'tool_result', data: { callId: 'call-1', name: 'search_memory', result: { found: true }, success: true } }
      return { toolResults: mockToolResults, events: [], activeRole: undefined, executionCapHit: false }
    })

    const events = await collectEvents(runTAORLoop('find my notes', makeConfig()))
    expect(executeToolBatchStreaming).toHaveBeenCalledOnce()

    // Verify tool_call event was yielded
    const toolCallEvents = events.filter(e => e.type === 'tool_call')
    expect(toolCallEvents).toHaveLength(1)
    expect((toolCallEvents[0].data as Record<string, unknown>).name).toBe('search_memory')
  })

  // ── 2. Extended thinking: complexity='high' → budget_tokens=8192 ──────
  it('enables extended thinking with budget_tokens=8192 for high complexity', async () => {
    const { generatePlan } = await import('@/lib/agent/planner')
    const { runTAORLoop } = await import('../taor-loop')

    ;(generatePlan as Mock).mockResolvedValueOnce({
      stages: [{ id: 's1', icon: '1', label: 'step', sublabel: '', toolHint: '' }],
      toolGroups: [],
      complexity: 'high',
      skills: [],
    })

    await collectEvents(runTAORLoop('generate a detailed financial analysis with comparisons', makeConfig()))

    // Check that the stream was called with thinking config
    const streamCall = mockClientInstance.messages.stream.mock.calls[0][0]
    expect(streamCall.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
  })

  // ── 3. Extended thinking: complexity='medium' → budget_tokens=2048 ────
  it('enables extended thinking with budget_tokens=2048 for medium complexity', async () => {
    const { generatePlan } = await import('@/lib/agent/planner')
    const { runTAORLoop } = await import('../taor-loop')

    ;(generatePlan as Mock).mockResolvedValueOnce({
      stages: [{ id: 's1', icon: '1', label: 'step', sublabel: '', toolHint: '' }],
      toolGroups: [],
      complexity: 'medium',
      skills: [],
    })

    await collectEvents(runTAORLoop('what was my last invoice?', makeConfig()))

    const streamCall = mockClientInstance.messages.stream.mock.calls[0][0]
    expect(streamCall.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 })
  })

  // ── 4. Extended thinking: complexity='low' → no thinking config ───────
  it('omits thinking config for low complexity', async () => {
    const { generatePlan } = await import('@/lib/agent/planner')
    const { isTrivialMessage } = await import('@/lib/agent/planner')
    const { runTAORLoop } = await import('../taor-loop')

    ;(isTrivialMessage as Mock).mockReturnValueOnce(true)
    // When trivial, no plan is generated. Fallback estimateComplexity with
    // a short message + 0 entities + 0 stages should yield 'low'.

    await collectEvents(runTAORLoop('hi', makeConfig()))

    const streamCall = mockClientInstance.messages.stream.mock.calls[0][0]
    expect(streamCall.thinking).toBeUndefined()
  })

  // ── 5. Response guard: scrubLeaks called on content_delta text ────────
  it('calls scrubLeaks on streamed content_delta text', async () => {
    const { scrubLeaks } = await import('@/lib/agent/response-guard')
    const { runTAORLoop } = await import('../taor-loop')

    mockStream = makeMockStream(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I am Claude, an AI' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' made by Anthropic' } },
      ],
      textMessage('I am Claude, an AI made by Anthropic'),
    )
    mockClientInstance.messages.stream.mockReturnValue(mockStream)

    const events = await collectEvents(runTAORLoop('who are you?', makeConfig()))

    expect(scrubLeaks).toHaveBeenCalledWith('I am Claude, an AI')
    expect(scrubLeaks).toHaveBeenCalledWith(' made by Anthropic')

    // Verify content_delta events exist
    const deltas = events.filter(e => e.type === 'content_delta')
    expect(deltas.length).toBeGreaterThanOrEqual(2)
  })

  // ── 6. Tool RAG filtering reduces tool count ──────────────────────────
  it('applies tool RAG filtering to reduce tool count', async () => {
    const { selectRelevantTools } = await import('@/lib/agent/tool-rag')
    const { runTAORLoop } = await import('../taor-loop')

    ;(selectRelevantTools as Mock).mockReturnValue({
      tools: [{ name: 'search_memory', description: 'search', input_schema: { type: 'object', properties: {} } }],
      excluded: ['send_message', 'fetch_url'],
      scores: { search_memory: 0.9, send_message: 0.2, fetch_url: 0.1 },
      toolSummary: 'Filtered 2 low-relevance tools',
    })

    await collectEvents(runTAORLoop('search for my notes', makeConfig()))

    expect(selectRelevantTools).toHaveBeenCalled()
    // The stream should only receive the filtered tool set
    const streamCall = mockClientInstance.messages.stream.mock.calls[0][0]
    expect(streamCall.tools).toHaveLength(1)
    expect(streamCall.tools[0].name).toBe('search_memory')
  })

  // ── 7. Deferred tools prompt appended when no toolGroups specified ────
  it('appends deferred tools prompt when toolGroups is not specified', async () => {
    const { buildDeferredToolsPrompt } = await import('@/lib/agent/tools/deferred-loader')
    const { runTAORLoop } = await import('../taor-loop')

    ;(buildDeferredToolsPrompt as Mock).mockReturnValue('\n## Additional Tools (On-Demand)\nresolve_tool, browse_website\n')

    await collectEvents(runTAORLoop('hello', makeConfig()))

    expect(buildDeferredToolsPrompt).toHaveBeenCalled()
    // The system prompt should include the deferred tools section
    const streamCall = mockClientInstance.messages.stream.mock.calls[0][0]
    expect(streamCall.system).toContain('Additional Tools (On-Demand)')
    expect(streamCall.system).toContain('resolve_tool')
  })

  // ── 8. Deferred tools prompt NOT appended when toolGroups specified ───
  it('does not append deferred tools prompt when toolGroups are specified', async () => {
    const { buildDeferredToolsPrompt } = await import('@/lib/agent/tools/deferred-loader')
    const { runTAORLoop } = await import('../taor-loop')

    ;(buildDeferredToolsPrompt as Mock).mockReturnValue('\n## Additional Tools\nresolve_tool\n')

    await collectEvents(runTAORLoop('hello', makeConfig({ toolGroups: ['core'] })))

    // buildDeferredToolsPrompt is still called (it's invoked unconditionally),
    // but the result should NOT be appended to the system prompt
    const streamCall = mockClientInstance.messages.stream.mock.calls[0][0]
    expect(streamCall.system).not.toContain('Additional Tools')
  })

  // ── 9. Run logging includes skills_activated when skills are active ───
  it('includes skills_activated in trigger_payload when skills are resolved', async () => {
    const { generatePlan } = await import('@/lib/agent/planner')
    const { resolveSkill } = await import('@/lib/skills/registry')
    const { logAgentRun } = await import('@/lib/agent/run-logger')
    const { runTAORLoop } = await import('../taor-loop')

    ;(generatePlan as Mock).mockResolvedValueOnce({
      stages: [{ id: 's1', icon: '1', label: 'step', sublabel: '', toolHint: '' }],
      toolGroups: [],
      complexity: 'medium',
      skills: ['invoice-helper'],
    })

    ;(resolveSkill as Mock).mockResolvedValueOnce({
      entry: {
        id: 'invoice-helper',
        name: 'Invoice Helper',
        estimatedTokens: 500,
        toolGroup: undefined,
        planGate: undefined,
      },
      prompt: 'You are an invoice helper...',
      tools: [],
    })

    await collectEvents(runTAORLoop('help with my invoice', makeConfig()))

    expect(logAgentRun).toHaveBeenCalled()
    const logCall = (logAgentRun as Mock).mock.calls[0][1]
    expect(logCall.trigger_payload.skills_activated).toEqual(['invoice-helper'])
    expect(logCall.trigger_payload.skills_tokens).toBe(500)
  })

  // ── 10. Multiple tool_use blocks dispatched in single batch ───────────
  it('dispatches multiple tool_use blocks to executeToolBatchStreaming', async () => {
    const { executeToolBatchStreaming } = await import('../tool-executor')
    const { runTAORLoop } = await import('../taor-loop')

    const toolMsg = toolUseMessage([
      { id: 'call-1', name: 'search_memory', input: { query: 'a' } },
      { id: 'call-2', name: 'send_message', input: { to: 'bob', text: 'hi' } },
    ])
    const finalTextMsg = textMessage('Done')

    let callCount = 0
    mockClientInstance.messages.stream.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeMockStream([], toolMsg)
      return makeMockStream(
        [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } }],
        finalTextMsg,
      )
    })

    const mockToolResults: Anthropic.ToolResultBlockParam[] = [
      { type: 'tool_result', tool_use_id: 'call-1', content: '{}' },
      { type: 'tool_result', tool_use_id: 'call-2', content: '{}' },
    ]
    ;(executeToolBatchStreaming as Mock).mockImplementation(function* () {
      yield { type: 'tool_result', data: { callId: 'call-1', name: 'search_memory', result: {}, success: true } }
      yield { type: 'tool_result', data: { callId: 'call-2', name: 'send_message', result: {}, success: true } }
      return { toolResults: mockToolResults, events: [], activeRole: undefined, executionCapHit: false }
    })

    const events = await collectEvents(runTAORLoop('search and send', makeConfig()))

    expect(executeToolBatchStreaming).toHaveBeenCalledOnce()
    // Both tool_use blocks should be in the first argument
    const toolBlocks = (executeToolBatchStreaming as Mock).mock.calls[0][0]
    expect(toolBlocks).toHaveLength(2)

    // Verify both tool_call events were yielded
    const toolCallEvents = events.filter(e => e.type === 'tool_call')
    expect(toolCallEvents).toHaveLength(2)
  })

  // ── 11. Thinking deltas are yielded to consumers ──────────────────────
  it('yields thinking_delta and thinking_complete events from extended thinking', async () => {
    const { generatePlan } = await import('@/lib/agent/planner')
    const { runTAORLoop } = await import('../taor-loop')

    ;(generatePlan as Mock).mockResolvedValueOnce({
      stages: [{ id: 's1', icon: '1', label: 'step', sublabel: '', toolHint: '' }],
      toolGroups: [],
      complexity: 'high',
      skills: [],
    })

    // Simulate a stream with thinking blocks followed by text
    const thinkingStream = makeMockStream(
      [
        { type: 'content_block_start', content_block: { type: 'thinking' } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Let me think about this...' } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'I should search memory.' } },
        { type: 'content_block_stop' },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Here is your answer' } },
      ],
      textMessage('Here is your answer'),
    )
    mockClientInstance.messages.stream.mockReturnValue(thinkingStream)

    const events = await collectEvents(runTAORLoop('complex analysis', makeConfig()))

    const thinkingDeltas = events.filter(e => e.type === 'thinking_delta')
    expect(thinkingDeltas).toHaveLength(2)
    expect(thinkingDeltas[0].data).toBe('Let me think about this...')
    expect(thinkingDeltas[1].data).toBe('I should search memory.')

    const thinkingComplete = events.filter(e => e.type === 'thinking_complete')
    expect(thinkingComplete).toHaveLength(1)
  })
})
