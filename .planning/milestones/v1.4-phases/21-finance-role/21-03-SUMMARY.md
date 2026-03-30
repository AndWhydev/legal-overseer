---
phase: 21-finance-role
plan: 03
subsystem: finance
tags: [cash-flow, payment-patterns, weekly-digest, bi-snapshots, supabase, typescript]

# Dependency graph
requires:
  - phase: 21-finance-role
    provides: finance role foundation, invoice wrapper, proactive invoicing, collection workflows
  - phase: 20-role-engine-foundation
    provides: role registry, role runtime, bi_snapshots table, workflow executor
provides:
  - Cash flow monitoring with bi_snapshots caching (24h TTL)
  - Per-client payment pattern learning (avg/median days, on-time rate)
  - Payment date prediction from historical patterns
  - Unusual payment delay detection
  - Weekly financial digest (Monday AEST)
  - Cash flow alerts surfaced through role autonomy gate
affects: [22-comms-role, dashboard, weekly-briefing]

# Tech tracking
tech-stack:
  added: []
  patterns: [bi_snapshots caching with upsert, AEST timezone scheduling, median-based prediction]

key-files:
  created:
    - personal-assistant/src/lib/roles/finance/cash-flow-monitor.ts
    - personal-assistant/src/lib/roles/finance/payment-learner.ts
    - personal-assistant/src/lib/roles/finance/weekly-digest.ts
    - personal-assistant/src/lib/roles/finance/__tests__/finance-role.test.ts
  modified:
    - personal-assistant/src/lib/roles/finance/finance-role.ts
    - personal-assistant/src/lib/roles/finance/index.ts

key-decisions:
  - "Cash flow cached in bi_snapshots with 24h TTL; overdue threshold $5000 for high-severity alerts"
  - "Payment prediction uses median (not mean) for robustness against outliers; confidence scales 0.2-0.85 by sample size"
  - "Unusual delay threshold: 50% over median or 7 days over, whichever is larger; requires 2+ invoices"
  - "Weekly digest on Monday only using AEST (UTC+10); guarded by 6-day cooldown"
  - "Cash flow alerts route through autonomy gate: high-severity as actions, medium/low as insights"
  - "Payment patterns stored in role state (known_payment_patterns) and refreshed weekly"

patterns-established:
  - "bi_snapshots upsert pattern: onConflict org_id,metric_type for cached analytics"
  - "AEST day-of-week detection: shift UTC by +10h then check getUTCDay()"
  - "Tiered evaluate() sections: daily (cash flow) vs weekly (patterns) vs Monday-only (digest)"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-03-18
---

# Phase 21 Plan 03: Cash Flow Monitoring + Payment Learning + Weekly Digest Summary

**Cash flow monitoring with bi_snapshots caching, per-client payment pattern learning with median-based prediction, and Monday-only weekly financial digest in AEST**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-18T16:24:27Z
- **Completed:** 2026-03-18T16:35:00Z
- **Tasks:** 5
- **Files modified:** 6

## Accomplishments
- Cash flow monitor computes incoming/outgoing/pending/overdue from invoices table with alert generation
- Payment learner analyzes historical paid invoices to learn per-client payment speed patterns
- Unusual delay detection flags contacts paying slower than their historical median
- Weekly digest generates comprehensive financial summary with insights and action items
- Finance role evaluate() integrates all three: daily cash flow, weekly patterns, Monday digest

## Task Commits

All tasks were committed together (prior execution already had these staged):

1. **Task 1: Cash Flow Monitor** - `cae76ad7` (feat)
2. **Task 2: Payment Pattern Learning** - `cae76ad7` (feat)
3. **Task 3: Weekly Financial Digest** - `cae76ad7` (feat)
4. **Task 4: Finance Role Integration** - `cae76ad7` (feat)
5. **Task 5: Finance Role Tests** - `cae76ad7` (test)

## Files Created/Modified
- `personal-assistant/src/lib/roles/finance/cash-flow-monitor.ts` - Cash flow computation, alert generation, bi_snapshots caching
- `personal-assistant/src/lib/roles/finance/payment-learner.ts` - Historical pattern analysis, payment date prediction, unusual delay detection
- `personal-assistant/src/lib/roles/finance/weekly-digest.ts` - Weekly financial summary with insights and action items
- `personal-assistant/src/lib/roles/finance/finance-role.ts` - Integrated cash flow, patterns, and digest into evaluate()
- `personal-assistant/src/lib/roles/finance/index.ts` - Re-exports for new modules
- `personal-assistant/src/lib/roles/finance/__tests__/finance-role.test.ts` - 11 tests covering all new functionality

## Decisions Made
- Cash flow uses bi_snapshots with 24h TTL to avoid recomputation on every tick
- Payment prediction uses median rather than mean for robustness against outlier payments
- Confidence scales by sample size: 0.2 (no data) to 0.85 (10+ invoices)
- Unusual delay threshold is 50% over median or 7 days over (whichever is larger), needs 2+ invoices
- Weekly digest uses AEST timezone (UTC+10) for Monday detection, with 6-day cooldown guard
- Cash flow alerts at high severity become RoleActions (routed through autonomy gate), medium/low become RoleInsights
- FinanceState extended with last_cash_flow_check_at, last_payment_pattern_update_at, last_weekly_digest_at

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Finance role is feature-complete: invoicing, collections, cash flow, payment learning, weekly digest
- Ready for Phase 22 (Comms Role) or any dependent phase
- Weekly digest can be wired to email/WhatsApp delivery channels when those roles are built

---
*Phase: 21-finance-role*
*Completed: 2026-03-18*
