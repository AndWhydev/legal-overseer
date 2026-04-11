# Cognitive Memory OS — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Scope:** BitBit memory retrieval pipeline overhaul — entity graph, temporal knowledge, contextual retrieval, sleep consolidation, adaptive routing, predictive loading, procedural memory.

---

## Problem

BitBit's memory search surfaces only recent, high-confidence memories. The root causes:

1. **Proactive recall** uses confidence-only ordering (top 5, 500 tokens) — no relevance signal
2. **No entity graph** — memories are flat documents, not connected knowledge
3. **No temporal reasoning** — can't answer "what happened with Steve in February"
4. **Consolidation is passive** — decay runs but no summarization, conflict resolution, or relationship discovery
5. **No adaptive retrieval** — every query gets the same pipeline regardless of complexity
6. **No predictive loading** — context assembly waits for user input before fetching

## Architecture Overview

Six interconnected layers, built incrementally:

```
Layer 6: Predictive Context Loading + Procedural Memory
Layer 5: Adaptive Query Routing
Layer 4: Sleep-Cycle Consolidation
Layer 3: Contextual Retrieval at Ingestion
Layer 2: Graph-Aware Retrieval
Layer 1: Entity Graph + Temporal Knowledge (foundation)
```

Each layer is independently testable and deployable. Lower layers are prerequisites for upper layers.

---

## Layer 1: Entity Graph + Temporal Knowledge

### Tables

**entity_nodes**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, gen_random_uuid() |
| org_id | UUID | FK organisations |
| entity_type | TEXT | 'person', 'project', 'company', 'invoice', 'channel' |
| name | TEXT | Display name |
| aliases | TEXT[] | Fuzzy match targets |
| properties | JSONB | Type-specific data (email, phone, status, etc.) |
| embedding | vector(768) | Google multimodal embedding |
| text_embedding | vector(1024) | Voyage-3.5 text embedding (optional) |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Indexes: GIN on aliases, btree on (org_id, entity_type), HNSW on embedding, HNSW on text_embedding.

**entity_edges**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| org_id | UUID | FK organisations |
| source_id | UUID | FK entity_nodes |
| target_id | UUID | FK entity_nodes |
| relation_type | TEXT | 'works_with', 'owns', 'blocked_by', 'invoiced', 'communicated', etc. |
| properties | JSONB | Relation-specific data |
| valid_from | TIMESTAMPTZ | When this became true |
| valid_until | TIMESTAMPTZ | Null = still true |
| ingested_at | TIMESTAMPTZ | When we learned this |
| confidence | FLOAT | 0.0-1.0 |
| source_memory_id | UUID | Provenance link to memory_palace_entries |

Indexes: btree on (source_id, valid_until), btree on (target_id, valid_until), btree on (org_id, relation_type).

**event_tuples**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| org_id | UUID | FK organisations |
| subject_id | UUID | FK entity_nodes |
| verb | TEXT | 'paid', 'emailed', 'completed', 'blocked' |
| object_text | TEXT | Free text: '$200', 'Phase 2 proposal' |
| object_id | UUID | FK entity_nodes, nullable |
| occurred_at | TIMESTAMPTZ | When event happened |
| occurred_until | TIMESTAMPTZ | Nullable, for ranges |
| source_memory_id | UUID | Provenance |
| metadata | JSONB | |

Indexes: btree on (org_id, subject_id, occurred_at DESC), btree on (org_id, occurred_at DESC).

### Entity Resolution Integration

The existing 5-step fuzzy cascade in entity resolution resolves contact mentions to contact IDs. A new step maps contact IDs to entity_node IDs via the aliases array. If no entity_node exists, one is created on first mention.

### Graph Population

Entity extraction runs as a fire-and-forget step after memory writes (existing pattern in embedding-service.ts). Uses Haiku to extract (subject, verb, object, timestamp) tuples from new memories and messages. Creates entity_nodes on first encounter, creates edges for relationships, inserts event_tuples for discrete events.

---

## Layer 2: Graph-Aware Retrieval

### Proactive Recall Overhaul

**File:** `src/lib/memory-palace/proactive-recall.ts`

Replace the current implementation:

```
Current: top 5 by confidence, 500 token budget
New:     graph + vector hybrid, 1500 token budget
```

New recall flow:

1. Extract entity mentions from current message (existing)
2. Resolve to entity_node IDs
3. Parallel fetch:
   a. Graph walk: 1-hop edges from mentioned entities where valid_until IS NULL
   b. Vector search: embed message via multimodal model, pgvector similarity on entity_nodes.embedding, top 10
   c. Event lookup: recent event_tuples for mentioned entities (last 30 days)
4. Score each result: `0.4 * vector_similarity + 0.3 * confidence + 0.2 * recency_score + 0.1 * edge_weight`
   - recency_score = exp(-0.01 * age_in_days), capped at [0, 1]
   - edge_weight = 1.0 for direct edges, 0.5 for 2-hop
5. Deduplicate by entity_node ID
6. Format top results into 1500-token budget
7. Inject as `<memory-context>` block in system prompt

### Memory Search Enhancement

**File:** `src/lib/memory-palace/memory-search.ts`

Add `graphSearch()` method:

- Input: query string, entity_node IDs (optional), time range (optional)
- Process: pgvector similarity on entity_nodes + JOIN entity_edges + filter by time
- Returns: ranked list of entity nodes with relationship context

The existing `search_memory` tool handler calls `graphSearch()` alongside Pinecone and sparse search, merging results via RRF.

---

## Layer 3: Contextual Retrieval at Ingestion

**File:** `src/lib/rag/chunker.ts` (modify), `src/lib/rag/contextualizer.ts` (new)

After chunking, before embedding:

1. For each chunk, call Haiku with prompt:
   ```
   <message>{{FULL_MESSAGE}}</message>
   <chunk>{{CHUNK_CONTENT}}</chunk>
   Give a short context to situate this chunk: who is speaking/writing,
   what entity/project is discussed, and when. Answer only with the context.
   ```
2. Prepend the context (50-100 tokens) to the chunk text
3. Embed the contextualized chunk

Cost: ~$1 per million tokens at ingestion. At BitBit's volume, negligible.

Applies to: new channel_messages ingested via relay daemon, new memory_palace_entries, conversation messages via unified pipeline.

---

## Layer 4: Sleep-Cycle Consolidation

**Files:** `src/lib/memory-palace/sleep-consolidation.ts` (new), `src/app/api/cron/sleep-consolidation/route.ts` (new)

**Schedule:** Daily at 2am AEST (16:00 UTC previous day) via existing cron infrastructure.

### Five stages, executed sequentially:

**Stage 1: SUMMARIZE** — Per-entity daily digest.
For each entity_node with new event_tuples or edges today, Haiku generates a 2-3 sentence state summary. Stored in `entity_nodes.properties.daily_summary`.

**Stage 2: RESOLVE CONFLICTS** — Temporal precedence.
Find entity_edges where two edges share (source_id, target_id, relation_type) and both have valid_until IS NULL. The edge with the older valid_from gets `valid_until = now`. Resolution logged to decision_log.

**Stage 3: DISCOVER RELATIONSHIPS** — Latent edge detection.
For entity pairs that co-occur in event_tuples (same day, same message, same thread) but have no direct edge: Haiku evaluates whether a meaningful relationship exists. If confidence > 0.7, create edge with source='consolidation'.

**Stage 4: PRUNE** — Noise reduction.
Memories written today with confidence < 0.3 and zero entity links are archived (is_active=false). Existing decay pipeline continues for older memories.

**Stage 5: GENERATE MORNING BRIEFING** — Anticipatory context.
Query entities with: deadlines within 48h, overdue actions, unread messages, newly discovered relationships. Haiku generates structured briefing. Stored in `organisations.settings.morning_briefing`.

### Design constraints:
- All LLM calls use Haiku (cheapest)
- Each stage is idempotent — safe to re-run
- Consolidation produces new data (edges, tuples, summaries), never mutates source memories
- Total cost: ~$0.10-0.50 per nightly run at current volume

---

## Layer 5: Adaptive Query Routing

**File:** `src/lib/rag/query-router.ts` (new)

### Classification (rule-based, no LLM):

```
Score = sum of:
  +1  entity count > 1
  +1  temporal markers present
  +1  query length > 50 chars
  +1  relational keywords present

0-1 → SIMPLE
2   → MODERATE
3-4 → COMPLEX
```

### Retrieval paths:

| Path | Vector | Graph | Rerank | topK | Token budget | Target latency |
|------|--------|-------|--------|------|-------------|----------------|
| SIMPLE | BM25 only | No | No | 5 | 500 | ~20ms |
| MODERATE | Hybrid BM25+dense | 1-hop | No | 10 | 1500 | ~80ms |
| COMPLEX | Hybrid + multi-hop | Full graph | Voyage rerank-2 | 20 | 3000 | ~150ms |

### Integration:
- `search_memory` tool handler calls `classifyQuery()` before dispatching
- Proactive recall defaults to MODERATE (entities already known)
- Context assembler adjusts token allocation based on route

---

## Layer 6: Predictive Context Loading + Procedural Memory

### Predictive Loading

**File:** `src/lib/context-assembly/predictive-loader.ts` (new)

Evaluated at conversation start, parallel with other context assembly:

1. **Deadline signal:** entity_nodes with event_tuples where occurred_at within 48h future
2. **Unresolved signal:** entities with pending approval_queue items
3. **Recency signal:** entities with event_tuples in last 4h
4. **Pattern signal:** frequency analysis of entity mentions by hour-of-day

Results share the 1500-token proactive recall budget. Predictive results are lower priority than entity-triggered recall.

### Procedural Memory

**Table: procedural_memories**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| org_id | UUID | FK organisations |
| name | TEXT | "AWU email protocol" |
| trigger_pattern | TEXT | Regex or keyword pattern |
| steps | JSONB[] | Ordered action sequence |
| success_count | INT | Times executed successfully |
| last_used_at | TIMESTAMPTZ | |
| source | TEXT | 'observed', 'explicit', 'consolidation' |
| is_active | BOOLEAN | Default true |

**Creation paths:**
- Observed: Sleep consolidation detects repeated tool sequences (3+ occurrences) and creates procedural memory
- Explicit: User instructs "remember how to do X", agent creates via tool call
- Consolidation: Promotes from memory_patterns table when confidence > 0.75

**Usage:** Proactive recall checks trigger_pattern against current message. If matched, injects steps as "## Known Procedure" in system prompt.

---

## Migration Strategy

### Phase 1: Foundation (Layer 1)
- Enable pgvector extension on Supabase
- Create entity_nodes, entity_edges, event_tuples tables
- Backfill entity_nodes from existing contacts table
- Backfill edges from existing projects.metadata (contact relationships)

### Phase 2: Retrieval (Layers 2-3)
- Deploy contextualizer in ingestion pipeline
- Deploy graph-aware proactive recall
- Deploy enhanced memory search

### Phase 3: Intelligence (Layers 4-6)
- Deploy sleep consolidation cron
- Deploy adaptive query routing
- Deploy predictive loading + procedural memory

### Embedding Model Configuration

- Primary: Google multimodal embedding (768d) for entity_nodes.embedding
- Secondary: Voyage-3.5 (1024d) for entity_nodes.text_embedding (text-heavy nodes)
- Configurable via environment variables: `EMBEDDING_MODEL_PRIMARY`, `EMBEDDING_MODEL_SECONDARY`

---

## Testing Strategy

TDD for all layers. Each layer has:

1. **Unit tests** for pure functions (scoring, classification, merge logic)
2. **Integration tests** for database queries (pgvector similarity, graph traversal)
3. **E2E tests** for full pipeline (message in → correct memories surfaced)

Key test scenarios:
- "What did Steve say about pricing?" retrieves Feb 6 conversation (temporal + entity)
- "How does Maya's project relate to the outstanding invoice?" retrieves multi-hop (Maya → project → invoice)
- Simple query routes through SIMPLE path (latency < 30ms)
- Complex query routes through COMPLEX path with reranking
- Sleep consolidation resolves contradictory facts by temporal precedence
- Predictive loading surfaces deadline within 48h at conversation start
- Procedural memory triggers on "email AWU client" → injects M365 protocol

---

## Success Criteria

1. **Autonomy metric**: Dashboard shows proactive recall contributing to >50% of chat responses (vs current ~0%)
2. **Retrieval depth**: search_memory finds memories from 6+ months ago when relevant (currently limited to recent)
3. **Latency**: Context assembly stays under 200ms for SIMPLE/MODERATE queries
4. **Morning briefing**: Generated daily with actionable items, visible on dashboard
5. **Procedural memory**: At least 5 procedures captured within first 2 weeks of operation
