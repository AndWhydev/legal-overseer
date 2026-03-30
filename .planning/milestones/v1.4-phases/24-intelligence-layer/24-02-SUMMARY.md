---
phase: intelligence-layer
plan: 02
subsystem: intelligence
tags: [cash-flow-prophet, capacity-oracle, forecasting, workload, bi-snapshots]

# Dependency graph
requires:
  - phase: intelligence-layer
    provides: "bi_snapshots caching pattern from 24-01"
  - phase: core
    provides: "Supabase client, logger, invoices/projects/tasks/proposals tables"
provides:
  - "projectCashFlow(supabase, orgId, months) -> CashFlowProphetResult"
  - "assessCapacity(supabase, orgId) -> CapacityAssessment"
  - "CashFlowProjection, CashFlowProphetResult, CashFlowProphetAlert, ProjectionSource interfaces"
  - "CapacityAssessment, CapacityAlert, CapacitySuggestion, DeadlineInfo interfaces"
affects: [finance-role, bi_snapshots]

# Tech tracking
tech-stack:
  added: []
  patterns: [forward-projection, utilization-modeling, alert-generation, deadline-clustering]

key-files:
  created:
    - "personal-assistant/src/lib/intelligence/cash-flow-prophet.ts"
    - "personal-assistant/src/lib/intelligence/capacity-oracle.ts"
  modified:
    - "personal-assistant/src/lib/intelligence/__tests__/intelligence.test.ts"

key-decisions:
  - "Cash Flow Prophet requires MIN_PAID_INVOICES=3; uses 12h cache TTL (shorter than 24h for revenue/health)"
  - "Capacity Oracle requires MIN_ACTIVE_ITEMS=1; uses 6h cache TTL (shortest -- workload changes frequently)"
  - "Cash flow projections combine 4 sources: historical avg, pipeline (sent invoices), overdue recovery (50% rate), proposals (40% acceptance probability)"
  - "Confidence decay for projections: max(0.2, 0.85 - (monthIndex-1) * 0.2)"
  - "4 cash flow alert types: shortfall, surplus, declining_trend, overdue_risk with severity levels"
  - "Declining trend detection: 3-month lookback, flags >20% decline"
  - "Capacity utilization model: projects=20% each, tasks=5% each, capped at 150%"
  - "4 capacity status levels: under (<30%), optimal (30-80%), heavy (80-110%), overloaded (>110%)"
  - "OPTIMAL_PROJECT_MIN=2, OPTIMAL_PROJECT_MAX=5, MAX_WEEKLY_TASKS=15"
  - "Deadline cluster detection: groups deadlines into 3-day windows, alerts on 3+ in same window"
  - "4 capacity alert types: overcommitted, deadline_cluster, idle, unbalanced"
  - "4 suggestion types: defer_start, redistribute, take_on_more, warn_client"
  - "SHORTFALL_THRESHOLD=-500 for negative net projection alerts"

patterns-established:
  - "Forward projection pattern: historical baseline vs pipeline-based, take the higher"
  - "computeMonthlyTotals() helper for grouping invoices by YYYY-MM"
  - "Alert severity escalation: threshold-based (e.g., overdue > $5000 = high)"
  - "Suggestion generation tied to capacity status"
  - "Deadline windowing: Math.floor(daysUntilDue / 3) for cluster grouping"
  - "Shorter cache TTLs for more volatile metrics (24h -> 12h -> 6h)"

requirements-completed:
  - "cash-flow-prophet.ts with projectCashFlow forward-projecting finances from invoices, proposals, and recurring patterns"
  - "capacity-oracle.ts with assessCapacity modeling workload from active projects/tasks"
  - "Cash flow: current month actuals, 6-month historical baseline, pipeline from sent/viewed invoices, overdue recovery estimates, proposal pipeline (40% probability)"
  - "Capacity: utilization percentage, status classification, upcoming deadline scanning (14 days), deadline cluster detection, overcommitment warnings, actionable suggestions"
  - "Minimum data thresholds with gatheringData flag for both modules"
  - "bi_snapshots caching with appropriate TTLs (12h cash flow, 6h capacity)"
  - "Tests: cash flow gathering data, cash flow projection generation with month format and confidence validation, capacity gathering data, capacity overloaded detection (7 projects + 10 tasks), capacity optimal utilization (3 projects + 1 task = 65%)"

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 24 Plan 02: Cash Flow Prophet + Capacity Oracle Summary

**Implemented forward financial projections and workload capacity modeling with alert generation, deadline clustering, and variable-TTL caching.**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 3

## Accomplishments
- Built `projectCashFlow()` projecting income forward N months by combining historical averages (6-month lookback), pipeline invoices (sent/viewed by due date), overdue recovery estimates (50% rate over 2 months), and proposal pipeline (40% acceptance probability)
- Built `assessCapacity()` modeling workload utilization from active projects (20% weight each) and tasks (5% weight each) with status classification (under/optimal/heavy/overloaded)
- Implemented `computeMonthlyTotals()` helper grouping paid invoices by YYYY-MM month key
- Cash flow generates 4 alert types: shortfall (projected negative net), surplus, declining_trend (3-month >20% decline), overdue_risk
- Capacity scans upcoming 14 days for deadlines, detects clusters (3+ deadlines in 3-day windows), and generates actionable suggestions (defer_start, take_on_more, warn_client)
- Shorter cache TTLs for more volatile metrics: 12h for cash flow, 6h for capacity (vs 24h for revenue radar/client health)
- Added 5 tests: cash flow gathering data, projection generation with YYYY-MM format and confidence bounds, capacity gathering data, overloaded detection (7 projects * 20 + 10 tasks * 5 = 190 -> capped 150 -> overloaded), optimal utilization (3 projects * 20 + 1 task * 5 = 65%)

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: intelligence-layer*
*Completed: 2026-03-26*
