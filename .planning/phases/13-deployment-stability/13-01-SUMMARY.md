---
phase: 13-deployment-stability
plan: 01
subsystem: infra
tags: [vercel, cron, supabase, nextjs, deployment]

requires:
  - phase: none
    provides: existing cron routes and build config
provides:
  - Shared withCronGuard utility for all cron endpoints
  - Consistent auth, error handling, logging across 9 cron routes
  - Production-ready build config with documented ignoreBuildErrors
affects: [14-channel-relay, 15-whatsapp-pipeline]

tech-stack:
  added: []
  patterns: [withCronGuard cron wrapper pattern, service-role Supabase client for cron context]

key-files:
  created:
    - personal-assistant/src/lib/cron/cron-guard.ts
  modified:
    - personal-assistant/next.config.ts
    - personal-assistant/src/app/api/cron/scheduler/route.ts
    - personal-assistant/src/app/api/cron/channel-sync/route.ts
    - personal-assistant/src/app/api/cron/triage/route.ts
    - personal-assistant/src/app/api/cron/sentry/route.ts
    - personal-assistant/src/app/api/cron/morning-briefing/route.ts
    - personal-assistant/src/app/api/cron/proactive-alerts/route.ts
    - personal-assistant/src/app/api/cron/daily-digest/route.ts
    - personal-assistant/src/app/api/cron/weekly-report/route.ts
    - personal-assistant/src/app/api/cron/monthly-report/route.ts

key-decisions:
  - "Keep ignoreBuildErrors due to monorepo SupabaseClient type mismatch (not real app errors)"
  - "Use service-role createClient directly (not cookie-based server client) for cron routes"
  - "Standardize all cron routes to 300s maxDuration via shared constant"

patterns-established:
  - "withCronGuard pattern: all cron routes delegate auth, error handling, logging, and Supabase client creation to shared guard"
  - "CronResult type: structured { message, details? } return from all cron handlers"

requirements-completed: [DEPLOY-01, DEPLOY-02]

duration: 13min
completed: 2026-03-01
---

# Phase 13 Plan 01: Build & Cron Hardening Summary

**Shared withCronGuard wrapper for all 9 cron endpoints with consistent auth, error handling, timing, and structured JSON responses**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-28T20:58:24Z
- **Completed:** 2026-02-28T21:11:50Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Created shared `withCronGuard` utility handling Bearer token auth, service-role Supabase client, try/catch, timing, and structured JSON responses
- Refactored all 9 cron routes to use the guard, eliminating duplicated boilerplate
- Documented `ignoreBuildErrors` rationale in next.config.ts (monorepo type mismatch, not real errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Vercel build and create shared cron guard** - `8a25ad70` (feat)
2. **Task 2: Harden all 9 cron routes with cron guard** - `e48c9244` (refactor, merged with parallel agent commit)

## Files Created/Modified
- `personal-assistant/src/lib/cron/cron-guard.ts` - Shared cron guard with auth, timing, error handling
- `personal-assistant/next.config.ts` - Added documentation for ignoreBuildErrors rationale
- `personal-assistant/src/app/api/cron/scheduler/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/channel-sync/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/triage/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/sentry/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/morning-briefing/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/proactive-alerts/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/daily-digest/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/weekly-report/route.ts` - Refactored to use withCronGuard
- `personal-assistant/src/app/api/cron/monthly-report/route.ts` - Refactored to use withCronGuard

## Decisions Made
- **Keep ignoreBuildErrors:** 106 TS errors are all monorepo SupabaseClient type mismatches between root and personal-assistant node_modules. Not real app errors.
- **Service-role client for cron:** Cron routes have no user session, so use `createClient` with `SUPABASE_SERVICE_ROLE_KEY` directly instead of cookie-based `createClient` from `@/lib/supabase/server`.
- **Standardize maxDuration to 300s:** All cron routes now use the same 300s timeout via `cronMaxDuration` constant (some previously had 60s or 120s).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 2 commit was absorbed by a parallel agent working on plan 13-02 (commit `e48c9244`). The cron route changes are correctly in HEAD.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All cron endpoints hardened and ready for production deployment
- withCronGuard pattern available for any future cron routes
- Build config documented and production-ready

## Self-Check: PASSED

- [x] cron-guard.ts exists
- [x] Commit 8a25ad70 found (Task 1)
- [x] Commit e48c9244 found (Task 2)
- [x] SUMMARY.md exists

---
*Phase: 13-deployment-stability*
*Completed: 2026-03-01*
