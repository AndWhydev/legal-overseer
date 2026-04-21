---
phase: 46-anomaly-active-learning
plan: 02
status: complete
completed: 2026-04-17
type: tdd
commits:
  - f9d2fafa test(46-02): anomaly detector test suite (RED phase — TDD)
  - c606f3ca feat(46-02): anomaly detector with z-scores, baselines, cross-entity breaks (GREEN phase)
---

# Plan 46-02 Summary: Anomaly Detector Module (TDD)

## What Was Built

Core statistical anomaly detection module with TDD discipline (RED → GREEN). 24 tests covering ANOM-01 through ANOM-05 including the ANOM-02 user delivery path via `dispatchNotification`.

### RED Phase (commit f9d2fafa)

`personal-assistant/src/lib/brain/__tests__/anomaly-detector.test.ts` — 24 failing tests committed before implementation, organized by requirement:

- **ANOM-01 z-score** — 5 tests (sample_count gate, zero-stddev guard, negative z-score)
- **updateBaseline** — 3 tests (first value, running mean, non-zero stddev over sequence)
- **ANOM-01 extractMetrics** — 5 tests (payment_amount, payment_timing, message_frequency, empty entity skip, response_latency exclusion)
- **ANOM-03 isWithinAlertBudget** — 4 tests (within budget, at budget, error fail-closed, default max)
- **ANOM-05 generateAnomalyExplanation** — 2 tests (LLM success, LLM error fallback)
- **ANOM-02 detectAndAlertAnomalies** — 3 tests (insert + dispatch, budget-exceeded skip, top-level error)
- **ANOM-04 detectCrossEntityPatternBreaks** — 2 tests (3+ entities triggers, <3 does not)

### GREEN Phase (commit c606f3ca)

`personal-assistant/src/lib/brain/anomaly-detector.ts` — 7 exported functions + 5 tuning constants:

**Constants:** `MIN_SAMPLE_SIZE=5`, `ALERT_BUDGET_MAX=3`, `Z_SCORE_ALERT_THRESHOLD=3`, `Z_SCORE_CROSS_ENTITY_THRESHOLD=2`, `CROSS_ENTITY_MIN_COUNT=3`.

**Functions:**
- `computeZScore(value, baseline)` — uses `simple-statistics.zScore`; returns null for `sample_count < 5` or `stddev === 0`.
- `updateBaseline(baseline, newValue)` — Welford's online variance (M2 accumulator, protected against negative variance).
- `extractMetrics(entries)` — rule-based extraction from `invoice` signals (`$X,XXX` amounts, `N days late/overdue/after` timing) and `message` signals (frequency=1 per entry). Skips empty `entity_ids`. Explicit TODO comment defers `response_latency` to phase-47.
- `isWithinAlertBudget(supabase, orgId, entityId, maxAlerts?)` — sliding 24h window count via `brain_alerts` table. Fails closed on DB error (returns false).
- `generateAnomalyExplanation(metricName, value, baseline, zScore)` — calls `gateway(models.fast)` with natural-language prompt. On LLM failure returns fallback string containing metric, z-score, and baseline mean.
- `detectAndAlertAnomalies(supabase, orgId, entityId, entries)` — per-metric pipeline: load baseline → compute z → update baseline → if |z|≥3 and within budget: generate explanation, INSERT `brain_alerts`, then call `dispatchNotification(...)`. `alertsSent` only increments when both insert AND dispatch succeed.
- `detectCrossEntityPatternBreaks(supabase, orgId)` — queries last 30min of `anomaly` alerts, groups by `metric_name`, emits `pattern_break` alert + `dispatchNotification` when ≥3 distinct entities have |z|≥2 on the same metric.

## Requirements Satisfied

| REQ | Evidence |
|-----|----------|
| ANOM-01 | `computeZScore` + `updateBaseline` + `extractMetrics` — tested across 13 cases |
| ANOM-02 | `detectAndAlertAnomalies` calls `dispatchNotification(supabase, { type: 'alert_escalation', ... })` after `brain_alerts` insert — channel-agnostic per CONTEXT.md |
| ANOM-03 | `isWithinAlertBudget` enforces `ALERT_BUDGET_MAX=3` per 24h via sliding-window COUNT query |
| ANOM-04 | `detectCrossEntityPatternBreaks` — 3+ entities same metric → pattern_break alert |
| ANOM-05 | `generateAnomalyExplanation` — LLM-generated baseline comparison + fallback text including mean, z-score |

## Key Files Created

- `personal-assistant/src/lib/brain/anomaly-detector.ts` (324 lines)
- `personal-assistant/src/lib/brain/__tests__/anomaly-detector.test.ts` (503 lines, 24 tests)

## Key Links Verified

| From | To | Via | Pattern |
|------|-----|-----|---------|
| anomaly-detector.ts | simple-statistics | `import { zScore, addToMean }` | `from 'simple-statistics'` ✓ |
| anomaly-detector.ts | brain/types.ts | types import | `from './types'` ✓ |
| anomaly-detector.ts | notifications/dispatcher.ts | `dispatchNotification` | `dispatchNotification` ✓ |

## Self-Check: PASSED

- ✓ RED commit (f9d2fafa) contains `test(46-02):` prefix and all 24 tests
- ✓ GREEN commit (c606f3ca) contains `feat(46-02):` prefix and all 7 exports + 5 constants
- ✓ `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts` → 24 passed (14ms)
- ✓ `computeZScore` returns null for sample_count<5 and stddev===0
- ✓ `extractMetrics` has no LLM calls
- ✓ `detectAndAlertAnomalies` calls `dispatchNotification` after `brain_alerts` insert
- ✓ `detectCrossEntityPatternBreaks` calls `dispatchNotification` for pattern_break alerts
- ✓ `alertsSent` counter tracks delivery attempts (both insert + dispatch succeeded)
- ✓ `response_latency` has explicit TODO(phase-47) comment — not extracted
- ✓ All functions wrap in try/catch with `logger.warn` fallbacks

## Downstream Enablement

Plan 46-04 (brain consolidation wiring) can now:
- Call `detectAndAlertAnomalies` per entity inside `runBrainConsolidation`
- Call `detectCrossEntityPatternBreaks` after all entities processed
- Expect `{ anomaliesDetected, alertsSent }` return shape for consolidation reporting
