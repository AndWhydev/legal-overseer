# Autonomy Feedback Loop — Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Goal:** Make the autonomy metric reflect actual agent behavior by wiring confidence scoring, outcome recording, and progressive gating into the TAOR loop.

## Problem Statement

All 198 agent runs have `confidence_score: 0` and `routing_decision: 'escalate'` because:
1. `RunLogPayload` lacks `confidence_score` and `routing_decision` fields
2. The TAOR loop never computes confidence before logging
3. `action_outcomes` table has 0 rows — the calibrator feedback loop is dead
4. The dashboard "Autonomy" metric reads approval rate from these fields → always 0%

## Design

### Component 1: Run-Level Confidence Scoring

**Location:** Computed in TAOR loop after execution, before `logAgentRun()`.

**Algorithm:** Weighted average of tool autonomy levels used in the run.

| Autonomy Level | Weight | Meaning |
|---|---|---|
| L4_silent (read-only) | 1.0 | Zero risk |
| L3_notify (reversible) | 0.85 | Low risk |
| L2_propose (outbound) | 0.65 | Medium risk |
| L1_approve (financial) | 0.45 | High risk |
| No tools used | 1.0 | Pure conversation |

Score = average of weights for all tools called in the run.
If `autonomy_enabled === false` on the org, score = 0 (hard opt-out).

Routing decision derived from score vs effective thresholds (calibrated if available, else static defaults).

**Changes to `RunLogPayload`:**
- Add `confidence_score?: number`
- Add `routing_decision?: string`

**Changes to `logAgentRun()`:**
- Include both fields in the DB insert

**Changes to TAOR loop:**
- Import `getAutonomyLevel` and `TOOL_AUTONOMY_MAP`
- After tool execution completes, compute confidence from tools used
- Import `routeByConfidence` to derive routing_decision
- Pass both to all 4 `logAgentRun()` call sites

### Component 2: Per-Tool Outcome Recording

**Location:** Inside TAOR loop, after each tool batch completes.

**For each tool result:**
- `action_type` = tool name
- `confidence_score` = autonomy level weight for that tool
- `was_approved` = true (user-initiated chat = implicit approval)
- `was_correct` = tool execution success boolean
- `agent_type` = config.agentType or 'chat'
- `threshold_source` = 'autonomy_level'

This populates `action_outcomes`. Once 50+ outcomes accumulate per agent type, `calibrateThresholds()` starts deriving data-driven thresholds.

### Component 3: Org-Level Opt-Out

**Mechanism:** `organisations.settings.autonomy_enabled` boolean (default: true).

When false:
- Confidence score always 0
- Routing decision always 'escalate'
- Outcome recording still happens (training data accumulates for when re-enabled)

Per-tool overrides already supported via existing `OrgAutonomyOverrides` in `autonomy-levels.ts`.

### Component 4: Backfill Existing Runs

One-time SQL update: set all 198 existing runs to `confidence_score: 0.85, routing_decision: 'act'` for runs with `status: 'success'` and `tool_calls > 0`. Runs with errors keep 0/escalate.

Rationale: these were successful user-initiated chat runs — the user asked, the agent delivered. They represent trust earned.

## Files Modified

| File | Change |
|---|---|
| `src/lib/agent/run-logger.ts` | Add `confidence_score`, `routing_decision` to `RunLogPayload` and insert |
| `src/lib/agent/engine/taor-loop.ts` | Compute confidence from tools used, record outcomes, pass to logger |
| `src/lib/agent/engine/tool-executor.ts` | No changes (outcomes recorded by TAOR loop from batch results) |

## Files Referenced (Read-Only)

| File | Purpose |
|---|---|
| `src/lib/intelligence/autonomy-levels.ts` | Tool → autonomy level mapping |
| `src/lib/intelligence/confidence-calibrator.ts` | `recordActionOutcome()` — already works |
| `src/lib/agent/confidence-router.ts` | `routeByConfidence()` — already works |
| `src/hooks/use-chart-data.ts` | Dashboard reads `routing_decision` — should work once data is correct |

## Success Criteria

1. New chat runs log non-zero `confidence_score` and meaningful `routing_decision`
2. `action_outcomes` table accumulates rows after tool executions
3. Dashboard "Autonomy" metric shows non-zero percentage
4. Org with `autonomy_enabled: false` always shows 0 (opt-out works)
5. Existing calibrator, router, and threshold cascade continue to work unchanged
