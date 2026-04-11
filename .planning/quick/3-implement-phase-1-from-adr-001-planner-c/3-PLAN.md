---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/lib/agent/planner.ts
  - personal-assistant/src/lib/agent/tools.ts
  - personal-assistant/src/lib/agent/engine.ts
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - "Haiku planner returns tool group selections alongside plan stages"
    - "Main agent receives only tools from selected groups (plus core) instead of all 20 tools"
    - "Trivial messages and planner timeouts fall back to all tools (no regression)"
    - "Tool groups remain stable within a conversation turn (KV cache preservation)"
  artifacts:
    - path: "personal-assistant/src/lib/agent/planner.ts"
      provides: "PlanOutput type with toolGroups field, updated prompt and JSON parsing"
      exports: ["PlanOutput", "generatePlan"]
    - path: "personal-assistant/src/lib/agent/tools.ts"
      provides: "getAgentTools accepts optional ToolGroup[] filter"
      exports: ["getAgentTools"]
    - path: "personal-assistant/src/lib/agent/engine.ts"
      provides: "Wires planner toolGroups output to filtered getAgentTools call"
  key_links:
    - from: "personal-assistant/src/lib/agent/planner.ts"
      to: "personal-assistant/src/lib/agent/engine.ts"
      via: "PlanOutput type import and generatePlan() return value"
      pattern: "plan\\.toolGroups"
    - from: "personal-assistant/src/lib/agent/engine.ts"
      to: "personal-assistant/src/lib/agent/tools.ts"
      via: "getAgentTools(plan.toolGroups) call"
      pattern: "getAgentTools\\(.*toolGroups"
---

<objective>
Implement Phase 1 from ADR-001: Planner-compiled tool group filtering.

Purpose: Reduce tool context from 20 (all) to 5-12 per session by having the Haiku planner select relevant tool groups. This preserves KV cache coherence (Manus-validated 90-95% hit rate) and reduces context tokens from ~6,000 to ~2,000-3,500. The infrastructure (ToolGroup type, TOOL_GROUPS record, TOOL_GROUP_MAP) already exists from Quick Task 1.

Output: Three modified files — planner.ts (PlanOutput type + prompt + parsing), tools.ts (group-filtered getAgentTools), engine.ts (wiring + logging + fallback).
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/docs/research/tool-architecture-decision.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From personal-assistant/src/lib/agent/tools.ts:
```typescript
export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms'
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupMeta>  // 5 groups with tools[] arrays
export const TOOL_GROUP_MAP: Record<string, ToolGroup>      // tool name -> group lookup
export function getToolsByGroup(group: ToolGroup): Anthropic.Tool[]  // existing single-group filter
export function getAgentTools(): Anthropic.Tool[]  // CURRENT: returns all tools, no filter
```

From personal-assistant/src/lib/agent/planner.ts:
```typescript
export interface PlanStage {
  id: string; label: string; sublabel?: string; icon: string; toolHint?: string
}
export function isTrivialMessage(message: string): boolean
export async function generatePlan(message: string, entityContext: string, toolNames: string[]): Promise<PlanStage[]>
```

From personal-assistant/src/lib/agent/engine.ts (relevant lines):
```typescript
import { generatePlan, stageFromToolName, isTrivialMessage, type PlanStage } from './planner'
// Line 142: const tools = getAgentTools()
// Line 143: const toolNames = tools.map(t => t.name)
// Line 155: planPromise = generatePlan(message, entityContext, toolNames).catch(() => [] as PlanStage[])
// Line 199: tools, // passed to client.messages.stream
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend planner to return PlanOutput with toolGroups + update tools.ts filter</name>
  <files>personal-assistant/src/lib/agent/planner.ts, personal-assistant/src/lib/agent/tools.ts</files>
  <action>
**planner.ts changes:**

1. Import `ToolGroup` from `./tools`.

2. Create `PlanOutput` interface and export it:
```typescript
export interface PlanOutput {
  stages: PlanStage[]
  toolGroups: ToolGroup[]
}
```

3. Change `generatePlan()` return type from `Promise<PlanStage[]>` to `Promise<PlanOutput>`.

4. Update `PLANNER_SYSTEM` prompt — append a second paragraph after the existing JSON array instructions:

```
Also select which tool groups are needed for this request.
Available groups: core (always included automatically), memory, channel, web, comms
Select 1-3 additional groups beyond core.

Output a JSON object (not array) with two fields:
- "stages": the array of stage objects as described above
- "toolGroups": array of group names (do NOT include "core" — it is always added)

Examples of toolGroups selection:
- "Send Sezer a WhatsApp" → ["channel", "comms"]
- "Search for plumbers in Sydney" → ["web"]
- "Remember that rate is $150/hr" → ["memory"]
- "Check my calendar" → ["channel"]
- "What tasks are pending?" → [] (core only)

Output ONLY the JSON object, no markdown fences or explanation.
```

IMPORTANT: Update the last line of the existing prompt ("Output ONLY the JSON array...") to match the new instruction ("Output ONLY the JSON object..."). Remove the duplicate instruction.

5. Update the JSON parsing in `generatePlan()`:
   - After `JSON.parse(cleaned)`, check if result is an object with `stages` field (new format) or an array (old format fallback).
   - If object: extract `parsed.stages` as PlanStage[] and `parsed.toolGroups` as ToolGroup[] (validate each is a valid ToolGroup from the set: core, memory, channel, web, comms — filter out invalid values).
   - If array (backward compat / Haiku sometimes ignores format): treat as stages with empty toolGroups.
   - Return `{ stages, toolGroups }` as PlanOutput.

6. Update the empty/error fallback returns: change `return []` to `return { stages: [], toolGroups: [] }`.

7. Keep `stageFromToolName` and `isTrivialMessage` unchanged.

**tools.ts changes:**

1. Change `getAgentTools()` signature to accept optional groups:
```typescript
export function getAgentTools(groups?: ToolGroup[]): Anthropic.Tool[]
```

2. Implementation: when `groups` is undefined or empty array, return all tools (backward compatible). When groups provided, build a `Set` of tool names from the selected groups PLUS always include 'core', then filter the full tool list:
```typescript
export function getAgentTools(groups?: ToolGroup[]): Anthropic.Tool[] {
  const allTools = [...toolDefinitions, ...channelToolDefinitions, ...superpowerToolDefinitions]
  if (!groups || groups.length === 0) return allTools

  const selectedGroups = new Set<ToolGroup>(['core', ...groups])
  const allowedTools = new Set<string>()
  for (const g of selectedGroups) {
    if (TOOL_GROUPS[g]) {
      for (const t of TOOL_GROUPS[g].tools) allowedTools.add(t)
    }
  }
  return allTools.filter(t => allowedTools.has(t.name))
}
```

3. Keep `getToolsByGroup()` as-is (single-group utility, still useful).
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - PlanOutput type exported from planner.ts with stages + toolGroups fields
    - generatePlan() returns PlanOutput (not bare PlanStage[])
    - Haiku prompt instructs tool group selection with examples
    - JSON parsing handles both object format (new) and array fallback (old)
    - getAgentTools() accepts optional ToolGroup[] and filters accordingly
    - getAgentTools() with no args returns all tools (backward compatible)
    - Core group always included when groups are provided
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire planner tool groups into engine.ts with logging and fallback</name>
  <files>personal-assistant/src/lib/agent/engine.ts</files>
  <action>
1. Update imports from `./planner`: add `PlanOutput` to the import. Change `type PlanStage` to be derived from PlanOutput if needed, but PlanStage is still separately exported so keep it.

2. Update imports from `./tools`: add `ToolGroup` to the import.

3. Find the section around line 142-143 where `const tools = getAgentTools()` and `const toolNames = tools.map(t => t.name)` are called. These need to become mutable (`let tools`) since they may be updated after planner resolves.

4. Change the planner call and result handling. The current flow is:
   - Line 149: `let planStages: PlanStage[] = []`
   - Line 153-155: fire `generatePlan()` as planPromise
   - Line 159-168: race window, if plan arrives set planStages

   Update to work with PlanOutput:
   - Change planPromise type to `Promise<PlanOutput> | null`
   - After the race window resolves with a PlanOutput, read BOTH `stages` and `toolGroups`
   - If toolGroups is non-empty, re-filter tools: `tools = getAgentTools(planOutput.toolGroups)` and update `toolNames`
   - Log the selection: `logger.info('[engine] Tool groups selected', { toolGroups: planOutput.toolGroups, toolCount: tools.length, totalAvailable: getAgentTools().length })`

5. Handle the late-arriving plan (lines 222-231 where planPromise is awaited after Sonnet starts streaming):
   - If the late plan arrives with toolGroups AND we haven't already filtered tools, do NOT re-filter mid-conversation (KV cache preservation). Only log that a late plan arrived with groups. The tool list is already locked for this turn.

6. Fallback behavior (critical for no regression):
   - When `isTrivialMessage(message)` is true: planPromise is never fired, tools stays as `getAgentTools()` (all tools). No change needed — this already works.
   - When planner times out or returns empty stages: tools stays as `getAgentTools()` (all tools) since toolGroups will be empty.
   - When planner returns stages but empty toolGroups (backward compat): tools stays as all tools.

7. The `tools` variable is passed to `client.messages.stream()` on line 199. Since it's now `let`, the filtered version will be used automatically.

8. Add a `toolGroupsApplied` boolean flag initialized to false. Set to true when tools are re-filtered. Use this to prevent double-filtering from late plan arrival.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - engine.ts reads plan.toolGroups from planner output
    - When toolGroups is non-empty, getAgentTools(groups) is called to filter the tool list
    - When toolGroups is empty or plan unavailable, all tools are used (backward compatible)
    - Tool group selection is logged via logger.info for observability
    - Late-arriving plans do NOT re-filter tools mid-conversation (KV cache preservation)
    - Trivial messages bypass planner entirely, use all tools (no regression)
    - TypeScript compiles without errors
    - Build succeeds: `npm run build` passes
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation: `cd personal-assistant && npx tsc --noEmit` passes with zero new errors
2. Build check: `cd personal-assistant && npm run build` succeeds
3. Grep for backward compatibility: `getAgentTools()` calls without args still work (engine.ts initial assignment, any other callers)
4. Grep for type consistency: all imports of PlanOutput and ToolGroup resolve correctly
</verification>

<success_criteria>
- generatePlan() returns PlanOutput with both stages and toolGroups
- Haiku prompt includes tool group selection instructions with examples
- getAgentTools() accepts optional ToolGroup[] filter, always includes core
- engine.ts wires planner toolGroups to filtered tool list
- Fallback to all tools when planner unavailable or returns empty groups
- No KV cache invalidation mid-conversation from late plans
- Zero TypeScript errors, build passes
</success_criteria>

<output>
After completion, create `.planning/quick/3-implement-phase-1-from-adr-001-planner-c/3-SUMMARY.md`
</output>
