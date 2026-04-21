# Phase 46: Anomaly Detection + Active Learning - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

BitBit proactively surfaces pattern breaks ("Alice's payment is 15 days late — unusual") and asks targeted clarifying questions when uncertain, rather than guessing. This phase extends the brain consolidation pipeline with statistical anomaly detection and extends the confidence router with active learning capabilities.

</domain>

<decisions>
## Implementation Decisions

### Anomaly Detection Architecture
- Z-scores computed inside brain consolidation pipeline — Section Librarian already iterates per-entity per-domain; add a stats pass after dossier compilation. Zero new cron jobs.
- Track 4 metrics per entity: payment timing, payment amount, message frequency, response latency. Extract from WAL signals already flowing through intake-clerk.
- New `anomaly_baselines` table (org_id, entity_id, metric_name, mean, stddev, sample_count, last_computed). Clean separation from dossiers; INFRA-04 budgets this table.
- Cross-entity pattern breaks via per-metric org-wide aggregation — after per-entity z-scores, run a second pass aggregating z>2 anomalies across entities for the same metric.

### Alert UX & Routing
- Alert channel is **channel-agnostic via provider registry** — route through whatever messaging surface the user has connected (WhatsApp, iMessage, SMS, etc.) plus dashboard notification. Use existing provider registry to resolve active channel. Do NOT hardcode WhatsApp.
- Alert format: concise with baseline comparison — "Alice's payment is 15 days late (usually pays by day 5, z=3.2)". One sentence context + one sentence baseline per ANOM-05.
- Budget enforcement via sliding 24h window per entity — track alert timestamps in brain_alerts table, skip if count >= 3. Handles timezone ambiguity.
- Track alert dismissals (`dismissed_at` column) but don't train on them yet. Later phases can use dismissal data to tune thresholds.

### Active Learning Mechanics
- Extend existing confidence router with `clarify` decision type for 50-70% band. Generate targeted question instead of approval request.
- Questions inline in the response — "I'm working on Steve's invoice — is this for the interior redesign or the landscaping project?" Natural conversation flow.
- New WAL signal type `clarification` — user's reply enters WAL pipeline, Section Librarian merges into dossier on next consolidation. Reuses existing pipeline.
- Weekly digest for recurring low-confidence domains — if entity domain confidence stays below 0.5 for 7 days, learning prompt in morning briefing. Limit: 1 per entity per week.

### Claude's Discretion
- Exact z-score threshold tuning beyond z>3 for alerts
- Internal data structure for running statistics (Welford's algorithm vs simple accumulation)
- Haiku prompt template for anomaly explanation generation
- Clarifying question generation prompt template

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/brain/brain-consolidation.ts` — main consolidation loop, processes WAL entries per org
- `src/lib/brain/intake-clerk.ts` — fact extraction with signal→domain mapping (invoice→financial, message→operational)
- `src/lib/brain/section-librarian.ts` — per-entity per-domain dossier compilation, entity resolution, Hebbian edge strengthening
- `src/lib/brain/predictive-coding.ts` — surprise scoring (0-1 scale), deviation type classification
- `src/lib/brain/surprise-surfacer.ts` — proactive surprise routing (web + messaging), channel-aware formatting
- `src/lib/whatsapp/proactive-alerts.ts` — existing proactive alert pipeline (dedup, WhatsApp routing)
- `src/lib/agent/confidence-router.ts` — act(0.85)/ask(0.55) bands, per-agent overrides, org-level overrides
- `src/lib/agent/engine/taor-loop.ts` — TAOR loop with confidence integration, follow-up generation
- `src/lib/intelligence/confidence-calibrator.ts` — outcome tracking, auto-threshold adjustment

### Established Patterns
- Brain consolidation: WAL tail → group by entity → Section Librarian per entity → Chief Librarian cross-entity
- Signal types in knowledge_log: message, invoice, relationship, pattern, delegated_action
- Proactive messaging: channel-agnostic formatting + provider registry routing
- RLS: `get_user_org_id()` on all org-scoped tables (SELECT, INSERT, UPDATE, DELETE)
- Migrations: `YYYYMMDDNNNNNN_description.sql` (latest: 20260415000005)
- Hebbian learning: entity_edges weight strengthened on co-occurrence, decay_rate for pruning

### Integration Points
- Hook anomaly computation into Section Librarian (after dossier compilation, before edge strengthening)
- Hook cross-entity aggregation into brain-consolidation.ts (after all entities processed, before marking consolidated)
- Hook clarify decision into confidence-router.ts (new band between ask and act)
- Route alerts through existing proactive-alerts pipeline (extend for brain_alerts source)
- New WAL signal type 'clarification' feeds back through existing intake-clerk → Section Librarian path

</code_context>

<specifics>
## Specific Ideas

- Anomaly explanations use Haiku (cheapest model, sufficient for explanation text) — one call per alert only
- Rule-based metric extraction from WAL signals (no LLM needed for numeric values)
- Z-score minimum sample size N>=5 (below 5, stddev unreliable)
- simple-statistics package (already installed per Phase 45) provides z-score utilities
- Morning briefing learning prompts integrate with existing briefing aggregation from Phase 43

</specifics>

<deferred>
## Deferred Ideas

- Anomaly threshold auto-tuning from dismissal feedback (track dismissals now, train later)
- Entity disambiguation layer (LLM-based alias resolution) — proposed in Gemini addendum, better as Phase 46.5 or pre-47 prerequisite
- Anomaly history archival table for long-term trend analysis
- Graph-based community detection for cross-entity anomaly clusters

</deferred>
