# Reasoning Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TAOR loop reason deliberately on complex turns by activating extended thinking for all model purposes, gated by a complexity signal from the Haiku planner.

**Architecture:** Three changes to existing files: (1) extend the planner's output and prompt to include a `complexity` field, (2) replace the `purpose === 'synthesis'` thinking guard with complexity-driven budgets, (3) add a 3-line prompt encouraging inter-tool reasoning.

**Tech Stack:** TypeScript, Anthropic SDK (existing), Zod schemas (existing), AI SDK generateObject/generateText (existing in planner).

**IMPORTANT CONTEXT:** The working copy at `/tmp/bitbit-push/personal-assistant/` is used for development. Run all commands from there.

---

## File Structure

### Modified Files
```
src/lib/agent/planner.ts              — add complexity to PlanOutput, PlanOutputSchema, planner prompt, both parsing paths
src/lib/agent/engine/taor-loop.ts     — replace synthesis thinking guard with complexity-driven budget, add fallback heuristic
src/lib/agent/prompt-builder.ts       — add 3-line inter-tool reasoning instruction
```

---

### Task 1: Extend the Planner with Complexity Signal

**Files:**
- Modify: `src/lib/agent/planner.ts`

- [ ] **Step 1: Add `complexity` to PlanOutput interface**

In `src/lib/agent/planner.ts`, find the `PlanOutput` interface (line 7) and add the `complexity` field:

```typescript
export interface PlanOutput {
  stages: PlanStage[]
  toolGroups: ToolGroup[]
  complexity: 'low' | 'medium' | 'high'
}
```

- [ ] **Step 2: Add `complexity` to PlanOutputSchema**

Find the `PlanOutputSchema` (line 71) and add the complexity field:

```typescript
const PlanOutputSchema = z.object({
  stages: z.array(PlanStageSchema).min(1).max(4)
    .describe('Array of 1-4 execution stages, focused on what matters to the user'),
  toolGroups: z.array(z.string())
    .describe('Tool groups needed (do NOT include "core" — it is always added). Available: memory, channel, web, comms, agentic'),
  complexity: z.enum(['low', 'medium', 'high'])
    .describe('Overall request complexity: low=greeting/simple lookup, medium=standard 1-2 step, high=multi-step research/financial/cross-entity'),
})
```

- [ ] **Step 3: Add complexity classification to PLANNER_SYSTEM prompt**

Find the `PLANNER_SYSTEM` string (line 83). Before the closing backtick, add:

```typescript
const PLANNER_SYSTEM = `You are a planning assistant for BitBit, an AI operations platform. Given a user request and context, output a JSON object with execution stages and tool group selections.

Each stage object has:
- id: snake_case identifier (e.g. "resolve_contact", "create_task")
- label: user-facing name, 2-3 words max (e.g. "Steve West", "New Task")
- sublabel: uppercase action verb, 1-2 words (e.g. "RESOLVING", "CREATING")
- icon: single emoji representing the stage
- toolHint: optional, the tool name BitBit will likely call (one of: TOOL_NAMES)

Focus on what matters to the user, not internal steps. Show entities by name when possible.

Also select which tool groups are needed for this request.
Available groups: core (always included automatically), memory, channel, web, comms
Select 1-3 additional groups beyond core.

Also classify the overall complexity of this request:
- "low": greeting, acknowledgment, simple single-step lookup, small talk
- "medium": standard query, 1-2 step operation, routine tool use
- "high": multi-step research, cross-entity reasoning, financial/scheduling decisions, temporal reasoning ("last time", "compared to"), conflict resolution, 3+ stages needed

Output a JSON object (not array) with three fields:
- "stages": the array of stage objects as described above
- "toolGroups": array of group names (do NOT include "core" — it is always added)
- "complexity": one of "low", "medium", "high"

Examples of toolGroups selection:
- "Send Sezer a WhatsApp" -> ["channel", "comms"]
- "Search for plumbers in Sydney" -> ["web"]
- "Remember that rate is $150/hr" -> ["memory"]
- "Check my calendar" -> ["channel"]
- "What tasks are pending?" -> [] (core only)

Output ONLY the JSON object, no markdown fences or explanation.`
```

- [ ] **Step 4: Update structured planner to extract complexity**

In `generatePlanStructured()` (line 134), the `PlanOutputSchema` already validates the response via `generateObject`. Add complexity to the return value. Find the return statement (line 178):

```typescript
    return { stages, toolGroups, complexity: data.complexity ?? 'medium' }
```

- [ ] **Step 5: Update legacy planner to extract complexity**

In `generatePlanLegacy()` (line 189), after the `rawToolGroups` extraction (around line 229), add complexity parsing:

Find this block:
```typescript
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.stages)) {
      // New format: { stages: [...], toolGroups: [...] }
      rawStages = parsed.stages
      if (Array.isArray(parsed.toolGroups)) {
        rawToolGroups = parsed.toolGroups
      }
```

After that block, but still inside the same `else if`, add:
```typescript
      // no additional code here — complexity is extracted below
```

Then find the final return statement in the legacy planner (it returns `{ stages, toolGroups }`). Replace it with:

```typescript
    // Extract complexity with fallback
    const rawComplexity = typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).complexity
      : undefined
    const complexity: 'low' | 'medium' | 'high' =
      rawComplexity === 'low' || rawComplexity === 'medium' || rawComplexity === 'high'
        ? rawComplexity
        : 'medium'

    return { stages, toolGroups, complexity }
```

- [ ] **Step 6: Update fallback returns to include complexity**

Find every `return { stages: [], toolGroups: [] }` in the file and replace with `return { stages: [], toolGroups: [], complexity: 'medium' as const }`. There are 3 instances:
1. Line 181 (structured planner catch block)
2. Line 151 (generatePlan catch in taor-loop — this is handled separately in Task 2)
3. Lines 231 and 234 in the legacy planner

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | grep -i "planner" | head -10
```

Expected: errors in `taor-loop.ts` (it doesn't use `complexity` yet) but no errors in `planner.ts`.

- [ ] **Step 8: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/agent/planner.ts
git commit -m "feat: add complexity signal to Haiku planner output"
```

---

### Task 2: Replace Synthesis Thinking Guard with Complexity-Driven Budgets

**Files:**
- Modify: `src/lib/agent/engine/taor-loop.ts`

- [ ] **Step 1: Add the estimateComplexity fallback function**

Add this function near the top of `taor-loop.ts`, after the imports (around line 25):

```typescript
/**
 * Fallback complexity estimation when the Haiku planner times out.
 * Uses message heuristics to determine thinking budget.
 */
function estimateComplexity(
  message: string,
  entityCount: number,
  toolGroupCount: number,
): 'low' | 'medium' | 'high' {
  if (message.length < 50 && entityCount === 0 && toolGroupCount <= 1) return 'low'
  const highSignals = [
    entityCount >= 2,
    toolGroupCount >= 3,
    /\b(last time|compared to|previously|invoice|payment|schedule|deadline|budget|proposal)\b/i.test(message),
  ].filter(Boolean).length
  if (highSignals >= 2) return 'high'
  return 'medium'
}
```

- [ ] **Step 2: Capture complexity from planner result**

Find the planner race result handling (line 154-176). After line 160 (`planStages = raceResult.plan.stages`), capture complexity:

Currently:
```typescript
    if (raceResult.ready && raceResult.plan.stages.length > 0) {
      planStages = raceResult.plan.stages
      yield { type: 'plan', data: { stages: planStages } }
```

Add a variable before the if block (around line 153):
```typescript
  let planComplexity: 'low' | 'medium' | 'high' | null = null

  if (planPromise) {
    const raceResult = await Promise.race([
      planPromise.then(plan => ({ ready: true as const, plan })),
      new Promise<{ ready: false }>(resolve => setTimeout(() => resolve({ ready: false }), 1500)),
    ])
    if (raceResult.ready && raceResult.plan.stages.length > 0) {
      planStages = raceResult.plan.stages
      planComplexity = raceResult.plan.complexity
      yield { type: 'plan', data: { stages: planStages } }
```

Also update the catch fallback in line 151 to include complexity:
```typescript
    planPromise = generatePlan(message, entityContext, toolNames)
      .catch(() => ({ stages: [], toolGroups: [], complexity: 'medium' as const }) as PlanOutput)
```

- [ ] **Step 3: Replace the thinking guard**

Find the current thinking guard (lines 281-283):

```typescript
          if (purpose === 'synthesis') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 8192 }
          }
```

Replace with:

```typescript
          // Complexity-gated extended thinking (Sub-project A)
          // Planner complexity signal drives thinking budget; falls back to heuristic
          const complexity = planComplexity
            ?? estimateComplexity(message, mentionedEntityIds?.length ?? 0, planStages.length)

          if (complexity === 'high') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 8192 }
          } else if (complexity === 'medium') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 2048 }
          }
          // complexity === 'low': no thinking (saves tokens on trivial turns)
```

Note: `mentionedEntityIds` is the entity mention scanner result — check if this variable is available in scope. If it's named differently (e.g., `entityIds` or `mentionedEntities`), use the correct name. Search the file for `mentionedEntity` or `entityId` to find the right variable.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors related to taor-loop.ts.

- [ ] **Step 5: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/agent/engine/taor-loop.ts
git commit -m "feat: complexity-gated extended thinking in TAOR loop"
```

---

### Task 3: Add Inter-Tool Reasoning Prompt

**Files:**
- Modify: `src/lib/agent/prompt-builder.ts`

- [ ] **Step 1: Add reasoning instruction to tool guidance section**

Find the retrieval guidelines section (around line 493-494). After the line:
```
- Do not quote raw search results verbatim. Synthesize the information naturally
```

Add:

```
### Deliberate Reasoning
When results from a tool are unexpected, or when you're planning a multi-step chain, reason in your response before calling the next tool. Explain what you've learned so far and what you'll try next. This produces better outcomes and helps the user follow your thinking.
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | grep -i "prompt-builder" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/agent/prompt-builder.ts
git commit -m "feat: add inter-tool reasoning instruction to system prompt"
```

---

### Task 4: Verify End-to-End and Build

**Files:** None (verification only)

- [ ] **Step 1: Verify the full flow connects**

Read through the code path to confirm:
1. `planner.ts` → `generatePlan()` returns `{ stages, toolGroups, complexity }`
2. `taor-loop.ts` → captures `planComplexity` from planner race result
3. `taor-loop.ts` → `estimateComplexity()` used as fallback when planner times out
4. `taor-loop.ts` → `complexity` drives `streamConfig.thinking` budget
5. `prompt-builder.ts` → reasoning instruction encourages inter-tool text

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new type errors from our changes.

- [ ] **Step 3: Run production build**

```bash
cd /tmp/bitbit-push/personal-assistant && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Push to remote**

```bash
cd /tmp/bitbit-push
git push origin fix-clobbered-files:main
```
