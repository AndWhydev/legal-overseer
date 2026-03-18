---
phase: "20"
plan: "03"
subsystem: roles
tags: [autonomy, gate, approval, routing, api]
dependency_graph:
  requires: [20-01, 20-02]
  provides: [autonomy-gate, action-dispatcher, output-formatter, autonomy-api]
  affects: [approval-queue, role-activity]
tech_stack:
  added: []
  patterns: [autonomy-gate-pattern, gate-decision-routing, autonomy-output-formatting]
key_files:
  created:
    - personal-assistant/src/lib/roles/autonomy-gate.ts
    - personal-assistant/src/lib/roles/action-dispatcher.ts
    - personal-assistant/src/lib/roles/output-formatter.ts
    - personal-assistant/src/app/api/roles/[roleType]/autonomy/route.ts
    - personal-assistant/supabase/migrations/093_approval_queue_role_columns.sql
  modified:
    - personal-assistant/src/lib/agent/approval-queue.ts
    - personal-assistant/src/lib/roles/index.ts
decisions:
  - Observer mode logs insight only, never creates approval or executes
  - Co-pilot mode always queues for approval regardless of confidence score
  - Autopilot delegates to existing confidence routing (act/ask/escalate cascade)
  - Approval records include role_config_id and autonomy_mode for audit trail
  - API PATCH takes immediate effect — next tick uses new autonomy level
metrics:
  duration: 5min
  completed: 2026-03-18
---

# Phase 20 Plan 03: Autonomy Gate & Approval Integration Summary

Autonomy gate layer between role evaluation and action execution, routing Observer/Co-pilot/Autopilot with existing confidence routing integration and approval queue extension.

## What Was Built

### 1. Autonomy Gate (`autonomy-gate.ts`)
- `routeThroughAutonomyGate()` — pure function that routes actions based on autonomy level
- Observer -> always `log_insight` (never acts, never queues)
- Co-pilot -> always `queue_approval` (regardless of confidence)
- Autopilot -> delegates to `routeAgentAction()` from confidence-router.ts
  - act -> `execute`, ask -> `queue_approval`, escalate -> `escalate`
- Returns `GateResult` with decision, reasoning, autonomy level, and optional confidence routing details

### 2. Action Dispatcher (`action-dispatcher.ts`)
- `dispatchRoleAction()` — async function that gates then dispatches
- Calls `routeThroughAutonomyGate()` first, then based on decision:
  - `execute`: logs to role_activity, returns execution placeholder
  - `queue_approval`: calls `createApproval()` with role context in context_snapshot
  - `log_insight`: formats via output-formatter, logs to role_activity
  - `escalate`: logs escalation to role_activity
- `dispatchRoleActions()` — batch convenience for multiple actions
- Every dispatch always logs to role_activity with full reasoning chain

### 3. Output Formatter (`output-formatter.ts`)
- `formatActivityForAutonomy()` — produces level-specific summaries
- Observer: "Noticed: X. Suggested action: Y"
- Co-pilot: "Recommends: X (N% confidence). Approval needed."
- Autopilot: "Executed: X (N% confidence)" or "Queued for approval" or "Escalated"

### 4. Approval Queue Extension
- Added `role_config_id` and `autonomy_mode` to `CreateApprovalParams`
- Insert conditionally includes role fields when present (backward compatible)
- Migration 093 adds columns to approval_queue table

### 5. Autonomy Level API
- `GET /api/roles/[roleType]/autonomy` — returns current level, enabled state
- `PATCH /api/roles/[roleType]/autonomy` — updates level immediately
- Follows existing route pattern (auth, org scoping, validation)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| All | `7a66855b` | feat(20-03): autonomy gate + approval integration |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] Observer mode: always returns `log_insight`, never creates approval or executes
- [x] Co-pilot mode: always returns `queue_approval` regardless of confidence
- [x] Autopilot mode: delegates to confidence routing (act->execute, ask->queue, escalate->escalate)
- [x] API route validates role types and autonomy levels
- [x] Every action logs to role_activity with reasoning chain
- [x] Approval records include role_config_id and autonomy_mode
- [x] Output formatting differs per autonomy level
- [x] TypeScript compiles with zero errors
