---
phase: "20"
plan: "04"
subsystem: role-engine
tags: [workflow-executor, cost-guard, activity-logger, integration-test]
dependency_graph:
  requires: [20-01, 20-02, 20-03]
  provides: [workflow-execution, per-role-cost-guards, role-activity-audit, haiku-pre-screen]
  affects: [role-runtime, role-registry]
tech_stack:
  added: []
  patterns: [atomic-step-execution, time-delayed-workflows, per-role-budgets, haiku-pre-screen]
key_files:
  created:
    - personal-assistant/src/lib/roles/workflow-executor.ts
    - personal-assistant/src/lib/roles/role-cost-guard.ts
    - personal-assistant/src/lib/roles/role-activity-logger.ts
    - personal-assistant/src/lib/roles/__tests__/role-engine.test.ts
  modified:
    - personal-assistant/src/lib/roles/role-runtime.ts
    - personal-assistant/src/lib/roles/role-registry.ts
    - personal-assistant/src/lib/roles/index.ts
decisions:
  - Workflow steps use atomic pattern: execute -> save result -> advance current_step
  - Time-delayed steps set next_step_at and return; next role tick resumes
  - Per-role cost guard queries agent_runs by role_config_id (reuses agent_runs table)
  - Haiku pre-screen checks role-specific tables (invoices, inbox_items, leads, proposals)
  - RoleImplementation gets optional getWorkflowStepDefs/getWorkflowStepDef methods
  - Activity logger exported as logRoleActivityAudit to avoid name collision with runtime helper
metrics:
  duration: "11min"
  completed: "2026-03-18"
  tasks: 5
  files: 7
---

# Phase 20 Plan 04: Workflow Executor, Cost Guards & Integration Test Summary

Durable workflow execution with per-role cost guards, Haiku pre-screen, activity logger, and 24 integration tests covering full tick lifecycle

## What Was Built

### Task 1: Workflow Executor (`workflow-executor.ts`)
- `startWorkflow`: creates DB record, executes first eligible step immediately (or schedules if delayed)
- `resumeWorkflow`: picks up from current_step when next_step_at <= now
- `cancelWorkflow`: sets status to cancelled
- `getReadyWorkflows`: fetches active workflows ready for their next step
- Atomic step execution: start -> execute -> save result -> advance
- Time-delayed steps: set next_step_at, return; next tick picks up
- Failed step: marks workflow as failed with error in role_activity
- Condition-based step skipping: steps with condition that returns false are skipped
- All steps log to role_activity with type 'workflow_step'

### Task 2: Workflow Processing in Role Tick
- `executeRoleTick` now processes active workflows after evaluation:
  - Resumes workflows with next_step_at <= now via `getReadyWorkflows`
  - Starts new workflows from `evaluation.workflowsToStart`
- Per-role cost guard integrated before evaluation (after org-level guard)

### Task 3: Per-Role Cost Guards (`role-cost-guard.ts`)
- `canRoleProceed`: checks daily budget from agent_runs for this role_config_id
- `shouldEvaluate`: Haiku pre-screen that checks for new data since last tick
  - Finance: new/updated invoices, overdue invoices
  - Comms: new inbox_items
  - Sales: new leads, updated proposals
- Fail-open pattern: cost read failures allow proceeding, pre-screen failures trigger evaluation

### Task 4: Role Activity Logger (`role-activity-logger.ts`)
- `logRoleActivity`: insert to role_activity with full audit trail (reasoning, confidence, autonomy mode, reversibility)
- `getRoleActivity`: query recent activity with type filtering and offset/limit pagination
- `getRoleActivitySummary`: count activity by type for dashboard badges

### Task 5: Integration Test (`role-engine.test.ts`)
24 tests across 9 test groups:
- Full tick lifecycle (lock -> state -> evaluate -> save -> log -> release)
- Observer mode (all actions become insights)
- Co-pilot mode (all actions queued for approval)
- Autopilot mode (delegates to confidence routing)
- Concurrent tick prevention (advisory lock skip)
- Cost guard (org-level and per-role budget checks)
- Haiku pre-screen (first tick, no changes, new data detection)
- Workflow executor (start, pause at delay, resume, fail, cancel, condition skip)
- Activity logger (log, retrieve, filter by type)
- Pre-screen skip state updates
- Version conflict handling
- Lock release on error (try/finally pattern)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Atomic step execution**: Each workflow step runs as start -> execute -> save result -> advance. No partial state possible.
2. **Time-delayed steps**: Set next_step_at on the workflow row and return. The scheduler's next tick picks it up naturally.
3. **Per-role cost guard reuses agent_runs**: Queries agent_runs where agent_config_id = role_config_id rather than a separate table.
4. **Haiku pre-screen by role type**: Finance checks invoices, comms checks inbox_items, sales checks leads/proposals. Unknown types always evaluate.
5. **Optional workflow methods on RoleImplementation**: `getWorkflowStepDefs` and `getWorkflowStepDef` are optional interface methods -- implementations that don't use workflows don't need them.
6. **Activity logger barrel export as logRoleActivityAudit**: Avoids collision with the simpler inline `logRoleActivity` in role-runtime.ts.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 61e65eec | feat(20-04): workflow executor, cost guards, activity logger, integration tests | 7 |

## Self-Check: PASSED

All 7 files verified present. Commit 61e65eec verified in git log. 24/24 tests pass.
