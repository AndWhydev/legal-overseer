---
phase: Q11
plan: 01
subsystem: intelligence
tags: [confidence, calibration, thresholds, approval, auto-trust, cron]

requires:
  - phase: 16-confidence-routing
    provides: routeAgentAction, AGENT_THRESHOLDS, confidence router infrastructure
  - phase: 09-approval-flow
    provides: approval_queue table, resolveApproval, approval handler

provides:
  - action_outcomes table for tracking agent action results
  - calibrateThresholds() for computing optimal confidence thresholds from outcome data
  - recordActionOutcome() for logging approve/reject/auto-act events
  - Calibration cron (daily) for automatic threshold recalibration
  - GET /api/confidence/calibration for trust dashboard

affects: [confidence-routing, approval-queue, agent-engine, trust-dashboard]

tech-stack:
  added: []
  patterns: [confidence-band-analysis, safety-rails, fire-and-forget-outcome-tracking]

key-files:
  created:
    - personal-assistant/src/lib/intelligence/confidence-calibrator.ts
    - personal-assistant/src/lib/intelligence/__tests__/confidence-calibrator.test.ts
    - personal-assistant/src/app/api/cron/calibrate-confidence/route.ts
    - personal-assistant/src/app/api/confidence/calibration/route.ts
    - personal-assistant/supabase/migrations/064_action_outcomes.sql
  modified:
    - personal-assistant/src/lib/agent/confidence-router.ts
    - personal-assistant/src/lib/agent/approval-queue.ts
    - personal-assistant/src/lib/agent/tools.ts

key-decisions:
  - "Calibrated thresholds stored in agent_configs.calibrated_thresholds JSONB — no new table needed"
  - "routeAgentAction remains synchronous; calibrated thresholds passed in by caller (no async lookup inside router)"
  - "Outcome tracking is fire-and-forget (async IIFE) to never block approval resolution"
  - "Safety rails: act >= 0.70, ask >= 0.45, min 20 samples/band, min 50 total samples before calibrated thresholds activate"
  - "5 confidence bands (0.50-0.60 through 0.90-1.00) with act requiring 95% approval rate and ask requiring 70%"

patterns-established:
  - "Fire-and-forget outcome tracking: async IIFE with try/catch for non-blocking side effects"
  - "Confidence band analysis: bucket outcomes into bands, compute per-band approval rates"
  - "Threshold source tracking: every routing result records which cascade level was used"

requirements-completed: []

duration: 15min
completed: 2026-03-12
---

# Quick Task 11: v2.0 Confidence Auto-Calibration Summary

**Dynamic confidence threshold calibration from user approve/reject patterns, with 5-band analysis, safety rails, daily cron, and trust dashboard API**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-11T17:51:08Z
- **Completed:** 2026-03-11T18:06:26Z
- **Tasks:** 7
- **Files modified:** 9

## Accomplishments
- Action outcomes tracking system that records every approve/reject/auto-act decision
- Calibration engine that analyzes 30 days of outcomes across 5 confidence bands to derive optimal thresholds
- Safety rails preventing thresholds from dropping dangerously low (act >= 0.70, ask >= 0.45)
- Extended confidence router cascade: calibrated > agent_config > agent_type > org > defaults
- Daily calibration cron using withCronGuard pattern
- Outcome tracking wired into both manual approval (resolveApproval) and auto-execute (tools.ts)
- 12 unit tests covering band stats, threshold derivation, safety rails, and edge cases

## Task Commits

All tasks committed atomically in one commit (parallel agent merged staging area):

1. **All tasks (migration, calibrator, router integration, cron, wiring, API, tests)** - `4c225460` (feat)

## Files Created/Modified
- `personal-assistant/supabase/migrations/064_action_outcomes.sql` - action_outcomes table + calibrated_thresholds column on agent_configs
- `personal-assistant/src/lib/intelligence/confidence-calibrator.ts` - Core calibration engine: recordActionOutcome, calibrateThresholds, calculateBandStats, deriveThresholds, getCalibratedThresholds, getCalibrationStatus
- `personal-assistant/src/lib/intelligence/__tests__/confidence-calibrator.test.ts` - 12 unit tests for calibration logic
- `personal-assistant/src/lib/agent/confidence-router.ts` - Added calibrated thresholds as highest-priority cascade level, added thresholdSource tracking
- `personal-assistant/src/lib/agent/approval-queue.ts` - Wired recordActionOutcome into resolveApproval (fire-and-forget)
- `personal-assistant/src/lib/agent/tools.ts` - Wired recordActionOutcome for auto-executed actions
- `personal-assistant/src/app/api/cron/calibrate-confidence/route.ts` - Daily cron endpoint for threshold recalibration
- `personal-assistant/src/app/api/confidence/calibration/route.ts` - GET endpoint for trust dashboard

## Decisions Made
- **Calibrated thresholds in agent_configs JSONB** - Avoided new table; JSONB column stores {act, ask, escalate, sampleSize, lastCalibrated} per agent config
- **Synchronous router, async lookup** - routeAgentAction stays synchronous; callers are responsible for async calibrated threshold lookups before calling
- **Fire-and-forget outcome tracking** - Wrapped in async IIFE with try/catch to never block approval resolution or tool execution
- **Conservative safety rails** - act floor of 0.70 and ask floor of 0.45 prevent dangerous auto-execution even with high approval rates
- **Band-based analysis** - 5 bands (0.50-0.60 through 0.90-1.00) require 20+ samples each before influencing thresholds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PromiseLike type error in approval-queue.ts**
- **Found during:** Task 5 (wire approve/reject)
- **Issue:** Supabase `.then()` returns `PromiseLike` not full `Promise`, so `.catch()` was not available
- **Fix:** Replaced `.then().catch()` chain with async IIFE wrapping `await` + try/catch
- **Files modified:** personal-assistant/src/lib/agent/approval-queue.ts
- **Verification:** `npx tsc --noEmit` passes clean

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial type fix, no scope change.

## Issues Encountered
- Parallel agent (Q9/Q10) ran a background commit that swept in my staged files alongside its own. My code changes are in commit `4c225460` but alongside unrelated Q9 files. All 9 files are correctly committed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Calibration system is ready for production
- Trust dashboard can consume GET /api/confidence/calibration
- Daily cron needs to be registered in Vercel cron config (vercel.json) when deploying

---
*Quick Task: Q11*
*Completed: 2026-03-12*

## Self-Check: PASSED
