# T009 — Context Baseplate

## Overview

Evolve BitBit's semantic context engine from reactive retrieval to a pre-computed understanding model. The Context Baseplate is BitBit's compiled world model — entity relationships, patterns, and active threads are built at ingest time, not at query time.

## Problem

The current context assembler (`context/assembler.ts`, 460 lines) works but follows a query-time pattern: when a user asks something, the system assembles context on demand. This works for single queries but doesn't scale for proactive intelligence — morning briefings, pattern detection, or cross-channel correlation require pre-computed state.

## Depends On

- T008 (Platform OAuth App Registrations) — needs real data flowing through channels to validate

## What Exists

- Entity graph: `entity_relationships` table, `relationship-linker.ts`, `entity-resolver.ts`
- Timeline: `entity_timeline` table, `timeline-writer.ts`
- Semantic memories: `semantic_memories` table, `reflection.ts`, `memory-consolidation.ts`
- Context assembler: `assembler.ts` (selective, budgeted, entity-aware)
- Classification: `classifier.ts` (LLM-based), `action-router.ts`
- Cross-channel: `dedup.ts`, `relay-daemon.ts`

## What's Missing

The gap is not in individual components but in the compiled-state layer that sits on top:

1. **Compiled entity profiles** — pre-built summaries per entity (contact, project, company) that update incrementally when new data arrives, not rebuilt per query
2. **Active thread tracking** — persistent state for open conversations, pending actions, waiting-for items across channels
3. **Pattern extraction** — background process that identifies recurring patterns (Steve always pays within 48hrs, leads from Event Hero convert at 60%)
4. **Baseplate snapshot** — a materialized view that any agent can read without re-assembling context from scratch
5. **Staleness management** — knowing when a compiled profile is outdated and needs refresh vs when it's still valid

## Acceptance Criteria

- [ ] Entity profiles are pre-computed and update incrementally on new data
- [ ] Active threads are tracked across channels with waiting-for attribution
- [ ] At least 3 pattern types are extracted automatically (payment timing, response latency, conversion rate)
- [ ] Any agent can read a baseplate snapshot without running the full assembler
- [ ] Staleness is tracked per entity — profiles older than N events trigger refresh
- [ ] Morning briefing uses baseplate data, not live assembly

## Risks

- Without real data flowing (T008), validation is theoretical
- The compiled-state pattern adds storage and maintenance complexity
- Incremental updates must handle conflicting signals (new data contradicts old memory)
