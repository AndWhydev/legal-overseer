/**
 * TAOR loop tests — tool execution, streaming, extended thinking, response guard.
 *
 * All imports from taor-loop.ts (and transitive deps) are vi.mock'd to
 * avoid runtime initialisation of Supabase, Anthropic, etc.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import type { AgentEvent, EngineConfig } from '../types'

// Shared reference to control the mock gateway adapter
let __mockCallModelViaGateway: Mock

// ---------------------------------------------------------------------------
// Mocks — every import the TAOR loop touches
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {},
}))

vi.mock('@/lib/ai/gateway-adapter', () => ({
  callModelViaGateway: vi.fn(),
}))

vi.mock('@/lib/ai', () => ({
  models: { fast: 'anthropic/claude-haiku', balanced: 'anthropic/claude-sonnet', heavy: 'anthropic/claude-opus' },
}))

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

vi.mock('@/lib/composio/tool-provider', () => ({
  getComposioToolsForOrg: vi.fn(async () => ({ tools: [] })),
}))

vi.mock('@/lib/composio/client', () => ({
  isComposioEnabled: vi.fn(() => false),
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

vi.mock('@/lib/brain/query-gate', () => ({
  classifyQueryComplexity: vi.fn(() => 'system2'),
}))

vi.mock('@/lib/agent/entity-overrides', () => ({
  resolveEntityOverrides: vi.fn(async () => ({})),
}))

vi.mock('@/lib/agent/delegation-intent', () => ({
  detectDelegationIntent: vi.fn(() => null),
  resolveEntityCandidates: vi.fn(async () => []),
  generateActivationConfirmation: vi.fn(() => ''),
  generateRevocationConfirmation: vi.fn(() => ''),
  generateAmbiguityClarification: vi.fn(() => ''),
}))

vi.mock('@/lib/agent/delegation-mandate', () => ({
  setEntityMandate: vi.fn(async () => {}),
  revokeEntityMandate: vi.fn(async () => false),
  getEntityMandate: vi.fn(async () => null),
}))

vi.mock('./taor-loop-utils', () => ({
  buildTaorExecOptions: vi.fn(() => undefined),
  mergeEntityOverrides: vi.fn((config: unknown) => config),
}))

vi.mock('./tool-resolver', () => ({
  buildTierContextBlock: vi.fn(async () => null),
}))

vi.mock('@/lib/agent/follow-up-generator', () => ({
  generateFollowUps: vi.fn(async () => []),
}))

vi.mock('./decision-trace-retriever', () => ({
  retrieveRelevantTraces: vi.fn(async () => ({ traces: [], retrievalMs: 0 })),
  formatTracesAsContext: vi.fn(() => null),
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

interface GatewayCallConfig {
  model: string
  maxTokens: number
  system: string
  tools: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>
  messages: Array<{ role: string; content: unknown }>
  thinking?: { type: 'enabled'; budget_tokens: number }
}

/**
 * Build a mock GatewayCallResult with text response.
 */
function makeTextGatewayResult(
  text: string,
  deltas?: string[],
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  return {
    streamedDeltas: deltas ?? [text],
    streamedThinkingDeltas: [],
    hadThinking: false,
    thinkingStartTime: null,
    response: {
      content: [{ type: 'text' as const, text }],
      stop_reason: 'end_turn',
      usage,
    },
  }
}

/**
 * Build a mock GatewayCallResult with tool_use response.
 */
function makeToolUseGatewayResult(
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  return {
    streamedDeltas: [],
    streamedThinkingDeltas: [],
    hadThinking: false,
    thinkingStartTime: null,
    response: {
      content: toolCalls.map(tc => ({
        type: 'tool_use' as const,
        id: tc.id,
        name: tc.name,
        input: tc.input,
      })),
      stop_reason: 'tool_use',
      usage,
    },
  }
}

/**
 * Build a mock GatewayCallResult with thinking deltas.
 */
function makeThinkingGatewayResult(
  thinkingDeltas: string[],
  text: string,
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  return {
    streamedDeltas: [text],
    streamedThinkingDeltas: thinkingDeltas,
    hadThinking: true,
    thinkingStartTime: Date.now() - 500,
    response: {
      content: [{ type: 'text' as const, text }],
      stop_reason: 'end_turn',
      usage,
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TAOR loop — tools, thinking, streaming', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset mocks that tests override with mockReturnValue / mockResolvedValue
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

    // Wire the gateway mock
    const gatewayAdapter = await import('@/lib/ai/gateway-adapter')
    __mockCallModelViaGateway = gatewayAdapter.callModelViaGateway as Mock

    // Default: model returns a simple text response
    __mockCallModelViaGateway.mockResolvedValue(makeTextGatewayResult('Hello there'))
  })

  // ── 1. Tool execution: executeToolBatchStreaming called on tool_use ──
  it('calls executeToolBatchStreaming when model returns tool_use blocks', async () => {
    const { executeToolBatchStreaming } = await import('../tool-executor')
    const { runTAORLoop } = await import('../taor-loop')

    // First call returns tool_use, second returns text
    let callCount = 0
    __mockCallModelViaGateway.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return makeToolUseGatewayResult([{ id: 'call-1', name: 'search_memory', input: { query: 'test' } }])
      }
      return makeTextGatewayResult('Here is the result')
    })

    // Mock executeToolBatchStreaming as a generator
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

    // Check that the gateway was called with thinking config
    const gatewayCall = __mockCallModelViaGateway.mock.calls[0][0] as GatewayCallConfig
    expect(gatewayCall.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
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

    const gatewayCall = __mockCallModelViaGateway.mock.calls[0][0] as GatewayCallConfig
    expect(gatewayCall.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 })
  })

  // ── 4. Extended thinking: complexity='low' → no thinking config ───────
  it('omits thinking config for low complexity', async () => {
    const { isTrivialMessage } = await import('@/lib/agent/planner')
    const { runTAORLoop } = await import('../taor-loop')

    ;(isTrivialMessage as Mock).mockReturnValueOnce(true)

    await collectEvents(runTAORLoop('hi', makeConfig()))

    const gatewayCall = __mockCallModelViaGateway.mock.calls[0][0] as GatewayCallConfig
    expect(gatewayCall.thinking).toBeUndefined()
  })

  // ── 5. Response guard: scrubLeaks called on content_delta text ────────
  it('calls scrubLeaks on streamed content_delta text', async () => {
    const { scrubLeaks } = await import('@/lib/agent/response-guard')
    const { runTAORLoop } = await import('../taor-loop')

    __mockCallModelViaGateway.mockResolvedValue({
      streamedDeltas: ['I am Claude, an AI', ' made by Anthropic'],
      streamedThinkingDeltas: [],
      hadThinking: false,
      thinkingStartTime: null,
      response: {
        content: [{ type: 'text', text: 'I am Claude, an AI made by Anthropic' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    })

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
    // The gateway should only receive the filtered tool set
    const gatewayCall = __mockCallModelViaGateway.mock.calls[0][0] as GatewayCallConfig
    expect(gatewayCall.tools).toHaveLength(1)
    expect(gatewayCall.tools[0].name).toBe('search_memory')
  })

  // ── 7. Deferred tools prompt appended when no toolGroups specified ────
  it('appends deferred tools prompt when toolGroups is not specified', async () => {
    const { buildDeferredToolsPrompt } = await import('@/lib/agent/tools/deferred-loader')
    const { runTAORLoop } = await import('../taor-loop')

    ;(buildDeferredToolsPrompt as Mock).mockReturnValue('\n## Additional Tools (On-Demand)\nresolve_tool, browse_website\n')

    await collectEvents(runTAORLoop('hello', makeConfig()))

    expect(buildDeferredToolsPrompt).toHaveBeenCalled()
    // The system prompt should include the deferred tools section
    const gatewayCall = __mockCallModelViaGateway.mock.calls[0][0] as GatewayCallConfig
    expect(gatewayCall.system).toContain('Additional Tools (On-Demand)')
    expect(gatewayCall.system).toContain('resolve_tool')
  })

  // ── 8. Deferred tools prompt NOT appended when toolGroups specified ───
  it('does not append deferred tools prompt when toolGroups are specified', async () => {
    const { buildDeferredToolsPrompt } = await import('@/lib/agent/tools/deferred-loader')
    const { runTAORLoop } = await import('../taor-loop')

    ;(buildDeferredToolsPrompt as Mock).mockReturnValue('\n## Additional Tools\nresolve_tool\n')

    await collectEvents(runTAORLoop('hello', makeConfig({ toolGroups: ['core'] })))

    // The result should NOT be appended to the system prompt
    const gatewayCall = __mockCallModelViaGateway.mock.calls[0][0] as GatewayCallConfig
    expect(gatewayCall.system).not.toContain('Additional Tools')
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

    let callCount = 0
    __mockCallModelViaGateway.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return makeToolUseGatewayResult([
          { id: 'call-1', name: 'search_memory', input: { query: 'a' } },
          { id: 'call-2', name: 'send_message', input: { to: 'bob', text: 'hi' } },
        ])
      }
      return makeTextGatewayResult('Done')
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

    // Return gateway result with thinking deltas
    __mockCallModelViaGateway.mockResolvedValue(
      makeThinkingGatewayResult(
        ['Let me think about this...', 'I should search memory.'],
        'Here is your answer',
      ),
    )

    const events = await collectEvents(runTAORLoop('complex analysis', makeConfig()))

    const thinkingDeltas = events.filter(e => e.type === 'thinking_delta')
    expect(thinkingDeltas).toHaveLength(2)
    expect(thinkingDeltas[0].data).toBe('Let me think about this...')
    expect(thinkingDeltas[1].data).toBe('I should search memory.')

    const thinkingComplete = events.filter(e => e.type === 'thinking_complete')
    expect(thinkingComplete).toHaveLength(1)
  })
})
