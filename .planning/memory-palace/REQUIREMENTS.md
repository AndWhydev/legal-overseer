# Memory Palace — Requirements

## MEM-01: Typed Memory Entries
Memory entries are typed into 7 categories: `conversation`, `decision`, `pattern`, `fact`, `relationship`, `pricing`, `convention`. Each type has distinct extraction logic, confidence scoring, and display behavior. Convention memories capture learned business operations patterns ("learn once, apply forever").

## MEM-02: Decision Log with Reasoning Chains
Decisions store full reasoning chains: what was decided, alternatives considered, reasoning, outcome observed, and lessons learned. Links to source conversations and entities. Supports archaeology queries ("Why did we stop working with X?").

## MEM-03: Confidence Scoring & Decay
Every memory has a confidence score (0-1). New auto-extracted memories start at 0.7. Confidence increases with corroboration (same fact from multiple sources). Confidence decays based on category-specific half-lives. User-explicit memories never decay. Each memory tracks provenance: source, corroborators, contradictors.

## MEM-04: Full-Text Search (tsvector)
All memory content indexed with PostgreSQL tsvector for instant full-text search. ts_rank for relevance scoring. GIN indexes on content_tsv column.

## MEM-05: Semantic Search Integration
Memory entries embedded via existing Voyage-3.5 pipeline and stored in Pinecone under `mp:` namespace prefix. Natural language queries return ranked results combining full-text and semantic similarity.

## MEM-06: Entity Cross-Referencing
Every memory links to source entities (contacts, projects, invoices) via entity_ids array. Query "everything we know about client X" returns all linked memories, decisions, and patterns.

## MEM-07: Pattern Detection Engine
Identifies recurring behaviors across entities and time: late payments, scope creep, communication patterns, pricing trends. Patterns auto-promote to memories when confidence exceeds threshold.

## MEM-08: Conversation Archaeology
Natural language queries like "Why did we stop working with TechCorp?" search archived thread summaries, entity timelines, and semantic memories to reconstruct narrative timelines.

## MEM-09: Proactive Recall
During conversations, automatically surface relevant memories without being asked. When a client is mentioned, inject recent decisions, patterns, and warnings into context assembly.

## MEM-10: GDPR Forgetting
`forget_entity(entity_id)` cascade-deletes all memories, patterns, timeline events, and vector embeddings linked to an entity.

## MEM-11: Memory Palace REST API
REST API at `/api/memory-palace/` with endpoints: search, store, recall (entity-scoped), forget, stats.

## MEM-12: Memory Explorer UI
Dashboard component showing searchable memory feed, timeline view, entity-grouped memories, and decision log viewer with glassmorphic design system.

## MEM-13: Pricing Intelligence
Query "What did we charge for the last 3 WordPress builds?" by cross-referencing invoice amounts with project types and contact entities.

## MEM-14: Relationship Timeline
Full narrative timeline of how any relationship evolved — from first contact through current state, with annotated decision points.

## MEM-15: Memory Consolidation Pipeline
Background process that: decays stale memories, merges corroborating facts, promotes high-confidence patterns, archives low-signal memories.
