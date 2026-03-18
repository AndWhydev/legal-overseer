# Memory Palace Roadmap

## Phase 26: Memory Palace Core Schema & Types
**Goal**: Database tables, TypeScript types, and core memory service that stores/retrieves typed memories with confidence, provenance, and entity linkage.
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-05, MEM-14
**Success Criteria**:
1. `memory_entries` table with typed memories, confidence, decay, provenance, entity linkage
2. `memory_decisions` table for decision tracking with reasoning chains
3. `memory_consolidation_log` table for tracking decay/merge operations
4. RLS policies on all new tables scoped to org_id
5. TypeScript types for all memory structures
6. Core MemoryPalaceService: store, retrieve, search, link/unlink entities
7. Full-text search via tsvector index on memory content

## Phase 27: Retrieval Engine & Extraction Pipeline
**Goal**: Hybrid search (text + semantic + entity-scoped), enhanced extraction pipeline, contradiction detection, and proactive recall during conversations.
**Requirements**: MEM-04, MEM-06, MEM-07, MEM-08, MEM-09, MEM-10, MEM-11
**Success Criteria**:
1. Hybrid search combines tsvector full-text, Pinecone semantic, and entity-scoped DB queries
2. Enhanced extraction pipeline classifies memories into typed categories (decision, fact, pattern, etc.)
3. Conversation archaeology: query returns relevant memories with source conversation links
4. Proactive recall: entity mentions trigger relevant memory injection into conversation context
5. Decision and pricing queries return structured results from memory palace

## Phase 28: Maintenance, GDPR & API
**Goal**: Background maintenance (decay, consolidation, archival), GDPR forget, REST API, and agent tool integration.
**Requirements**: MEM-12, MEM-13, MEM-15, MEM-17
**Success Criteria**:
1. Cron job decays confidence, merges duplicates, archives stale memories
2. `forgetEntity()` cascading delete with audit log
3. REST API endpoints for search, entity lookup, decisions, remember, forget, stats
4. Agent tools: search_memories, recall_decisions, remember_this, forget_entity

## Phase 29: Memory Palace Dashboard
**Goal**: React dashboard component for browsing, searching, and managing memories.
**Requirements**: MEM-16
**Success Criteria**:
1. Memory search with filters (type, entity, confidence, date range)
2. Decision timeline view
3. Entity memory cards
4. Memory health metrics (total active, confidence distribution, type breakdown)
5. Glassmorphic design matching existing dashboard

## Progress

| Phase | Plans | Status | Commit |
|-------|-------|--------|--------|
| 26. Core Schema & Types | 1/1 | Complete | `606a23ca` |
| 27. Retrieval & Extraction | 1/1 | Complete | `606a23ca` + `060fa905` |
| 28. Maintenance, GDPR & API | 1/1 | Complete | `606a23ca` + `060fa905` |
| 29. Dashboard | 1/1 | Complete | `606a23ca` |
