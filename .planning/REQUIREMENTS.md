# Requirements: v3.0 Omniscience Activation

**Defined:** 2026-04-15
**Core Value:** BitBit knows things about relationships that the people in them don't — asymmetric intelligence that makes it genuinely omniscient.

## v3.0 Requirements

### Wiring (Level 1 — Connect existing dead code)

- [x] **WIRE-01**: Entity dossiers replace old entity_profiles as primary context source in ContextAssembler
- [x] **WIRE-02**: Spreading activation fires when user mentions an entity, surfacing related entities in proactive recall
- [x] **WIRE-03**: Neural decay confidence scores affect recall ranking (low-confidence memories rank lower)
- [x] **WIRE-04**: Predictive coding surprise scores >0.7 surface as proactive messages to the user
- [x] **WIRE-05**: Domain profiles injected into system prompt via prompt cache (L1 cache hit for repeated contexts)
- [x] **WIRE-06**: Global Workspace allocates context budget across dossier/memory/temporal modules dynamically
- [x] **WIRE-07**: Query Gate System 1 path reads cached dossiers (<50ms), System 2 does full retrieval

### Anomaly Detection (ANOM)

- [x] **ANOM-01**: Statistical anomaly detector computes z-scores per entity per metric (payment timing, amount, frequency)
- [x] **ANOM-02**: Anomalies exceeding z>3 generate proactive alerts routed to user via messaging channel
- [x] **ANOM-03**: Alert budget caps at 2-3 per entity per day to prevent fatigue
- [x] **ANOM-04**: Pattern break detection across multiple entities ("3 clients with late payments this month")
- [x] **ANOM-05**: Anomaly explanations include baseline comparison ("Usually pays day 15, this invoice is day 30")

### Active Learning (LEARN)

- [x] **LEARN-01**: When agent confidence is in "ask" band (50-70%), generate targeted clarifying questions
- [x] **LEARN-02**: Clarifying questions reference specific ambiguity ("White House project — interior redesign or landscaping?")
- [x] **LEARN-03**: User responses to clarifying questions update entity dossiers and confidence scores
- [x] **LEARN-04**: Confidence gaps tracked per knowledge domain; recurring low-confidence domains trigger proactive learning

### Theory of Mind (TOM)

- [ ] **TOM-01**: Belief ledger per entity tracks what each contact knows vs ground truth
- [ ] **TOM-02**: Information gap detection: "Alice doesn't know Bob is leaving" based on communication analysis
- [ ] **TOM-03**: Belief state updates from inbound messages (what they said implies what they believe)
- [ ] **TOM-04**: Epistemic qualifiers when belief state uncertain ("Alice may not be aware of the rate change")
- [ ] **TOM-05**: Belief conflicts surfaced: "Steve thinks rate is $150/hr but you agreed $180"

### Temporal Reasoning (TEMP)

- [ ] **TEMP-01**: Event tuples with temporal ordering extracted during consolidation pipeline
- [ ] **TEMP-02**: Deadline propagation: if task A blocks task B, B's effective deadline is A's deadline minus lead time
- [ ] **TEMP-03**: Schedule conflict detection: "3 things due April 15 and only 10 hours available"
- [ ] **TEMP-04**: Temporal pattern recognition: recurring events, seasonal trends, deadline patterns

### Causal Reasoning (CAUS)

- [ ] **CAUS-01**: Causal edges (CAUSES, LEADS_TO, BLOCKS, ENABLES) on existing entity_edges table
- [ ] **CAUS-02**: Causal chain tracing: given effect, trace back through CAUSES edges to root cause
- [ ] **CAUS-03**: Counterfactual reasoning: "If you'd invoiced Tuesday, payment would have cleared by now"
- [ ] **CAUS-04**: 2-signal corroboration required before creating CAUSES edges (prevent hallucinated causation)
- [ ] **CAUS-05**: CORRELATES_WITH as weaker interim edge type before promotion to CAUSES

### Metacognition (META)

- [ ] **META-01**: Confidence scores per knowledge domain (financial, relational, operational, behavioral)
- [ ] **META-02**: Domain confidence derived from signal density + recency + dossier completeness
- [ ] **META-03**: Low-confidence domains surfaced: "I have weak understanding of Steve's project scope"
- [ ] **META-04**: Knowledge gap identification: detect domains with zero or stale data

### Goal Decomposition (GOAL)

- [ ] **GOAL-01**: Explicit goal hierarchy stored per org (top-level goals decomposed into subgoals)
- [ ] **GOAL-02**: Goal elicitation from conversations: extract stated goals + deadlines
- [ ] **GOAL-03**: Critical path analysis: identify which subgoals are on the critical path
- [ ] **GOAL-04**: Goal-task routing: map incoming tasks/decisions against goal tree
- [ ] **GOAL-05**: Proactive warnings: "Q3 ship date at risk — need to decide on feature X by April 1"
- [ ] **GOAL-06**: Goal decay by mention frequency; stale goals prompt quarterly review

### Infrastructure (INFRA)

- [ ] **INFRA-01**: Install graphology + simple-statistics (only 2 new deps, ~45KB gzipped)
- [ ] **INFRA-02**: Cost tracking per cognitive feature (token usage per extraction type)
- [ ] **INFRA-03**: Batch cognitive extraction into single LLM call per entity per consolidation run
- [ ] **INFRA-04**: New tables: belief_states, anomaly_baselines, goal_tree, metacognitive_scores + extend entity_edges for causal types
- [ ] **INFRA-05**: All new tables org-scoped with RLS policies

## v3.1+ Requirements (Deferred)

### Advanced Cognitive Features

- **ADV-01**: Cross-org reasoning (how decision in org A affects org B)
- **ADV-02**: Collaborative Theory of Mind (multi-party belief modeling in group contexts)
- **ADV-03**: Causal intervention simulation (do-calculus for "what if" scenario planning)
- **ADV-04**: Automated goal revision based on achieved/missed milestones
- **ADV-05**: Sent message capture (Epic B1) — full Theory of Mind exposure tracking

## Out of Scope

| Feature | Reason |
|---------|--------|
| External graph DB (Neo4j) | Supabase Postgres + graphology sufficient; no new infra |
| Python ML sidecar | All cognitive features are LLM extraction tasks, not traditional ML |
| Real-time cognitive streaming | Cron-based consolidation sufficient; real-time adds complexity without value |
| Bayesian network inference | LLM-powered reasoning more practical for business domain |
| Personality modeling | Ethical boundary; BitBit models knowledge/beliefs, not personality |
| Full do-calculus engine | Academic overkill; LLM counterfactual reasoning sufficient for v3.0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIRE-01 — WIRE-07 | Phase 45 | Complete (shipped 2026-04-14) |
| INFRA-01 — INFRA-05 | Phase 45-46 | Partial — INFRA-01..03 satisfied, INFRA-04/05 deferred to Phase 46+ |
| ANOM-01 — ANOM-05, LEARN-01 — LEARN-04 | Phase 46 | Pending |
| TOM-01 — TOM-05, TEMP-01 — TEMP-04 | Phase 47 | Pending |
| CAUS-01 — CAUS-05, META-01 — META-04 | Phase 48 | Pending |
| GOAL-01 — GOAL-06 | Phase 49 | Pending |

**Coverage:**
- v3.0 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after v3.0 milestone definition*
