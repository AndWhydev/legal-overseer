# Streaming UX Overhaul Plan

## Current Architecture

### Event Flow: Engine -> API Route -> SSE -> Chat Interface

```
User message
  -> POST /api/agent/chat (route.ts:17)
    -> UnifiedConversationPipeline.handleMessage() (unified-pipeline.ts:88)
      -> Identity resolution, thread resolution, store inbound, load history
      -> runTAORLoop() (taor-loop.ts:50) — AsyncGenerator<AgentEvent>
        -> Pre-flight checks, model routing, context assembly
        -> TAOR while-loop (line 250):
           1. THINK: Anthropic API streaming call (line 264-302)
           2. ACT: executeToolBatch() (tool-executor.ts:70) — Promise.allSettled
           3. OBSERVE: append results to messages (line 558)
           4. REPEAT
        <- yields AgentEvent objects per step
      <- unified-pipeline yields events pass-through (line 255)
    -> ReadableStream encodes each event as SSE: `data: ${JSON.stringify(event)}\n\n` (route.ts:177)
  -> fetch() ReadableStream -> chat-interface.tsx parses SSE line-by-line (line 811-835)
```

### Event Types Emitted (types.ts:61-91)

| Event | Source | Frontend Handling |
|-------|--------|-------------------|
| `thinking_start/delta/complete` | TAOR loop streaming callback | Updates thinking UI state |
| `stage` | TAOR loop lifecycle | **IGNORED** (line 881: `break`) |
| `plan` | Haiku planner (pre-loop, 1500ms race) | **IGNORED** (line 882: `break`) |
| `plan_stage_update` | TAOR loop (tool-to-stage matching) | **IGNORED** (line 883: `break`) |
| `tool_call` | TAOR loop (pre-batch, lines 485-504) | Creates ToolCall with `status: 'running'`, updates stream segments |
| `tool_result` | tool-executor.ts (batched after ALL tools) | Updates matching tool to done/error |
| `content_delta` | TAOR loop streaming callback | Streams text into message or inter-tool buffer |
| `message` | TAOR loop (end-of-turn, line 443) | Sets final response text |
| `citation` | tool-executor.ts | Appends to active citations |
| `checkpoint` | TAOR loop | Adds checkpoint marker |
| `sub_agent_start/complete` | tool-executor sideEvents | **IGNORED** (lines 886-896: `break`) |
| `thread` | unified-pipeline.ts | Updates threadId state |
| `done` | TAOR loop | Finalizes stream segments, feeds smooth-stream |
| `error` | TAOR loop / pipeline | Shows error message |

### Where Dead Silence Occurs

**Gap 1: Tool Execution (5-30s, the worst offender)**
- `tool_call` events emit *before* execution starts (taor-loop.ts:502-503)
- `executeToolBatch` uses `Promise.allSettled` (tool-executor.ts:130) — blocks until ALL tools complete
- Events are collected in an array, returned in batch (tool-executor.ts:10: "Event collection (returned, not yielded)")
- Zero events reach the frontend during this window
- User sees spinning loaders on tools with no progress indication

**Gap 2: Inter-iteration synthesis (2-8s)**
- After tool results append to messages (line 558), the TAOR while-loop immediately starts the next Anthropic API call
- `stage: api_streaming: start` fires (line 260) but frontend ignores all `stage` events
- Nothing visual happens between tool completion and next `content_delta`

**Gap 3: Plan stages arrive as batch (instant but jarring)**
- Haiku planner races with 1500ms timeout (line 158-162)
- All stages emit at once: `yield { type: 'plan', data: { stages: planStages } }` (line 164)
- Frontend ignores `plan` events entirely — they're only used internally for tool-to-stage matching
- No visual plan progression shown to user

**Gap 4: Context assembly (1-3s)**
- ContextAssembler + entity-aware prompt building runs before the first API call
- Only `stage` events emitted, which frontend ignores
- `thinking_start` fires at line 86 but the user just sees a generic "Thinking" shimmer

## Root Causes

1. **`executeToolBatch` waits for all tools (`Promise.allSettled`) — zero events during execution.** The function was intentionally designed as pure-async (not generator) for testability: "This keeps the function pure-async and testable without generator mechanics" (tool-executor.ts:68). All events are collected in an array and returned after completion. This architectural choice prevents streaming individual tool results.

2. **No signal between tool completion and next Claude API iteration.** The TAOR loop yields `stage: api_streaming: start` for iteration 2+ (line 260), but the frontend explicitly discards all `stage` events (chat-interface.tsx:881: `case 'stage': break`). There's no dedicated "synthesis" event type that the frontend would handle.

3. **Plan stages arrive as a single batch event.** The Haiku planner runs pre-loop with a 1500ms `Promise.race` window (lines 158-162). When it wins, ALL stages emit in one `yield`. Plan stage updates (`plan_stage_update`) do fire correctly during tool execution, but the frontend ignores them.

4. **Frontend discards useful events.** Lines 880-896 in chat-interface.tsx: `stage`, `plan`, `plan_stage_update`, `sub_agent_start`, and `sub_agent_complete` all `break` with no state updates. The backend already provides rich lifecycle data — the frontend just doesn't use it.

## Proposed Fix — 4 Phases

### Phase 1: Kill Dead Silence (~100 lines, zero risk)

**Goal:** Eliminate perceived freezing during tool execution and inter-iteration gaps.

#### Backend Changes

**1. New event types in `types.ts`:**
```typescript
| { type: 'tool_progress'; data: { elapsed_ms: number; tools_pending: number; tools_complete: number } }
| { type: 'synthesis_start'; data: { iteration: number } }
```

**2. Heartbeat wrapper in `taor-loop.ts` around `executeToolBatch`:**

Since the TAOR loop is an async generator, we can't yield during `await executeToolBatch(...)`. Solution: wrap with an async generator that races the batch promise against a 2s timer:

```typescript
async function* executeWithHeartbeat(
  toolBlocks: ToolUseBlock[],
  config: EngineConfig,
  execOptions: ExecuteToolOptions | undefined,
  executionTokens: number,
  activeRole: string | undefined,
): AsyncGenerator<AgentEvent | { type: '__batch_result'; result: ToolExecutionResult }> {
  const startTime = Date.now()
  let completed = 0
  const total = toolBlocks.length

  const resultPromise = executeToolBatch(toolBlocks, config, execOptions, executionTokens, activeRole)
    .then(r => ({ done: true as const, result: r }))

  while (true) {
    const tick = await Promise.race([
      resultPromise,
      new Promise<{ done: false }>(resolve => setTimeout(() => resolve({ done: false }), 2000)),
    ])

    if (tick.done) {
      yield { type: '__batch_result' as const, result: tick.result }
      return
    }

    yield {
      type: 'tool_progress',
      data: { elapsed_ms: Date.now() - startTime, tools_pending: total - completed, tools_complete: completed },
    }
  }
}
```

Replace the `await executeToolBatch(...)` call (lines 508-514) with:
```typescript
let batchResult: ToolExecutionResult
for await (const evt of executeWithHeartbeat(toolBlocks, config, execOptions, executionTokens, activeRole)) {
  if (evt.type === '__batch_result') {
    batchResult = (evt as any).result
  } else {
    yield evt as AgentEvent
  }
}
```

**3. `synthesis_start` event at iteration 2+:**
At line 251 (top of while-loop), after `iterationCount++`:
```typescript
if (iterationCount > 1) {
  yield { type: 'synthesis_start', data: { iteration: iterationCount } }
}
```

#### Frontend Changes

**4. Handle `tool_progress` in chat-interface.tsx:**
```typescript
case 'tool_progress': {
  // Just reset the stall timer — the elapsed time drives the Tool component's local timer
  break
}
```

**5. Handle `synthesis_start` in chat-interface.tsx:**
```typescript
case 'synthesis_start': {
  setIsThinkingStreaming(true)
  setThinkingContent('Composing response')
  break
}
```

**6. Elapsed timer on Tool component (`tool.tsx`):**
When `status === 'running'`, start a local `setInterval` that shows elapsed seconds:
```typescript
// Inside Tool component, when status === 'running':
const [elapsed, setElapsed] = useState(0)
useEffect(() => {
  if (status !== 'running') return
  const start = Date.now()
  const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
  return () => clearInterval(id)
}, [status])
```
Display: `<span className="text-xs tabular-nums text-muted-foreground">{elapsed}s</span>`

**Files touched:**
- `engine/types.ts` — 2 new event types (+6 lines)
- `engine/taor-loop.ts` — Heartbeat wrapper + synthesis_start (+45 lines)
- `components/chat/chat-interface.tsx` — 2 new switch cases (+12 lines)
- `components/ui/tool.tsx` — Elapsed timer (+15 lines)

**Risk:** Zero. New events are additive. Old clients ignore unknown events. Frontend changes are cosmetic.

---

### Phase 2: Stagger Plan Stages (frontend only, ~60 lines)

**Goal:** Show plan stages visually with progressive reveal, giving users a sense of what the agent will do.

**1. Add plan state to chat-interface.tsx:**
```typescript
const [planStages, setPlanStages] = useState<PlanStage[]>([])
const [planStageStatuses, setPlanStageStatuses] = useState<Record<string, 'pending' | 'active' | 'done' | 'error'>>({})
```

**2. Handle plan events:**
```typescript
case 'plan': {
  // Stagger stages with 200ms delay each
  event.data.stages.forEach((stage, i) => {
    setTimeout(() => {
      if (requestGenRef.current !== gen) return
      setPlanStages(prev => [...prev, stage])
      setPlanStageStatuses(prev => ({ ...prev, [stage.id]: 'pending' }))
    }, i * 200)
  })
  break
}

case 'plan_stage_update': {
  setPlanStageStatuses(prev => ({ ...prev, [event.data.stageId]: event.data.status }))
  break
}
```

**3. Optional PlanProgress component (~80 lines):**
Compact progress list rendered above the Steps/chain-of-thought section. Each stage shows icon, label, and status (pending dot / active spinner / done check / error x).

**Files touched:**
- `components/chat/chat-interface.tsx` — Plan state + event handling (+30 lines)
- New: `components/chat/plan-progress.tsx` (~80 lines, optional)

**Risk:** Low. Frontend-only. Plan data already emitted by backend. Late plans (after 1500ms race) are handled by existing TAOR loop logic (lines 327-343).

---

### Phase 3: Streaming Tool Results (medium risk, ~80 lines)

**Goal:** Show tool results as they complete, not after all tools finish.

**Convert `executeToolBatch` to an async generator:**

```typescript
// tool-executor.ts — AFTER
export async function* executeToolBatch(
  toolBlocks: ToolUseBlock[],
  config: EngineConfig,
  execOptions: ExecuteToolOptions | undefined,
  executionTokens: number,
  activeRole: string | undefined,
): AsyncGenerator<AgentEvent, ToolExecutionResult> {
  // ... budget checks (unchanged) ...

  // Start all tools in parallel
  const indexed = toolBlocks.map((tool, idx) => ({
    idx,
    tool,
    promise: executeAgentTool(tool.name, tool.input, config.orgId, config.supabase, execOptions)
      .then(result => ({ idx, tool, result, status: 'fulfilled' as const }))
      .catch(reason => ({ idx, tool, reason, status: 'rejected' as const })),
  }))

  const pending = new Set(indexed.map(i => i.promise))
  const toolResults: ToolResultBlockParam[] = new Array(toolBlocks.length)

  // Yield results in completion order
  while (pending.size > 0) {
    const completed = await Promise.race(pending)
    pending.delete(completed.promise) // need to store promise ref
    // Process result, yield events, store in toolResults[completed.idx]
    // ... (citation extraction, reflection, truncation — same as current)
  }

  return { toolResults, events: [], activeRole, executionCapHit }
}
```

**Update TAOR loop** to consume the generator:
```typescript
const batchGen = executeToolBatch(toolBlocks, config, execOptions, executionTokens, activeRole)
let batchResult: ToolExecutionResult
while (true) {
  const { value, done } = await batchGen.next()
  if (done) { batchResult = value; break }
  yield value // individual tool_result events
}
```

**Frontend impact:** None required. The existing `tool_result` handler (line 974) already finds matching running tools by name and updates them individually. Tools will visually flip from spinner to checkmark one-by-one.

**Files touched:**
- `engine/tool-executor.ts` — Convert to async generator (~80 lines rewritten)
- `engine/taor-loop.ts` — Consume generator instead of awaiting (~10 lines changed)

**Risk:** Medium.
- Changes core tool execution contract
- Must ensure `toolResults` array stays in original order (model expects `tool_use_id` correspondence)
- Budget/cap logic runs before dispatch — timing unaffected
- Citation extraction / action reflection timing shifts slightly (per-tool instead of batch)
- Test with mock tools of varying latency

---

### Phase 4: Polish (~60 lines)

**1. Source badges on tool results:**
Map tool names to data source labels in `tool.tsx`:
```typescript
const SOURCE_BADGES: Record<string, string> = {
  find_messages: 'Gmail',
  read_message: 'Gmail',
  search_contacts: 'Contacts',
  get_contact: 'Contacts',
  search_memory: 'Memory',
  add_memory: 'Memory',
  get_calendar: 'Calendar',
  browse_website: 'Web',
  search_tasks: 'Tasks',
}
```
Render as a small `<span>` badge next to the tool name.

**2. Transition animations:**
- Crossfade spinner -> checkmark on tool completion (already using motion/react)
- Smooth height transitions when plan stages appear
- `AnimatePresence` for synthesis indicator appear/disappear

**3. Delete orphaned `chain-of-thought.tsx`** — dead code, safe to remove.

**Files touched:**
- `components/ui/tool.tsx` — Source badges + transitions (+25 lines)
- `components/chat/chat-interface.tsx` — Minor animation tweaks (+10 lines)
- Delete: `components/ai-elements/chain-of-thought.tsx` (-543 lines)

**Risk:** Low. Visual-only changes.

---

## chain-of-thought.tsx Status

**ORPHANED.** The `ChainOfThought` component at `src/components/ai-elements/chain-of-thought.tsx` (543 lines, 7 exports) is NOT imported by any file in the codebase. Zero consumers.

The chat interface fully migrated to:
- `Steps` / `StepsTrigger` / `StepsContent` / `StepsItem` (from `@/components/ui/steps`) — collapsible reasoning blocks
- `Tool` component (from `@/components/ui/tool`) — individual tool status rows with icon, name, detail, result badge

The old component uses inline styles with deprecated CSS variables (`var(--text-dim)`, `var(--glass-divider)`, `var(--hover-bg)`) from the removed glassmorphic design system. The new components use Tailwind/Shadcn conventions.

One useful pattern from chain-of-thought.tsx worth borrowing: the stagger animation `delay: index * 0.08` (line 213) for entrance effects.

**Recommendation:** Delete in Phase 4. It's dead code.

## Risk Assessment

| Phase | Risk | What Could Break | Mitigation |
|-------|------|------------------|------------|
| **Phase 1** | Zero | Nothing — additive events, cosmetic frontend changes | New SSE events ignored by old clients. No existing behavior modified. |
| **Phase 2** | Low | Plan rendering could layout-shift if stages arrive after tools start. Late plans (post-1500ms race) could show stale plan. | Guard with `requestGenRef` check in setTimeout. AnimatePresence handles late arrivals. |
| **Phase 3** | Medium | Tool result ordering could desync — model expects `tool_use_id` correspondence in toolResults array. Budget/cap logic timing. Citation extraction on partial results. | Pre-allocate toolResults array indexed by original position. Budget checks run before dispatch (unchanged). Test with variable-latency mocks. |
| **Phase 4** | Low | Source badge mapping could be wrong for renamed tools. Animation performance on mobile. | Static mapping. Use `will-change` sparingly. |

## Implementation Order

```
Phase 1 (zero risk, highest impact)
  |
  +---> Phase 2 (frontend only, can parallel with Phase 3)
  |
  +---> Phase 3 (independent of Phase 2, medium risk)
  |
  +---> Phase 4 (depends on Phase 2 + 3 being stable)
```

Phase 1 alone eliminates the worst UX problem (dead silence during tool execution) with ~100 lines and zero risk. Ship it first, iterate from there.
