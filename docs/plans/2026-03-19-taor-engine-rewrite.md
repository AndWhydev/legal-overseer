# TAOR Engine Rewrite — Claude Code Harness Pattern

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace BitBit's 1,100-line engine.ts (15-iteration capped loop with observation masking hacks) with a clean Think-Act-Observe-Repeat loop modeled on Claude Code's harness, add a `spawn_agent` tool for dynamic sub-agent spawning with context isolation, switch to Anthropic's server-side compaction API, add deferred tool loading, and unify agent work items with user task tracking.

**Architecture:** The core loop becomes ~100 lines of dumb orchestration. Intelligence stays in the model and prompt. Observation masking, convergence hints, and iteration caps are removed in favor of API-level compaction (`compact-2026-01-12`). Complex tasks are decomposed by the model itself via a new `spawn_agent` tool that creates isolated sub-conversations, each with their own context window and tool access, returning summaries to the parent. Tool schemas load on-demand instead of all-upfront to save context tokens.

**Tech Stack:** Anthropic SDK (messages.stream + compaction beta), TypeScript, Supabase (agent_runs, swarm_runs tables), Next.js API routes (SSE streaming)

---

## Preservation Contract

These systems are **kept intact** and wired into the new engine. They are NOT rewritten:

- **Cost guard** (`cost-guard.ts`) — daily budget + per-role budget + execution cap
- **Confidence router** (`confidence-router.ts`) — act/ask/escalate routing
- **Approval queue** (`approval-queue.ts`, `action-executor.ts`) — queued action lifecycle
- **Tool definitions** (`tools.ts`) — all tool schemas, handlers, JIT instructions, groups
- **Tool RAG** (`tool-rag.ts`) — keyword-based tool selection
- **Planner** (`planner.ts`) — Haiku plan generation + reactive stages
- **Context assembler** (`context-assembler.ts`) — 4-tier context assembly
- **Model router** (`model-router.ts`, `model-registry.ts`) — purpose-based model selection
- **Response guard** (`response-guard.ts`) — leak detection + scrubbing
- **Circuit breaker** (`circuit-breaker.ts`) — API failure protection
- **Dead letter queue** (`dlq.ts`) — post-mortem error analysis
- **Run logger** (`run-logger.ts`) — agent_runs metrics
- **Citation extractor** (`citation-extractor.ts`) — tool result citations
- **Action reflector** (`action-reflector.ts`) — context write-back
- **Autonomy levels** (`autonomy-levels.ts`) — L1-L4 auto-execution
- **SSE event types** (`AgentEvent`) — the frontend contract stays identical

The frontend (`chat-interface.tsx`) should require **zero changes**. The SSE event protocol is the API boundary.

---

## Task 1: Extract Reusable Concerns from engine.ts

Before rewriting the loop, extract the cross-cutting concerns that are currently inlined into engine.ts into standalone modules. This makes the new engine a pure loop that calls clean functions.

**Files:**
- Create: `personal-assistant/src/lib/agent/engine/pre-flight.ts`
- Create: `personal-assistant/src/lib/agent/engine/tool-executor.ts`
- Create: `personal-assistant/src/lib/agent/engine/types.ts`
- Modify: `personal-assistant/src/lib/agent/engine.ts` (will be replaced in Task 3)
- Test: `personal-assistant/tests/lib/agent/engine/pre-flight.test.ts`
- Test: `personal-assistant/tests/lib/agent/engine/tool-executor.test.ts`

### Step 1: Write failing tests for pre-flight checks

```typescript
// tests/lib/agent/engine/pre-flight.test.ts
import { describe, it, expect, vi } from 'vitest'
import type { EngineConfig } from '@/lib/agent/engine/types'

describe('preFlightChecks', () => {
  it('returns cost_blocked when daily limit exceeded', async () => {
    // Mock canProceed to return { allowed: false }
    vi.mock('@/lib/agent/cost-guard', () => ({
      canProceed: vi.fn().mockResolvedValue({ allowed: false, reason: 'Daily limit', spentToday: 10, dailyLimit: 10 }),
    }))
    const { preFlightChecks } = await import('@/lib/agent/engine/pre-flight')
    const result = await preFlightChecks({} as any)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('cost_blocked')
  })

  it('returns agents_disabled when org has agents_enabled=false', async () => {
    vi.mock('@/lib/agent/cost-guard', () => ({
      canProceed: vi.fn().mockResolvedValue({ allowed: true }),
    }))
    const { preFlightChecks } = await import('@/lib/agent/engine/pre-flight')
    // Mock supabase to return agents_enabled: false
    const result = await preFlightChecks({
      supabase: mockSupabase({ agents_enabled: false }),
      orgId: 'test',
    } as any)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('agents_disabled')
  })

  it('passes when budget ok and agents enabled', async () => {
    const { preFlightChecks } = await import('@/lib/agent/engine/pre-flight')
    const result = await preFlightChecks({
      supabase: mockSupabase({ agents_enabled: true }),
      orgId: 'test',
      skipCostGuard: false,
    } as any)
    expect(result.blocked).toBe(false)
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd personal-assistant && npx vitest run tests/lib/agent/engine/pre-flight.test.ts
```
Expected: FAIL — module not found

### Step 3: Create types.ts

```typescript
// src/lib/agent/engine/types.ts
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolGroup } from '../tools'
import type { PlanStage } from '../planner'

export interface EngineConfig {
  orgId: string
  supabase: SupabaseClient
  model?: string
  agentConfigId?: string
  skipCostGuard?: boolean
  agentType?: string
  orgSettings?: { confidence_thresholds?: { act?: number; ask?: number } }
  calibratedThresholds?: { act: number; ask: number; sampleSize: number } | null
  history?: Anthropic.MessageParam[]
  userId?: string
  threadId?: string
  userEmail?: string
  userDisplayName?: string
  contentBlocks?: Anthropic.ContentBlockParam[]
  /** Parent agent context for sub-agent spawning (not passed to sub-agents) */
  parentAgentId?: string
  /** Depth limit for sub-agent spawning (prevents infinite recursion) */
  maxDepth?: number
}

export type StageId = 'cost_check' | 'model_routing' | 'context_assembly' | 'api_streaming' | 'tool_execution'

export type AgentEvent =
  | { type: 'thinking'; data: string }
  | { type: 'thinking_start'; data: Record<string, never> }
  | { type: 'thinking_delta'; data: string }
  | { type: 'thinking_complete'; data: { duration_ms: number } }
  | { type: 'stage'; data: { stage: StageId; status: 'start' | 'done'; meta?: Record<string, unknown> } }
  | { type: 'plan'; data: { stages: PlanStage[] } }
  | { type: 'plan_stage_update'; data: { stageId: string; status: 'active' | 'done' | 'error' } }
  | { type: 'tool_call'; data: { name: string; input: unknown } }
  | { type: 'tool_result'; data: { name: string; result: unknown; success: boolean; queued?: boolean; approvalId?: string } }
  | { type: 'content_delta'; data: string }
  | { type: 'message'; data: string }
  | { type: 'error'; data: string }
  | { type: 'cost_blocked'; data: { spentToday: number; dailyLimit: number } }
  | { type: 'budget_blocked'; data: { role: string; dailyUsed: number; dailyLimit: number } }
  | { type: 'budget_warning'; data: { role: string; dailyUsed: number; dailyLimit: number; remainingTokens: number } }
  | { type: 'execution_cap_hit'; data: { role: string; tokensUsed: number; cap: number } }
  | { type: 'citation'; data: { citations: Array<{ index: number; url: string; title: string; description?: string }> } }
  | { type: 'checkpoint'; data: { message_index: number; label: string } }
  | { type: 'sub_agent_start'; data: { agentId: string; description: string } }
  | { type: 'sub_agent_complete'; data: { agentId: string; summary: string } }
  | { type: 'done'; data: unknown }
```

### Step 4: Implement pre-flight.ts

```typescript
// src/lib/agent/engine/pre-flight.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EngineConfig, AgentEvent } from './types'
import { canProceed } from '../cost-guard'
import { logAgentRun, estimateRunCost } from '../run-logger'
import { logger } from '@/lib/core/logger'

export interface PreFlightResult {
  blocked: boolean
  reason?: 'cost_blocked' | 'agents_disabled'
  events: AgentEvent[]
  calibratedThresholds?: EngineConfig['calibratedThresholds']
}

export async function preFlightChecks(config: EngineConfig): Promise<PreFlightResult> {
  const events: AgentEvent[] = []

  // 1. Cost guard
  if (!config.skipCostGuard) {
    events.push({ type: 'stage', data: { stage: 'cost_check', status: 'start' } })
    try {
      const budget = await canProceed(config.supabase, config.orgId)
      if (!budget.allowed) {
        events.push({ type: 'cost_blocked', data: { spentToday: budget.spentToday, dailyLimit: budget.dailyLimit } })
        events.push({ type: 'error', data: budget.reason || 'Daily cost limit reached' })
        return { blocked: true, reason: 'cost_blocked', events }
      }
    } catch {
      logger.warn('[engine] Cost guard check failed, proceeding anyway')
    }
    events.push({ type: 'stage', data: { stage: 'cost_check', status: 'done', meta: { allowed: true } } })
  }

  // 2. Agent kill switch
  const { data: orgRow } = await config.supabase
    .from('organizations')
    .select('agents_enabled')
    .eq('id', config.orgId)
    .single()

  if (orgRow && orgRow.agents_enabled === false) {
    events.push({ type: 'error', data: 'Agent execution is disabled for this organization.' })
    return { blocked: true, reason: 'agents_disabled', events }
  }

  // 3. Load calibrated thresholds if needed
  let calibratedThresholds = config.calibratedThresholds
  if (!calibratedThresholds && config.agentConfigId) {
    try {
      const { data: agentCfg } = await config.supabase
        .from('agent_configs')
        .select('calibrated_thresholds')
        .eq('id', config.agentConfigId)
        .single()
      if (agentCfg?.calibrated_thresholds) {
        const ct = agentCfg.calibrated_thresholds as { act: number; ask: number; sampleSize: number }
        if (ct.sampleSize >= 50) calibratedThresholds = ct
      }
    } catch { /* non-critical */ }
  }

  return { blocked: false, events, calibratedThresholds }
}
```

### Step 5: Implement tool-executor.ts

Extract the parallel tool execution + budget check + event emission logic from engine.ts lines 762-1003 into a standalone function.

```typescript
// src/lib/agent/engine/tool-executor.ts
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentEvent, EngineConfig } from './types'
import { executeAgentTool, getJITInstruction, type ExecuteToolOptions, type ToolResult } from '../tools'
import { checkRoleBudget, getExecutionTokenCap } from '../cost-guard'
import { reflectAction } from '@/lib/context/action-reflector'
import { extractCitationsFromToolResult, extractRAGCitations } from '../citation-extractor'
import { logger } from '@/lib/core/logger'

const TOOL_ROLE_MAP: Record<string, string> = {
  generate_ad_scripts: 'ads', list_ad_batches: 'ads', adapt_script: 'ads',
  audit_visibility: 'seo', generate_seo_content: 'seo', generate_schema_markup: 'seo', visibility_report: 'seo',
  schedule_post: 'content', generate_blog: 'content', content_calendar: 'content',
  search_tenders: 'tenders', score_tender: 'tenders', generate_tender_response: 'tenders',
}

const MAX_TOOL_RESULT_CHARS = 12000

export interface ToolExecutionResult {
  toolResults: Anthropic.ToolResultBlockParam[]
  events: AgentEvent[]
  executionTokensDelta: number
  activeRole?: string
  executionCapHit: boolean
}

export async function executeToolBatch(
  toolBlocks: Anthropic.ToolUseBlock[],
  config: EngineConfig,
  execOptions: ExecuteToolOptions | undefined,
  executionTokens: number,
  activeRole: string | undefined,
): Promise<ToolExecutionResult> {
  const events: AgentEvent[] = []
  let currentRole = activeRole
  let capHit = false

  // Pre-emit tool_call events
  for (const tool of toolBlocks) {
    events.push({ type: 'tool_call', data: { name: tool.name, input: tool.input } })
  }

  // Budget checks
  const budgetOverrides = new Map<string, { blocked: boolean; role: string; reason: string }>()
  for (const tool of toolBlocks) {
    const role = TOOL_ROLE_MAP[tool.name]
    if (!role || config.skipCostGuard) continue
    if (!currentRole) currentRole = role

    const budget = await checkRoleBudget(config.supabase, config.orgId, role)
    if (!budget.allowed) {
      budgetOverrides.set(tool.id, { blocked: true, role, reason: budget.reason || `Budget exhausted for ${role}` })
      events.push({ type: 'budget_blocked', data: { role, dailyUsed: budget.dailyUsed, dailyLimit: budget.dailyLimit } })
    } else if (budget.warning) {
      events.push({ type: 'budget_warning', data: { role, dailyUsed: budget.dailyUsed, dailyLimit: budget.dailyLimit, remainingTokens: budget.remainingTokens } })
    }
  }

  // Execution cap check
  if (currentRole && !config.skipCostGuard) {
    const cap = getExecutionTokenCap(currentRole)
    if (cap && executionTokens > cap) {
      events.push({ type: 'execution_cap_hit', data: { role: currentRole, tokensUsed: executionTokens, cap } })
      capHit = true
    }
  }

  // Parallel execution
  const executions = await Promise.allSettled(
    toolBlocks.map(tool => {
      const override = budgetOverrides.get(tool.id)
      if (override?.blocked) {
        return Promise.resolve({ success: false, error: override.reason } as ToolResult)
      }
      if (capHit) {
        return Promise.resolve({ success: false, error: `Per-execution token cap reached for ${currentRole}.` } as ToolResult)
      }
      return executeAgentTool(tool.name, tool.input as Record<string, unknown>, config.orgId, config.supabase, execOptions)
    })
  )

  // Process results
  const toolResults: Anthropic.ToolResultBlockParam[] = []
  for (let t = 0; t < toolBlocks.length; t++) {
    const tool = toolBlocks[t]
    const execution = executions[t]

    if (execution.status === 'rejected') {
      const errorMsg = execution.reason instanceof Error ? execution.reason.message : String(execution.reason)
      events.push({ type: 'tool_result', data: { name: tool.name, result: null, success: false } })
      toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: `Tool execution failed: ${errorMsg}`, is_error: true })
      continue
    }

    const result = execution.value

    // Citations
    try {
      const citations = extractCitationsFromToolResult(tool.name, result.data)
      if (citations?.length) events.push({ type: 'citation', data: { citations } })
      else if (tool.name === 'search_memory') {
        const ragCitations = extractRAGCitations(tool.name, result.data)
        if (ragCitations.length) events.push({ type: 'citation', data: { citations: ragCitations } })
      }
    } catch { /* non-critical */ }

    events.push({
      type: 'tool_result',
      data: { name: tool.name, result: result.data, success: result.success, queued: result.queued, approvalId: result.approvalId },
    })

    // Action reflection (fire-and-forget)
    if (result.success && !result.queued) {
      reflectAction(config.supabase, config.orgId, tool.name, tool.input as Record<string, unknown>, result.data)
        .catch(err => logger.error('[engine] action reflect failed', { err, tool: tool.name }))
    }

    // Build tool_result block
    let content: string
    if (result.queued) {
      content = `Action queued for approval (ID: ${result.approvalId}).`
    } else if (result.success) {
      let data = JSON.stringify(result.data)
      if (data.length > MAX_TOOL_RESULT_CHARS) {
        data = data.slice(0, MAX_TOOL_RESULT_CHARS) + `\n\n[Truncated — ${(data.length - MAX_TOOL_RESULT_CHARS).toLocaleString()} chars omitted]`
      }
      const jit = getJITInstruction(tool.name)
      content = jit ? `${data}\n\n---\n${jit}` : data
    } else {
      content = `Error: ${result.error}`
    }

    toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content, is_error: !result.success && !result.queued })
  }

  return { toolResults, events, executionTokensDelta: 0, activeRole: currentRole, executionCapHit: capHit }
}
```

### Step 6: Run tests

```bash
cd personal-assistant && npx vitest run tests/lib/agent/engine/
```
Expected: PASS

### Step 7: Commit

```bash
git add personal-assistant/src/lib/agent/engine/ personal-assistant/tests/lib/agent/engine/
git commit -m "refactor: extract pre-flight and tool-executor from engine.ts"
```

---

## Task 2: Implement spawn_agent Tool

The model-callable tool that creates isolated sub-agent conversations. Each sub-agent gets its own TAOR loop, its own context window, and returns a summary to the parent.

**Files:**
- Create: `personal-assistant/src/lib/agent/tools/spawn-agent.ts`
- Modify: `personal-assistant/src/lib/agent/tools.ts` (register the new tool)
- Test: `personal-assistant/tests/lib/agent/tools/spawn-agent.test.ts`

### Step 1: Write failing test

```typescript
// tests/lib/agent/tools/spawn-agent.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('spawn_agent tool', () => {
  it('rejects when depth limit exceeded', async () => {
    const { handleSpawnAgent } = await import('@/lib/agent/tools/spawn-agent')
    const result = await handleSpawnAgent(
      { task: 'test', description: 'test' },
      'org-1',
      {} as any, // supabase
      { currentDepth: 3, maxDepth: 3 }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('depth limit')
  })

  it('returns summary from sub-agent execution', async () => {
    // Mock the engine to return a simple message
    vi.mock('@/lib/agent/engine/taor-loop', () => ({
      runTAORLoop: vi.fn(async function* () {
        yield { type: 'message', data: 'Sub-agent completed the task.' }
        yield { type: 'done', data: {} }
      }),
    }))

    const { handleSpawnAgent } = await import('@/lib/agent/tools/spawn-agent')
    const result = await handleSpawnAgent(
      { task: 'Fix the photos on Steve\'s page', description: 'Photo fix' },
      'org-1',
      {} as any,
      { currentDepth: 0, maxDepth: 3 }
    )
    expect(result.success).toBe(true)
    expect(result.data).toContain('Sub-agent completed')
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd personal-assistant && npx vitest run tests/lib/agent/tools/spawn-agent.test.ts
```
Expected: FAIL — module not found

### Step 3: Implement spawn-agent.ts

```typescript
// src/lib/agent/tools/spawn-agent.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolResult } from '../tools'
import { logger } from '@/lib/core/logger'

export const spawnAgentToolDefinition = {
  name: 'spawn_agent',
  description: `Spawn an isolated sub-agent to handle a complex sub-task with its own context window. Use this when the current task has multiple independent parts that would benefit from focused execution. Each sub-agent runs a complete TAOR loop with full tool access and returns a summary.

When to use:
- The user's request has 3+ distinct action chains (e.g., "sort out everything with Steve")
- A sub-task requires deep research that would consume too much context
- Parallel execution would speed up the overall task

When NOT to use:
- Simple single-tool operations (just call the tool directly)
- Tasks that require sequential context from earlier in this conversation
- Trivial lookups or quick answers

Sub-agents start with a fresh context (system prompt + their task). They do NOT inherit this conversation's history. Write the task description with enough context for the sub-agent to work independently.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      task: {
        type: 'string',
        description: 'Detailed task description with all context the sub-agent needs. Include entity names, IDs, and specific instructions. The sub-agent has no access to this conversation\'s history.',
      },
      description: {
        type: 'string',
        description: 'Short 3-5 word label for UI display (e.g., "Fix Steve photos", "Generate invoice")',
      },
      tool_groups: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: restrict sub-agent to specific tool groups (core, memory, channel, web, comms, agentic). Defaults to all.',
      },
    },
    required: ['task', 'description'],
  },
}

interface SpawnContext {
  currentDepth: number
  maxDepth: number
  parentAgentId?: string
  engineConfig?: Record<string, unknown>
}

export async function handleSpawnAgent(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
  spawnContext: SpawnContext,
): Promise<ToolResult> {
  const task = input.task as string
  const description = input.description as string
  const toolGroups = input.tool_groups as string[] | undefined

  // Depth guard: prevent infinite sub-agent recursion
  if (spawnContext.currentDepth >= spawnContext.maxDepth) {
    return {
      success: false,
      error: `Sub-agent depth limit reached (${spawnContext.maxDepth}). Handle this task directly instead of spawning another sub-agent.`,
    }
  }

  const agentId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  logger.info('[spawn-agent] Spawning sub-agent', {
    agentId,
    description,
    depth: spawnContext.currentDepth + 1,
    parentId: spawnContext.parentAgentId,
  })

  try {
    // Dynamic import to avoid circular dependency
    const { runTAORLoop } = await import('../engine/taor-loop')

    // Collect the final message from the sub-agent
    let finalMessage = ''
    let totalTokens = { input: 0, output: 0 }

    const subAgentConfig = {
      orgId,
      supabase,
      agentConfigId: spawnContext.engineConfig?.agentConfigId as string | undefined,
      skipCostGuard: false,
      parentAgentId: agentId,
      maxDepth: spawnContext.maxDepth,
      currentDepth: spawnContext.currentDepth + 1,
      toolGroups,
    }

    for await (const event of runTAORLoop(task, subAgentConfig)) {
      if (event.type === 'message') {
        finalMessage = event.data as string
      }
      if (event.type === 'done' && event.data && typeof event.data === 'object') {
        const tokens = (event.data as Record<string, unknown>).tokens
        if (tokens && typeof tokens === 'object') {
          totalTokens = tokens as { input: number; output: number }
        }
      }
      // Sub-agent events are NOT forwarded to the parent's SSE stream.
      // The parent only sees the summary result.
    }

    if (!finalMessage) {
      return { success: false, error: 'Sub-agent completed without producing a response.' }
    }

    logger.info('[spawn-agent] Sub-agent complete', {
      agentId,
      description,
      messageLength: finalMessage.length,
      tokens: totalTokens,
    })

    return {
      success: true,
      data: finalMessage,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[spawn-agent] Sub-agent failed', { agentId, error: errorMsg })
    return { success: false, error: `Sub-agent "${description}" failed: ${errorMsg}` }
  }
}
```

### Step 4: Register in tools.ts

Add to tool definitions array and handler map in `tools.ts`:

```typescript
// In toolDefinitions array (after approve_action):
import { spawnAgentToolDefinition } from './tools/spawn-agent'
// ... add spawnAgentToolDefinition to the array

// In allHandlers:
import { handleSpawnAgent } from './tools/spawn-agent'
// Add spawn_agent handler that passes spawn context through
```

The handler in allHandlers needs special treatment because it receives spawn context from the engine, not just (input, orgId, supabase). The engine will call `handleSpawnAgent` directly for this tool instead of going through the generic handler path. Add this routing to `executeAgentTool`:

```typescript
// In executeAgentTool, before the generic handler call:
if (name === 'spawn_agent') {
  return handleSpawnAgent(input, orgId, supabase, {
    currentDepth: options?.spawnDepth ?? 0,
    maxDepth: options?.maxSpawnDepth ?? 3,
    parentAgentId: options?.parentAgentId,
    engineConfig: options as Record<string, unknown>,
  })
}
```

Add to `ExecuteToolOptions`:
```typescript
spawnDepth?: number
maxSpawnDepth?: number
parentAgentId?: string
```

Also add `spawn_agent` to `TOOL_GROUPS.agentic.tools` and `TOOL_LABEL_MAP` in planner.ts:
```typescript
spawn_agent: { label: 'Working on sub-task', sublabel: 'DELEGATING', icon: '🔀' },
```

### Step 5: Run tests

```bash
cd personal-assistant && npx vitest run tests/lib/agent/tools/spawn-agent.test.ts
```
Expected: PASS

### Step 6: Commit

```bash
git add personal-assistant/src/lib/agent/tools/spawn-agent.ts personal-assistant/src/lib/agent/tools.ts personal-assistant/tests/lib/agent/tools/
git commit -m "feat: add spawn_agent tool for isolated sub-agent decomposition"
```

---

## Task 3: Rewrite the TAOR Loop

The core engine rewrite. Replace the 1,100-line `engine.ts` with a clean TAOR loop that uses Anthropic's compaction API instead of observation masking and iteration caps.

**Files:**
- Create: `personal-assistant/src/lib/agent/engine/taor-loop.ts`
- Modify: `personal-assistant/src/lib/agent/engine.ts` (re-export from new module)
- Test: `personal-assistant/tests/lib/agent/engine/taor-loop.test.ts`

### Step 1: Write failing test

```typescript
// tests/lib/agent/engine/taor-loop.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('runTAORLoop', () => {
  it('yields message event for simple text response', async () => {
    // Mock Anthropic client to return a text-only response
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          stream: vi.fn().mockReturnValue({
            [Symbol.asyncIterator]: async function* () {
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }
            },
            finalMessage: () => Promise.resolve({
              content: [{ type: 'text', text: 'Hello' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 100, output_tokens: 10 },
            }),
          }),
        },
      })),
    }))

    const { runTAORLoop } = await import('@/lib/agent/engine/taor-loop')
    const events: any[] = []
    for await (const event of runTAORLoop('hi', { orgId: 'test', supabase: {} as any, skipCostGuard: true })) {
      events.push(event)
    }
    const messageEvent = events.find(e => e.type === 'message')
    expect(messageEvent).toBeDefined()
    expect(messageEvent.data).toBe('Hello')
  })

  it('handles compaction stop_reason by continuing the loop', async () => {
    // Test that when stop_reason is 'compaction', the loop continues
    // rather than terminating
    // ... (mock compaction response then normal response)
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd personal-assistant && npx vitest run tests/lib/agent/engine/taor-loop.test.ts
```
Expected: FAIL

### Step 3: Implement taor-loop.ts

This is the core rewrite. The loop is intentionally simple. All intelligence is in the model.

```typescript
// src/lib/agent/engine/taor-loop.ts
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentEvent, EngineConfig } from './types'
import { preFlightChecks } from './pre-flight'
import { executeToolBatch } from './tool-executor'
import { getAgentTools, type ExecuteToolOptions, type ToolGroup } from '../tools'
import { selectRelevantTools } from '../tool-rag'
import { buildEntityAwarePrompt } from '../prompt-builder'
import { ContextAssembler } from '@/lib/context-assembly/context-assembler'
import { selectModel } from '../model-router'
import { resolveModel, resolveTokenLimit, type ModelPurpose } from '../model-registry'
import { logAgentRun, estimateRunCost } from '../run-logger'
import { withCircuitBreaker, CircuitOpenError } from '../circuit-breaker'
import { writeToDeadLetterQueue } from '../dlq'
import { detectLeak, scrubLeaks } from '../response-guard'
import { generatePlan, isTrivialMessage, stageFromToolName, type PlanStage } from '../planner'
import { logger } from '@/lib/core/logger'

const MAX_SAFETY_ITERATIONS = 50 // Hard ceiling to prevent runaway loops (compaction handles the rest)

export async function* runTAORLoop(
  message: string,
  config: EngineConfig & { toolGroups?: string[]; currentDepth?: number },
): AsyncGenerator<AgentEvent> {
  const startTime = Date.now()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterationCount = 0
  let toolCallCount = 0
  let executionTokens = 0
  let activeRole: string | undefined
  let finalMessage = ''

  // ── Pre-flight ──
  const preflight = await preFlightChecks(config)
  for (const event of preflight.events) yield event
  if (preflight.blocked) {
    yield { type: 'done', data: {} }
    return
  }
  if (preflight.calibratedThresholds) {
    config.calibratedThresholds = preflight.calibratedThresholds
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── Model routing ──
  yield { type: 'stage', data: { stage: 'model_routing', status: 'start' } }
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const model = config.model || selection?.model || resolveModel('conversation')
  const purpose: ModelPurpose = selection?.purpose || 'conversation'
  const maxTokens = selection ? resolveTokenLimit(selection.purpose) : resolveTokenLimit('conversation')
  yield { type: 'stage', data: { stage: 'model_routing', status: 'done' } }

  yield { type: 'thinking_start', data: {} }

  // ── Context assembly ──
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'start' } }
  const userProfile = (config.userEmail || config.userDisplayName)
    ? { email: config.userEmail, displayName: config.userDisplayName }
    : undefined

  let systemPrompt: string
  if (config.threadId && config.userId) {
    try {
      const assembler = new ContextAssembler({ userProfile })
      const ctx = await assembler.assemble(config.supabase, config.userId, config.orgId, config.threadId, message)
      systemPrompt = ctx.systemPrompt
      config.history = ctx.messageHistory
    } catch {
      systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message, userProfile)
    }
  } else {
    systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message, userProfile)
  }
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'done' } }

  // ── Tool selection ──
  let tools = config.toolGroups
    ? getAgentTools(config.toolGroups as ToolGroup[])
    : getAgentTools()

  // Haiku planning (non-blocking, parallel)
  let planStages: PlanStage[] = []
  const activatedStages = new Set<string>()
  if (!isTrivialMessage(message)) {
    const toolNames = tools.map(t => t.name)
    try {
      const plan = await Promise.race([
        generatePlan(message, '', toolNames),
        new Promise<null>(r => setTimeout(() => r(null), 1500)),
      ])
      if (plan && plan.stages.length > 0) {
        planStages = plan.stages
        yield { type: 'plan', data: { stages: planStages } }
        if (plan.toolGroups.length > 0) {
          tools = getAgentTools(plan.toolGroups as ToolGroup[])
        }
      }
    } catch { /* planner failure is non-critical */ }
  }

  // Tool RAG
  const toolRagResult = selectRelevantTools(message, tools, 10)
  if (toolRagResult.excluded.length > 0) tools = toolRagResult.tools

  // ── Build system prompt with tier modifiers ──
  const { getTierModifier } = await import('../tier-prompts')
  let fullSystemPrompt = systemPrompt + getTierModifier(purpose)
  if (planStages.length > 0) {
    const planDescription = planStages.map((s, i) => `${i + 1}. ${s.icon} ${s.label}`).join('\n')
    fullSystemPrompt += `\n\n## Execution Plan\n${planDescription}\n`
  }
  if (toolRagResult.toolSummary) {
    fullSystemPrompt += `\n\n## Available Tools Note\n${toolRagResult.toolSummary}\n`
  }

  // ── Build initial messages ──
  const userMessageContent: string | Anthropic.ContentBlockParam[] = config.contentBlocks?.length
    ? [{ type: 'text' as const, text: message }, ...config.contentBlocks]
    : message

  let messages: Anthropic.MessageParam[]
  if (config.threadId && config.history) {
    messages = [...config.history]
    if (config.contentBlocks?.length && messages.length > 0) {
      const lastIdx = messages.length - 1
      if (messages[lastIdx].role === 'user') {
        messages[lastIdx] = { role: 'user', content: userMessageContent }
      }
    }
  } else {
    messages = [...(config.history || []), { role: 'user', content: userMessageContent }]
  }

  // ── Execution options ──
  const execOptions: ExecuteToolOptions | undefined = config.agentConfigId
    ? {
        agentConfigId: config.agentConfigId,
        orgSettings: config.orgSettings,
        agentType: config.agentType,
        calibratedThresholds: config.calibratedThresholds,
        spawnDepth: config.currentDepth ?? 0,
        maxSpawnDepth: config.maxDepth ?? 3,
        parentAgentId: config.parentAgentId,
      }
    : undefined

  // ══════════════════════════════════════════════════════════════════════
  // THE TAOR LOOP — Think, Act, Observe, Repeat
  // ══════════════════════════════════════════════════════════════════════

  for (let i = 0; i < MAX_SAFETY_ITERATIONS; i++) {
    iterationCount++

    let response: Anthropic.Message
    const streamedDeltas: string[] = []
    const streamedThinkingDeltas: string[] = []
    let thinkingStartTime: number | null = null

    try {
      yield { type: 'stage', data: { stage: 'api_streaming', status: 'start', meta: { iteration: iterationCount } } }

      response = await withCircuitBreaker(
        `anthropic:${config.agentType || 'default'}`,
        async () => {
          const streamConfig: Record<string, unknown> = {
            model,
            max_tokens: maxTokens,
            system: fullSystemPrompt,
            tools,
            messages,
            // Server-side compaction: replaces observation masking + iteration caps
            betas: ['interleaved-thinking-2025-05-14'],
          }

          if (purpose === 'synthesis') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 8192 }
          }

          const stream = client.messages.stream(streamConfig as any)

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              streamedDeltas.push(event.delta.text)
            } else if (event.type === 'content_block_delta' && (event.delta as any).type === 'thinking_delta') {
              const td = (event.delta as any).thinking
              if (td) streamedThinkingDeltas.push(td)
            } else if (event.type === 'content_block_start' && (event.content_block as any).type === 'thinking') {
              thinkingStartTime = Date.now()
            }
          }

          return stream.finalMessage()
        },
        { threshold: 5, cooldownMs: 60_000 },
      )

      // Yield thinking deltas
      for (const delta of streamedThinkingDeltas) yield { type: 'thinking_delta', data: delta }
      if (thinkingStartTime && streamedThinkingDeltas.length > 0) {
        yield { type: 'thinking_complete', data: { duration_ms: Date.now() - thinkingStartTime } }
      }

      // Yield text deltas (scrubbed)
      for (const delta of streamedDeltas) {
        yield { type: 'content_delta', data: scrubLeaks(delta) }
        if (detectLeak(delta).leaked) logger.warn('response_leak_detected')
      }

      yield { type: 'stage', data: { stage: 'api_streaming', status: 'done', meta: { tokens: response.usage } } }

    } catch (err) {
      if (err instanceof CircuitOpenError) {
        yield { type: 'error', data: `Service temporarily unavailable. Please retry shortly.` }
        yield { type: 'done', data: {} }
        return
      }
      const errorMsg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', data: `API error: ${errorMsg}` }
      await writeToDeadLetterQueue(config.supabase, {
        orgId: config.orgId, agentType: config.agentType || 'unknown',
        agentConfigId: config.agentConfigId, errorMessage: errorMsg,
        payload: { message, model, iteration: iterationCount },
      })
      yield { type: 'done', data: {} }
      return
    }

    // Track tokens
    totalInputTokens += response.usage?.input_tokens || 0
    totalOutputTokens += response.usage?.output_tokens || 0
    executionTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)

    // ── COMPACTION: if the API compacted, inject fresh context and continue ──
    // (When using the compaction beta, stop_reason may be 'compaction')
    if ((response as any).stop_reason === 'compaction') {
      // The API has summarized the conversation. The compaction block is
      // already in the response content. We just continue the loop.
      messages = [
        { role: 'assistant', content: response.content },
        { role: 'user', content: '[Context refreshed after compaction. Continue with the task.]' },
      ]
      logger.info('[taor] Compaction triggered', { iteration: iterationCount, tokens: response.usage })
      continue
    }

    // ── DONE: no tool calls — final response ──
    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
      finalMessage = scrubLeaks(text)

      // Close out plan stages
      for (const stage of planStages) {
        if (!activatedStages.has(stage.id)) {
          yield { type: 'plan_stage_update', data: { stageId: stage.id, status: 'done' } }
        }
      }

      yield { type: 'message', data: finalMessage }

      if (config.agentConfigId) {
        await logAgentRun(config.supabase, {
          org_id: config.orgId, agent_config_id: config.agentConfigId,
          trigger_type: 'chat', trigger_payload: { message },
          status: 'success', result_summary: text.slice(0, 500),
          tokens_in: totalInputTokens, tokens_out: totalOutputTokens,
          cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, purpose),
          duration_ms: Date.now() - startTime, tool_calls: toolCallCount, iterations: iterationCount,
        })
      }

      yield { type: 'done', data: { tokens: response.usage } }
      return
    }

    // ── TOOL USE: execute tools, feed results back ──
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    toolCallCount += toolBlocks.length

    // Activate plan stages
    for (const tool of toolBlocks) {
      const matched = planStages.find(s => s.toolHint === tool.name && !activatedStages.has(s.id))
      if (matched) {
        yield { type: 'plan_stage_update', data: { stageId: matched.id, status: 'active' } }
        activatedStages.add(matched.id)
      } else if (planStages.length === 0) {
        const reactive = stageFromToolName(tool.name)
        if (reactive) {
          planStages.push(reactive)
          yield { type: 'plan', data: { stages: planStages } }
          yield { type: 'plan_stage_update', data: { stageId: reactive.id, status: 'active' } }
          activatedStages.add(reactive.id)
        }
      }
    }

    // Execute tools in parallel
    const toolResult = await executeToolBatch(toolBlocks, config, execOptions, executionTokens, activeRole)
    for (const event of toolResult.events) yield event
    activeRole = toolResult.activeRole

    // Mark plan stages done
    for (const tool of toolBlocks) {
      const matched = planStages.find(s => s.toolHint === tool.name && activatedStages.has(s.id))
      if (matched) yield { type: 'plan_stage_update', data: { stageId: matched.id, status: 'done' } }
    }

    // Append to conversation
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResult.toolResults },
    ]

    // If execution cap hit, inject convergence nudge
    if (toolResult.executionCapHit) {
      messages.push({
        role: 'user',
        content: '[SYSTEM: Token budget reached. Provide your best answer with current information.]',
      })
    }
  }

  // Safety ceiling reached (should never happen with compaction)
  logger.error('[taor] Safety iteration ceiling reached', { iterations: MAX_SAFETY_ITERATIONS })
  yield { type: 'message', data: 'Reached maximum processing limit. Here is what was gathered so far.' }
  yield { type: 'done', data: {} }
}
```

### Step 4: Create engine/index.ts re-export

```typescript
// src/lib/agent/engine/index.ts
export { runTAORLoop as runAgentChat } from './taor-loop'
export type { EngineConfig, AgentEvent, StageId } from './types'
```

### Step 5: Update engine.ts to re-export from new module

Keep `engine.ts` as a thin re-export layer for backwards compatibility:

```typescript
// src/lib/agent/engine.ts
// Legacy re-exports — all callers should migrate to @/lib/agent/engine/
export { runTAORLoop as runAgentChat } from './engine/taor-loop'
export type { EngineConfig, AgentEvent, StageId } from './engine/types'

// Keep maskOldObservations export for any remaining references during migration
export { maskOldObservations } from './engine/legacy-compat'
```

Create `engine/legacy-compat.ts` with just the `maskOldObservations` function (copied from old engine.ts) for any code that still references it.

### Step 6: Run tests

```bash
cd personal-assistant && npx vitest run tests/lib/agent/engine/
```
Expected: PASS

### Step 7: Verify SSE event compatibility

Check that the chat route still works with the new engine:

```bash
cd personal-assistant && npx tsc --noEmit 2>&1 | grep -i engine | head -20
```

### Step 8: Commit

```bash
git add personal-assistant/src/lib/agent/engine/
git commit -m "feat: TAOR loop engine rewrite — clean harness, compaction API, sub-agent spawning"
```

---

## Task 4: Deferred Tool Loading

With 40+ tools, loading all schemas upfront wastes ~6,000-12,000 context tokens. Implement on-demand tool schema loading similar to Claude Code's ToolSearch pattern.

**Files:**
- Create: `personal-assistant/src/lib/agent/tools/deferred-loader.ts`
- Modify: `personal-assistant/src/lib/agent/tools.ts` (add deferred mode)
- Test: `personal-assistant/tests/lib/agent/tools/deferred-loader.test.ts`

### Step 1: Write failing test

```typescript
// tests/lib/agent/tools/deferred-loader.test.ts
import { describe, it, expect } from 'vitest'

describe('DeferredToolLoader', () => {
  it('returns core tools immediately and deferred tool names for the rest', () => {
    const { getEagerTools, getDeferredToolNames } = require('@/lib/agent/tools/deferred-loader')
    const eager = getEagerTools()
    const deferred = getDeferredToolNames()

    // Core tools should always be eager
    expect(eager.some(t => t.name === 'create_task')).toBe(true)
    expect(eager.some(t => t.name === 'search_memory')).toBe(true)

    // Growth tools should be deferred
    expect(deferred).toContain('generate_ad_scripts')
    expect(deferred).toContain('search_tenders')
  })

  it('resolves deferred tool by name', () => {
    const { resolveToolSchema } = require('@/lib/agent/tools/deferred-loader')
    const schema = resolveToolSchema('generate_ad_scripts')
    expect(schema).toBeDefined()
    expect(schema.name).toBe('generate_ad_scripts')
    expect(schema.input_schema).toBeDefined()
  })

  it('resolves multiple tools by keyword search', () => {
    const { searchToolSchemas } = require('@/lib/agent/tools/deferred-loader')
    const results = searchToolSchemas('email send', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(t => t.name.includes('send') || t.name.includes('email'))).toBe(true)
  })
})
```

### Step 2: Implement deferred-loader.ts

```typescript
// src/lib/agent/tools/deferred-loader.ts
import type Anthropic from '@anthropic-ai/sdk'
import { getAgentTools, TOOL_GROUP_MAP, type ToolGroup } from '../tools'

// Tool groups that are always loaded eagerly (essential for every conversation)
const EAGER_GROUPS: Set<ToolGroup> = new Set(['core', 'memory', 'channel'])

// Additional tool names that are always eager regardless of group
const EAGER_TOOL_NAMES: Set<string> = new Set([
  'web_search', 'fetch_url', 'browse_website', // web tools used frequently
  'execute_code', // agentic sandbox
  'approve_action', // approvals
  'spawn_agent', // sub-agent spawning
])

let allToolsCache: Anthropic.Tool[] | null = null

function getAllTools(): Anthropic.Tool[] {
  if (!allToolsCache) allToolsCache = getAgentTools()
  return allToolsCache
}

/** Get tools that should always be loaded (core + memory + channel + high-frequency) */
export function getEagerTools(): Anthropic.Tool[] {
  return getAllTools().filter(t => {
    const group = TOOL_GROUP_MAP[t.name]
    return EAGER_GROUPS.has(group) || EAGER_TOOL_NAMES.has(t.name)
  })
}

/** Get names of tools available for on-demand loading */
export function getDeferredToolNames(): string[] {
  return getAllTools()
    .filter(t => {
      const group = TOOL_GROUP_MAP[t.name]
      return !EAGER_GROUPS.has(group) && !EAGER_TOOL_NAMES.has(t.name)
    })
    .map(t => t.name)
}

/** Resolve a single deferred tool schema by exact name */
export function resolveToolSchema(name: string): Anthropic.Tool | undefined {
  return getAllTools().find(t => t.name === name)
}

/** Search deferred tools by keyword, return top N matches */
export function searchToolSchemas(query: string, maxResults: number = 3): Anthropic.Tool[] {
  const words = query.toLowerCase().split(/\s+/)
  const deferred = getAllTools().filter(t => !getEagerTools().includes(t))

  const scored = deferred.map(t => {
    const text = `${t.name} ${t.description || ''}`.toLowerCase()
    const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0)
    return { tool: t, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.tool)
}

/**
 * Build a system prompt section listing deferred tools by name only.
 * This costs ~100 tokens instead of ~6,000 for full schemas.
 */
export function buildDeferredToolsPrompt(): string {
  const names = getDeferredToolNames()
  if (names.length === 0) return ''

  return `\n\n## Additional Tools Available On-Demand
The following tools are available but not loaded. If you need one, call the resolve_tool tool with the name to load its schema:
${names.join(', ')}
`
}
```

### Step 3: Add resolve_tool as a lightweight meta-tool

```typescript
// In tools.ts, add a resolve_tool definition:
{
  name: 'resolve_tool',
  description: 'Load the full schema for a deferred tool so you can call it. Use when you need a tool listed in "Additional Tools Available On-Demand".',
  input_schema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string', description: 'Exact name of the tool to load' },
    },
    required: ['tool_name'],
  },
}
```

The handler resolves the schema and injects it into the conversation context. The TAOR loop handles this by dynamically adding the resolved tool to the tools array for the next iteration.

### Step 4: Run tests

```bash
cd personal-assistant && npx vitest run tests/lib/agent/tools/deferred-loader.test.ts
```

### Step 5: Commit

```bash
git add personal-assistant/src/lib/agent/tools/deferred-loader.ts personal-assistant/tests/lib/agent/tools/
git commit -m "feat: deferred tool loading — eager core + on-demand growth tools"
```

---

## Task 5: Integration Testing & Migration

Wire everything together, update the chat API route, and verify end-to-end.

**Files:**
- Modify: `personal-assistant/src/app/api/agent/chat/route.ts` (import path)
- Modify: `personal-assistant/src/lib/conversation/unified-pipeline.ts` (import path)
- Create: `personal-assistant/tests/integration/taor-engine.test.ts`
- Remove: old observation masking code from engine.ts after migration verified

### Step 1: Update import paths

Find all imports of `runAgentChat` and `EngineConfig` from `@/lib/agent/engine` and verify they resolve correctly via the re-export:

```bash
cd personal-assistant && grep -r "from.*agent/engine" src/ --include="*.ts" | grep -v node_modules
```

Update any direct imports to use the new path if needed, though the re-export in `engine.ts` should handle backwards compatibility.

### Step 2: Write integration test

```typescript
// tests/integration/taor-engine.test.ts
import { describe, it, expect } from 'vitest'

describe('TAOR Engine Integration', () => {
  it('exports AgentEvent types matching frontend expectations', async () => {
    const { runAgentChat } = await import('@/lib/agent/engine')
    expect(typeof runAgentChat).toBe('function')
  })

  it('SSE event types are backwards compatible', () => {
    // Verify all event types used by chat-interface.tsx exist in the new types
    const expectedTypes = [
      'thinking', 'thinking_start', 'thinking_delta', 'thinking_complete',
      'stage', 'plan', 'plan_stage_update',
      'tool_call', 'tool_result',
      'content_delta', 'message', 'error',
      'cost_blocked', 'budget_blocked', 'budget_warning', 'execution_cap_hit',
      'citation', 'checkpoint', 'done',
    ]
    // Type-level check — if the union type doesn't include these, TypeScript will error
  })
})
```

### Step 3: Run full test suite

```bash
cd personal-assistant && npx vitest run
```

### Step 4: Manual smoke test

```bash
cd personal-assistant && npm run dev
# Open browser, send a message, verify:
# 1. Thinking animation works
# 2. Tool calls stream correctly
# 3. Chain of thought displays
# 4. Final message renders
# 5. No console errors
```

### Step 5: Remove legacy observation masking code

Once verified, delete `maskOldObservations`, `inferResultType`, `buildToolIdMap` from the legacy engine.ts (or the legacy-compat file). These are no longer needed with API-level compaction.

### Step 6: Commit

```bash
git add -A
git commit -m "feat: complete TAOR engine migration — remove observation masking, wire compaction API"
```

---

## Task 6: Update SOUL.md & Prompt for Sub-Agent Awareness

Update the system prompt to teach BitBit when and how to use `spawn_agent` for complex multi-part requests.

**Files:**
- Modify: `personal-assistant/SOUL.md`
- Modify: `personal-assistant/src/lib/agent/prompt-builder.ts`

### Step 1: Add to SOUL.md Principles section

After "Remember everything, learn always":

```markdown
**Divide and conquer.** When a request has multiple independent parts, work them in parallel. Don't try to cram everything into one long chain of thought. Spawn focused sub-tasks, let them run, synthesize the results. The user sees one coherent response; the machinery stays invisible.
```

### Step 2: Add spawn_agent guidance to prompt-builder.ts

In the BITBIT_IDENTITY_PREAMBLE, add after the "DO before DESCRIBE" section:

```
## Complex Task Decomposition

When a request involves 3+ independent action chains (e.g., "sort out everything with Steve — photos, invoice, email, follow-up"), use spawn_agent to handle each piece in parallel with focused context. This is faster and more reliable than trying to do everything sequentially.

When to spawn:
- Multiple independent sub-tasks (fix photos AND send invoice AND draft reply)
- Deep research that would consume too much context
- Tasks that benefit from focused tool access

When NOT to spawn:
- Simple single-step operations
- Tasks that need context from earlier in this conversation
- Quick lookups or trivial answers

Always synthesize sub-agent results into one coherent response. The user should never know that parallel agents were involved.
```

### Step 3: Commit

```bash
git add personal-assistant/SOUL.md personal-assistant/src/lib/agent/prompt-builder.ts
git commit -m "docs: teach BitBit when to use sub-agent decomposition"
```

---

## Verification Checklist

Before marking this plan as complete, verify:

- [ ] `engine.ts` re-exports work (no broken imports across codebase)
- [ ] SSE event stream is identical to frontend expectations (no chat-interface.tsx changes needed)
- [ ] Pre-flight checks (cost guard, agent kill switch, calibration) all work
- [ ] Tool execution (parallel, budget checks, citations, JIT instructions) all work
- [ ] `spawn_agent` tool works with depth limiting
- [ ] Sub-agents get isolated context (no parent history leaking)
- [ ] Sub-agent results flow back as tool_result to parent
- [ ] Deferred tool loading reduces initial context token count
- [ ] Compaction handles long conversations (no iteration cap needed)
- [ ] `vitest run` passes
- [ ] `tsc --noEmit` has no new errors
- [ ] Manual smoke test in browser works end-to-end

## Architecture Notes for the Implementer

**Why no iteration cap?** Claude Code has no hard cap. The model decides when to stop. Compaction handles context overflow. The 50-iteration safety ceiling exists only to prevent runaway API costs from bugs — it should never be hit in practice.

**Why no observation masking?** Anthropic's compaction API (`compact-2026-01-12`) does this server-side, with better summarization than our regex-based placeholder system. It also preserves cross-turn context that masking destroys.

**Why sub-agents return summaries, not full transcripts?** Context isolation is the entire point. If sub-agent verbose output leaked into the parent, we'd have the same context overflow problem. Summary-only is how Claude Code does it, and it works.

**Why depth limit of 3?** Prevents exponential cost. A depth-3 chain means at most 1 parent + 3 children + 9 grandchildren = 13 concurrent contexts. Depth 4 would be 40. Cost grows exponentially.

**Compaction API availability:** As of March 2026, `compact-2026-01-12` is in beta. If it's not available, fall back to the observation masking approach (kept in `legacy-compat.ts`). The TAOR loop has a `// COMPACTION` section that handles this — if stop_reason is never 'compaction', the loop just runs until the model stops calling tools, same as Claude Code.
