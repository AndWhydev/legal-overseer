---
phase: 29-seo-tender-scheduled-monitoring
plan: 01
subsystem: roles
tags: [role-system, seo, tender, scheduled-monitoring, vitest]

# Dependency graph
requires:
  - phase: 23-seo-monitor-tender-hunter
    provides: SEO visibility audit (runVisibilityAudit, detectVisibilityChanges) and Tender Hunter (runTenderHunterTick, filterTenders) tool implementations
  - phase: 27-role-runtime-fix
    provides: Role registry, runtime, scheduler, cost guard, and side-effect registration pattern
provides:
  - Growth role implementation registered via side-effect import
  - SEO monitor wrapper producing RoleAction[] and RoleInsight[] from visibility audits
  - Tender monitor wrapper producing RoleAction[] from high-fit tender matches
  - DB migration extending role_type ENUM with 'growth'
affects: [role-dashboard, cron-system, settings-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [sub-interval gating within role tick, pure-function change detection to avoid double-notify]

key-files:
  created:
    - personal-assistant/src/lib/roles/growth/growth-role.ts
    - personal-assistant/src/lib/roles/growth/seo-monitor.ts
    - personal-assistant/src/lib/roles/growth/tender-monitor.ts
    - personal-assistant/src/lib/roles/growth/__tests__/growth-role.test.ts
    - personal-assistant/supabase/migrations/149_role_type_growth.sql
  modified:
    - personal-assistant/src/lib/bitbit-core/types.ts
    - personal-assistant/src/lib/roles/role-init.ts
    - personal-assistant/src/app/api/cron/role-tick/route.ts
    - personal-assistant/src/lib/roles/index.ts
    - personal-assistant/src/lib/roles/__tests__/role-registration.test.ts

key-decisions:
  - "Uses detectVisibilityChanges (pure function) not checkVisibilityChanges (notification side-effect) to prevent double-notify"
  - "Single growth role wraps both SEO and tender monitoring with independent sub-interval gating"
  - "Sub-intervals read from config JSONB, default 24h, checked before each sub-task"

patterns-established:
  - "Sub-interval gating: role tick fires hourly, sub-tasks only run when their interval elapses (via hasIntervalElapsed helper)"
  - "Config-driven feature flags: seo_enabled/tender_enabled in role_configs.config JSONB"

requirements-completed: [SEO-03, SEO-04, TNDR-03, TNDR-04]

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 29 Plan 01: SEO/Tender Scheduled Monitoring Summary

**Growth role wiring SEO visibility audits and Tender Hunter scans into role-tick cron with 24h sub-interval gating and 17 unit tests**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T05:15:49Z
- **Completed:** 2026-03-27T05:31:09Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Growth role registered and discoverable via getRole('growth') through side-effect import
- SEO monitor wraps runVisibilityAudit + detectVisibilityChanges, surfaces ranking drops as RoleAction with diagnosis and recommendations
- Tender monitor wraps runTenderHunterTick + filterTenders, surfaces high-fit (>= 50) matches as RoleAction with qualification
- hasChanges() correctly gates on configurable sub-intervals (default 24h for both SEO and tender)
- No double notifications (uses pure detectVisibilityChanges, not checkVisibilityChanges)
- All 88 role tests pass across 6 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + TypeScript type extension + role-init defaults** - `5bfa6c09` (feat - pre-existing, included in prior landing page commit)
2. **Task 2: Growth role TDD - failing tests** - `54ee0fc8` (test)
3. **Task 2: Growth role TDD - implementation** - `40fdbdac` (feat)
4. **Task 3: Integration wiring + registration test extension** - `e606992c` (feat)

_Task 2 followed TDD: RED (failing tests) then GREEN (implementation)._

## Files Created/Modified
- `personal-assistant/src/lib/roles/growth/growth-role.ts` - RoleImplementation with evaluate(), hasChanges(), defaultConfig(), GrowthState/GrowthConfig interfaces
- `personal-assistant/src/lib/roles/growth/seo-monitor.ts` - SEO audit wrapper producing RoleAction[] (ranking drops) and RoleInsight[] (score alerts)
- `personal-assistant/src/lib/roles/growth/tender-monitor.ts` - Tender scan wrapper producing RoleAction[] (high-fit matches) and RoleInsight[] (scan summaries)
- `personal-assistant/src/lib/roles/growth/__tests__/growth-role.test.ts` - 17 unit tests covering all evaluate/hasChanges/registration paths
- `personal-assistant/supabase/migrations/149_role_type_growth.sql` - ALTER TYPE role_type ADD VALUE 'growth'
- `personal-assistant/src/lib/bitbit-core/types.ts` - RoleType union extended with 'growth'
- `personal-assistant/src/lib/roles/role-init.ts` - ROLE_DEFAULTS growth entry (3600s tick, $2/day, copilot)
- `personal-assistant/src/app/api/cron/role-tick/route.ts` - Growth role side-effect import for cron registration
- `personal-assistant/src/lib/roles/index.ts` - Growth role barrel import
- `personal-assistant/src/lib/roles/__tests__/role-registration.test.ts` - Growth role registration test, count assertion updated to 4

## Decisions Made
- Uses `detectVisibilityChanges` (pure function) instead of `checkVisibilityChanges` (has notification side effect) to prevent double-notify through the role system
- Single growth role wraps both SEO and tender monitoring with independent sub-interval gating rather than two separate role types
- Sub-intervals read from `role_configs.config` JSONB with 24h defaults, checked before each sub-task using `hasIntervalElapsed()` helper
- Critical SEO drops (severity === 'critical') dispatch alert_escalation notification via dispatchNotification for immediate user awareness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing updated_at in test mock RoleState**
- **Found during:** Task 3 (TypeScript compilation check)
- **Issue:** RoleState interface requires `updated_at: string` but test mock omitted it
- **Fix:** Added `updated_at: new Date().toISOString()` to mock context factory
- **Files modified:** personal-assistant/src/lib/roles/growth/__tests__/growth-role.test.ts
- **Verification:** TypeScript compiles cleanly for growth files
- **Committed in:** e606992c (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal. TypeScript strictness caught a missing required field in test mock. No scope creep.

## Issues Encountered
- Task 1 files were already committed in a prior commit (5bfa6c09) as part of a landing page batch. No re-work needed.
- Pre-existing TypeScript errors in chat-interface.tsx and multi-tenant-isolation.test.ts (40 errors) -- unrelated to growth role, not in scope.
- Pre-existing test failures in 10 unrelated test files (invoice-pdf, theme, etc.) -- not in scope per deviation rules.

## User Setup Required
None - no external service configuration required. Growth role auto-registers on cron tick. Org-level enablement happens via `initializeRole()` or settings page.

## Next Phase Readiness
- Growth role is fully wired and tested
- SEO and Tender monitoring will execute on the next role-tick cron cycle for orgs with growth role_configs enabled
- Orgs need growth role initialized via settings page or `initializeRole(supabase, orgId, 'growth')` to begin receiving scheduled monitoring

## Self-Check: PASSED

All 5 created files verified on disk. All 3 task commits (54ee0fc8, 40fdbdac, e606992c) found in git history.

---
*Phase: 29-seo-tender-scheduled-monitoring*
*Completed: 2026-03-27*
