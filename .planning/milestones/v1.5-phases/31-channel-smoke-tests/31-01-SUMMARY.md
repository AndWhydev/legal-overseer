---
phase: 31-channel-smoke-tests
plan: 01
subsystem: testing
tags: [vitest, smoke-tests, gmail, outlook, whatsapp, sms, telnyx, channels]

# Dependency graph
requires:
  - phase: 10-channel-infra
    provides: "Channel adapter interfaces (ChannelAdapter, ChannelMessage, health checks)"
provides:
  - "4 channel-specific smoke test files gated behind SMOKE_TEST=1"
  - "Unified smoke test runner with SmokeTestReport output"
  - "runAllSmokeTests() for cron/API invocation"
  - "runChannelSmoke() for individual channel testing"
affects: [31-02-PLAN, 31-03-PLAN, monitoring-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SMOKE_TEST=1 env gate for production verification tests", "Vitest 4 signature: it(name, { timeout }, fn)", "Promise.allSettled for parallel channel testing with per-channel error isolation"]

key-files:
  created:
    - personal-assistant/src/lib/channels/__tests__/smoke-gmail.test.ts
    - personal-assistant/src/lib/channels/__tests__/smoke-outlook.test.ts
    - personal-assistant/src/lib/channels/__tests__/smoke-whatsapp.test.ts
    - personal-assistant/src/lib/channels/__tests__/smoke-sms.test.ts
    - personal-assistant/src/lib/channels/smoke-test-runner.ts
  modified: []

key-decisions:
  - "Vitest 4 test signature: options as second arg (name, { timeout }, fn) -- third-arg options removed in Vitest 4"
  - "WhatsApp tests use native fetch to bridge HTTP endpoints rather than Supabase-based session checks"
  - "SMS normalization test runs unconditionally under SMOKE_TEST=1 as non-network baseline"
  - "Runner uses 15s per-channel timeout with withTimeout() wrapper -- never blocks on one channel"

patterns-established:
  - "SMOKE_TEST=1 env gate: all production verification tests skip unless explicitly enabled"
  - "describe.skipIf(!SMOKE) at top level for CI safety"
  - "Per-test latency logging via console.log for diagnostics"

requirements-completed: [CHAN-SMOKE-01, CHAN-SMOKE-02, CHAN-SMOKE-03, CHAN-SMOKE-04]

# Metrics
duration: 9min
completed: 2026-03-27
---

# Phase 31 Plan 01: Channel Adapter Smoke Tests Summary

**4 production smoke tests (Gmail, Outlook, WhatsApp, SMS) with unified runner producing SmokeTestReport for beta launch gating**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-27T02:24:13Z
- **Completed:** 2026-03-27T02:33:42Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- 4 channel-specific smoke test files covering all production communication channels
- All tests gate behind SMOKE_TEST=1 -- zero risk in CI without credentials
- Unified smoke test runner (runAllSmokeTests) runs all 4 channels in parallel with 15s timeouts
- Individual channel runner (runChannelSmoke) for targeted testing from API/dashboard
- All 12 tests skip cleanly without SMOKE_TEST env var (verified via vitest run)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create channel smoke test suite** - `b572e952` (test)
2. **Task 2: Create unified smoke test runner** - `5ff08dc1` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `src/lib/channels/__tests__/smoke-gmail.test.ts` - Gmail OAuth/IMAP smoke test (isAvailable, pull, health)
- `src/lib/channels/__tests__/smoke-outlook.test.ts` - Outlook Graph API smoke test (isAvailable, pull, health)
- `src/lib/channels/__tests__/smoke-whatsapp.test.ts` - WhatsApp bridge HTTP smoke test (health, status, uptime)
- `src/lib/channels/__tests__/smoke-sms.test.ts` - Telnyx SMS smoke test (API key, send, normalization)
- `src/lib/channels/smoke-test-runner.ts` - Unified runner with SmokeTestReport, per-channel timeouts

## Decisions Made
- **Vitest 4 signature:** Used `it(name, { timeout }, fn)` instead of deprecated `it(name, fn, { timeout })` -- Vitest 4 removed the third-arg options pattern
- **WhatsApp HTTP-only tests:** Used native `fetch` to bridge endpoints (`/health`, `/status`) rather than Supabase session queries -- simpler, no dependency on org credentials for basic connectivity check
- **SMS normalization baseline:** Phone number normalization test runs unconditionally when SMOKE_TEST=1 since it's a pure function with no network calls
- **Runner timeout strategy:** 15s per-channel with `withTimeout()` wrapper and `Promise.allSettled` -- one slow channel cannot block others

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Vitest 4 test signature**
- **Found during:** Task 1 (smoke test creation)
- **Issue:** Vitest 4 removed `it(name, fn, { timeout })` signature -- all 4 test files failed to parse
- **Fix:** Changed to `it(name, { timeout }, fn)` signature across all test files
- **Files modified:** All 4 smoke test files
- **Verification:** `npx vitest run` shows 4 suites, 12 tests, all skip cleanly
- **Committed in:** b572e952 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Vitest 4 API change required signature fix. No scope creep.

## Issues Encountered
None beyond the Vitest 4 signature change documented above.

## User Setup Required
None - smoke tests use existing channel credentials from env vars. No new external service configuration required.

## Next Phase Readiness
- Smoke test infrastructure ready for 31-02 (channel reconnection tests)
- Smoke test runner ready for 31-03 (monitoring dashboard integration)
- `runAllSmokeTests()` and `runChannelSmoke()` exported for API/cron consumption

## Self-Check: PASSED

- All 5 created files verified present on disk
- Task 1 commit b572e952 verified in git log
- Task 2 commit 5ff08dc1 verified in git log
- Vitest run confirms 4 suites, 12 tests, all skip without SMOKE_TEST=1
- smoke-test-runner.ts has 0 type errors (verified via project-level tsc --noEmit)

---
*Phase: 31-channel-smoke-tests*
*Completed: 2026-03-27*
