# Project State

## Current Position

Phase: 39 of 40 (Adaptive Query Routing)
Plan: Not started
Status: Ready to plan
Last activity: 2026-04-04 — Phase 38 complete (sleep consolidation)

Progress: ██████████████████████░░░░░░░░ ~78%

## Performance Metrics

- Total plans completed: 10
- Average duration: 8 min
- Total execution time: 1.4 hours

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 35 | 3/3 | 40min | 13min |
| 36 | 2/2 | 11min | 6min |
| 37 | 2/2 | 10min | 5min |
| 38 | 2/2 | 16min | 8min |

## Accumulated Context

### Decisions
- pgvector, organizations FK, match_entity_nodes RPC
- Haiku + Zod extraction, Google key pending
- graphAwareRecall primary with legacy fallback, 1500 tokens, blended scoring
- Graph search as 5th source in search_memory
- Contextualizer in embedding pipeline, CONTEXTUALIZE_ENABLED toggle
- Sleep consolidation: JS fallback for duplicate edges, metadata for archive_reason
- Morning briefing: user auth pattern, 24h staleness, monochrome styling

### Deferred Issues
- GOOGLE_API_KEY needed for 768d embeddings

## Session Continuity
Last session: 2026-04-04
Stopped at: Phase 38 complete, ready for Phase 39
