# Memory Palace — Roadmap

## Phase 26: Core Schema & Storage Engine
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-06, MEM-10
- Migration 100: `memory_palace_entries` table with tsvector, confidence, decay, provenance
- Migration 101: `decision_log` table with reasoning chains
- Migration 102: `memory_patterns` table for detected behavioral patterns
- Migration 103: RLS policies for all Memory Palace tables
- Migration 104: `forget_entity()` GDPR cascade function + consolidation helpers
- TypeScript types for all memory entry types
- Confidence scoring module with decay logic
- Memory writer: store + validate + embed pipeline

## Phase 27: Search & Retrieval
**Requirements**: MEM-04, MEM-05, MEM-06, MEM-07, MEM-08, MEM-13
- Hybrid search engine: tsvector full-text + Pinecone semantic
- Entity recall: aggregate all memories for a given entity
- Conversation archaeology: reconstruct narrative from fragments
- Pattern detection: detect and store behavioral patterns
- Pricing intelligence: cross-reference invoices with entity memories

## Phase 28: API Layer & Proactive Recall
**Requirements**: MEM-09, MEM-11, MEM-14, MEM-15
- REST API routes at `/api/memory-palace/` (search, store, recall, forget, stats)
- Context assembly integration for proactive recall during chat
- Relationship timeline builder
- Memory consolidation background pipeline

## Phase 29: Memory Explorer UI
**Requirements**: MEM-12
- Memory search interface with hybrid full-text + semantic search
- Timeline visualization per entity
- Entity-grouped memory view
- Decision log viewer with reasoning chain display
- Glassmorphic design system integration
