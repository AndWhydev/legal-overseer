# BitBit Brain Architecture v2: The Living Brain

> **Status**: Research synthesis — ready for discussion  
> **Date**: 2026-04-09  
> **Thesis**: Replace the read-heavy RAG-on-every-turn model with a write-heavy architecture where background workers continuously consolidate information into pre-compiled "dossiers" that the brain reads in a single operation.

---

## The Problem

Every conversation turn currently triggers **6+ retrieval operations**:

1. Pinecone vector search (Voyage-3.5, 70/30 dense/sparse hybrid)
2. pgvector cosine search (entity embeddings, 768d + 1024d)
3. Spreading activation (Hebbian KG traversal)
4. Full-text search (Memory Palace tsvector)
5. Thread history load (verbatim + compressed + key facts)
6. Proactive recall (blended 0.4r + 0.3c + 0.2t + 0.1e scoring)

All compressed into ~8K tokens. Target: <200ms. The only "librarian" is a nightly 7-stage sleep consolidation cron at 3am UTC.

**The result**: A library with no librarians where every visitor searches every shelf themselves, every time.

---

## The Vision: Workers + Librarians = Living Brain

```
CURRENT (Read-Heavy):                    PROPOSED (Write-Heavy):
                                         
  signal → store → forget               signal → worker updates dossier
  query  → search 6 systems → rank      query  → read the dossier → done
         → compress → inject             
```

---

## Architectural Foundation: 8 Neuroscience Layers

These aren't alternatives — they're layers of the same system. Each maps to a concrete implementation:

| Layer | Theory | Implementation | Current BitBit | Gap |
|-------|--------|---------------|----------------|-----|
| 1. Storage | Hippocampal Indexing | KG index routing to distributed data | `entity_ids[]` arrays | Need proper KG as primary routing layer |
| 2. Encoding | Predictive Coding | Only store prediction errors (surprises) | `confidence` + `corroboration_count` | All memories treated equally — no surprise scoring |
| 3. Fast Path | Dual Process (System 1) | Cached responses, direct entity lookup | Confidence routing (act/ask/escalate) | No query-complexity gating — all queries get same depth |
| 4. Slow Path | Dual Process (System 2) | Deep retrieval + reasoning on cache miss | Full RAG pipeline | Currently the ONLY path, not the fallback |
| 5. Consolidation | Systems Consolidation | Continuous workers: replay, prune, promote | 7-stage nightly batch | Not continuous — one batch/day |
| 6. Knowledge | Schema Theory | Per-entity schemas compressing many memories | `MemoryCategory` types are proto-schemas | No per-entity schema objects |
| 7. Assembly | Baddeley Working Memory | Central executive curating limited budget | 4-tier context assembly | No competitive budget allocation |
| 8. Selection | Global Workspace | Competing modules broadcast best signals | Implicit in context assembler | No explicit module competition |

---

## The L1/L2/L3 Tiered Architecture

Inspired by CPU cache hierarchy (validated by March 2026 paper on multi-agent memory):

### L1: Hot Context (In-Prompt, Cached)

**Always loaded via Anthropic prompt caching.**

Contents:
- User profile, preferences, autonomy settings
- Top 5-10 active entity dossiers (pre-compiled)
- Strategy memories and decision frameworks
- Fiduciary constraints (never-decay)
- Current conversation thread

Cost: **0.1x per read** (prompt cache). Write once per hour.

At 50K tokens cached, 10 queries/hour = **~85% cost reduction** vs current per-query assembly.

### L2: Warm Memory (Pre-Compiled Dossiers, Swappable)

**Background workers continuously maintain these. Swapped by conversation topic.**

Contents:
- Entity dossiers (one per contact/project, ~500-1000 tokens each)
- Domain profiles (financial health, relationship map, behavioral patterns, ~2000-3000 tokens each)
- Situation reports (one per active thread/project)
- Morning briefings (compiled actionable intel)

Updated: every few minutes by event-driven workers.

Read: single DB query (~20ms). **Replaces 80% of current retrieval.**

### L3: Cold Storage (Traditional RAG, On Cache Miss Only)

**The exception, not the default.**

Contents:
- Full Pinecone vector pipeline
- Knowledge graph traversal
- Complete message archive
- Historical patterns and decisions

Fires: only when L1+L2 don't have the answer (<20% of queries).

### The Net Effect

| Metric | Current (6+ retrievals) | Proposed (L1/L2/L3) |
|--------|------------------------|---------------------|
| Query-time retrievals | 6+ per turn | 0-1 per turn |
| Context assembly latency | ~200ms | ~25ms |
| Cost per query | ~$0.01 | ~$0.001 |
| Cost per day (50 msgs/user) | ~$1.00 | ~$0.08 |
| Context freshness | Always current | 5-30s stale + WAL tail |
| Nightly batch job | Required (7 stages) | Optional (catchup only) |

---

## The Worker Architecture: Librarian Hierarchy

### Write-Ahead Knowledge Log (WAL)

Every signal gets appended to an immutable log before any processing:

```sql
CREATE TABLE knowledge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  entity_ids UUID[] DEFAULT '{}',
  signal_type TEXT NOT NULL,  -- message, invoice, calendar, pattern, correction
  content TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.7,
  consolidated_at TIMESTAMPTZ,  -- NULL until a worker processes it
  created_at TIMESTAMPTZ DEFAULT now()
);

-- The "tail read" query: what's not yet consolidated?
CREATE INDEX idx_klog_unconsolidated 
  ON knowledge_log (org_id, created_at DESC) 
  WHERE consolidated_at IS NULL;
```

### Three-Tier Worker Hierarchy

```
TIER 1 — Intake Clerks (high-throughput, low-cost)
  Queue:    memory:intake (BullMQ on Redis)
  Model:    Haiku (~$0.001 per message)
  Job:      Tag signal type, extract entities, extract facts, route
  Latency:  <2s per message
  Workers:  10-20 concurrent
  Trigger:  Every new message/invoice/event

TIER 2 — Section Librarians (domain-specific, medium-cost)
  Queues:   memory:financial, memory:relational, memory:operational
  Model:    Sonnet (~$0.003 per update)
  Job:      Delta-merge facts into entity dossier, detect domain patterns
  Latency:  <10s per update
  Workers:  3-5 per domain
  Trigger:  Batched — fires after 30s window of accumulated facts

TIER 3 — Chief Librarian (cross-cutting, periodic)
  Queue:    memory:synthesis
  Model:    Sonnet/Opus (stronger, less frequent)
  Job:      Cross-domain pattern detection, conflict resolution,
            master index update, morning briefing generation
  Latency:  <60s per synthesis cycle
  Workers:  1 per org (serialized)
  Trigger:  After N Tier 2 updates OR on schedule (hourly)
```

### Windowed Batching (Critical Optimization)

Instead of firing an LLM call per message, batch facts into 30-second windows:

```
Message 1 arrives at T+0s  → queue fact, schedule batch for T+30s
Message 2 arrives at T+5s  → append to pending batch
Message 3 arrives at T+12s → append to pending batch
T+30s fires               → single LLM call processes all 3 facts
```

This yields **5-10x cost reduction** vs per-message processing.

---

## The Dossier Model

### Entity Dossier (L2 — one per contact/project)

```sql
CREATE TABLE entity_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id),
  entity_name TEXT NOT NULL,
  
  -- The pre-compiled brain state, ready for LLM injection
  dossier_markdown TEXT NOT NULL,
  
  -- Schema (prediction model) — the "expected" baseline
  schema_json JSONB NOT NULL DEFAULT '{}',
  -- e.g. { payment_behavior: "pays within 14 days",
  --        communication_style: "formal, detail-oriented",
  --        project_type: "WordPress builds, $5-8K",
  --        relationship_status: "active, 3 projects completed" }
  
  -- Freshness tracking
  version INT NOT NULL DEFAULT 1,
  last_compiled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stale_since TIMESTAMPTZ,  -- set when new signals arrive, cleared on recompile
  
  -- Budget tracking
  token_count INT NOT NULL DEFAULT 0,
  
  -- Compilation metadata
  facts_incorporated INT NOT NULL DEFAULT 0,
  last_fact_id UUID,  -- cursor: last knowledge_log entry processed
  compilation_model TEXT,  -- which model compiled this version
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE (org_id, entity_id)
);

CREATE INDEX idx_dossiers_stale 
  ON entity_dossiers (org_id, stale_since) 
  WHERE stale_since IS NOT NULL;
```

### Domain Profile (L2 — cross-entity rollups)

```sql
CREATE TABLE domain_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  domain TEXT NOT NULL,  -- financial, relational, operational, behavioral
  
  profile_markdown TEXT NOT NULL,
  
  -- Merkle-tree change detection
  constituent_hashes JSONB NOT NULL DEFAULT '{}',
  -- e.g. { "entity_abc": "sha256...", "entity_def": "sha256..." }
  -- Only re-synthesize when constituent entity dossier hashes change
  
  version INT NOT NULL DEFAULT 1,
  last_compiled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_count INT NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE (org_id, domain)
);
```

---

## The Encoding Revolution: Predictive Coding

### Only Store Surprises

From Friston's Free Energy Principle: the brain only encodes **prediction errors**. If BitBit processes 100 messages from a client, ~80% are "as expected." Only the ~20% that deviate from the entity's schema need dedicated memory entries.

**Implementation:**

1. Each entity dossier contains a `schema_json` — the predicted baseline behavior
2. When a new fact arrives, the Intake Clerk compares it against the schema
3. **Expected** (matches schema): increment `corroboration_count`, don't create new memory
4. **Surprising** (deviates from schema): create memory with `surprise_score`, prioritize in dossier
5. When enough prediction errors accumulate in one direction: **update the schema itself** (this IS episodic→semantic promotion)

**BitBit already has the primitives:**
- `corroboration_count` measures how expected something is
- High-corroboration memories ARE the prediction/schema
- Low-corroboration contradictions ARE prediction errors
- The system just doesn't use this distinction architecturally

### Surprise-Weighted Retrieval

During context assembly, prioritize memories with high surprise scores. The "expected" stuff is already in the schema; the surprises are what the agent needs to know about.

---

## System 1 / System 2 Gating

### Fast Path (System 1) — No Retrieval Needed

| Query Type | Response | Latency |
|-----------|----------|---------|
| "What's Client X's email?" | Direct entity lookup from dossier | <10ms |
| Greeting/small talk | Cached response + personalization from dossier | <50ms |
| "Remind me what we decided" | Decision log keyword search | <50ms |
| Simple approval ("yes, send it") | Resolve pending action | <100ms |

### Slow Path (System 2) — Full Retrieval

| Query Type | Response | Latency |
|-----------|----------|---------|
| "Should we take this project given capacity?" | Multi-dossier cross-reference + reasoning | ~500ms |
| "What's the full history with this contact?" | L3 cold storage retrieval | ~200ms |
| Novel query (no cached pattern) | Full RAG pipeline | ~200ms |

### Gating Mechanism

```
Query arrives
  → Complexity detection:
      Simple lookup?     → System 1 (dossier only)
      Multi-entity?      → System 2 (cross-reference dossiers)
      Temporal reasoning? → System 2 (knowledge log + dossiers)
      Novel topic?        → System 2 (L3 cold storage)
      "Why" question?     → System 2 (decision log + reasoning)
```

The TAOR loop's "Triage" step becomes the System 1/2 router. Salesforce's VoiceAgentRAG achieved **316x speedup** with this pattern.

---

## Context Assembly v2

### Current: 4-Tier Parallel Fetch (~200ms)

```
Tier 1: System prompt (identity, guidelines)
Tier 2: Session history (verbatim + compressed + facts)
Tier 3: Entity context (baseplate snapshots for mentions)
Tier 4: Action state (pending approvals)
→ 6+ retrieval operations, token budget compression
```

### Proposed: Dossier-First Assembly (~25ms)

```
Step 1: Load cached prefix (L1)                    ~0ms (prompt cache hit)
        - System prompt, user profile, top entities
        
Step 2: Identify conversation topic                 ~5ms
        - Entity mention scanning
        - Complexity classification (System 1/2 gating)
        
Step 3: Swap relevant dossiers (L2)                ~15ms
        - Load entity dossiers for mentioned entities
        - Load relevant domain profile
        
Step 4: Read WAL tail                              ~5ms
        - SELECT * FROM knowledge_log
          WHERE org_id = ? AND consolidated_at IS NULL
          ORDER BY created_at DESC LIMIT 20
        - Catches anything not yet consolidated
        
Step 5 (System 2 only): L3 retrieval              ~200ms
        - Full RAG pipeline, knowledge graph traversal
        - Only fires on cache miss
```

### Global Workspace: Competitive Module Selection

Instead of stuffing everything into the budget, memory modules **compete** for context space:

| Module | Specialization | Competes When | Priority |
|--------|---------------|---------------|----------|
| Fiduciary Memory | Constraints, warnings | Always (safety) | HIGHEST |
| Entity Dossier | Contact/project facts | Entity mentioned | HIGH |
| Decision Memory | Past reasoning | Similar decision context | HIGH |
| Pattern Memory | Behavioral trends | Pattern entity active | MEDIUM |
| Financial Memory | Pricing, invoices | Money/pricing mentioned | MEDIUM |
| Temporal Memory | Recent conversation | Always (recency) | MEDIUM |
| Warning Memory | Red flags, overdue | Risk indicators | LOW (but escalates) |

Each module produces a relevance score. The **budget allocator** (central executive) selects top-K contributions that fit within the token budget. This replaces the current fixed 4-tier allocation.

---

## LSM-Tree Knowledge Compaction

Inspired by Log-Structured Merge Trees — the same pattern databases use for write-heavy workloads:

```
LEVEL 0: Raw Facts (append-only knowledge_log)
  Every extracted fact with timestamp, source, confidence
  Never deleted, only marked as consolidated
  Analogous to LSM memtable / WAL

LEVEL 1: Entity Dossiers (incremental delta merge)
  Per-entity structured summary
  Updated via delta: new fact → LLM merges into existing dossier
  Tracks cursor (last_fact_id)
  ~500-1000 tokens per entity
  Analogous to LSM L0→L1 compaction

LEVEL 2: Domain Profiles (periodic synthesis)
  Cross-entity rollups: financial health, relationship map, behavioral
  Rebuilt when >N constituent dossier hashes change (Merkle-tree detection)
  ~2000-3000 tokens per domain
  Analogous to LSM L1→L2 compaction

LEVEL 3: Master Brain State (the cached prefix)
  Aggregated from top dossiers + domain profiles + fiduciary constraints
  Rebuilt hourly or on significant change
  This IS the L1 prompt cache payload
```

### Delta Update (Not Full Re-Summarization)

Critical: naive re-summarization destroys ~60% of facts during compaction. Instead:

```
Current dossier + New facts → LLM produces ONLY the delta → Merge
```

The LLM sees the current dossier and the new facts, and outputs only what changed. This preserves existing context while incorporating new information.

---

## Redundancy Consolidation

The current brain has overlapping systems that should be unified:

| Current (Redundant) | Proposed (Unified) |
|---------------------|-------------------|
| Memory Palace entries + Semantic Memories | → Entity Dossiers (pre-compiled) |
| Knowledge Graph (kg_nodes/edges) + Entity Graph (entity_nodes/edges) | → Single Neural KG with Hebbian learning |
| Pinecone vector search + pgvector search | → pgvector primary, Pinecone for L3 cold storage only |
| Proactive recall + sleep consolidation summaries | → Continuous worker output (dossiers) |
| 6+ per-turn retrieval operations | → 1-2 dossier reads + WAL tail |

---

## Migration Path

### Phase A: Foundation (No Disruption)

1. Add `knowledge_log` table
2. Emit WAL entries alongside existing pipeline (dual-write)
3. Add `entity_dossiers` and `domain_profiles` tables
4. No changes to query path

### Phase B: Workers (Parallel Operation)

1. Deploy BullMQ + Redis infrastructure
2. Build Intake Clerk workers (Tier 1)
3. Start populating entity dossiers from knowledge log
4. Run alongside existing nightly consolidation
5. Monitor dossier quality vs proactive recall quality

### Phase C: Switchover (Replace Query Path)

1. Add System 1/2 gating to TAOR Triage step
2. Switch `context-assembler.ts` to read dossiers + WAL tail
3. System 1 queries skip all retrieval (dossier only)
4. System 2 queries add L3 retrieval as fallback
5. Enable Anthropic prompt caching for L1 brain state

### Phase D: Maturity (Deprecate Legacy)

1. Deprecate nightly sleep consolidation batch (keep as catchup/fallback)
2. Unify kg_nodes/edges and entity_nodes/edges into single graph
3. Reduce Pinecone to L3 cold storage only
4. Add competitive module selection (Global Workspace pattern)
5. Implement predictive coding (surprise scoring on schema deviations)

---

## Production Validation

Systems already doing this in production:

| System | Architecture | Results |
|--------|-------------|---------|
| **Zep/Graphiti** | Temporal KG + pre-compiled entity summaries | 94.8% accuracy, 90% latency reduction vs RAG |
| **Google Vertex AI Memory Bank** | Background extraction + continuous refinement | GA 2026 |
| **Materialize** | Continuously maintained materialized views for AI | Production |
| **Letta Sleep-Time Agents** | Dual-agent with background consolidation | Production, cursor-based processing |
| **HippoRAG** | KG index + PageRank routing | 20% accuracy gain, 10-30x cheaper, 6-13x faster |
| **Mem0** | Vector + graph + KV hybrid with incremental updates | 68.4% LOCOMO, 91% lower latency vs full context |
| **VoiceAgentRAG** (Salesforce) | System 1/2 dual-agent | 316x retrieval speedup |

---

## Key Research Sources

- [Sleep-Time Compute (Lin et al., April 2025)](https://arxiv.org/abs/2504.13171) — 5x test-time compute reduction via idle-period preprocessing
- [Karpathy's LLM Wiki (April 2026)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Three-layer LLM-maintained knowledge base outperforming RAG
- [Zep Temporal KG (January 2025)](https://arxiv.org/html/2501.13956v1) — 94.8% DMR benchmark
- [HippoRAG (NeurIPS 2024)](https://arxiv.org/abs/2405.14831) — Hippocampal-inspired retrieval
- [Materialize AI Context Engines](https://materialize.com/blog/ai-context-engines-context-engineering-evolution/) — Materialized views for LLM context
- [Multi-Agent Memory from Computer Architecture Perspective (March 2026)](https://arxiv.org/html/2603.10062v1) — L1/L2/L3 cache analogy
- [Anthropic Context Engineering (September 2025)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Structured note-taking, compaction, sub-agent delegation
- [VoiceAgentRAG (Salesforce, March 2026)](https://earezki.com/ai-news/2026-03-30-salesforce-ai-research-releases-voiceagentrag-a-dual-agent-memory-router-that-cuts-voice-rag-retrieval-latency-by-316x/) — 316x speedup via dual-process
- [SleepGate (March 2026)](https://arxiv.org/abs/2603.14517) — Sleep-cycle KV cache consolidation
- [Mem0 State of Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) — Production memory infrastructure benchmarks
- [CLS Theory (McClelland, Kumaran, Hassabis)](https://www.cell.com/trends/cognitive-sciences/abstract/S1364-6613(16)30043-2) — Complementary fast/slow learning systems
