---
phase: quick-5
plan: 01
subsystem: testing
tags: [smoke-tests, e2e, playwright, brave-search, stripe, telnyx, resend, meta-whatsapp, agent-tools]

# Dependency graph
requires:
  - phase: quick-4
    provides: Beta blocker fixes ensuring production stability
provides:
  - Extended channel smoke test script with 12 tests (7 existing + 5 credential verifications)
  - Onboarding E2E test script with 6 route verification tests
  - browse_website agent superpower tool with Playwright headless browser
affects: [agent-tools, channel-verification, onboarding]

# Tech tracking
tech-stack:
  added: [playwright (dynamic import)]
  patterns: [credential-smoke-test, headless-browser-tool, e2e-route-verification]

key-files:
  created:
    - scripts/onboarding-e2e-test.ts
    - scripts/onboarding-e2e-results.json
  modified:
    - scripts/channel-smoke-test.ts
    - scripts/smoke-test-results.json
    - personal-assistant/src/lib/agent/tools/superpower-tools.ts
    - personal-assistant/src/lib/agent/tools.ts

key-decisions:
  - "Dynamic import for Playwright — tool gracefully degrades when Playwright not installed"
  - "Token refresh cron test: try GET first, fallback to POST on 405 (Vercel cron routes use GET)"
  - "Onboarding route is /onboard not /onboarding, OAuth callback is /callback/google not /api/auth/callback/google"
  - "browse_website returns full base64 screenshot_base64 field (caller decides truncation)"

patterns-established:
  - "Credential smoke test pattern: read env var, SKIP if not set, call lightweight read-only API, PASS/FAIL based on status"
  - "E2E route verification: accept 400/401/403/307 as valid (route exists), only fail on 404/500"

requirements-completed: [T011, T010, T027]

# Metrics
duration: 13min
completed: 2026-03-11
---

# Quick Task 5: Channel Smoke Tests, Onboarding E2E, and browse_website Tool Summary

**12-test channel credential verification, 6-test onboarding E2E script, and Playwright-powered browse_website agent tool**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-11T12:22:48Z
- **Completed:** 2026-03-11T12:36:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Expanded channel smoke tests from 7 to 12 tests: Stripe, Telnyx, Resend, Meta WhatsApp, and Brave Search credential verification via real API calls
- Created standalone onboarding E2E verification script testing all 6 key routes (/onboard, /api/onboarding, /api/onboarding/first-value, /api/auth/e2e/onboarding, skip affordance, /callback/google)
- Added browse_website agent superpower tool with Playwright headless browser, JS rendering, optional CSS selector wait, and screenshot capture

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand channel smoke tests** - `8728a43a` (feat)
2. **Task 2: Create onboarding E2E verification script** - `b38254be` (feat)
3. **Task 3: Add browse_website agent superpower tool** - `781252fc` (feat)

## Files Created/Modified
- `scripts/channel-smoke-test.ts` - Added 5 real API credential tests (Stripe, Telnyx, Resend, Meta, Brave) + fixed token refresh test
- `scripts/smoke-test-results.json` - Updated JSON report with 12 test results
- `scripts/onboarding-e2e-test.ts` - New E2E script testing 6 onboarding routes
- `scripts/onboarding-e2e-results.json` - New JSON report for onboarding tests
- `personal-assistant/src/lib/agent/tools/superpower-tools.ts` - Added browse_website tool definition and handler
- `personal-assistant/src/lib/agent/tools.ts` - Added browse_website to TOOL_GROUPS.web and JIT_INSTRUCTIONS

## Decisions Made
- Dynamic import for Playwright in browse_website handler: tool returns a clear error message when Playwright is not installed rather than crashing, allowing the same codebase to work in environments with and without Playwright
- Token refresh cron test fixed to try GET first (Vercel cron convention) with POST fallback on 405
- Corrected onboarding route paths to match actual Next.js app structure: /onboard (not /onboarding), /callback/google (not /api/auth/callback/google)
- browse_website returns screenshot_base64 as full base64 string, letting the caller (engine) decide on truncation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected onboarding route paths in E2E tests**
- **Found during:** Task 2 (Onboarding E2E verification script)
- **Issue:** Plan specified /onboarding and /api/auth/callback/google but actual Next.js routes are /(auth)/onboard and /callback/[provider]
- **Fix:** Updated test URLs to /onboard and /callback/google respectively
- **Files modified:** scripts/onboarding-e2e-test.ts
- **Verification:** All 6 tests pass (5 PASS, 1 SKIP)
- **Committed in:** b38254be (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Route path correction necessary for tests to be meaningful. No scope creep.

## Issues Encountered
- Git lock file from background commit tasks required manual removal before commits could proceed
- Pre-existing test failures (stage-progress expects "2/4" but gets "2/5", SMS webhook signature) are unrelated to this task and not addressed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Channel smoke tests ready for CI integration (exit code 0/1)
- Onboarding E2E tests can be added to deployment verification pipeline
- browse_website tool available to all agents via 'web' tool group
- Playwright dependency optional -- tool works without it installed

## Self-Check: PASSED

All 6 files verified present. All 3 task commits verified in git log.

---
*Phase: quick-5*
*Completed: 2026-03-11*
