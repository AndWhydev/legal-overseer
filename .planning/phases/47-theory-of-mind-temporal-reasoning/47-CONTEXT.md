# Phase 47: Theory of Mind + Temporal Reasoning - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

BitBit tracks what each entity knows vs ground truth (Theory of Mind / belief
ledger) and reasons about temporal relationships — deadlines, sequences,
conflicts. The phase bundles three disjoint but causally-connected workstreams:

1. **Sent message capture (Epic B1)** — wire outbound-message logging across
   every dispatch surface so the belief ledger has a write-side. Scoped
   separately at `.planning/research/EPIC-B1-sent-message-capture.md`; folded
   in here as plan 47-01 so Phase 47 remains self-contained.
2. **Theory of Mind / belief ledger** — per-entity tracking of "facts this
   entity has been exposed to" vs "facts in ground truth", surfaced as an
   information-gap alert when relevant.
3. **Temporal reasoner** — deadline tracking, sequence/dependency inference,
   conflict detection across an entity's commitments and calendar.

Out of scope: causal graphs (Phase 48), metacognitive confidence (Phase 48),
goal hierarchy (Phase 49), automated belief revision from contradictions.

</domain>

<decisions>
## Implementation Decisions

### Scope folding (Epic B1 inside Phase 47)
- Epic B1 lands as plan 47-01 before any ToM logic. Reason: ToM's `known_facts`
  feed is outbound-message-driven; building belief-ledger compilation on top
  of an inbound-only feed would produce garbage data we'd have to rebuild.
- Phase 47 plan count target: 5-7. Comparable to Phase 45 (5). Split into:
  - 47-01: `recordOutbound` helper + dispatcher hook (B1-01 + partial B1-02)
  - 47-02: `resolveEntityByContact` + channel sender adoption (B1-03 + full B1-02)
  - 47-03: `entity_beliefs` schema + belief-ledger compiler (ToM core)
  - 47-04: information-gap detector + alert surface (ToM surfacing)
  - 47-05: temporal primitives (deadline extraction + sequence inference)
  - 47-06: temporal conflict detector + alert surface (mirrors 47-04)
  - 47-07 (optional): integration pass — brain-consolidation hook ordering,
    e2e verification

### Belief ledger storage
- New `entity_beliefs` table, NOT schema_json extension on `entity_dossiers`.
  Reason: the ledger is append-dominant and queryable-by-fact (needed for
  information-gap surfacing); jsonb columns make that awkward. Mirrors the
  shape of `brain_alerts` / `anomaly_baselines` from Phase 46.
- Columns: `id`, `org_id`, `entity_id`, `fact_text`, `exposed_at`,
  `source_channel`, `source_wal_id`, `status` (`exposed` | `superseded` |
  `retracted`), `metadata jsonb`. RLS matches Phase 46 pattern.
- `fact_text` is natural-language one-liner ("Invoice #4521 was paid on
  April 10"). No structured predicate representation — would force an
  ontology debate we don't need to win here.

### Fact extraction from outbound
- One LLM call per outbound message content, batched in brain-consolidation
  pass (same rhythm as intake-clerk's fact extraction). Model: `models.fast`
  (Haiku-class), same as Phase 46 anomaly explanations.
- Prompt: "extract 0-5 concise facts that were communicated". Wrapped with
  the `<user-reply>` delimiter pattern established in Phase 46 active-learner
  (REVIEW LO-03) — defends against prompt-injection from message bodies.
- Fall-through: on LLM failure, record the full message text as a single
  belief with low confidence. Better to over-expose than miss exposure.

### Information-gap detection
- Runs inside brain-consolidation after dossier compilation (same slot as
  Phase 46's anomaly-detector). Per active conversation with entity X,
  compare the ground-truth facts surfaced in the working memory against
  entity X's belief ledger; if a relevant fact has never been exposed and
  is within a time window (default 7 days), surface an `information_gap`
  alert.
- Reuses Phase 46's `brain_alerts` table. Extend the `alert_type` CHECK
  constraint to add `'information_gap'` alongside existing values. One
  migration.
- Budget: respect the per-alert_type budget plumbing added in Phase 46
  (REVIEW MD-02). Cap: 2 information-gap alerts per entity per 24h.

### Temporal reasoning scope
- Three primitives only — match the phase goal, don't boil the ocean:
  - **Deadline tracking**: extract "by {date}", "before {event}", "within
    {N} days" from message/invoice/delegated_action signals.
  - **Sequence inference**: when fact B references fact A ("after the
    deposit clears"), record B depends on A.
  - **Conflict detection**: two commitments overlap (same entity, same
    time window, contradictory).
- Storage: new `temporal_commitments` table with `(id, org_id, entity_id,
  commitment_text, due_at, depends_on_id, conflict_with_id, source_wal_id,
  created_at)`. Nullable `due_at` for event-relative deadlines.
- No Allen's interval algebra, no temporal logic solver. Too much for 47;
  Phase 48's causal reasoning can layer a richer structure on top.

### Integration points (brain-consolidation hook order)
After Phase 46, the consolidation loop per entity looks like:
1. Dossier compilation (Section Librarian)
2. Anomaly detection (Phase 46)

Phase 47 adds, per entity, after step 2:
3. Belief ledger update — walk this run's outbound WAL entries for the
   entity, call fact-extraction, append to `entity_beliefs`
4. Information-gap check — compare working-memory facts against ledger,
   emit `brain_alerts` row if gap found
5. Temporal primitive extraction — scan this run's WAL entries for
   deadlines/sequences, append to `temporal_commitments`

And after all entities:
6. Temporal conflict detector — scan `temporal_commitments` for overlapping
   windows per entity, emit `brain_alerts` row if conflict found

### Claude's Discretion
- Exact LLM prompt templates for fact extraction, deadline extraction,
  gap explanation
- Relevance heuristic for information-gap detection (which ground-truth
  facts to compare against which conversation)
- Backoff/retry policy for fact-extraction LLM failures
- Whether `entity_beliefs.fact_text` gets its own embedding column or
  relies on schema_json — start without, add if 47-04 gap-matching needs it

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/brain/brain-consolidation.ts` — main pipeline; Phase 46 added
  anomaly-detector hook at the same slot Phase 47 will reuse
- `src/lib/brain/intake-clerk.ts` — fact extraction batching + signal→domain
  mapping; templates the LLM-batched approach for fact extraction here
- `src/lib/brain/section-librarian.ts` — per-entity dossier compilation,
  entity resolution, existing context for belief-ledger layering
- `src/lib/brain/anomaly-detector.ts` — Phase 46; mirrors the shape of the
  new information-gap and conflict-detection functions. `isWithinAlertBudget`
  already supports per-alert_type budgets (REVIEW MD-02 fix)
- `src/lib/notifications/dispatcher.ts` — channel-agnostic dispatch, where
  Epic B1's `recordOutbound` hook lands
- `src/lib/knowledge-graph/graph-queries.ts` — `resolveEntityByAlias` exists;
  Epic B1-03 adds the sibling `resolveEntityByContact` for phone/email/handle
- `src/lib/agent/active-learner.ts` — Phase 46 pattern for
  `<user-reply>`-delimited user-content (reuse for outbound message bodies
  during fact extraction)
- `channel_messages.direction` column (20260329100000) — already live;
  Epic B1 just needs to WRITE the `outbound` rows

### Established Patterns
- Brain consolidation hook slots: after dossier compilation, before marking
  consolidated. Phase 46 anomaly-detector demonstrates the pattern.
- Alert persistence: `brain_alerts` row + `dispatchNotification` call,
  non-critical wrapper with `logger.warn` on failure
- Per-alert_type budget (Phase 46 REVIEW MD-02): scope budget to type so
  gap alerts don't compete with anomaly alerts
- WAL user-content defense: wrap external text in `<user-reply>…</user-reply>`
  so downstream LLM prompts can be system-prompted to treat it as data
  (Phase 46 REVIEW LO-03)
- Migrations: `YYYYMMDDNNNNNN_description.sql`. Latest applied:
  `20260418000001_expand_transport_check.sql`. Phase 47 will add two:
  `entity_beliefs` + `temporal_commitments` (can be one migration or two)
- RLS: `get_user_org_id()` on every org-scoped table, four policies
  (SELECT/INSERT/UPDATE/DELETE)

### Integration Points
- `recordOutbound` helper (new) wired into `dispatcher.ts` after successful
  dispatch; per-channel senders call it directly where they bypass the
  dispatcher
- Brain-consolidation loop (new hook): belief-ledger update call after
  anomaly-detector, information-gap check after ledger update, temporal
  primitive extraction per entity, temporal-conflict pass after all entities
- `brain_alerts.alert_type` CHECK constraint: migration to add
  `'information_gap'` and `'temporal_conflict'`
- `entity_nodes` references both new tables (ON DELETE CASCADE matches
  Phase 46 pattern)

</code_context>

<specifics>
## Specific Ideas

- Fact extraction prompt starting point: "Given this outbound message from
  BitBit to {entity}, list 0–5 concise factual statements that were
  communicated. One fact per line, under 140 chars each. If the message is
  purely conversational with no facts, return an empty list."
- Deadline extraction: rule-based regex pass first (already have the pattern
  from Phase 46 anomaly-detector payment_timing extraction), LLM fallback
  only for ambiguous natural-language ("by end of week").
- Information-gap relevance heuristic v1: token-overlap between working-memory
  fact and `entity_beliefs.fact_text`, threshold ≥0.3 overlap ∧ age ≥7 days
  ∧ status='exposed'. Fine-tune in a later pass.
- Sequence inference v1: pattern match `after X`, `before Y`, `once Z`,
  `when W` against prior 24h of WAL entries for the same entity. Skip LLM
  unless the phrase doesn't match the pattern list.

</specifics>

<deferred>
## Deferred Ideas

- Belief ledger with structured predicates (subject, predicate, object) —
  deferred to Phase 48 or later if the natural-language `fact_text` approach
  proves insufficient for information-gap detection
- Allen's interval algebra for temporal relations — overkill for v1;
  revisit if Phase 48 causal reasoning needs interval precision
- Automatic belief revision from contradicting inbound messages — belongs
  to Phase 48 metacognition (confidence tracking needs to exist first)
- Per-entity "communication preferences" learned from outbound patterns
  (channel, time of day, formality) — future work, not Phase 47
- Embedding-based fact matching in information-gap detection — start with
  token overlap; add embeddings only if recall is the bottleneck
- Backfill of historical sent messages — Epic B1 scope doc explicitly
  calls this out of scope (14-day ledger decay absorbs the loss)

</deferred>
