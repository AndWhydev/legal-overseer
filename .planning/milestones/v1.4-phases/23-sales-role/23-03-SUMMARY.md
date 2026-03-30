---
phase: 23-sales-role
plan: 03
subsystem: roles/sales
tags: [sales, win-loss, pipeline, analytics, bi-snapshots, test-coverage]

# Dependency graph
requires:
  - phase: 23-sales-role
    provides: "salesRole with nurture + onboarding (plans 01-02)"
  - phase: 08-agent-runtime
    provides: "RoleInsight, role state persistence"
provides:
  - "analyzeWinLossPatterns() -- weekly win/loss analysis with pricing patterns and learnings"
  - "computePipelineSnapshot() -- daily pipeline metrics with lead/proposal/client counts, conversion rate, alerts"
  - "WinLossResult, WinLossLearning, PipelineSnapshot, PipelineAlert types"
  - "Full test coverage: 13 tests across 5 describe blocks"
affects: [sales-role evaluate(), bi_snapshots table, role-state pricing_patterns]

# Tech tracking
tech-stack:
  added: []
  patterns: [win-loss-learning, pipeline-snapshot, bi-cache, price-sensitivity-detection]

key-files:
  created:
    - "personal-assistant/src/lib/roles/sales/win-loss-learner.ts"
    - "personal-assistant/src/lib/roles/sales/pipeline-tracker.ts"
    - "personal-assistant/src/lib/roles/sales/__tests__/sales-role.test.ts"
  modified:
    - "personal-assistant/src/lib/roles/sales/sales-role.ts"

key-decisions:
  - "Win/loss analysis runs weekly (ONE_WEEK_MS gate in evaluate()) to accumulate meaningful data"
  - "Pipeline snapshot runs daily (ONE_DAY_MS gate) with 24h TTL cache in bi_snapshots table"
  - "Pricing patterns stored in role state as Record<string, { avgPrice, count }> keyed by project type"
  - "Win rate, price sensitivity, time-to-close, and per-type win rates generated as WinLossLearning insights"
  - "Price sensitivity detected when avg loss value exceeds avg win value by 30%+"
  - "Pipeline alerts: dry pipeline (<3 leads), low conversion (<30%), unviewed proposals (3+), hot leads without proposals"
  - "Test suite uses custom createMockSupabase() with filter-chain builder supporting eq/in/lt/gt/gte/lte/contains"
  - "Revenue radar integration (analyzeRevenueOpportunities) wired in evaluate() section 6b"

patterns-established:
  - "WinLossResult: { learnings: WinLossLearning[], pricingPatterns, stats: { totalWins, totalLosses, winRate, avgWinValue, avgLossValue, avgTimeToClose } }"
  - "PipelineSnapshot: { totalLeads, hotLeads, warmLeads, coldLeads, totalProposals, proposalsSent, proposalsAccepted, proposalsDeclined, activeClients, pipelineValue, conversionRate, alerts }"
  - "PipelineAlert: { summary, details, priority } for actionable pipeline health warnings"
  - "ProposalOutcome internal type for structured win/loss data extraction"
  - "getStandardPrice() helper extracting standard-tier price from pricing array"
  - "getCachedSnapshot() / cacheSnapshot() with org_id+metric_type upsert and TTL expiry"
  - "createMockSupabase() test utility with chainable filter builder and promise-based resolution"

requirements-completed: [SALES-07, SALES-08, SALES-09]

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 23 Plan 03: Win/Loss Learning, Pipeline Analytics, and Test Coverage Summary

**Implemented weekly win/loss pattern analysis, daily pipeline snapshot with caching, and comprehensive test suite covering all sales role subsystems.**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 3

## Accomplishments
- Built `win-loss-learner.ts` with `analyzeWinLossPatterns()` analyzing accepted/declined proposals to generate actionable learnings
- Win/loss stats computed: totalWins, totalLosses, winRate, avgWinValue, avgLossValue, avgTimeToClose (days from sent to accepted)
- Pricing patterns extracted per project type from winning proposals (avgPrice, count) and stored in SalesState
- Four learning categories generated: overall win rate, price sensitivity detection (>30% delta), time-to-close patterns, per-type win rate strengths/weaknesses
- Built `pipeline-tracker.ts` with `computePipelineSnapshot()` aggregating leads by score, proposals by status, active clients, pipeline value, and conversion rate
- Pipeline alerts generated for: dry pipeline (<3 active leads), low conversion rate (<30%), unviewed proposals (3+), hot leads needing proposals
- Pipeline snapshots cached in `bi_snapshots` table with `sales_pipeline` metric_type, 24h TTL, org_id+metric_type upsert
- Wired win/loss analysis into evaluate() section 5 with weekly gate (ONE_WEEK_MS), updating pricing_patterns in state
- Wired pipeline snapshot into evaluate() section 6 with daily gate (ONE_DAY_MS), surfacing snapshot and alerts as insights
- Created comprehensive test suite with 13 tests across 5 describe blocks:
  - `lead-wrapper`: wraps lead swarm tick, maps to role actions/insights (1 test)
  - `lead-nurture`: stale lead detection, stale proposal detection, nurture workflow creation (3 tests)
  - `client-onboarding`: conversion detection, onboarding workflow creation (2 tests)
  - `win-loss-learner`: pattern analysis, empty results, price sensitivity detection (3 tests)
  - `pipeline-tracker`: full snapshot computation, cache hit, dry-pipeline alert (3 tests)
  - `proposal-generator`: pricing context from historical data (1 test)
- Test infrastructure: custom `createMockSupabase()` factory with chainable query builder supporting eq, in, lt, gt, gte, lte, contains filters plus single/upsert/insert operations

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: 23-sales-role*
*Completed: 2026-03-26*
