# Phase 44: Living Brain Architecture v2

## Goal
Replace the read-heavy RAG-on-every-turn model with a write-heavy architecture where background workers continuously consolidate information into pre-compiled dossiers. Close ALL gaps between BitBit's current brain and best-in-class production systems.

## Business Context
- Current: 6+ retrieval operations per turn, ~$1.00/day/user, ~200ms assembly latency
- Target: 0-1 retrievals per turn, ~$0.08/day/user, ~25ms assembly latency
- This is foundational infrastructure — every feature built on top gets faster and cheaper

## Scope: 7 Workstreams

### WS-1: Knowledge WAL + Dossier Tables (Foundation)
**Gap**: No pre-compiled context, no write-ahead log for knowledge events
**Best-in-class**: Karpathy's LLM Wiki, Materialize AI Context Engines, CQRS/Event Sourcing
**Deliverables**:
- `knowledge_log` table (append-only WAL for all signals)
- `entity_dossiers` table (pre-compiled per-entity brain state)
- `domain_profiles` table (cross-entity rollups with Merkle-tree change detection)
- Dual-write: emit WAL entries alongside existing pipeline
- WAL tail query for unconsolidated signals

### WS-2: Worker Infrastructure (BullMQ + Redis)
**Gap**: No continuous consolidation — only nightly batch
**Best-in-class**: Zep/Graphiti (real-time event-driven), Letta Sleep-Time Agents
**Deliverables**:
- BullMQ + Redis infrastructure on Fly.io
- Tier 1: Intake Clerks (Haiku, <2s, entity extraction + fact extraction + routing)
- Tier 2: Section Librarians (Sonnet, <10s, domain-specific dossier delta-merge)
- Tier 3: Chief Librarian (Sonnet/Opus, <60s, cross-domain synthesis + morning briefing)
- Windowed batching (30s windows, 5-10x cost reduction)
- Cursor-based processing (last_fact_id high-water mark)
- Backpressure handling, dead letter queues, per-org concurrency limits

### WS-3: Predictive Coding + Schema Engine
**Gap**: All memories treated equally — no surprise scoring, no entity schemas
**Best-in-class**: Free Energy Principle, Predictive Coding Networks
**Deliverables**:
- `schema_json` field on entity dossiers (predicted baseline behavior per entity)
- Surprise scoring: compare new facts against schema, only store deviations
- Corroboration-as-prediction: high-corroboration memories = schema, contradictions = prediction errors
- Schema auto-update: when enough prediction errors accumulate in one direction, update schema
- Surprise-weighted retrieval: prioritize high-surprise memories in context

### WS-4: System 1/2 Query Gating
**Gap**: No query-complexity gating — all queries get same retrieval depth
**Best-in-class**: VoiceAgentRAG (Salesforce, 316x speedup), Dual Process Theory
**Deliverables**:
- Query complexity classifier in TAOR Triage step
- System 1 (fast path): dossier-only, <50ms (simple lookups, greetings, approvals)
- System 2 (slow path): dossier + L3 retrieval, <500ms (multi-entity, temporal, "why" questions)
- Confidence-based escalation: low-confidence System 1 → System 2
- Novelty detection: no cached pattern → System 2

### WS-5: Hippocampal Index (KG-First Routing)
**Gap**: KG exists but isn't used as primary routing layer
**Best-in-class**: HippoRAG (NeurIPS 2024, 20% accuracy, 10-30x cheaper, 6-13x faster)
**Deliverables**:
- Unify kg_nodes/edges and entity_nodes/edges into single neural KG
- PageRank-based traversal for multi-hop reasoning
- KG as the routing layer: query → KG traversal → identify relevant dossiers → load
- Parahippocampal synonymy detection (resolve "Steve", "Steve West", "SW" to same entity)
- Eliminate redundant vector search by routing through KG first

### WS-6: L1 Prompt Cache (Brain State Prefix)
**Gap**: No prompt caching, context rebuilt from scratch every turn
**Best-in-class**: Anthropic prompt caching (90% read cost reduction, 85% latency reduction)
**Deliverables**:
- Structure system prompt as cacheable prefix: [system] + [user profile] + [top entity dossiers] + [fiduciary constraints] + [domain profiles]
- 1-hour cache with hourly rebuild by Chief Librarian
- Cache-aware context assembly: prefix (cached) + conversation (dynamic)
- Token budget: ~50K token prefix → $0.005/query read cost
- Cache invalidation on significant dossier changes

### WS-7: Competitive Context Selection (Global Workspace)
**Gap**: Fixed 4-tier allocation, no competitive module selection
**Best-in-class**: Global Workspace Theory (Baars), competitive broadcasting
**Deliverables**:
- Memory modules as competing processors (entity, decision, pattern, financial, temporal, warning, fiduciary)
- Per-module relevance scoring based on current query
- Budget allocator (central executive) selects top-K contributions within token budget
- Priority override for safety signals (fiduciary constraints always win)
- Replace fixed tier allocation with dynamic competitive allocation

## Depends On
- Existing Memory Palace infrastructure (phases 28-36)
- Existing Knowledge Graph (phase 36)
- Existing TAOR loop and context assembly
- Redis infrastructure (or provision new)

## Research Completed
- Full synthesis: `.planning/research/brain-architecture-v2.md`
- 4 parallel research agents covered: Dossier patterns, Worker architectures, Beyond-RAG alternatives, Neuroscience-inspired models
- Production validation from: Zep/Graphiti, HippoRAG, Letta, Mem0, VoiceAgentRAG, Materialize, Karpathy Wiki

## Complexity Assessment
- **Scope**: Large — 7 workstreams touching core infrastructure
- **Risk**: Medium — incremental migration path, dual-write allows parallel operation
- **Dependencies**: Low — builds on existing primitives, no new external services (except Redis/BullMQ)
- **Reversibility**: High — each workstream is independently deployable and rollback-safe
