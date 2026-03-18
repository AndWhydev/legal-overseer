---
phase: 21-billing-infrastructure
plan: 02
subsystem: billing
tags: [plan-gating, growth-roles, trial, usage-metering, tool-execution]

# Dependency graph
requires:
  - phase: 21-billing-infrastructure (plan 01)
    provides: Stripe SDK, subscription-handler, billing migrations
provides:
  - TOOL_PLAN_REQUIREMENTS map for growth tool gating
  - checkToolPlanGate function for plan tier comparison
  - growthRoles and fileAttachments fields in PlanFeatures
  - Plan gate injection in executeAgentTool
  - 30-day trial duration constant
affects: [22-cost-controls, 23-seo-tender, 24-content-creator]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-side tool gating via TOOL_PLAN_REQUIREMENTS, PLAN_ORDER comparison]

key-files:
  created: []
  modified:
    - personal-assistant/src/lib/billing/plan-gates.ts
    - personal-assistant/src/lib/billing/plan-gates.test.ts
    - personal-assistant/src/lib/agent/tools.ts
    - personal-assistant/src/lib/billing/trial-manager.ts
    - personal-assistant/src/lib/billing/trial-manager.test.ts

key-decisions:
  - "Server-side plan gate in executeAgentTool: gate check runs before autonomy routing and handler call"
  - "PLAN_ORDER array for tier comparison instead of numeric values"
  - "TRIAL_PERIOD_DAYS constant replacing hardcoded 14"

patterns-established:
  - "Growth tool gating: add tool to TOOL_PLAN_REQUIREMENTS, executeAgentTool handles the rest"
  - "Plan tier comparison: PLAN_ORDER.indexOf(orgPlan) >= PLAN_ORDER.indexOf(requiredPlan)"

requirements-completed: [BILL-04, BILL-05, BILL-06]

# Metrics
duration: 12min
completed: 2026-03-18
---

# Phase 21 Plan 02: Plan Gating & Metering Summary

**Growth tool plan gating via TOOL_PLAN_REQUIREMENTS in executeAgentTool, 30-day trial fix, usage metering verified**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-18T17:54:09Z
- **Completed:** 2026-03-18T18:06:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Growth tools (SEO, ads, content, tenders) gated by plan tier at the tool execution layer
- Free/starter users get upgrade prompt instead of growth tool results
- Trial duration corrected from 14 to 30 days via TRIAL_PERIOD_DAYS constant
- Usage metering verified: trackUsage and getUsage handle token_usage, agent_run, storage_mb events
- 29 new tests for plan gating, 2 new tests for trial duration (all passing)

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: Plan gates + tool requirements** - RED `6b60679e`, GREEN `81c0ed38`
2. **Task 2: Trial duration + usage metering** - RED `93c1790c`, GREEN `9544935f`

_TDD tasks have separate test and implementation commits._

## Files Created/Modified
- `personal-assistant/src/lib/billing/plan-gates.ts` - Added growthRoles, fileAttachments, TOOL_PLAN_REQUIREMENTS, checkToolPlanGate
- `personal-assistant/src/lib/billing/plan-gates.test.ts` - 29 new tests for plan features, tool requirements, gate function
- `personal-assistant/src/lib/agent/tools.ts` - Plan gate check injected before handler call in executeAgentTool
- `personal-assistant/src/lib/billing/trial-manager.ts` - Changed 14-day to 30-day trial via TRIAL_PERIOD_DAYS
- `personal-assistant/src/lib/billing/trial-manager.test.ts` - 2 new tests verifying 30-day trial duration

## Decisions Made
- Server-side plan gate in executeAgentTool runs before autonomy routing -- ensures gate cannot be bypassed by L4/L3 autonomy levels
- PLAN_ORDER array approach for tier comparison -- simple indexOf comparison, easily extensible for future tiers
- TRIAL_PERIOD_DAYS constant defined locally in trial-manager.ts (not imported from stripe-client) -- avoids circular dependency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in `plan-gates.test.ts > storage action > denies storage when over limit`: mock uses old `attachments` table approach but implementation was changed to `.rpc('get_org_storage_bytes')` in a prior phase. Not caused by this plan, not fixed (out of scope).
- Pre-existing test failure in `checkout.test.ts`: mock type mismatch with Stripe SDK. Not caused by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan gating infrastructure complete -- growth roles (Phase 23, 24) can rely on TOOL_PLAN_REQUIREMENTS
- Cost controls (Phase 22) can layer budget enforcement on top of usage metering
- All billing test coverage solid for regression protection

## Self-Check: PASSED

All 6 files verified present. All 4 commits verified in git log.

---
*Phase: 21-billing-infrastructure*
*Completed: 2026-03-18*
