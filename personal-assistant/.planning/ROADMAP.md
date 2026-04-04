# BitBit Roadmap — v1.0

## Milestone v1.0: Production Dashboard

Active development milestone for dashboard UX improvements and feature additions.

### Phase 1: SOTA Context-Enriched Response Drafter

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 0
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 1 to break down)

### Phase 34: Builder Role — Website Generation & Deployment

**Goal:** Website generation via chat, template library, WordPress/Elementor integration, staging preview, one-click deployment.
**Requirements:** BUILD-01, BUILD-02, BUILD-03
**Depends on:** Existing role engine (phases 22-23)
**Plans:** 4 plans

Plans:
- [ ] 34-01-PLAN.md — Builder role foundation: DB schema, types, role registration, template library
- [ ] 34-02-PLAN.md — Website generation engine and chat tools
- [ ] 34-03-PLAN.md — WordPress REST API client and Elementor integration
- [ ] 34-04-PLAN.md — Staging preview, deployment tools, and project dashboard

---

## Milestone: Cognitive Memory OS

Overhaul BitBit's memory retrieval pipeline with entity graph, temporal knowledge, contextual retrieval, sleep consolidation, adaptive routing, predictive loading, and procedural memory. Spec: docs/superpowers/specs/2026-04-04-cognitive-memory-os-design.md

### Phase 35: Entity Graph Foundation
**Goal:** pgvector extension, entity_nodes/entity_edges/event_tuples tables, backfill from contacts and projects, entity extraction pipeline
**Depends on:** None (standalone foundation)
**Research:** Likely (pgvector HNSW indexes, Google multimodal embedding API)
**Research topics:** pgvector index tuning for 768d, Google embedding v2 API, Supabase pgvector extension setup
**Plans:** 3 plans

Plans:
- [x] 35-01: Enable pgvector, create tables + indexes + RLS
- [x] 35-02: Entity extraction pipeline (Haiku-based SVO extraction from messages/memories)
- [x] 35-03: Backfill entity_nodes from contacts, edges from projects.metadata

### Phase 36: Graph-Aware Retrieval
**Goal:** Replace confidence-only proactive recall with graph+vector hybrid. Increase token budget from 500 to 1500. Enhanced memory search via graph traversal.
**Depends on:** Phase 35
**Research:** Unlikely (internal patterns, existing retrieval code)
**Plans:** 2 plans

Plans:
- [x] 36-01: Rewrite proactive-recall.ts with graph walk + vector similarity + relevance scoring
- [x] 36-02: Add graphSearch() to memory-search.ts, integrate into search_memory tool

### Phase 37: Contextual Retrieval at Ingestion
**Goal:** Contextualize chunks before embedding via Haiku. Prepend entity/project/speaker context to each chunk for dramatically better retrieval precision.
**Depends on:** Phase 35 (needs entity_nodes for context enrichment)
**Research:** Likely (Anthropic contextual retrieval technique, prompt caching for cost)
**Research topics:** Anthropic contextual retrieval cookbook, Claude prompt caching API
**Plans:** 2 plans

Plans:
- [x] 37-01: Build contextualizer.ts, integrate into chunker.ts ingestion pipeline
- [x] 37-02: Re-embed existing memories with contextual prefixes (backfill job)

### Phase 38: Sleep-Cycle Consolidation
**Goal:** Nightly cron that summarizes per-entity, resolves fact conflicts, discovers latent relationships, prunes noise, generates morning briefing.
**Depends on:** Phase 35, Phase 36 (needs entity graph + retrieval)
**Research:** Unlikely (internal patterns, Haiku calls, existing cron infrastructure)
**Plans:** 2 plans

Plans:
- [x] 38-01: Build sleep-consolidation.ts with 5-stage pipeline
- [x] 38-02: Morning briefing generator + dashboard/API surface + cron route

### Phase 39: Adaptive Query Routing
**Goal:** Rule-based query classifier (simple/moderate/complex) that right-sizes retrieval. Simple queries skip heavy pipeline, complex queries get full graph+vector+rerank.
**Depends on:** Phase 36 (needs graph retrieval paths to route to)
**Research:** Unlikely (rule-based classifier, no external deps)
**Plans:** 1 plan

Plans:
- [x] 39-01: Build query-router.ts, integrate into search_memory and proactive recall

### Phase 40: Predictive Loading + Procedural Memory
**Goal:** Pre-load context at conversation start based on deadlines/recency/patterns. Store and trigger learned workflows as procedural memories.
**Depends on:** Phase 35, Phase 38 (needs entity graph + morning briefing data)
**Research:** Unlikely (internal patterns)
**Plans:** 2 plans

Plans:
- [ ] 40-01: Build predictive-loader.ts, integrate into context-assembler.ts
- [ ] 40-02: procedural_memories table, creation paths (observed/explicit/consolidation), trigger matching in proactive recall

## Progress — Cognitive Memory OS

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 35. Entity Graph Foundation | 3/3 | Complete | 2026-04-04 |
| 36. Graph-Aware Retrieval | 2/2 | Complete | 2026-04-04 |
| 37. Contextual Retrieval | 2/2 | Complete | 2026-04-04 |
| 38. Sleep Consolidation | 2/2 | Complete | 2026-04-04 |
| 39. Adaptive Query Routing | 1/1 | Complete | 2026-04-04 |
| 40. Predictive + Procedural | 0/2 | Not started | - |
