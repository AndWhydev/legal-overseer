# Self-Improvement Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the feedback loop so BitBit gets measurably better each day via per-turn quality evaluation and nightly systemic learning.
**Architecture:** Per-turn Haiku evaluator scores each TAOR run. Nightly Sleep Stage 6 analyzes aggregate quality, tracks consolidation precision, and adjusts thresholds. Both write to existing tables.
**Tech Stack:** TypeScript, Anthropic SDK (Haiku), Supabase, existing sleep consolidation pipeline.

**Design spec:** `docs/superpowers/specs/2026-04-06-self-improvement-loop-design.md`

---

## Task 1: Database Migration

**Files:** `supabase/migrations/20260406100001_quality_scores.sql`

Add quality score columns to the existing `agent_runs` table and create the `consolidation_metrics` table for tracking Stage 3 precision over time.

- [ ] 1.1 Add quality score columns to `agent_runs`:
  - `quality_tool_efficiency real` (0-1)
  - `quality_context_utilisation real` (0-1)
  - `quality_confidence_calibration real` (0-1)
  - `quality_overall real` (0-1, weighted average)
  - `quality_notes text` (optional Haiku commentary)
  - All columns nullable (NULL = not yet evaluated or low-complexity skip)

- [ ] 1.2 Create `consolidation_metrics` table:
  - `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
  - `org_id uuid NOT NULL REFERENCES organisations(id)`
  - `date date NOT NULL`
  - `stage text NOT NULL` (e.g. 'discover_relationships')
  - `precision real NOT NULL` (0-1)
  - `total_inferred integer NOT NULL DEFAULT 0`
  - `total_invalidated integer NOT NULL DEFAULT 0`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - UNIQUE constraint on `(org_id, date, stage)`

- [ ] 1.3 Enable RLS on `consolidation_metrics` with org-scoped read/write policy

---

## Task 2: Per-Turn Quality Evaluator

**Files:**
- `src/lib/agent/engine/turn-evaluator.ts` (NEW)
- `src/lib/agent/engine/taor-loop.ts` (MODIFY — fire-and-forget call)

### 2.1 Create turn-evaluator.ts (~120 lines)

- [ ] 2.1.1 Define `TurnQualityScore` interface: `tool_efficiency`, `context_utilisation`, `confidence_calibration`, `overall` (all 0-1 floats), optional `notes` string
- [ ] 2.1.2 Define `EvaluatorInput` interface: `run_id`, `message`, `tool_calls` (string[]), `plan_stages` (number), `surfaced_memory_ids` (string[]), `response_excerpt` (string), `iteration_count`, `model_used`, `complexity`
- [ ] 2.1.3 Implement `evaluateTurnQuality(input: EvaluatorInput, supabase: SupabaseClient)`:
  - Call `models.fast` via `generateText` with the scoring prompt (~200 tokens instruction + ~300 tokens data)
  - Parse JSON response, validate each score is 0.0-1.0
  - Compute `overall` as weighted average: `0.4 * tool_efficiency + 0.35 * context_utilisation + 0.25 * confidence_calibration`
  - Handle edge cases: no tool calls -> tool_efficiency defaults 1.0; empty surfacedMemoryIds -> context_utilisation NULL
  - UPDATE `agent_runs` SET quality columns WHERE id = run_id
- [ ] 2.1.4 Validate malformed Haiku responses: if any score is outside 0-1 range, discard entire evaluation (do not store partial scores)

### 2.2 Integrate in taor-loop.ts (~10 lines)

- [ ] 2.2.1 Import `evaluateTurnQuality` from `./turn-evaluator`
- [ ] 2.2.2 After `logAgentRun()` on success path (around line 620-640), add fire-and-forget call:
  - Guard: `if (runResult && complexity !== 'low')`
  - Call `evaluateTurnQuality(...)` with `.catch(() => {})` — truly fire-and-forget
  - Pass: run_id from logAgentRun result, message, tool call names, plan stage count, surfacedMemoryIds, response excerpt (500 chars), iteration count, model, complexity

---

## Task 3: Nightly Sleep Stage 6 + Adaptive Thresholds

**Files:** `src/lib/memory-palace/sleep-consolidation.ts` (MODIFY)

### 3.1 Stage 6: System Learning (~150 lines)

- [ ] 3.1.1 Add `stageSystemLearning(supabase, orgId)` function:
  - Query today's `agent_runs` with non-null `quality_overall`
  - Skip if fewer than 3 evaluated runs (return `{ skipped: true, reason: 'insufficient_data' }`)
  - Call three analysis sub-functions below
  - Write insights as `lesson_learned` memories via `MemoryPalaceService.createMemory()`

- [ ] 3.1.2 `analyzeToolEfficiency(runs)`:
  - Compute average `quality_tool_efficiency` across runs
  - If average < 0.6, produce insight about systemic tool selection issues
  - Return array of `{ content: string, confidence: number }`

- [ ] 3.1.3 `analyzeConsolidationPrecision(supabase, orgId)`:
  - Find edges created by Stage 3 yesterday (`source: 'consolidation'`, created yesterday)
  - Count how many were invalidated (valid_until set)
  - Compute precision = 1 - (invalidated / total)
  - Upsert into `consolidation_metrics` table
  - If precision < 0.6, produce insight recommending threshold raise

- [ ] 3.1.4 `analyzeModelRouting(runs)`:
  - Group runs by complexity from metadata
  - High-complexity + avg quality < 0.5 -> suggest Opus escalation
  - Medium-complexity + avg quality > 0.85 + count >= 5 -> suggest downgrade

- [ ] 3.1.5 Wire Stage 6 into `runSleepConsolidation()` after Stage 5, update report type with `systemLearningInsights` count

### 3.2 Adaptive Thresholds (~25 lines)

- [ ] 3.2.1 Add `getRelationshipDiscoveryThreshold(supabase, orgId)`:
  - Query last 7 days of `consolidation_metrics` for `discover_relationships` stage
  - Default: 0.7
  - If avg precision < 0.6 -> return min(0.7 + 0.1, 0.9)
  - If avg precision > 0.8 -> return max(0.7 - 0.1, 0.5)
  - If < 3 days of data -> return default 0.7

- [ ] 3.2.2 Use threshold in `stageDiscoverRelationships()` — replace hardcoded 0.5 confidence on new edge insertion with adaptive threshold value

---

## Task 4: Morning Briefing Enhancement

**Files:** `src/lib/memory-palace/sleep-consolidation.ts` (MODIFY)

- [ ] 4.1 Add `systemInsights` field to `MorningBriefing` interface:
  ```typescript
  systemInsights?: {
    avgToolEfficiency: number | null
    avgContextUtilisation: number | null
    consolidationPrecision: number | null
    totalEvaluatedRuns: number
    insights: string[]
  }
  ```

- [ ] 4.2 In `stageMorningBriefing()`, after lifecycle evaluation:
  - Query today's evaluated `agent_runs` for average quality scores
  - Query latest `consolidation_metrics` for precision
  - Build `systemInsights` object
  - Append to briefing

- [ ] 4.3 Ensure morning briefing context assembler already picks up the new field (it reads the full `morning_briefing` JSON from `organisations.settings`)

---

## Verification

After all tasks:
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Migration SQL is syntactically valid
- [ ] All new code is fire-and-forget where specified (non-blocking)
- [ ] Quality columns are nullable (NULL = not evaluated)
- [ ] Stage 6 appears after Stage 5 in pipeline order
- [ ] Evaluator only runs on medium/high complexity turns
