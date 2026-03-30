# Streaming UX Overhaul — Implementation Plan

## 1. Current Architecture

### Event Flow

```
User message
  → POST /api/agent/chat (route.ts)
    → UnifiedConversationPipeline.handleMessage() (unified-pipeline.ts)
      → runTAORLoop() (taor-loop.ts)
        → yields AgentEvent objects
      ← async generator yields events
    ← async generator yields PipelineEvent objects
  → ReadableStream encodes each event as SSE: `data: ${JSON.stringify(event)}\n\n`
  → fetch() ReadableStream → chat-interface.tsx parses SSE line-by-line
```

### Key Files

| File | Role | Lines |
|------|------|-------|
| `src/app/api/agent/chat/route.ts` | SSE endpoint — wraps pipeline in ReadableStream | ~196 |
| `src/lib/conversation/unified-pipeline.ts` | Identity → thread → engine → store → post-process | ~449 |
| `src/lib/agent/engine/taor-loop.ts` | TAOR loop: Think/Act/Observe/Repeat. Yields AgentEvent | ~637 |
| `src/lib/agent/engine/tool-executor.ts` | Parallel tool dispatch. Returns events in array (not yielded) | ~295 |
| `src/lib/agent/engine/types.ts` | AgentEvent union type + EngineConfig | ~109 |
| `src/lib/agent/planner.ts` | Haiku planner — generates PlanStage[] | ~301 |
| `src/components/chat/chat-interface.tsx` | SSE consumer, state management, rendering | ~2200+ |
| `src/components/ai-elements/chain-of-thought.tsx` | Legacy CoT component (unused in current rendering) | ~543 |
| `src/components/ui/steps.tsx` | Collapsible Steps/StepsTrigger/StepsContent | ~117 |
| `src/components/ui/tool.tsx` | Tool status row (icon, name, detail, result badge) | ~166 |

### Current AgentEvent Types (types.ts:61-91)

| Event | When Emitted | Data Shape |
|-------|-------------|------------|
| `thinking_start` | Before context assembly | `{}` |
| `thinking_delta` | Extended thinking text chunk | `string` |
| `thinking_complete` | Thinking block finished | `{ duration_ms }` |
| `stage` | Internal pipeline stages | `{ stage, status, meta? }` |
| `plan` | Haiku planner returns stages | `{ stages: PlanStage[] }` |
| `plan_stage_update` | Stage status change | `{ stageId, status }` |
| `tool_call` | Tool invocation starts | `{ name, input }` |
| `tool_result` | Tool execution completes | `{ name, result, success, queued?, approvalId? }` |
| `content_delta` | Streaming text token | `string` |
| `message` | Final complete response text | `string` |
| `citation` | Source citations extracted | `{ citations[] }` |
| `checkpoint` | Context compaction marker | `{ message_index, label }` |
| `sub_agent_start` | Sub-agent spawned | `{ agentId, description }` |
| `sub_agent_complete` | Sub-agent finished | `{ agentId, summary }` |
| `error` | Unrecoverable error | `string` |
| `done` | Stream complete | `{ tokens? }` |

### How the Frontend Processes Events (chat-interface.tsx:830-1266)

The `handleSend` callback:
1. POSTs to `/api/agent/chat`, gets a `ReadableStream`
2. Reads chunks, splits by `\n`, parses `data: {...}` lines
3. Switch-cases on `event.type` to update React state
4. Uses `streamSegments` (mutable ref + state) to track chronological order of text/tool interleaving
5. Smooth-stream hook animates final response text character-by-character

### Current Rendering (chat-interface.tsx:1430-1700)

- **Steps/StepsTrigger/StepsContent** — Shadcn-style collapsible wrapper
- **Tool** component — individual tool row with icon, name, detail pill, result badge, spinner
- **Segment-aware rendering** — handles interleaved text + tool batches
- Each tool segment gets its own `<Steps>` block with header ("Thinking", "Continued reasoning")
- Auto-opens during streaming, auto-closes ~1.2s after completion

---

## 2. Root Causes of UX Problems

### Problem 1: Plan stages flash all at once
**Root cause:** `taor-loop.ts:157-178` — Haiku planner runs as a `Promise.race` with a 1500ms window. When it wins the race, ALL stages are emitted in a single `yield { type: 'plan', data: { stages: planStages } }`. The frontend receives them as one SSE event and renders all 3-4 items simultaneously.

**Why it feels wrong:** No staggered entrance. The user sees nothing, then suddenly 3 plan items appear at once.

### Problem 2: 10-20s dead silence during tool execution
**Root cause:** `tool-executor.ts:130-155` — Tools execute via `Promise.allSettled()` in parallel. The executor collects ALL events in an array and returns them after ALL tools complete. Back in `taor-loop.ts:517-519`, the batch events are yielded all at once. Between `tool_call` and `tool_result`, zero events are emitted.

The timeline looks like:
```
t=0s   tool_call (search_tasks)     ← SSE event
t=0s   tool_call (find_messages)    ← SSE event
       ... 10-20s silence ...
t=15s  tool_result (search_tasks)   ← SSE event (batched)
t=15s  tool_result (find_messages)  ← SSE event (batched)
```

### Problem 3: Response arrives in two chunks with long pause
**Root cause:** After tools complete, the engine must make another API call to Claude with tool results appended to the conversation (`taor-loop.ts:250-302`). This second API call takes 2-5s before streaming begins. During this time, zero events are emitted — the frontend shows no indication that processing has resumed.

### Problem 4: Thinking animation stops/starts awkwardly
**Root cause:** `chat-interface.tsx:901` sets `isThinkingStreaming(false)` on `tool_call`, then nothing resets it during tool execution. The `isReasoningActive` flag (`line 1401-1403`) depends on `isThinkingStreaming || tools.some(running) || (isLoading && tools.length > 0)`, but the visual effect is that "Thinking" shimmer disappears abruptly when the first tool starts, and nothing replaces it until tool results arrive.

---

## 3. Proposed Changes

### 3A. New SSE Event Types

Add these to `AgentEvent` union in `types.ts`:

```typescript
// Emitted as each tool starts executing (before result)
| { type: 'tool_progress'; data: { name: string; status: 'executing' | 'retrying'; elapsed_ms: number } }

// Emitted when engine starts a new API call (iteration 2+)
| { type: 'synthesis_start'; data: { iteration: number } }

// Emitted when plan stages arrive, but one at a time with delay
// (Alternatively, handle staggering client-side from the existing 'plan' event)
```

**Decision: Stagger plan stages client-side** — No new event type needed. The `plan` event already sends all stages; the frontend can render them with staggered animation delays (the `motion.div` with `delay: index * 0.08` pattern already exists in `chain-of-thought.tsx:209`).

### 3B. Server-Side Changes

#### `types.ts` — Add new event types

```typescript
// Add to AgentEvent union:
| { type: 'tool_progress'; data: { name: string; status: 'executing'; elapsed_ms: number } }
| { type: 'synthesis_start'; data: { iteration: number } }
```

**Scope:** 2 lines added to the union type.

#### `tool-executor.ts` — Stream individual tool completions

**Current:** `Promise.allSettled()` waits for ALL tools, then returns all events in one batch.

**Proposed:** Convert `executeToolBatch` from returning a `Promise<ToolExecutionResult>` to an `AsyncGenerator<AgentEvent>` that yields events as each tool completes. This way `tool_result` events stream to the client immediately when each tool finishes, rather than waiting for the slowest tool.

```typescript
// BEFORE (returns batch):
export async function executeToolBatch(...): Promise<ToolExecutionResult> {
  const toolExecutions = await Promise.allSettled(...)
  // ... process all results ...
  return { toolResults, events, ... }
}

// AFTER (yields per-tool):
export async function* executeToolBatch(...): AsyncGenerator<AgentEvent | ToolResultParam> {
  // Start all tools in parallel, but yield results as they complete
  const promises = toolBlocks.map((tool, idx) =>
    executeAgentTool(tool.name, tool.input, ...).then(result => ({ idx, tool, result }))
  )

  // Use Promise.race pattern to yield results in completion order
  const pending = new Set(promises)
  while (pending.size > 0) {
    const completed = await Promise.race(pending)
    pending.delete(completed.promise)
    yield { type: 'tool_result', data: { name: completed.tool.name, ... } }
  }
}
```

**Scope:** ~80 lines rewritten in tool-executor.ts. Moderate complexity — need to preserve budget checks, citation extraction, and the `toolResults` array for conversation history.

**Alternative (simpler):** Keep `Promise.allSettled` but add periodic `tool_progress` heartbeat events. A wrapper function runs a setInterval that yields `tool_progress` every 2s while tools execute. This is much less invasive:

```typescript
// In taor-loop.ts, around the executeToolBatch call:
const progressInterval = setInterval(() => {
  for (const tool of toolBlocks) {
    // yield heartbeat for still-running tools
  }
}, 2000)

const batchResult = await executeToolBatch(...)
clearInterval(progressInterval)
```

**Recommendation:** Start with the heartbeat approach (simpler, less risk), then upgrade to streaming completions in a follow-up if needed.

#### `taor-loop.ts` — Emit synthesis_start event

At `taor-loop.ts:260` (start of the while loop iteration), when `iterationCount > 1`:

```typescript
if (iterationCount > 1) {
  yield { type: 'synthesis_start', data: { iteration: iterationCount } }
}
```

**Scope:** 3 lines.

#### `taor-loop.ts` — Tool progress heartbeat

Wrap the `executeToolBatch` call (`line 508-514`) with a heartbeat emitter:

```typescript
// Before executeToolBatch, start heartbeat
const toolStartTimes = new Map<string, number>()
for (const tool of toolBlocks) {
  toolStartTimes.set(tool.name, Date.now())
}

// Heartbeat generator — yields tool_progress every 2s
let heartbeatResolve: (() => void) | null = null
const heartbeatEvents: AgentEvent[] = []
const heartbeatInterval = setInterval(() => {
  for (const tool of toolBlocks) {
    const startTime = toolStartTimes.get(tool.name)!
    heartbeatEvents.push({
      type: 'tool_progress',
      data: { name: tool.name, status: 'executing', elapsed_ms: Date.now() - startTime }
    })
  }
  heartbeatResolve?.()
}, 2000)

// Execute tools (existing code)
const batchResult = await executeToolBatch(toolBlocks, config, execOptions, executionTokens, activeRole)
clearInterval(heartbeatInterval)

// Yield any queued heartbeats
for (const evt of heartbeatEvents) yield evt
```

**Problem:** The TAOR loop is a synchronous `await` on `executeToolBatch`, so heartbeat events can't be yielded during the await. We need a different approach.

**Better approach — interleave with async generator:**

```typescript
// Convert the tool execution section to use an async generator wrapper
async function* executeWithHeartbeat(
  toolBlocks: Anthropic.ToolUseBlock[],
  config: EngineConfig,
  execOptions: ExecuteToolOptions | undefined,
  executionTokens: number,
  activeRole: string | undefined,
): AsyncGenerator<AgentEvent> {
  const startTime = Date.now()

  const resultPromise = executeToolBatch(toolBlocks, config, execOptions, executionTokens, activeRole)

  // Race between result and heartbeat timer
  let done = false
  resultPromise.then(() => { done = true })

  while (!done) {
    const tick = await Promise.race([
      resultPromise.then(r => ({ type: 'result' as const, result: r })),
      new Promise<{ type: 'tick' }>(resolve => setTimeout(() => resolve({ type: 'tick' }), 2000)),
    ])

    if (tick.type === 'result') {
      // Yield all batch events
      for (const event of tick.result.events) yield event
      return tick.result
    }

    // Yield heartbeat
    for (const tool of toolBlocks) {
      yield {
        type: 'tool_progress' as const,
        data: { name: tool.name, status: 'executing' as const, elapsed_ms: Date.now() - startTime },
      }
    }
  }

  return await resultPromise
}
```

**Scope:** ~40 lines new function in taor-loop.ts, ~5 lines changed at the call site.

### 3C. Frontend Changes

#### `chat-interface.tsx` — Handle new event types

Add cases to the SSE switch statement:

```typescript
case 'tool_progress': {
  // Update tool elapsed time for display
  const toolIdx = toolCalls.findIndex(
    tc => tc.name === event.data.name && tc.status === 'running'
  )
  if (toolIdx !== -1) {
    toolCalls[toolIdx] = {
      ...toolCalls[toolIdx],
      elapsedMs: event.data.elapsed_ms,
    }
    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
    ))
  }
  break
}

case 'synthesis_start': {
  // Show "Composing response..." indicator
  setIsThinkingStreaming(true)
  setThinkingContent(prev => prev ? prev : '')  // Keep existing thinking content
  break
}
```

**Scope:** ~25 lines in the switch statement.

#### `chat-interface.tsx` — Plan stage staggered rendering

Current: All plan stages render at once because they're set in state simultaneously.

Proposed: When `plan` event arrives, set stages into state one at a time with delays:

```typescript
case 'plan': {
  const stages = event.data.stages
  // Stagger: add stages one at a time with 200ms gaps
  stages.forEach((stage, i) => {
    setTimeout(() => {
      if (requestGenRef.current !== gen) return
      setPlanStages(prev => [...prev, stage])
    }, i * 200)
  })
  break
}
```

**Note:** Plan stages are currently not rendered as standalone UI — they're used internally for matching tool_calls to stages. The visual "Thinking" header already exists. If we want visible plan stage labels (Manus-style), this needs a new UI section. See 3D.

**Scope:** ~15 lines if staggering existing plan matching. ~60 lines if adding visible plan stage UI.

#### `tool.tsx` — Add elapsed time display

Add optional `elapsedMs` prop to show running duration:

```typescript
// When status === 'running' and elapsedMs is provided:
{status === "running" && elapsedMs && (
  <span className="text-xs text-muted-foreground tabular-nums">
    {Math.ceil(elapsedMs / 1000)}s
  </span>
)}
```

**Scope:** ~8 lines.

#### `chat-interface.tsx` — Show "Composing response..." between iterations

When `synthesis_start` arrives, show a distinct visual state:

```typescript
// Add to the reasoning chain header logic:
const headerText = isSynthesizing ? (
  <Shimmer duration={1}>Composing response</Shimmer>
) : isReasoningActive ? (
  <Shimmer duration={1}>Thinking</Shimmer>
) : (/* existing completed text */)
```

**Scope:** ~10 lines.

### 3D. Manus-Style Progressive Plan Display (Optional Enhancement)

This is the "ideal" from the brief — visible plan stages that progress from pending → active → done as the engine works.

**Current state:** Plan stages exist in the data (`PlanStage[]` from Haiku planner) but are only used for internal matching. They're never shown to the user directly.

**Proposed:** Add a `PlanProgress` component that renders above the chain-of-thought:

```
┌─────────────────────────────────────────┐
│  👤 Steve West    RESOLVING ✓           │
│  📋 New Task      CREATING  ●           │
│  📨 Confirmation  SENDING   ○           │
└─────────────────────────────────────────┘
```

This would require:
1. New state: `planStages` and `planStageStatuses` in chat-interface.tsx
2. New component: `PlanProgress` (~80 lines)
3. Wire up `plan`, `plan_stage_update` events to update state
4. Render between avatar and chain-of-thought

**Scope:** ~120 lines total. Low risk — purely additive UI, no changes to existing data flow.

**Recommendation:** Do this in a follow-up. The heartbeat + synthesis_start changes address the "dead silence" problem. Plan display is polish.

### 3E. Source Badges (Future Enhancement)

The brief mentions "Source badges (gmail, contacts, memory)". These would show where information came from.

**Current state:** Citation extraction already exists (`citation-extractor.ts`). The `citation` event carries source URLs.

**Proposed:** Map tool names to source badges in the chain-of-thought:

```
🔍 Searching tasks          → "tasks" badge
📨 Reading message           → "gmail" badge
🧠 Checking memory           → "memory" badge
👤 Finding contact            → "contacts" badge
```

This is already partially implemented via the `getToolIcon()` and `formatToolName()` functions. Adding explicit source badges would mean:

1. Add a `source` field to `tool_call` events (derived from tool name)
2. Render source badges inline with chain-of-thought steps

**Scope:** ~30 lines. Defer to follow-up.

---

## 4. Migration Path — Incremental Delivery

### Phase 1: Kill Dead Silence (backend, 1 session)
1. Add `tool_progress` and `synthesis_start` to `AgentEvent` union in `types.ts`
2. Add heartbeat wrapper in `taor-loop.ts` around `executeToolBatch`
3. Add `synthesis_start` yield at start of iteration 2+
4. Frontend: handle `tool_progress` (update elapsed time), `synthesis_start` (show composing state)
5. Frontend: add elapsed time display to `<Tool>` component

**Files changed:** `types.ts`, `taor-loop.ts`, `chat-interface.tsx`, `tool.tsx`
**Risk:** Low — additive events, existing flow unchanged.

### Phase 2: Staggered Plan Stages (frontend, 1 session)
1. Stagger plan stage rendering with 200ms delays
2. Add visible `PlanProgress` component (optional)
3. Improve "Thinking" → "Composing response" transition

**Files changed:** `chat-interface.tsx`, new `plan-progress.tsx`
**Risk:** Low — frontend-only, no backend changes.

### Phase 3: Streaming Tool Results (backend, 1 session)
1. Convert `executeToolBatch` to yield results as they complete (Promise.race pattern)
2. Update `taor-loop.ts` to consume the async generator
3. Frontend already handles individual `tool_result` events — no frontend changes needed

**Files changed:** `tool-executor.ts`, `taor-loop.ts`
**Risk:** Medium — changes the tool execution contract. Need to preserve `toolResults` array for conversation history and ensure budget/citation logic still works.

### Phase 4: Source Badges & Polish (frontend, 1 session)
1. Add source badge rendering to tool steps
2. Clean up chain-of-thought transitions
3. Remove legacy `chain-of-thought.tsx` if fully superseded

**Files changed:** `chat-interface.tsx`, `tool.tsx`, possibly new `source-badge.tsx`
**Risk:** Low.

---

## 5. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Heartbeat events flood SSE stream | Low | Emit only every 2s, frontend ignores if tool already has result |
| Promise.race in tool-executor breaks budget tracking | Medium | Keep `toolResults` array accumulation separate from yield timing |
| Stale heartbeat events after tool completes | Low | Frontend ignores `tool_progress` for tools with `status !== 'running'` |
| `synthesis_start` emits before content_delta for simple responses | Low | Only emit when `iterationCount > 1` (tool-use loop iterations) |
| Race condition: smooth-stream ownership during rapid re-sends | Low | Existing `requestGenRef` generation check covers this |
| Chain-of-thought legacy component conflicts | Low | `chain-of-thought.tsx` is NOT used in current rendering — safe to ignore |

---

## 6. Estimated Scope Per File

| File | Changes | Complexity |
|------|---------|-----------|
| `engine/types.ts` | +2 event types | Trivial |
| `engine/taor-loop.ts` | +heartbeat wrapper, +synthesis_start emit | Moderate (~45 lines) |
| `engine/tool-executor.ts` | Phase 3 only: convert to async generator | Moderate (~80 lines rewrite) |
| `chat-interface.tsx` | +2 switch cases, +elapsed tracking, +stagger plan | Moderate (~50 lines) |
| `ui/tool.tsx` | +elapsed time display | Trivial (~8 lines) |
| New: `plan-progress.tsx` | Optional plan progress bar | Small (~80 lines) |
| `planner.ts` | No changes needed | None |
| `unified-pipeline.ts` | No changes needed (passthrough) | None |
| `route.ts` | No changes needed (passthrough) | None |

**Total Phase 1 (kill dead silence):** ~100 lines across 4 files
**Total all phases:** ~260 lines across 6 files

---

## 7. What chain-of-thought.tsx Already Implements

The component at `src/components/ai-elements/chain-of-thought.tsx` (543 lines) implements:

- `ChainOfThought` — controlled/uncontrolled collapsible wrapper with context
- `ChainOfThoughtHeader` — clickable trigger with chevron
- `ChainOfThoughtStep` — individual step with icon, label, detail pill, status (active/complete/pending), staggered entrance animation
- `ChainOfThoughtContent` — animated expand/collapse with thread line
- `ChainOfThoughtSearchResults` / `ChainOfThoughtSearchResult` — result pills
- `ChainOfThoughtImage` — image display with caption

**Current usage: NONE.** The chat-interface.tsx does NOT import this component. It uses the `Steps`/`StepsTrigger`/`StepsContent` from `@/components/ui/steps` and the `Tool` component from `@/components/ui/tool` instead.

**Recommendation:** The chain-of-thought.tsx component is more feature-rich (has thread lines, pulsing active states, staggered entrance) but uses inline styles and legacy design tokens (`var(--text-dim)`, `var(--glass-divider)`). The Steps/Tool components use Tailwind/Shadcn conventions. Keep using Steps/Tool for consistency with the current design system. The stagger animation from chain-of-thought.tsx can be borrowed (the `delay: index * 0.08` pattern).

---

## 8. Summary

The streaming UX problems are caused by three gaps:
1. **No progress events during tool execution** → 10-20s dead silence
2. **No signal between tool completion and response synthesis** → mysterious pause
3. **Plan stages arrive as a batch** → flash of 3 items

The fix is primarily **new SSE event types** (`tool_progress`, `synthesis_start`) and **frontend timing** (staggered plan stages, elapsed time display). The existing component architecture (Steps/Tool) is solid — it just needs more data to show.

Phase 1 alone (heartbeat + synthesis_start) eliminates the worst UX problem (dead silence) with ~100 lines of changes and zero risk to existing functionality.
