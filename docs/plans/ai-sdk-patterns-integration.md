# AI SDK Patterns Integration Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Integrate Vercel AI SDK patterns from aisdkagents.com into BitBit, replacing raw Anthropic SDK usage with standardised AI SDK patterns across 6 phases.

**Architecture:** Incremental migration from raw `@anthropic-ai/sdk` to Vercel AI SDK (`ai` package v6+). Start with zero-risk UI component activation, progress through background call migrations, then tackle the core chat engine last. Each phase is independently shippable.

**Tech Stack:** Next.js 16, React 19, Vercel AI SDK v6, @ai-sdk/anthropic, Supabase, TypeScript, shadcn/ui

**Branch:** `feat/ai-sdk-patterns-integration`
**Working dir:** `~/bitbit/personal-assistant`
**Pattern source:** `~/aisdkagents-patterns/`

---

## Track A: Install Dependencies & Provider Setup

### Task A1: Install @ai-sdk/anthropic provider

**Objective:** Add the Anthropic provider for AI SDK so generateText/streamText can use Claude models.

**Files:**
- Modify: `personal-assistant/package.json`

**Steps:**
1. Run: `cd ~/bitbit/personal-assistant && npm install @ai-sdk/anthropic@latest`
2. Verify: `node -e "require('@ai-sdk/anthropic');"` — should not error
3. Commit: `git add package.json package-lock.json && git commit -m "deps: add @ai-sdk/anthropic provider"`

### Task A2: Create AI SDK provider config

**Objective:** Create a shared provider configuration file that all AI SDK calls will import.

**Files:**
- Create: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/index.ts`

**src/lib/ai/provider.ts:**
```typescript
import { createAnthropic } from '@ai-sdk/anthropic'

// Shared Anthropic provider — uses ANTHROPIC_API_KEY from env
export const anthropic = createAnthropic({})

// Model shortcuts matching existing model-registry.ts
export const models = {
  fast: anthropic('claude-haiku-4-5-20250414'),
  balanced: anthropic('claude-sonnet-4-5-20250514'),
  heavy: anthropic('claude-opus-4-20250514'),
} as const
```

**src/lib/ai/index.ts:**
```typescript
export { anthropic, models } from './provider'
```

**Steps:**
1. Create the files above
2. Verify TypeScript compiles: `cd ~/bitbit/personal-assistant && npx tsc --noEmit src/lib/ai/provider.ts 2>&1 | head -5`
3. Commit: `git add src/lib/ai/ && git commit -m "feat: add AI SDK Anthropic provider config"`

---

## Track B: Activate Unused AI Element Components

### Task B1: Wire up Reasoning component

**Objective:** Replace the ~200-line inline reasoning chain in chat-interface.tsx with the pre-built ai-elements/reasoning.tsx component.

**Files:**
- Modify: `src/components/chat/chat-interface.tsx` — remove inline reasoning JSX, import Reasoning from ai-elements
- Reference: `src/components/ai-elements/reasoning.tsx` (already exists, unused)

**Steps:**
1. Read the existing Reasoning component API from `src/components/ai-elements/reasoning.tsx`
2. In chat-interface.tsx, find the reasoning chain rendering section (look for `thinkingContent` state and the JSX that renders it)
3. Replace the inline reasoning JSX with `<Reasoning>` compound component
4. Test: Run dev server, send a message that triggers extended thinking, verify reasoning chain displays correctly
5. Commit: `git add -A && git commit -m "refactor: use Reasoning AI element in chat interface"`

### Task B2: Wire up Plan component

**Objective:** Replace ThoughtPipeline with the pre-built Plan component. Currently plan/plan_stage_update events are received but the plan data is discarded in the SSE parser.

**Files:**
- Modify: `src/components/chat/chat-interface.tsx` — handle plan events, render Plan component
- Reference: `src/components/ai-elements/plan.tsx` (already exists, unused)
- Modify: `src/components/chat/thought-pipeline.tsx` — may be partially replaced

**Steps:**
1. Read Plan component API from `src/components/ai-elements/plan.tsx`
2. In the SSE event parser in chat-interface.tsx, find the `case 'plan':` and `case 'plan_stage_update':` handlers
3. Store plan data in state instead of discarding it
4. Render `<Plan>` component with the plan stages
5. Test: Verify plan stages display during complex agent operations
6. Commit: `git add -A && git commit -m "feat: show execution plans via Plan AI element"`

### Task B3: Wire up Confirmation component for approvals

**Objective:** Unify the inline approval card in chat with the proper Confirmation compound component that already exists and already imports from the 'ai' package.

**Files:**
- Modify: `src/components/chat/chat-interface.tsx` — replace InlineApprovalCard with Confirmation
- Reference: `src/components/ai-elements/confirmation.tsx` (already exists, unused)

**Steps:**
1. Read Confirmation component API from `src/components/ai-elements/confirmation.tsx`
2. Find InlineApprovalCard in chat-interface.tsx
3. Replace with Confirmation compound component, mapping the existing approval state (approvalId, tool name, summary) to Confirmation props
4. Preserve the PATCH /api/agent/approvals call for resolve/reject
5. Test: Trigger an action that requires approval, verify the confirmation UI works
6. Commit: `git add -A && git commit -m "refactor: use Confirmation AI element for approvals"`

### Task B4: Replace FollowUpChips with Suggestion component

**Objective:** Use the pre-built Suggestion component instead of custom FollowUpChips.

**Files:**
- Modify: `src/components/chat/chat-interface.tsx` — swap FollowUpChips for Suggestion
- Reference: `src/components/ai-elements/suggestion.tsx` (already exists, unused)
- May deprecate: `src/components/chat/follow-up-chips.tsx`

**Steps:**
1. Read Suggestion component from `src/components/ai-elements/suggestion.tsx`
2. Replace FollowUpChips usage with Suggestion component, mapping followUp strings
3. Test: Verify suggestions appear after agent responses
4. Commit: `git add -A && git commit -m "refactor: use Suggestion AI element for follow-ups"`

---

## Track C: Background AI Call Migrations (generateText/generateObject)

These are all independent — each file uses `new Anthropic()` and `client.messages.create()` which gets replaced with `generateText()` or `generateObject()` from the AI SDK.

### Task C1: Migrate api/ai/text/route.ts to streamText

**Objective:** Simplest streaming migration. Replace raw Anthropic streaming with AI SDK streamText.

**Files:**
- Modify: `src/app/api/ai/text/route.ts`

**Pattern reference:** `~/aisdkagents-patterns/basics-stream-text/`

**Steps:**
1. Read the current route implementation
2. Replace `new Anthropic()` + `client.messages.stream()` with:
   ```typescript
   import { streamText } from 'ai'
   import { models } from '@/lib/ai'
   const result = streamText({ model: models.balanced, prompt: userMessage })
   return result.toDataStreamResponse()
   ```
3. Test: Hit the endpoint, verify streaming works
4. Commit: `git add -A && git commit -m "refactor: migrate ai/text route to AI SDK streamText"`

### Task C2: Migrate agent/classifier.ts to generateObject

**Objective:** Replace raw Anthropic call with type-safe structured output using generateObject + Zod.

**Files:**
- Modify: `src/lib/agent/classifier.ts`

**Pattern reference:** `~/aisdkagents-patterns/basics-generate-object-claude/`

**Steps:**
1. Read current classifier implementation
2. Define Zod schema for classification output (purpose, confidence, signals)
3. Replace `new Anthropic()` + `client.messages.create()` with:
   ```typescript
   import { generateObject } from 'ai'
   import { z } from 'zod'
   import { models } from '@/lib/ai'
   const { object } = await generateObject({
     model: models.fast,
     schema: z.object({ purpose: z.enum([...]), confidence: z.number(), signals: z.array(z.string()) }),
     prompt: classificationPrompt,
   })
   ```
4. Test: Verify classification still works correctly
5. Commit: `git add -A && git commit -m "refactor: migrate classifier to AI SDK generateObject"`

### Task C3: Migrate agent/planner.ts to generateObject

**Files:** `src/lib/agent/planner.ts`
**Same pattern as C2** but for plan generation with a plan schema.

### Task C4: Migrate agent/sentiment.ts to generateObject

**Files:** `src/lib/agent/sentiment.ts`
**Same pattern as C2** but for sentiment analysis.

### Task C5: Migrate memory/memory-consolidator.ts to generateObject

**Files:** `src/lib/memory/memory-consolidator.ts`
**Replace Anthropic call with generateObject for entity/fact extraction.**

### Task C6: Migrate memory/conversation-compressor.ts to generateText

**Files:** `src/lib/memory/conversation-compressor.ts`
**Replace Anthropic call with generateText for summary generation.**

### Task C7: Migrate intelligence/reflexion.ts to generateText

**Files:** `src/lib/intelligence/reflexion.ts`
**Replace Anthropic call with generateText for self-reflection.**
**Pattern reference:** `~/aisdkagents-patterns/ai-chat-agent-evaluator-optimizer-pattern/`

### Task C8: Migrate intelligence/ingest-enrichment.ts to generateObject

**Files:** `src/lib/intelligence/ingest-enrichment.ts`
**Pattern reference:** `~/aisdkagents-patterns/ai-sdk-enrich-form/`

### Task C9: Migrate workflows/workflow-rule-parser.ts to generateObject

**Files:** `src/lib/workflows/workflow-rule-parser.ts`
**Replace NL->rule parsing with generateObject and Zod schema for workflow rules.**

### Task C10: Migrate swarm/coordinator.ts to generateText

**Files:** `src/lib/swarm/coordinator.ts`
**Replace 3 separate Anthropic calls with generateText.**

### Task C11: Migrate meetings/ai-extraction.ts to generateObject

**Files:** `src/lib/meetings/ai-extraction.ts`

### Task C12: Migrate agent/ad-script-gen.ts to generateText

**Files:** `src/lib/agent/ad-script-gen.ts`

### Task C13: Migrate agent/daily-digest.ts to generateText

**Files:** `src/lib/agent/daily-digest.ts`

### Task C14: Migrate creator-studio/generation.ts to streamText

**Files:** `src/lib/creator-studio/generation.ts`

### Task C15: Migrate onboarding/opus-synthesis.ts to generateText

**Files:** `src/lib/onboarding/opus-synthesis.ts`
**Uses Claude Opus with extended thinking — use models.heavy with thinking enabled.**

---

## Track D: Tool API Pattern Integration

### Task D1: Add Tool API Context pattern

**Objective:** Inject tenant/org context into every tool call automatically instead of manual per-tool context passing.

**Files:**
- Create: `src/lib/agent/engine/tool-context.ts`
- Modify: `src/lib/agent/engine/tool-executor.ts`

**Pattern reference:** `~/aisdkagents-patterns/tool-api-context/`

### Task D2: Add Tool Call Repair pattern

**Objective:** Auto-repair malformed tool calls from LLM instead of failing hard.

**Files:**
- Create: `src/lib/agent/engine/tool-repair.ts`
- Modify: `src/lib/agent/engine/tool-executor.ts`

**Pattern reference:** `~/aisdkagents-patterns/tool-api-tool-call-repair/`

---

## Track E: Workflow Pattern Upgrades (WDK)

### Task E1: Port Sequential Workflow pattern

**Files:**
- Create: `src/lib/workflows/patterns/sequential.ts`
- Reference: `~/aisdkagents-patterns/wdk-workflows-sequential-worfklow/`

### Task E2: Port Parallel Workflow pattern

**Files:**
- Create: `src/lib/workflows/patterns/parallel.ts`
- Reference: `~/aisdkagents-patterns/wdk-workflows-parallel-worfklow/`

### Task E3: Port Routing Workflow pattern

**Files:**
- Create: `src/lib/workflows/patterns/routing.ts`
- Reference: `~/aisdkagents-patterns/wdk-workflows-routing-worfklow/`

### Task E4: Port Evaluator Workflow pattern

**Files:**
- Create: `src/lib/workflows/patterns/evaluator.ts`
- Reference: `~/aisdkagents-patterns/wdk-workflows-evaluator-workflow/`

### Task E5: Port Orchestrator Workflow pattern

**Files:**
- Create: `src/lib/workflows/patterns/orchestrator.ts`
- Reference: `~/aisdkagents-patterns/wdk-workflows-orchestrator-worfklow/`

---

## Track F: Core Chat Engine Migration (Phase 4 — Do Last)

### Task F1: Create AI SDK chat route (parallel to existing)

**Objective:** Build a new chat API route using AI SDK streamText alongside the existing one, switchable via feature flag.

**Files:**
- Create: `src/app/api/agent/chat-v2/route.ts`
- Create: `src/lib/agent/engine/ai-sdk-engine.ts`

### Task F2: Migrate chat frontend to useChat

**Objective:** Create a v2 chat interface using useChat hook, running alongside existing.

**Files:**
- Create: `src/components/chat/chat-interface-v2.tsx`

**This is the highest-risk task and should only be attempted after Tracks A-E are complete and stable.**

---

## Execution Strategy

**Parallel Tracks:**
- Track A (deps): Must complete first, ~30 min
- Track B (UI elements): Independent, can run in parallel after A
- Track C (background migrations): Independent per task, can run 3+ in parallel after A
- Track D (tool patterns): Independent after A
- Track E (workflows): Independent after A
- Track F (core chat): Only after B+C+D are proven stable

**Agent Assignment:**
- Claude Code agents: Tracks B, C (code-heavy refactoring with full codebase context)
- Codex agents: Tracks D, E (new file creation, pattern porting)
- Review agents: Code review after each track completes
