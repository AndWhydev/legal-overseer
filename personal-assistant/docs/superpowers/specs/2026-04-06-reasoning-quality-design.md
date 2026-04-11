# Sub-project A: Reasoning Quality — Design Spec

**Goal:** Make the TAOR loop reason deliberately on complex turns by activating extended thinking for all purposes (not just synthesis), gating thinking budget by a complexity signal from the Haiku planner, and encouraging inter-tool reasoning via prompt.

**Architecture:** Three targeted changes to existing files. No new files, dependencies, DB migrations, or UI changes. The model already emits text between tool calls and the UI already renders it in the reasoning chain — we just need to activate thinking and guide the model to use it.

---

## 1. Complexity-Gated Extended Thinking

### Current State

In `taor-loop.ts`, extended thinking is only activated when `purpose === 'synthesis'`:

```typescript
// Current: only synthesis gets thinking
if (purpose === 'synthesis') {
  thinking = { type: 'enabled', budget_tokens: 8192 }
}
```

### New Behavior

The Haiku planner returns a `complexity` signal alongside plan stages. This drives thinking budget for ALL model purposes:

| Complexity | Thinking Budget | Activation Criteria |
|---|---|---|
| `low` | Disabled (no thinking) | Trivial messages, greetings, single-tool lookups |
| `medium` | `budget_tokens: 2048` | Standard queries, 1-2 tool chains, routine operations |
| `high` | `budget_tokens: 8192` | Multi-step research, cross-entity reasoning, financial decisions, conflict resolution, 3+ plan stages |

### Fallback (planner times out)

If the 1500ms planner race times out without returning a result, use a message-level heuristic:

```typescript
function estimateComplexity(message: string, entityCount: number, toolGroupCount: number): 'low' | 'medium' | 'high' {
  // Trivial: short message, no entities, single tool group
  if (message.length < 50 && entityCount === 0 && toolGroupCount <= 1) return 'low'
  // High: multiple entities, multiple tool groups, or temporal/financial signals
  const highSignals = [
    entityCount >= 2,
    toolGroupCount >= 3,
    /\b(last time|compared to|previously|invoice|payment|schedule|deadline)\b/i.test(message),
  ].filter(Boolean).length
  if (highSignals >= 2) return 'high'
  return 'medium'
}
```

### Implementation in taor-loop.ts

Replace the `purpose === 'synthesis'` guard (~line 281) with:

```typescript
// Determine thinking budget from planner complexity (or fallback heuristic)
const complexity = raceResult?.plan?.complexity
  ?? estimateComplexity(message, mentionedEntityIds.length, (raceResult?.plan?.toolGroups ?? []).length)

const thinkingConfig = complexity === 'high'
  ? { type: 'enabled' as const, budget_tokens: 8192 }
  : complexity === 'medium'
    ? { type: 'enabled' as const, budget_tokens: 2048 }
    : undefined
```

This replaces the single `purpose === 'synthesis'` check. The `synthesis` purpose previously guaranteed thinking — now thinking is driven by complexity regardless of purpose, which is more correct (a complex tool-use turn benefits from thinking more than a simple synthesis turn).

---

## 2. Planner Complexity Signal

### Current State

`planner.ts` generates a plan with stages and tool groups via a Haiku call in a 1500ms race window. The output schema includes `stages` and `toolGroups`.

### New Behavior

Add `complexity` to the planner output schema and scoring prompt.

### Planner Prompt Addition

Append to the existing planner system prompt:

```
Also classify the overall complexity of this request:
- "low": greeting, acknowledgment, simple single-step lookup, small talk
- "medium": standard query, 1-2 step operation, routine tool use
- "high": multi-step research, cross-entity reasoning, financial/scheduling decisions, temporal reasoning ("last time", "compared to"), conflict resolution, 3+ steps needed

Return complexity as a field in your response.
```

### Planner Output Schema Change

```typescript
// Add to the planner response type
interface PlannerResult {
  stages: PlanStage[]
  toolGroups: string[]
  complexity: 'low' | 'medium' | 'high'  // NEW
}
```

### Parsing

Add `complexity` extraction from the planner JSON response alongside existing `stages` and `toolGroups` parsing. Default to `'medium'` if the field is missing (graceful degradation).

---

## 3. Inter-Tool Reasoning Prompt

### Current State

The system prompt guides tool usage but does not encourage the model to reason between tool calls. The model CAN emit text between tool calls (the TAOR loop and UI already handle this), but it typically chains tools without pausing to evaluate.

### New Behavior

Add to the "Using your tools" section in `prompt-builder.ts`, after existing tool guidance:

```
When results from a tool are unexpected, or when you're planning a multi-step chain, reason in your response before calling the next tool. Explain what you've learned so far and what you'll try next. This produces better outcomes and helps the user follow your thinking.
```

This is 3 lines (~40 tokens). It leverages BitBit's existing inter-tool text rendering in the reasoning chain UI — no frontend changes needed.

---

## 4. File Changes Summary

| File | Change | Estimated Lines |
|---|---|---|
| `src/lib/agent/engine/taor-loop.ts` | Replace `purpose === 'synthesis'` thinking gate with complexity-driven budget + add `estimateComplexity` fallback function | ~20 |
| `src/lib/agent/planner.ts` | Add `complexity` to planner output schema, add classification instruction to prompt, parse new field with 'medium' default | ~30 |
| `src/lib/agent/prompt-builder.ts` | Add 3-line inter-tool reasoning instruction to tool usage section | ~5 |

**Total: ~55 lines changed.** No new files, no new dependencies, no DB migrations, no UI changes.

---

## 5. Data Flow

```
User message arrives
  ↓
Haiku planner (1500ms race window)
  → Returns: { stages, toolGroups, complexity: 'low'|'medium'|'high' }
  → If timeout: estimateComplexity() heuristic fallback
  ↓
selectModel() returns model + purpose
  ↓
Thinking config resolved from complexity:
  low    → thinking: undefined (disabled)
  medium → thinking: { type: 'enabled', budget_tokens: 2048 }
  high   → thinking: { type: 'enabled', budget_tokens: 8192 }
  ↓
TAOR loop runs with thinking config
  → Claude uses extended thinking at turn start (internal reasoning)
  → Claude emits text between tool calls when results need evaluation (encouraged by prompt)
  → Both render in the UI reasoning chain (existing behavior)
  ↓
User sees: "Thought for X seconds · N tools" with visible reasoning between tool calls
```

---

## 6. Future Integration (Sub-project D)

When the post-turn quality evaluator is built (Sub-project D), it will score each TAOR run on tool efficiency, context utilisation, and confidence calibration. These scores can feed back into complexity estimation:

- If a `medium`-complexity turn scored poorly, the system learns to classify similar patterns as `high` next time
- If a `high`-complexity turn completed efficiently in 1-2 tools, the system learns to classify similar patterns as `medium`

This retrofit is a straightforward addition to `estimateComplexity()` once the quality scoring table exists. No changes to this spec are needed to support it — the interface is already clean.

---

## 7. Error Handling

- **Planner returns invalid complexity value**: Default to `'medium'`
- **Extended thinking not supported by selected model**: The Anthropic SDK silently ignores the `thinking` parameter on models that don't support it — no error handling needed
- **Thinking budget exceeded**: Anthropic truncates thinking at the budget limit, not an error — the model simply stops its internal reasoning and produces output
- **Fallback heuristic misclassifies**: Over-classifying as `medium` when `low` would suffice costs ~2K extra input tokens (the thinking budget). Under-classifying as `low` when `medium` is needed means no thinking — mitigated by Sub-project D's adaptive feedback. The heuristic errs toward `medium` by default.

---

## 8. Non-Goals

- **New "think" tool**: Not needed. The model's existing ability to emit text between tool calls serves the same purpose without the overhead of a fake tool call and API round-trip.
- **UI changes**: The reasoning chain already renders interleaved text and extended thinking. No frontend work.
- **AI SDK migration**: This spec works with the raw Anthropic SDK that BitBit currently uses.
- **Adaptive complexity (Sub-project D)**: Designed to be compatible but not implemented in this spec.
