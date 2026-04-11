---
phase: intelligence-layer
plan: 01
subsystem: intelligence
tags: [revenue-radar, client-health, analytics, bi-snapshots]

# Dependency graph
requires:
  - phase: core
    provides: "Supabase client, logger, contacts/invoices/projects tables"
provides:
  - "analyzeRevenueOpportunities(supabase, orgId) -> RevenueRadarResult"
  - "computeClientHealth(supabase, orgId) -> ClientHealthResult"
  - "RevenueOpportunity, RevenueRadarResult, ClientHealthScore, ClientHealthResult interfaces"
affects: [sales-role, comms-role, bi_snapshots]

# Tech tracking
tech-stack:
  added: []
  patterns: [bi_snapshots-cache-with-ttl, minimum-data-thresholds, per-contact-scoring]

key-files:
  created:
    - "personal-assistant/src/lib/intelligence/revenue-radar.ts"
    - "personal-assistant/src/lib/intelligence/client-health.ts"
    - "personal-assistant/src/lib/intelligence/__tests__/intelligence.test.ts"
  modified: []

key-decisions:
  - "Revenue Radar requires MIN_INVOICES=3 before analysis; returns gatheringData=true below threshold"
  - "Client Health requires MIN_ACTIVE_CONTACTS=2 before scoring"
  - "All results cached in bi_snapshots with 24h TTL via upsert on org_id,metric_type"
  - "Revenue opportunities detected: upsell, stale_client, pricing_gap, repeat_potential"
  - "Client health scored on 4 dimensions (responsiveness, paymentHealth, projectProgress, engagement) each 0-25 for total 0-100"
  - "Health grades: excellent (80+), good (60+), fair (40+), poor (20+), critical (<20)"
  - "Stale client threshold: STALE_CLIENT_DAYS=90"
  - "Upsell detection window: UPSELL_WINDOW_DAYS=60 after project completion without follow-up"
  - "Pricing gap detection: flags contacts 40%+ below org average invoice value"
  - "Repeat potential: flags when time since last invoice exceeds 1.5x average invoice gap"
  - "Client health scores sorted ascending (worst first) for attention prioritization"

patterns-established:
  - "Intelligence module pattern: export async function, typed result interface with gatheringData flag, bi_snapshots caching"
  - "Confidence scoring: Math.min(ceiling, base + count * increment) for data-dependent confidence"
  - "Batch Supabase queries: fetch all org data then group in-memory by contact ID"
  - "Deduplication: Set-based key (contactId:type) with sort-by-value-first"
  - "Dimension scoring functions: private functions returning 0-25 with flag accumulation"
  - "scoreToGrade() grade conversion from numeric score"

requirements-completed:
  - "revenue-radar.ts with analyzeRevenueOpportunities scanning client history for upsell, stale, pricing gaps"
  - "client-health.ts with computeClientHealth computing per-client 0-100 scores"
  - "4 revenue opportunity types: upsell, stale_client, pricing_gap, repeat_potential"
  - "4 health dimensions: responsiveness, paymentHealth, projectProgress, engagement"
  - "bi_snapshots caching with 24h TTL for both modules"
  - "Minimum data threshold with gatheringData flag"
  - "Tests: revenue radar gathering data, stale client detection, client health gathering data, client health scoring with grade validation"

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 24 Plan 01: Revenue Radar + Client Health Score Summary

**Implemented revenue opportunity scanning and per-client health scoring with bi_snapshots caching and minimum data thresholds.**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 3

## Accomplishments
- Built `analyzeRevenueOpportunities()` scanning contacts, invoices, and projects to detect 4 opportunity types (upsell, stale_client, pricing_gap, repeat_potential) with confidence scores and estimated values
- Built `computeClientHealth()` scoring clients 0-100 across 4 weighted dimensions (responsiveness, paymentHealth, projectProgress, engagement) with grade assignment and flag accumulation
- Implemented `computeAverageInvoiceGap()` for repeat potential detection using sorted paid invoice timestamps
- Implemented 4 scoring functions: `scoreResponsiveness()` (message response ratio), `scorePaymentHealth()` (overdue/on-time analysis), `scoreProjectProgress()` (completion/cancellation rates), `scoreEngagement()` (recency + frequency)
- Both modules cache in `bi_snapshots` via upsert with 24h TTL and support `gatheringData` mode below minimum data thresholds
- Wrote 4 tests covering gathering-data paths and active analysis for both modules (stale client detection, health scoring with grade validation)

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: intelligence-layer*
*Completed: 2026-03-26*
