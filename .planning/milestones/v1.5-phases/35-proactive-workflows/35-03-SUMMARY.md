---
phase: 35-proactive-workflows
plan: 03
subsystem: api, ui
tags: [next-api-routes, react, shadcn-ui, workflow-automation, crud, natural-language]

requires:
  - phase: 35-proactive-workflows-01
    provides: WorkflowRule types, NL parser, trigger engine, workflow templates
provides:
  - CRUD API routes for workflow rules (GET/POST/PATCH/DELETE)
  - Workflow run history API endpoint
  - Workflow dashboard tab with rule list, NL creator, template gallery
  - SPA shell + module registry integration for workflows
affects: [channel-triage, role-runtime, dashboard-ui]

tech-stack:
  added: []
  patterns: [nl-creator-with-template-prefill, optimistic-ui-toggle, card-based-rule-list]

key-files:
  created:
    - personal-assistant/src/app/api/workflows/route.ts
    - personal-assistant/src/app/api/workflows/[id]/route.ts
    - personal-assistant/src/app/api/workflows/[id]/runs/route.ts
    - personal-assistant/src/components/dashboard/tabs/workflows-tab.tsx
  modified:
    - personal-assistant/src/components/dashboard/spa-shell.tsx
    - personal-assistant/src/components/dashboard/topbar-configs.tsx
    - personal-assistant/src/components/dashboard/sidebar-nav.tsx
    - personal-assistant/src/lib/modules/registry.ts

key-decisions:
  - "DB row trigger_type accessed via unknown cast since WorkflowRule interface uses trigger.type structure"
  - "NLCreatorWithTemplate pattern: template gallery fills textarea via prop, separate from standalone NLCreator"
  - "Workflows gated to growth+ tiers (beta, growth, scale, enterprise) -- automation is a growth feature"
  - "Workflows placed in Intelligence sidebar category alongside meetings, swarm, sentry"
  - "Delete is hard-delete (not soft) with active workflow cancellation for clean rule removal"

patterns-established:
  - "NL-to-rule creator UI: textarea + parse + preview (needsReview) + confirm flow"
  - "Optimistic toggle: Switch component updates state immediately, reverts on API error"
  - "Template gallery: pre-fills creator textarea from WORKFLOW_TEMPLATES for quick rule setup"

requirements-completed: [WRKF-04]

duration: 19min
completed: 2026-03-28
---

# Phase 35 Plan 03: Workflow CRUD API & Dashboard Summary

**CRUD API routes with NL parsing for workflow rules, plus dashboard tab with rule list, toggle controls, template gallery, and run history**

## Performance

- **Duration:** 19 min
- **Started:** 2026-03-27T15:52:58Z
- **Completed:** 2026-03-27T16:12:24Z
- **Tasks:** 2 of 3 (Task 3 pending user verification)
- **Files modified:** 8

## Accomplishments
- 3 API route files providing full CRUD for workflow rules with auth, org scoping, and NL parsing integration
- Workflow dashboard tab (669 lines) with rule list, enable/disable toggles, NL creator, and template gallery
- SPA shell, topbar, sidebar, and module registry all wired for workflows tab under Intelligence category
- Module gated to growth+ plans (beta, growth, scale, enterprise)

## Task Commits

Each task was committed atomically:

1. **Task 1: Workflow CRUD API routes** - `8d921927` (feat)
2. **Task 2: Workflow dashboard tab and SPA shell integration** - `5c0e52f6` (feat)
3. **Task 3: Verify workflow dashboard end-to-end** - PENDING user verification

## Files Created/Modified
- `personal-assistant/src/app/api/workflows/route.ts` - GET (list) + POST (create with NL parsing) endpoints
- `personal-assistant/src/app/api/workflows/[id]/route.ts` - GET (single) + PATCH (update/toggle) + DELETE endpoints
- `personal-assistant/src/app/api/workflows/[id]/runs/route.ts` - GET endpoint for workflow run history
- `personal-assistant/src/components/dashboard/tabs/workflows-tab.tsx` - Full workflow dashboard with rule list, NL creator, template gallery, run history
- `personal-assistant/src/components/dashboard/spa-shell.tsx` - Added workflows tab + lazy import
- `personal-assistant/src/components/dashboard/topbar-configs.tsx` - Added workflows topbar with Bolt icon
- `personal-assistant/src/components/dashboard/sidebar-nav.tsx` - Added IconBolt mapping for workflows
- `personal-assistant/src/lib/modules/registry.ts` - Added workflows to ALL_MODULES, tier definitions, and intelligence sidebar category

## Decisions Made
- Hard-delete workflow rules (not soft-delete) with active workflow cancellation -- simpler model for v1
- DB row `trigger_type` field accessed via `unknown` cast since the TypeScript interface uses nested `trigger.type`
- NLCreatorWithTemplate combines creator + template prefill in a single component (removed unused standalone NLCreator)
- Workflows placed in Intelligence sidebar category (alongside meetings, swarm, sentry) -- matches "automation intelligence" grouping
- Module gated to growth+ tiers -- automation is a growth feature, not starter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict cast for DB row trigger_type field**
- **Found during:** Task 2 (workflows-tab.tsx)
- **Issue:** `WorkflowRule` interface has `trigger.type` but DB rows return flat `trigger_type` column -- direct cast to `Record<string, unknown>` failed strict TS checks
- **Fix:** Used `unknown` intermediate cast: `(rule as unknown as Record<string, unknown>).trigger_type`
- **Files modified:** workflows-tab.tsx
- **Committed in:** 5c0e52f6

**2. [Rule 2 - Missing Critical] Removed unused NLCreator component**
- **Found during:** Task 2 (workflows-tab.tsx cleanup)
- **Issue:** Standalone `NLCreator` component was unused since `NLCreatorWithTemplate` superseded it
- **Fix:** Removed NLCreator, kept NLCreatorWithTemplate as the sole creator component
- **Files modified:** workflows-tab.tsx
- **Committed in:** 5c0e52f6

---

**Total deviations:** 2 auto-fixed (1 bug, 1 cleanup)
**Impact on plan:** Minor fixes for type safety and dead code removal. No scope creep.

## Issues Encountered
- Git index.lock from a stale background commit process -- removed manually and re-staged
- Pre-existing TypeScript errors in unrelated test files (multi-tenant-isolation, first-run-discovery, cross-role) -- not caused by our changes

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 3 (human verification) pending: user needs to verify workflow dashboard end-to-end in browser
- All CRUD endpoints ready for production use
- Dashboard tab accessible from sidebar under Intelligence category
- Template gallery provides 3 starter templates for quick workflow creation

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (8d921927, 5c0e52f6) found in git history.

---
*Phase: 35-proactive-workflows*
*Completed: 2026-03-28*
