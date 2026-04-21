---
phase: 46-anomaly-active-learning
plan: 01
status: complete
completed: 2026-04-17
commits:
  - 928f5a93 feat(46-01): add anomaly_baselines and brain_alerts tables with RLS
  - 9d909c57 feat(46-01): extend type system for anomaly detection and active learning
  - 9328b483 feat(46-01): install simple-statistics dependency
---

# Plan 46-01 Summary: Foundation Schema, Types, Dependencies

## What Was Built

Foundation layer for Phase 46 — database schema for anomaly detection and active learning, TypeScript type extensions, and simple-statistics dependency installation.

### Task 1: Migration (commit 928f5a93)

Created `personal-assistant/supabase/migrations/20260417000001_anomaly_baselines_brain_alerts.sql`:

- **anomaly_baselines table** — tracks running statistics per (org, entity, metric). Columns: id, org_id (FK organizations), entity_id (FK entity_nodes), metric_name (CHECK: payment_timing | payment_amount | message_frequency | response_latency), mean, stddev, sample_count, last_computed. UNIQUE on (org_id, entity_id, metric_name).
- **brain_alerts table** — stores generated alerts with delivery and dismissal state. Columns: id, org_id, entity_id, alert_type (CHECK: anomaly | pattern_break | learning_prompt), metric_name, z_score, baseline_text, explanation, severity, channel, dismissed_at.
- **signal_type extension** — knowledge_log CHECK constraint now accepts 'clarification' alongside existing 10 signal types.
- Indexes: entity-scoped, metric-scoped, and time-windowed (DESC) for budget queries.
- RLS: 4 policies per table (select/insert/update/delete) using `get_user_org_id()`.
- Trigger: `trg_anomaly_baselines_updated_at` updates the updated_at column.

### Task 2: TypeScript types (commit 9d909c57)

Extended type system across 5 files:

- `src/lib/brain/types.ts` — Added `'clarification'` to SignalType union. Added new types: `MetricName`, `AnomalyBaseline`, `AlertType`, `AlertSeverity`, `BrainAlert`, `MetricExtraction`.
- `src/lib/bitbit-core/types.ts` — Added `'clarify'` to ConfidenceDecision union.
- `src/lib/core/types.ts` — Added `"clarify"` to ConfidenceDecision union.
- `src/lib/agent/schemas/confidence-decision.ts` — Extended Zod route enum with 'clarify'.
- `src/lib/brain/intake-clerk.ts` — Added `clarification: 'operational'` to SIGNAL_DOMAIN_MAP.

### Task 3: simple-statistics (commit 9328b483)

Installed `simple-statistics@^7.8.9` as production dependency. Verified `zScore` and `addToMean` functions available.

## Requirements Satisfied

- **ANOM-01** — anomaly_baselines schema provides storage for per-entity per-metric z-score stats
- **ANOM-03** — brain_alerts indexes support sliding 24h window budget queries
- **LEARN-01** — ConfidenceDecision 'clarify' type is ready for routing logic extension
- **LEARN-03** — SignalType 'clarification' is accepted by WAL pipeline, routed to operational domain
- **INFRA-01** — simple-statistics declared in dependencies

## Key Files Created

- `personal-assistant/supabase/migrations/20260417000001_anomaly_baselines_brain_alerts.sql`

## Key Files Modified

- `personal-assistant/src/lib/brain/types.ts`
- `personal-assistant/src/lib/bitbit-core/types.ts`
- `personal-assistant/src/lib/core/types.ts`
- `personal-assistant/src/lib/agent/schemas/confidence-decision.ts`
- `personal-assistant/src/lib/brain/intake-clerk.ts`
- `personal-assistant/package.json`
- `personal-assistant/package-lock.json`

## Self-Check: PASSED

- Migration contains both `CREATE TABLE IF NOT EXISTS anomaly_baselines` and `CREATE TABLE IF NOT EXISTS brain_alerts`
- Both tables have `ENABLE ROW LEVEL SECURITY` with 4 policies each (8 total)
- signal_type CHECK constraint includes `'clarification'`
- All 5 type/schema files updated
- `node -e "require('simple-statistics').zScore"` returns a function

## Downstream Enablement

Plans 46-02 (anomaly detector) and 46-03 (active learner) can now:
- Import `simple-statistics` for z-score computation
- Write to `anomaly_baselines` and `brain_alerts` tables
- Emit WAL entries with `signal_type: 'clarification'`
- Return `ConfidenceDecision.clarify` from routing logic
