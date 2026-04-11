/**
 * TAOR Loop Tests
 *
 * Tests the core agent loop: iteration, termination, streaming, safety ceiling,
 * circuit breaker, DLQ writes, token accumulation, and compaction handling.
 *
 * Strategy: mock all 20+ imports to isolate the loop logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock ALL imports before importing the module under test
// ---------------------------------------------------------------------------

const mockStreamFn = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      stream: mockStreamFn,
    }
  }
  return { default: MockAnthropic }
})

vi.mock('@/lib/agent/tools', () => ({
  getAgentTools: vi.fn(() => [
    { name: 'search_contacts', description: 'Search contacts', input_schema: { type: 'object', properties: {} } },
    { name: 'create_task', description: 'Create a task', input_schema: { type: 'object', properties: {} } },
  ]),
  TOOL_GROUP_MAP: {} as Record<string, string>,
  TOOL_GROUPS: {},
}))

vi.mock('@/lib/agent/tools/deferred-loader', () => ({
  getEagerTools: vi.fn(() => [
    { name: 'search_contacts', description: 'Search contacts', input_schema: { type: 'object', properties: {} } },
  ]),
  buildDeferredToolsPrompt: vi.fn(() => ''),
  resolveToolSchema: vi.fn(),
}))

vi.mock('@/lib/composio/mcp-session', () => ({
  getMCPTools: vi.fn(async () => []),
  isMCPEnabled: vi.fn(() => false),
}))

vi.mock('@/lib/agent/tool-rag', () => ({
  selectRelevantTools: vi.fn((_msg: string, tools: unknown[]) => ({
    tools,
    excluded: [],
    toolSummary: '',
    scores: {},
  })),
}))

vi.mock('@/lib/agent/prompt-builder', () => ({
  buildEntityAwarePrompt: vi.fn(async () => '## Core Identity\nYou are BitBit.\n\n## Entity Context\n\nNo entities detected.'),
}))

vi.mock('@/lib/context-assembly/context-assembler', () => ({
  ContextAssembler: vi.fn().mockImplementation(() => ({
    loadContext: vi.fn(async () => ''),
    loadPolicies: vi.fn(async () => ''),
  })),
}))

vi.mock('@/lib/agent/model-router', () => ({
  selectModel: vi.fn(() => ({ model: 'claude-sonnet-4-6', purpose: 'conversation' as const, reasoning: 'test' })),
}))

vi.mock('@/lib/agent/model-registry', () => ({
  resolveModel: vi.fn(() => 'claude-sonnet-4-6'),
  resolveTokenLimit: vi.fn(() => 8192),
  computeCost: vi.fn(() => 0.001),
}))

vi.mock('@/lib/agent/run-logger', () => ({
  logAgentRun: vi.fn(async () => ({ id: 'run-123' })),
  estimateRunCost: vi.fn(() => 0.001),
}))

vi.mock('@/lib/agent/planner', () => ({
  generatePlan: vi.fn(async () => ({
    stages: [{ id: 'greet', label: 'Greeting', icon: '👋' }],
    toolGroups: [],
    complexity: 'low' as const,
    skills: [],
  })),
  stageFromToolName: vi.fn(() => null),
  isTrivialMessage: vi.fn(() => false),
}))

vi.mock('@/lib/agent/circuit-breaker', () => ({
  withCircuitBreaker: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
  CircuitOpenError: class CircuitOpenError extends Error {
    circuitKey: string
    constructor(key: string) { super(`Circuit open: ${key}`); this.circuitKey = key; this.name = 'CircuitOpenError' }
  },
}))

vi.mock('@/lib/agent/dlq', () => ({
  writeToDeadLetterQueue: vi.fn(async () => {}),
}))

vi.mock('@/lib/agent/response-guard', () => ({
  detectLeak: vi.fn(() => ({ leaked: false, patterns: [] })),
  scrubLeaks: vi.fn((text: string) => text),
  guardAndHumanize: vi.fn((text: string) => text),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/agent/citation-extractor', () => ({
  detectTopicShift: vi.fn(() => false),
}))

vi.mock('../turn-evaluator', () => ({
  evaluateTurnQuality: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/memory-palace/service', () => ({
  MemoryPalaceService: vi.fn().mockImplementation(() => ({
    createMemory: vi.fn(async () => 'mem-123'),
    searchMemories: vi.fn(async () => []),
    corroborateMemory: vi.fn(async () => {}),
    contradictMemory: vi.fn(async () => {}),
    penaliseMemory: vi.fn(async () => {}),
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
  executeToolBatchStreaming: vi.fn(async function* () {
    // yields nothing by default — return value provides toolResults
  }),
}))

vi.mock('@/lib/agent/tier-prompts', () => ({
  getTierModifier: vi.fn(() => ''),
}))

// ---------------------------------------------------------------------------
// Import module under test (after all mocks)
// ---------------------------------------------------------------------------

const { runTAORLoop } = await import('../taor-loop')

// Import mocked modules for assertion access — cast to Mock for type safety
import type { Mock } from 'vitest'
const planner = await import('@/lib/agent/planner')
const preflight = await import('../pre-flight')
const runLogger = await import('@/lib/agent/run-logger')
const dlq = await import('@/lib/agent/dlq')
const circuitBreaker = await import('@/lib/agent/circuit-breaker')
const responseGuard = await import('@/lib/agent/response-guard')
const toolExecutor = await import('../tool-executor')

const mockIsTrivialMessage = planner.isTrivialMessage as unknown as Mock
const mockGeneratePlan = planner.generatePlan as unknown as Mock
const mockPreFlightChecks = preflight.preFlightChecks as unknown as Mock
const mockLogAgentRun = runLogger.logAgentRun as unknown as Mock
const mockWriteToDeadLetterQueue = dlq.writeToDeadLetterQueue as unknown as Mock
const mockWithCircuitBreaker = circuitBreaker.withCircuitBreaker as unknown as Mock
const mockScrubLeaks = responseGuard.scrubLeaks as unknown as Mock
const mockExecuteToolBatchStreaming = toolExecutor.executeToolBatchStreaming as unknown as Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Parameters<typeof runTAORLoop>[1]> = {}) {
  return {
    orgId: 'org-test',
    supabase: {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn(() => ({ data: null, error: null })) })),
        })),
      })),
    } as any,
    agentConfigId: 'config-123',
    ...overrides,
  }
}

async function collectEvents(message: string, config?: Parameters<typeof runTAORLoop>[1]) {
  const events: Array<{ type: string; data: unknown }> = []
  for await (const event of runTAORLoop(message, config ?? makeConfig())) {
    events.push(event)
  }
  return events
}

function findEvents(events: Array<{ type: string; data: unknown }>, type: string) {
  return events.filter(e => e.type === type)
}

/**
 * Create a mock Anthropic stream that yields text deltas then resolves a final message.
 */
function createMockStream(content: string, stopReason = 'end_turn', usage = { input_tokens: 100, output_tokens: 50 }) {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: content } }
    },
    finalMessage: () => ({
      content: [{ type: 'text', text: content }],
      stop_reason: stopReason,
      usage,
    }),
  }
}

/**
 * Create a mock stream whose finalMessage returns tool_use blocks,
 * forcing the loop into tool execution.
 */
function createToolUseStream(
  toolBlocks: Array<{ id: string; name: string; input: unknown }>,
  usage = { input_tokens: 200, output_tokens: 100 },
) {
  const content = toolBlocks.map(t => ({
    type: 'tool_use' as const,
    id: t.id,
    name: t.name,
    input: t.input,
  }))
  return {
    [Symbol.asyncIterator]: async function* () {
      // No text deltas for tool_use responses
    },
    finalMessage: () => ({
      content,
      stop_reason: 'tool_use',
      usage,
    }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TAOR Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock: stream returns end_turn with simple text
    mockStreamFn.mockReturnValue(createMockStream('Hello!'))

    // Reset withCircuitBreaker to default pass-through (tests may set mockRejectedValue)
    mockWithCircuitBreaker.mockImplementation(async (_key: string, fn: () => Promise<unknown>) => fn())

    // Reset defaults
    mockIsTrivialMessage.mockReturnValue(false)
    mockPreFlightChecks.mockResolvedValue({ blocked: false, events: [] })
    mockGeneratePlan.mockResolvedValue({
      stages: [{ id: 'greet', label: 'Greeting', icon: '👋' }],
      toolGroups: [],
      complexity: 'low',
      skills: [],
    })
  })

  // -----------------------------------------------------------------------
  // 1. Loop terminates when model returns stop_reason !== 'tool_use'
  // -----------------------------------------------------------------------
  describe('normal termination', () => {
    it('terminates when model returns end_turn, yielding message + done', async () => {
      mockStreamFn.mockReturnValue(createMockStream('Goodbye!'))

      const events = await collectEvents('Hello')

      const messageEvents = findEvents(events, 'message')
      const doneEvents = findEvents(events, 'done')

      expect(messageEvents.length).toBeGreaterThanOrEqual(1)
      expect(messageEvents[0].data).toBe('Goodbye!')
      expect(doneEvents).toHaveLength(1)

      // Should NOT have any tool_call events
      const toolCalls = findEvents(events, 'tool_call')
      expect(toolCalls).toHaveLength(0)
    })

    it('logs successful run with logAgentRun', async () => {
      await collectEvents('Hello')

      expect(mockLogAgentRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          org_id: 'org-test',
          status: 'success',
          trigger_type: 'chat',
        }),
      )
    })

    it('blocks when pre-flight check returns blocked', async () => {
      mockPreFlightChecks.mockResolvedValue({
        blocked: true,
        reason: 'cost_blocked',
        events: [{ type: 'cost_blocked', data: { spentToday: 10, dailyLimit: 5 } }],
      })

      const events = await collectEvents('Hello')
      const costBlocked = findEvents(events, 'cost_blocked')

      expect(costBlocked).toHaveLength(1)
      // Should NOT have any message events since loop was blocked
      const messages = findEvents(events, 'message')
      expect(messages).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // 2. Loop yields content_delta events for streamed text
  // -----------------------------------------------------------------------
  describe('content delta streaming', () => {
    it('yields content_delta events for each streamed text chunk', async () => {
      // Stream that produces multiple text deltas
      const multiDeltaStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ', ' } }
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world!' } }
        },
        finalMessage: () => ({
          content: [{ type: 'text', text: 'Hello, world!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 80, output_tokens: 30 },
        }),
      }
      mockStreamFn.mockReturnValue(multiDeltaStream)

      const events = await collectEvents('Hi')
      const deltas = findEvents(events, 'content_delta')

      expect(deltas).toHaveLength(3)
      expect(deltas.map(d => d.data)).toEqual(['Hello', ', ', 'world!'])
    })

    it('calls scrubLeaks on each streamed delta', async () => {
      mockStreamFn.mockReturnValue(createMockStream('Some text'))

      await collectEvents('Hello')

      expect(mockScrubLeaks).toHaveBeenCalledWith('Some text')
    })
  })

  // -----------------------------------------------------------------------
  // 3. Safety ceiling triggers max_iterations status
  // -----------------------------------------------------------------------
  describe('safety ceiling', () => {
    it('stops after SAFETY_CEILING (50) iterations and logs max_iterations', async () => {
      // Every stream call returns tool_use to force continuous iteration
      mockStreamFn.mockImplementation(() =>
        createToolUseStream([{ id: `call-${Date.now()}`, name: 'search_contacts', input: {} }], { input_tokens: 10, output_tokens: 5 }),
      )

      // Mock tool executor to return minimal results (generator that returns immediately)
      mockExecuteToolBatchStreaming.mockImplementation(function* () {
        return {
          toolResults: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }],
          events: [],
          executionCapHit: false,
        }
      })

      const events = await collectEvents('do something complex')

      // Should have a done event
      const doneEvents = findEvents(events, 'done')
      expect(doneEvents).toHaveLength(1)

      // logAgentRun must be called with max_iterations status
      const logCalls = mockLogAgentRun.mock.calls
      const maxIterCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'max_iterations',
      )
      expect(maxIterCall).toBeDefined()
      expect((maxIterCall![1] as Record<string, unknown>).iterations).toBe(50)
    }, 10000) // Allow more time for 50 iterations
  })

  // -----------------------------------------------------------------------
  // 4. Circuit breaker (CircuitOpenError) yields error, doesn't throw
  // -----------------------------------------------------------------------
  describe('circuit breaker', () => {
    it('yields error event and done when CircuitOpenError is thrown', async () => {
      const { CircuitOpenError } = await import('@/lib/agent/circuit-breaker')
      mockWithCircuitBreaker.mockRejectedValue(new CircuitOpenError('anthropic:default'))

      const events = await collectEvents('Hello')

      const errorEvents = findEvents(events, 'error')
      expect(errorEvents.length).toBeGreaterThan(0)
      expect(String(errorEvents[0].data)).toContain('circuit open')

      // Generator must complete (yield done), not throw
      const doneEvents = findEvents(events, 'done')
      expect(doneEvents).toHaveLength(1)
    })

    it('logs agent run with error status on circuit breaker open', async () => {
      const { CircuitOpenError } = await import('@/lib/agent/circuit-breaker')
      mockWithCircuitBreaker.mockRejectedValue(new CircuitOpenError('anthropic:default'))

      await collectEvents('Hello')

      expect(mockLogAgentRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'error',
          error_message: expect.stringContaining('Circuit breaker open'),
        }),
      )
    })

    it('does NOT write to dead letter queue on circuit breaker (temporary)', async () => {
      const { CircuitOpenError } = await import('@/lib/agent/circuit-breaker')
      mockWithCircuitBreaker.mockRejectedValue(new CircuitOpenError('anthropic:default'))

      await collectEvents('Hello')

      expect(mockWriteToDeadLetterQueue).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 5. API error writes to dead letter queue
  // -----------------------------------------------------------------------
  describe('API error and DLQ', () => {
    it('writes to dead letter queue on unrecoverable API error', async () => {
      mockWithCircuitBreaker.mockRejectedValue(new Error('API rate limit'))

      const events = await collectEvents('Hello')

      expect(mockWriteToDeadLetterQueue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orgId: 'org-test',
          errorMessage: 'API rate limit',
        }),
      )

      // Should also yield error + done
      const errorEvents = findEvents(events, 'error')
      expect(errorEvents.length).toBeGreaterThan(0)
      expect(String(errorEvents[0].data)).toContain('API rate limit')

      const doneEvents = findEvents(events, 'done')
      expect(doneEvents).toHaveLength(1)
    })

    it('skips run logging when agentConfigId is absent', async () => {
      mockWithCircuitBreaker.mockRejectedValue(new Error('Timeout'))

      await collectEvents('Hello', makeConfig({ agentConfigId: undefined }))

      // DLQ should still be written
      expect(mockWriteToDeadLetterQueue).toHaveBeenCalledOnce()
      // But logAgentRun should NOT be called
      expect(mockLogAgentRun).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 6. Token counting accumulates across iterations
  // -----------------------------------------------------------------------
  describe('token accumulation', () => {
    it('accumulates totalInputTokens and totalOutputTokens across iterations', async () => {
      // First call: tool_use with known token counts
      mockStreamFn
        .mockReturnValueOnce(
          createToolUseStream(
            [{ id: 'call-1', name: 'search_contacts', input: {} }],
            { input_tokens: 150, output_tokens: 80 },
          ),
        )
        // Second call: end_turn with more tokens
        .mockReturnValueOnce(
          createMockStream('Done!', 'end_turn', { input_tokens: 300, output_tokens: 120 }),
        )

      // Mock tool executor for the tool_use iteration
      mockExecuteToolBatchStreaming.mockImplementation(function* () {
        return {
          toolResults: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'result' }],
          events: [],
          executionCapHit: false,
        }
      })

      await collectEvents('do something')

      // logAgentRun should report accumulated tokens: 150+300=450 in, 80+120=200 out
      const logCalls = mockLogAgentRun.mock.calls
      const successCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'success',
      )
      expect(successCall).toBeDefined()
      expect((successCall![1] as Record<string, unknown>).tokens_in).toBe(450)
      expect((successCall![1] as Record<string, unknown>).tokens_out).toBe(200)
      expect((successCall![1] as Record<string, unknown>).iterations).toBe(2)
    })
  })

  // -----------------------------------------------------------------------
  // 7. Compaction handling resets messages and continues
  // -----------------------------------------------------------------------
  describe('compaction handling', () => {
    it('resets messages on compaction and continues the loop', async () => {
      // First call: compaction stop_reason
      const compactionStream = {
        [Symbol.asyncIterator]: async function* () {
          // No text deltas during compaction
        },
        finalMessage: () => ({
          content: [{ type: 'text', text: '[compacted summary]' }],
          stop_reason: 'compaction',
          usage: { input_tokens: 500, output_tokens: 200 },
        }),
      }
      mockStreamFn
        .mockReturnValueOnce(compactionStream)
        // Second call: normal end_turn after compaction
        .mockReturnValueOnce(createMockStream('After compaction'))

      const events = await collectEvents('Hello')

      // Should have a checkpoint event for the compaction
      const checkpoints = findEvents(events, 'checkpoint')
      const compactionCheckpoint = checkpoints.find(
        e => (e.data as Record<string, unknown>).label === 'Context compacted',
      )
      expect(compactionCheckpoint).toBeDefined()

      // Should eventually produce a message + done from the second iteration
      const messageEvents = findEvents(events, 'message')
      expect(messageEvents.length).toBeGreaterThanOrEqual(1)
      expect(messageEvents[0].data).toBe('After compaction')

      const doneEvents = findEvents(events, 'done')
      expect(doneEvents).toHaveLength(1)

      // The stream function should have been called twice
      // (once for compaction, once for the resumed iteration)
      expect(mockStreamFn).toHaveBeenCalledTimes(2)
    })

    it('accumulates tokens across compaction boundary', async () => {
      const compactionStream = {
        [Symbol.asyncIterator]: async function* () {},
        finalMessage: () => ({
          content: [{ type: 'text', text: '[compacted]' }],
          stop_reason: 'compaction',
          usage: { input_tokens: 400, output_tokens: 150 },
        }),
      }
      mockStreamFn
        .mockReturnValueOnce(compactionStream)
        .mockReturnValueOnce(createMockStream('OK', 'end_turn', { input_tokens: 200, output_tokens: 100 }))

      await collectEvents('Hello')

      const logCalls = mockLogAgentRun.mock.calls
      const successCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'success',
      )
      expect(successCall).toBeDefined()
      // 400+200=600 input, 150+100=250 output
      expect((successCall![1] as Record<string, unknown>).tokens_in).toBe(600)
      expect((successCall![1] as Record<string, unknown>).tokens_out).toBe(250)
    })
  })

  // -----------------------------------------------------------------------
  // 8. Entity-aware iteration caps
  // -----------------------------------------------------------------------
  describe('entity-aware iteration caps', () => {
    it('uses SAFETY_CEILING (50) when no override is set', async () => {
      // Force continuous tool_use to hit ceiling
      mockStreamFn.mockImplementation(() =>
        createToolUseStream([{ id: `call-${Date.now()}`, name: 'search_contacts', input: {} }], { input_tokens: 10, output_tokens: 5 }),
      )
      mockExecuteToolBatchStreaming.mockImplementation(function* () {
        return {
          toolResults: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }],
          events: [],
          executionCapHit: false,
        }
      })

      const events = await collectEvents('do something', makeConfig())

      const logCalls = mockLogAgentRun.mock.calls
      const maxIterCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'max_iterations',
      )
      expect(maxIterCall).toBeDefined()
      expect((maxIterCall![1] as Record<string, unknown>).iterations).toBe(50)
    }, 10000)

    it('uses config.iterationCap when provided', async () => {
      let iterations = 0
      mockStreamFn.mockImplementation(() => {
        iterations++
        if (iterations <= 5) {
          return createToolUseStream([{ id: `call-${iterations}`, name: 'search_contacts', input: {} }], { input_tokens: 10, output_tokens: 5 })
        }
        return createMockStream('Done after 5 iterations')
      })
      mockExecuteToolBatchStreaming.mockImplementation(function* () {
        return {
          toolResults: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }],
          events: [],
          executionCapHit: false,
        }
      })

      const events = await collectEvents('do something', makeConfig({ iterationCap: 100 }))

      // Should complete normally (not hit ceiling at 50) since iterationCap is 100
      const logCalls = mockLogAgentRun.mock.calls
      const successCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'success',
      )
      expect(successCall).toBeDefined()
    })

    it('uses config.maxIterations as fallback when iterationCap is absent', async () => {
      mockStreamFn.mockImplementation(() =>
        createToolUseStream([{ id: `call-${Date.now()}`, name: 'search_contacts', input: {} }], { input_tokens: 10, output_tokens: 5 }),
      )
      mockExecuteToolBatchStreaming.mockImplementation(function* () {
        return {
          toolResults: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }],
          events: [],
          executionCapHit: false,
        }
      })

      const events = await collectEvents('do something', makeConfig({ maxIterations: 3 }))

      const logCalls = mockLogAgentRun.mock.calls
      const maxIterCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'max_iterations',
      )
      expect(maxIterCall).toBeDefined()
      expect((maxIterCall![1] as Record<string, unknown>).iterations).toBe(3)
    })

    it('iterationCap takes priority over maxIterations', async () => {
      mockStreamFn.mockImplementation(() =>
        createToolUseStream([{ id: `call-${Date.now()}`, name: 'search_contacts', input: {} }], { input_tokens: 10, output_tokens: 5 }),
      )
      mockExecuteToolBatchStreaming.mockImplementation(function* () {
        return {
          toolResults: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }],
          events: [],
          executionCapHit: false,
        }
      })

      // iterationCap: 5 should win over maxIterations: 30
      const events = await collectEvents('do something', makeConfig({ iterationCap: 5, maxIterations: 30 }))

      const logCalls = mockLogAgentRun.mock.calls
      const maxIterCall = logCalls.find(
        (args: unknown[]) => (args[1] as Record<string, unknown>).status === 'max_iterations',
      )
      expect(maxIterCall).toBeDefined()
      expect((maxIterCall![1] as Record<string, unknown>).iterations).toBe(5)
    })
  })
})
