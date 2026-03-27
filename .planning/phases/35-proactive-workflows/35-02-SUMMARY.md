---
phase: 35-proactive-workflows
plan: 02
subsystem: workflows
tags: [cross-role-tools, budget-guard, channel-triage, role-runtime, workflow-triggers, vitest]

requires:
  - phase: 35-proactive-workflows-01
    provides: WorkflowRule types, trigger evaluation engine, event/schedule matching
provides:
  - WorkflowToolBridge for cross-role tool resolution and execution with org-level budget guard
  - executeWorkflowStep with condition evaluation and on_failure strategies (skip/abort/retry)
  - ruleToWorkflowDefinition converting user-defined rules to executor-compatible definitions
  - Event trigger evaluation in channel triage after standing order processing
  - Scheduled trigger evaluation in role runtime with automatic workflow starting
affects: [35-03-PLAN, channel-triage, role-runtime, workflow-executor]

tech-stack:
  added: []
  patterns: [cross-role-tool-bridge, try-catch-non-critical-integration, workflow-rule-to-definition-conversion]

key-files:
  created:
    - personal-assistant/src/lib/workflows/workflow-tool-bridge.ts
    - personal-assistant/src/lib/workflows/__tests__/cross-role.test.ts
  modified:
    - personal-assistant/src/lib/agent/channel-triage.ts
    - personal-assistant/src/lib/roles/role-runtime.ts

key-decisions:
  - "WorkflowToolBridge uses TOOL_GROUPS registry for tool resolution -- no separate tool map needed"
  - "Org-level canProceed used for budget guard (not per-role) since workflows are cross-role"
  - "Event triggers in channel triage only evaluate and record matches; workflow starting deferred to role tick"
  - "Both triage and role-runtime integrations wrapped in try/catch for zero crash risk on workflow failures"

patterns-established:
  - "Cross-role tool bridge: resolve tool by group+name from TOOL_GROUPS, check org budget, execute via executeAgentTool"
  - "Non-critical integration: wrap workflow evaluation in try/catch so host function (triage/tick) always completes"
  - "Rule-to-definition conversion: WorkflowRule.actions -> WorkflowStepDef[] with closures over bridge.executeTool"

requirements-completed: [WRKF-02, WRKF-03]

duration: 15min
completed: 2026-03-28
---

# Phase 35 Plan 02: Trigger Wiring & Cross-Role Tool Bridge Summary

**Cross-role workflow tool bridge with org-level budget guard, event triggers in channel triage, scheduled triggers in role runtime**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T15:52:31Z
- **Completed:** 2026-03-27T16:07:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- WorkflowToolBridge resolves tools from any of 11 tool groups and executes with org-level budget guard via canProceed
- executeWorkflowStep handles conditional execution (step dependency), and on_failure strategies: skip returns success, abort propagates error, retry attempts once
- ruleToWorkflowDefinition converts DB-stored WorkflowRule into executor-compatible WorkflowDefinition with closure-based step execution
- Channel triage evaluates event triggers after standing order processing (section 4c), non-critical with try/catch
- Role runtime evaluates scheduled triggers and starts workflows for matched rules (section 11), non-critical with try/catch
- 40 tests passing across all 3 workflow test files (15 cross-role + 18 trigger-engine + 7 rule-parser)

## Task Commits

Each task was committed atomically:

1. **Task 1: Cross-role workflow tool bridge with budget guard** - `8a2e8d54` (feat, TDD)
2. **Task 2: Wire triggers into channel triage and role runtime** - `0c5fa431` (feat)

## Files Created/Modified
- `personal-assistant/src/lib/workflows/workflow-tool-bridge.ts` - WorkflowToolBridge factory, executeWorkflowStep, ruleToWorkflowDefinition
- `personal-assistant/src/lib/workflows/__tests__/cross-role.test.ts` - 15 tests: resolution, budget guard, failure handling, rule conversion
- `personal-assistant/src/lib/agent/channel-triage.ts` - Added evaluateEventTriggers call after standing orders (section 4c)
- `personal-assistant/src/lib/roles/role-runtime.ts` - Added evaluateScheduledTriggers + workflow starting (section 11)

## Decisions Made
- WorkflowToolBridge uses the existing TOOL_GROUPS registry for tool resolution rather than building a separate tool map -- simpler, stays in sync automatically
- Org-level canProceed used for budget guard (not per-role canRoleProceed) since workflows are cross-role and should check the org-wide daily budget
- Event triggers in channel triage only evaluate and record matches (update trigger stats); actual workflow starting is deferred to role tick for budget control and simplicity
- Both triage and role-runtime integrations are wrapped in try/catch so workflow failures never break the host functions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated test files (multi-tenant-isolation.test.ts, first-run-discovery.test.ts) -- not caused by our changes, not addressed
- Git commit via background bash commands failed silently; switched to foreground commits

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workflow tool bridge ready for Plan 03 (dashboard UI) to invoke when users create/test workflows
- Channel triage and role runtime fully wired -- new workflow rules created via API or dashboard will automatically trigger
- Workflow templates from Plan 01 can now be converted to WorkflowDefinitions and executed via the bridge

## Self-Check: PASSED

All 2 created files verified on disk. Both task commits (8a2e8d54, 0c5fa431) found in git history.

---
*Phase: 35-proactive-workflows*
*Completed: 2026-03-28*
