---
phase: 22-cost-controls-ad-script-generator
plan: 01
subsystem: billing
tags: [cost-guard, token-budget, rate-limiting, growth-roles, usage-metering]

requires:
  - phase: 21-billing-infrastructure
    provides: "usage_events table, trackUsage function, plan gating, TOOL_PLAN_REQUIREMENTS"
provides:
  - "Per-role token budget config (ROLE_BUDGET_CONFIG) for ads/seo/content/tenders"
  - "checkRoleBudget function for daily token limit enforcement"
  - "getExecutionTokenCap function for per-execution token caps"
  - "getRoleUsageToday function for per-role daily usage queries"
  - "Engine budget enforcement: pre-tool role check + per-execution cap"
  - "budget_blocked, budget_warning, execution_cap_hit events"
affects: [22-02-ad-script-generator, 23-seo-monitor-tender-hunter, 24-content-creator]

tech-stack:
  added: []
  patterns: ["per-role token budget with warning/block thresholds", "execution-scoped token cap with convergence hint", "tool-role mapping for budget category resolution"]

key-files:
  created: []
  modified:
    - "personal-assistant/src/lib/agent/cost-guard.ts"
    - "personal-assistant/src/lib/agent/cost-guard.test.ts"
    - "personal-assistant/src/lib/agent/engine.ts"
    - "personal-assistant/src/lib/billing/usage-metering.ts"
    - "personal-assistant/src/lib/agent/run-logger.ts"

key-decisions:
  - "TOOL_ROLE_MAP as static constant in engine.ts, not derived from TOOL_PLAN_REQUIREMENTS, for explicit control over budget categories"
  - "Budget-blocked tools return synthetic error results rather than halting the entire engine, so the agent can inform the user gracefully"
  - "Execution cap injects convergence hint message rather than force-stopping, letting the agent produce a useful summary"
  - "Role metadata stored on usage_events via optional trackUsage parameter for backward compatibility"

patterns-established:
  - "Per-role budget check: TOOL_ROLE_MAP lookup -> checkRoleBudget -> yield warning/block event"
  - "Execution token cap: cumulative tracking -> cap comparison -> convergence hint injection"

requirements-completed: [COST-01, COST-02, COST-03]

duration: 15min
completed: 2026-03-18
---

# Phase 22 Plan 01: Cost Controls Summary

**Per-role token budget enforcement with daily limits (80% warning / 100% block) and per-execution caps for growth workloads**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-18T19:04:32Z
- **Completed:** 2026-03-18T19:19:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ROLE_BUDGET_CONFIG defines per-role token budgets for ads (50K/500K), seo (30K/300K), content (80K/800K), tenders (60K/600K)
- checkRoleBudget returns warning at 80% and blocks at 100% daily budget
- Engine halts growth tool execution when daily role budget exhausted, with budget_blocked event
- Engine tracks cumulative execution tokens and injects convergence hint when per-execution cap exceeded
- trackUsage extended with optional role parameter for per-role usage_events tracking
- 28 tests pass (12 existing canProceed + 16 new role budget tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-role budget config and query functions** (TDD)
   - `addefeb0` (test: add failing tests for per-role budget enforcement)
   - `8cbc2165` (feat: per-role budget config and query functions)
2. **Task 2: Wire budget enforcement into engine** - `620c729c` (feat)

## Files Created/Modified
- `personal-assistant/src/lib/agent/cost-guard.ts` - Added ROLE_BUDGET_CONFIG, RoleBudgetResult, checkRoleBudget, getExecutionTokenCap, imported getRoleUsageToday
- `personal-assistant/src/lib/agent/cost-guard.test.ts` - Added 16 tests for role budget config, checkRoleBudget, getExecutionTokenCap
- `personal-assistant/src/lib/billing/usage-metering.ts` - Added getRoleUsageToday, extended trackUsage with optional role param
- `personal-assistant/src/lib/agent/engine.ts` - Added TOOL_ROLE_MAP, budget_blocked/warning/execution_cap_hit events, per-role budget check before tool execution, execution token cap enforcement
- `personal-assistant/src/lib/agent/run-logger.ts` - Added role to RunLogPayload, passed through to trackUsage

## Decisions Made
- TOOL_ROLE_MAP as static constant rather than derived from TOOL_PLAN_REQUIREMENTS -- explicit control over which tools map to which budget categories
- Budget-blocked tools return synthetic error results instead of halting the entire engine -- allows the agent to inform the user gracefully
- Execution cap injects convergence hint rather than force-stopping -- lets the agent produce a useful summary with available info
- Role metadata stored on usage_events via optional trackUsage parameter -- backward compatible with existing callers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Cost controls active -- growth roles can now be safely exposed to users
- TOOL_ROLE_MAP ready to accept new growth tools as they're implemented in 22-02, 23-xx, 24-xx
- budget_blocked/budget_warning/execution_cap_hit events ready for frontend consumption

## Self-Check: PASSED

All 6 files verified present. All 3 commits verified in git history.

---
*Phase: 22-cost-controls-ad-script-generator*
*Plan: 01*
*Completed: 2026-03-18*
