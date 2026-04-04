# ADR-0003: 6-Layer Cognitive Memory OS Architecture

## Status

Accepted

## Context

BitBit's memory retrieval surfaced only recent, high-confidence memories due to:
1. Proactive recall: confidence-only ordering, 500 token budget, top 5 per entity
2. No entity relationships or temporal reasoning
3. Passive consolidation (decay only, no summarization or discovery)
4. Fixed retrieval depth regardless of query complexity

Research into state-of-the-art systems (Graphiti, Chronos, MAGMA, MemGPT, Mem0, Anthropic's contextual retrieval) identified a convergent architecture pattern.

## Considered Options

### Option A: Precision Retrieval (surgical fixes)
Fix proactive recall ordering and increase token budget. Low effort, limited depth.

### Option B: Temporal Knowledge Graph (Graphiti-inspired)
Entity graph + temporal edges + graph-aware retrieval. Foundation for deeper intelligence.

### Option C: Cognitive Memory OS (full stack)
All of B plus contextual ingestion, sleep consolidation, adaptive routing, predictive loading, procedural memory.

## Decision

**Option C: Cognitive Memory OS** with incremental delivery through 6 phases.

## Architecture

```
Layer 6: Predictive Context Loading + Procedural Memory
Layer 5: Adaptive Query Routing (simple/moderate/complex)
Layer 4: Sleep-Cycle Consolidation (nightly 5-stage pipeline)
Layer 3: Contextual Retrieval at Ingestion (Haiku enrichment)
Layer 2: Graph-Aware Retrieval (proactive recall + search_memory)
Layer 1: Entity Graph + Temporal Knowledge (pgvector foundation)
```

Each layer is independently testable and deployable. Lower layers are prerequisites for upper layers.

## Key Design Decisions Within

- **Bi-temporal edges** (Graphiti pattern): valid_from/valid_until + ingested_at. Facts evolve over time, old facts invalidated but never deleted.
- **SVO event tuples** (Chronos pattern): Subject-Verb-Object decomposition enables temporal queries.
- **Blended relevance scoring**: 0.4*vector_similarity + 0.3*confidence + 0.2*recency + 0.1*edge_weight replaces confidence-only ordering.
- **Contextual retrieval** (Anthropic pattern): Haiku enriches chunks at ingestion time, prepending "who said what about which project." 67% less retrieval failure at zero query-time cost.
- **Sleep consolidation**: 5-stage nightly pipeline mimicking cognitive sleep: summarize, resolve conflicts, discover relationships, prune noise, generate morning briefing.
- **Adaptive routing**: Rule-based classifier (no LLM) routes queries to right-sized pipelines. Simple queries skip graph+rerank, saving 35% latency.

## Consequences

### Positive
- Multi-hop reasoning ("How does X relate to Y?") works via graph traversal
- Old memories surface when relevant (not just recent/high-confidence)
- Morning briefings anticipate user needs before they ask
- Procedural memory captures learned workflows for automatic triggering
- 30+ integration tests verify all layers

### Negative
- 6 new tables, 15+ new files, complex system to maintain
- Sleep consolidation uses Haiku API credits nightly (~$0.10-0.50/run)
- Entity extraction adds latency to message ingestion (fire-and-forget, non-blocking)
- Contextual retrieval adds ~$1/million tokens at ingestion

### Risks
- Entity extraction quality depends on Haiku accuracy (mitigated by fire-and-forget: bad extraction doesn't break anything)
- Sleep consolidation relationship discovery may produce false positives (mitigated by confidence threshold 0.7)

## References

- Spec: `docs/superpowers/specs/2026-04-04-cognitive-memory-os-design.md`
- Research: Graphiti (arxiv 2501.13956), Chronos (arxiv 2603.16862), MAGMA (arxiv 2601.03236)
- Anthropic Contextual Retrieval: anthropic.com/news/contextual-retrieval
