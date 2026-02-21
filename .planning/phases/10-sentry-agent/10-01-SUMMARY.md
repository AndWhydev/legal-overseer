---
phase: 10-sentry-agent
plan: 01
subsystem: database
tags: [sentry, scheduler, supabase, watches, vitest]
requires:
  - phase: 09-approval-flow
    provides: approval queue and scheduler baseline behavior
provides:
  - sentry_alerts persistence schema with escalation metadata
  - deterministic sentry watch evaluation runtime
  - scheduler integration to run sentry checks on due ticks
affects: [10-02, sentry-dashboard, escalation-processing]
tech-stack:
  added: [vitest]
  patterns: [supabase-client-first DI, deterministic due-watch evaluation]
key-files:
  created:
    - personal-assistant/supabase/migrations/021_sentry_alerts.sql
    - personal-assistant/src/lib/agent/sentry.ts
    - personal-assistant/src/lib/agent/sentry.test.ts
  modified:
    - personal-assistant/src/lib/agent/scheduler.ts
    - personal-assistant/src/lib/agent/scheduler.test.ts
    - personal-assistant/package.json
    - package-lock.json
key-decisions:
  - "Evaluate due watches in runtime using next_check_at first, then interval fallback from last_checked_at."
  - "Scheduler executes runSentryTick for sentry configs and records processed/triggered/alerts counts in run logs."
  - "Install vitest as a workspace devDependency to unblock plan-mandated test execution."
patterns-established:
  - "Sentry runtime pattern: evaluateWatch returns triggered/severity/summary/evidence and remediation is mapped centrally."
  - "Due-state pattern: watch updates always set last_checked_at and next_check_at after processing."
requirements-completed: [SNTR-01, SNTR-02]
duration: 8min
completed: 2026-02-21
---

# Phase 10 Plan 01: Sentry Agent Core Summary

**Sentry now runs scheduled due-watch checks for error keywords, uptime, and negative sentiment, and persists alert records with remediation guidance and escalation metadata.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-21T17:12:30Z
- **Completed:** 2026-02-21T17:20:32Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `sentry_alerts` schema with escalation lifecycle fields, indexes, trigger, and org-scoped RLS.
- Added sentry runtime exports `runSentryTick`, `evaluateWatch`, and `buildRemediationSuggestion` with three deterministic detection paths.
- Wired scheduler sentry configs to execute real sentry ticks and added targeted vitest coverage for watch evaluation and scheduler integration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Sentry alert persistence and watch due-state fields** - `bf169d9` (feat)
2. **Task 2: Implement Sentry watch evaluation and scheduler wiring** - `3386020` (feat)

## Files Created/Modified
- `personal-assistant/supabase/migrations/021_sentry_alerts.sql` - Adds alert persistence, watch escalation fields, indexes, trigger, and RLS.
- `personal-assistant/src/lib/agent/sentry.ts` - Implements due-watch evaluation, detection rules, remediation mapping, and alert insertion.
- `personal-assistant/src/lib/agent/sentry.test.ts` - Covers due-watch selection and each required watch type trigger/non-trigger behavior.
- `personal-assistant/src/lib/agent/scheduler.ts` - Calls `runSentryTick` for due sentry configs and logs execution summary.
- `personal-assistant/src/lib/agent/scheduler.test.ts` - Verifies sentry path is called and non-sentry behavior remains intact.
- `personal-assistant/package.json` - Adds `vitest` devDependency for local test execution.
- `package-lock.json` - Locks dependency graph updates for vitest install.

## Decisions Made
- Use `next_check_at` as primary due signal and interval-based fallback to keep scheduler behavior deterministic even before first next-check write.
- Keep sentry detection dependency-free by implementing keyword and pattern matching directly over queried channel messages.
- Keep scheduler never-throw behavior while still executing real sentry work and preserving existing non-sentry run logging flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing Vitest dependency required by plan verification**
- **Found during:** Task 2 (verification command execution)
- **Issue:** `npx vitest` failed to load local config because `vitest/config` was not installed in workspace dependencies.
- **Fix:** Installed `vitest` in `personal-assistant` workspace and re-ran plan-specified tests.
- **Files modified:** `personal-assistant/package.json`, `package-lock.json`
- **Verification:** `npx vitest run src/lib/agent/sentry.test.ts src/lib/agent/scheduler.test.ts` (passes)
- **Committed in:** `3386020`

**2. [Rule 1 - Bug] Normalized cron test datetime parsing to avoid timezone-dependent failure**
- **Found during:** Task 2 (test run after scheduler test updates)
- **Issue:** Existing cron tests used `Z` timestamps while scheduler cron matcher evaluates local `Date` fields, causing false negatives in some local timezones.
- **Fix:** Switched scheduler cron test inputs to local datetime strings for deterministic expectations.
- **Files modified:** `personal-assistant/src/lib/agent/scheduler.test.ts`
- **Verification:** `npx vitest run src/lib/agent/sentry.test.ts src/lib/agent/scheduler.test.ts` (passes)
- **Committed in:** `3386020`

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** Both fixes were required to complete verification and keep behavior deterministic; no scope creep beyond plan goals.

## Issues Encountered
- `npx supabase db lint` could not run because local Docker daemon is unavailable (`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Detection and persistence foundation is in place for escalation/API/dashboard work in `10-02`.
- Remaining environment concern: migration lint requires a running local Supabase/Docker stack.

---
*Phase: 10-sentry-agent*
*Completed: 2026-02-21*

## Self-Check: PASSED

- FOUND: `.planning/phases/10-sentry-agent/10-01-SUMMARY.md`
- FOUND: `bf169d9`
- FOUND: `3386020`
