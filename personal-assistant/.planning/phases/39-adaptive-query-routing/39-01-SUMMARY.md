---
phase: 39-adaptive-query-routing
plan: 01
subsystem: rag-pipeline
tags: [query-routing, classifier, retrieval-optimization, tdd]
requires:
  - phase: 36-graph-aware-retrieval
    provides: graph search paths to route to
provides:
  - classifyQuery() rule-based classifier (simple/moderate/complex)
  - getRetrievalConfig() with topK, token budget, graph/rerank flags
  - Integrated into search_memory and proactive recall
affects: []
key-files:
  created: [src/lib/rag/query-router.ts, src/lib/rag/__tests__/query-router.test.ts]
  modified: [src/lib/agent/tools.ts, src/lib/memory-palace/proactive-recall.ts]
key-decisions:
  - "Pure string analysis, no DB/LLM calls for classification"
  - "MAX_RECALL_TOKENS from getRetrievalConfig instead of hardcoded"
  - "Simple queries skip graph search entirely"
duration: 5min
completed: 2026-04-04
---

# Phase 39 Plan 01: Adaptive Query Router Summary

**Rule-based query classifier routing simple/moderate/complex queries to right-sized retrieval, 10 TDD tests passing**

## Task Commits
1. **RED** - acccc247 (test)
2. **GREEN** - 6f464dde (feat)
3. **Integration** - df22a29b (feat)
