# Frontier Agentic Memory Architectures & Knowledge Graphs (2026)

> **Research Date:** 2026-03-15
> **Researcher:** Memory Architecture Specialist (AI Architecture Council)
> **Context:** BitBit has a Context Baseplate concept (pre-computed entity profiles) and Total Recall (3-tier conversation compression), but NO vector search, NO knowledge graph, NO semantic retrieval. Entity_profiles.relationships and memories fields are empty.
> **Sources:** Direct web research across GitHub repos, arXiv papers, vendor docs, practitioner articles, and benchmark comparisons

---

## Executive Summary

The agentic memory landscape in 2026 has matured from research prototypes into production-grade infrastructure. Seven major frameworks compete across three architectural paradigms: **flat memory stores** (Mem0, LangMem), **temporal knowledge graphs** (Zep/Graphiti, Cognee), and **multi-graph orchestration** (MAGMA, EverMemOS). The critical insight for BitBit:

**You need BOTH a knowledge graph AND vector retrieval — they solve different problems.**

- **Vector search** (Pinecone, pgvector) excels at semantic similarity: "find conversations similar to this query." Essential for Total Recall over 12+ months of business communications.
- **Knowledge graphs** (Graphiti/Zep) excel at structured reasoning: "who was managing Project X when we made the budget decision?" Essential for the Context Baseplate's entity relationships and temporal facts.

The frameworks are converging on hybrid architectures. Mem0's latest version combines vector + graph stores. Graphiti combines graph traversal + vector embeddings. The debate is settled: **hybrid wins**.

**Recommendation for BitBit:** Use **Graphiti** (open-source) for the Context Baseplate knowledge graph + **pgvector on Supabase** for Total Recall vector retrieval. Add Pinecone only if/when multi-tenant scale demands it. Skip Mem0's managed service (it's overkill for a single-user system with existing Supabase infrastructure).

---

## 1. Letta V1 (evolved MemGPT)

### Overview
- **GitHub:** [letta-ai/letta](https://github.com/letta-ai/letta) — ~38K stars (Mar 2026)
- **Architecture:** Stateful agent platform with persistent memory, native reasoning, sleep-time compute
- **Latest:** V1 architecture (letta_v1_agent), released 2025-2026

### V1 Architecture Changes (from MemGPT)
The V1 architecture is a significant departure from the original MemGPT design:

| Feature | MemGPT (Legacy) | Letta V1 |
|---------|-----------------|----------|
| Reasoning | Forced through tool calls (`thinking` param) | Native model reasoning (GPT-5, Claude 4.5 Sonnet) |
| Heartbeats | Explicit tool calls for continuation | Eliminated — model decides autonomously |
| `send_message` | Special tool bundling reasoning + output | Deprecated — direct assistant messages |
| Reasoning traces | Mutable, passed across models | Opaque, encrypted by frontier providers |
| Tool rules | Apply to all tools including messages | Cannot apply to AssistantMessage |

**Key trade-off:** V1 leverages frontier model capabilities better, but sacrifices fine-grained control over reasoning. Non-reasoning models generate no reasoning output at all.

### Sleep-Time Compute
Letta's most significant innovation. The concept: AI agents use idle time to process, consolidate, and reorganize memory — transforming "raw context" into "learned context."

**Architecture:**
- **Primary agent:** Handles user interaction (latency-sensitive, can use cheaper model like gpt-4o-mini)
- **Sleep-time agent:** Manages memory rewriting for both agents asynchronously (uses stronger model)
- Dual agents share persistent memory bridges
- Released as part of Letta v0.7.0+

**Performance:**
- ~5x reduction in test-time compute for equivalent accuracy
- 13-18% accuracy increase from scaling sleep-time compute
- Pareto improvement: no response quality degradation despite shifted compute

**Production Status:** Released with full API/SDK support. Requires self-hosted Letta server or Letta Cloud.

### Limitations
1. **Heartbeat removal breaks automated workflows** — for sleep-time compute loops, you need custom prompting
2. **Reasoning opacity** — cannot inspect or mutate reasoning tokens from Claude/GPT
3. **Heavy infrastructure** — requires running a Letta server (Docker), not a lightweight library
4. **Vendor lock-in** — agents are stored in Letta's format, not portable

### Relevance to BitBit
Sleep-time compute is **directly relevant** to the Context Baseplate. BitBit's pre-computed entity profiles are essentially a manual implementation of what Letta automates: converting raw conversation data into structured knowledge during idle time. However, Letta's full agent platform is overkill — BitBit already has its own agent framework. **Extract the pattern, not the platform.**

---

## 2. Zep / Graphiti

### Overview
- **GitHub:** [getzep/graphiti](https://github.com/getzep/graphiti) — ~23K stars (Mar 2026)
- **Latest version:** v0.28.1 (Feb 2026)
- **Architecture:** Temporal knowledge graph engine with bi-temporal model
- **Paper:** [arXiv:2501.13956](https://arxiv.org/abs/2501.13956) — "Zep: A Temporal Knowledge Graph Architecture for Agent Memory"

### Core Architecture: Bi-Temporal Knowledge Graphs

Graphiti's key innovation is the bi-temporal model tracking FOUR timestamps per fact:

| Timestamp | Meaning |
|-----------|---------|
| `t_created` | When fact was recorded in the system |
| `t_expired` | When fact was invalidated in the system |
| `t_valid` | When fact became true in the real world |
| `t_invalid` | When fact stopped being true in the real world |

**Why this matters for BitBit:** "John Smith is VP of Engineering" might have validity windows (2019-2021, 2023-present). The system can correctly answer "Who was VP when we signed the contract in 2020?" by matching temporal validity windows.

### Edge Invalidation
When new information contradicts existing facts, Graphiti doesn't delete old edges — it invalidates them with timestamps. This preserves full temporal history while surfacing only currently-valid facts by default.

**Temporal classification of facts:**
- **Atemporal:** Never change (e.g., "the speed of light is 299,792 km/s")
- **Static:** True from a point forward (e.g., "became CFO on March 1")
- **Dynamic:** Continuously evolving (e.g., "estimated completion date")

### Retrieval: Hybrid Search Without LLM Calls
Graphiti achieves P95 latency of ~300ms through:
1. **Semantic embeddings** — cosine similarity over entity/relationship descriptions
2. **BM25 keyword search** — exact term matching
3. **Graph traversal** — follow edges to related entities

**Critical detail:** No LLM calls during retrieval. This is a key cost and latency advantage.

### Database Backend Support

| Database | Status | Notes |
|----------|--------|-------|
| **Neo4j 5.26+** | Primary/mature | Most battle-tested |
| **FalkorDB 1.1.2+** | Supported | Redis-based, ultra-low latency |
| **Kuzu 0.11.2+** | Supported | Embedded, ~18x faster ingestion than Neo4j |
| **Amazon Neptune** | Supported | Managed AWS service |
| **Pinecone** | Planned | Listed as future pluggable vector backend |

### Supabase Integration Feasibility
Graphiti does NOT natively support PostgreSQL/pgvector as a graph backend. However:
- Supabase can be used for the **vector embeddings** (pgvector) alongside Graphiti
- Graph storage requires a dedicated graph DB (Neo4j, FalkorDB, or Kuzu)
- **Kuzu is the best fit for BitBit** — embedded, no separate server, file-based storage, fast ingestion
- Alternatively, FalkorDB Lite runs as subprocess with file-based storage — no Docker required

### Performance Benchmarks
- **DMR benchmark:** 94.8% accuracy (vs 93.4% MemGPT)
- **LongMemEval:** Up to 18.5% accuracy improvement over baselines
- **Latency:** ~90% reduction compared to baseline implementations

### Production Readiness
Graphiti is **production-ready**. Zep Cloud runs it at scale for enterprise customers. The open-source version is well-maintained with active releases (latest: Feb 2026).

### Relevance to BitBit
**HIGH.** Graphiti is the ideal engine for BitBit's Context Baseplate:
- Entity profiles with temporal relationships → Graphiti's core competency
- Contact evolution tracking → bi-temporal model
- Fact invalidation as relationships change → edge invalidation
- No LLM at retrieval time → cost-effective for single-user

**Recommended integration:** Graphiti + Kuzu (embedded) for the knowledge graph layer, Supabase pgvector for the vector retrieval layer.

---

## 3. Mem0

### Overview
- **GitHub:** [mem0ai/mem0](https://github.com/mem0ai/mem0) — ~49.6K stars, 5.5K forks (Mar 2026)
- **Latest:** v1.0.0 (Mar 2026) — API modernization
- **Architecture:** Three-tier (state + persistence + selection) with vector + key-value + graph stores
- **Paper:** [arXiv:2504.19413](https://arxiv.org/abs/2504.19413) — "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory"

### Architecture: State + Persistence + Selection

Mem0 operates across three pillars:
1. **State** — knowing what's happening right now (working memory)
2. **Persistence** — retaining knowledge across sessions (long-term store)
3. **Selection** — deciding what's worth remembering (intelligent filtering)

**Memory hierarchy:** User level → Session level → Agent level, enabling multi-layered personalization.

### Key Features
- **Automatic extraction:** LLM-powered memory extraction from conversations without manual orchestration
- **Dynamic forgetting:** Memory decay based on relevance and aging
- **Priority scoring:** Contextual tagging determines storage priority
- **Graph memory (Mem0^g):** Enhanced variant using graph store for multi-session relationships (Pro tier, $249/mo)

### Performance
- **26% accuracy boost** on standard memory benchmarks
- **91% lower P95 latency** vs full-context approaches
- **90% token savings** through memory compression
- **Search latency:** P50: 0.148s, P95: 0.200s (fastest among all frameworks)

### Integration Breadth
- 50+ provider integrations
- 24+ vector store options (including pgvector, Pinecone, Qdrant, Chroma)
- 16+ LLM providers (OpenAI, Anthropic, Ollama, etc.)
- Enterprise: SOC 2, HIPAA, BYOK, on-prem

### Pricing Concern

| Tier | Price | Key Feature |
|------|-------|-------------|
| Free | $0/mo | 10K memories, vector search only |
| Pro | $249/mo | Graph memory, advanced search |
| Enterprise | Custom | HIPAA, BYOK, dedicated infra |

**Graph memory is paywalled at $249/mo.** The open-source self-hosted version supports vector + key-value but graph requires Pro.

### Relevance to BitBit
**MEDIUM.** Mem0 is the most popular framework and has the simplest developer experience. However:
- BitBit already has Supabase for storage — Mem0 adds another managed service
- Graph memory (the most valuable feature) is paywalled
- Mem0 is designed for "add facts, search facts" — too simple for BitBit's Context Baseplate needs
- Self-hosted Mem0 OSS is basically pgvector with an extraction layer — BitBit can build this directly

**Verdict:** Use Mem0's extraction patterns as inspiration, but don't adopt the platform. The open-source version doesn't add enough over what Supabase pgvector + custom extraction provides.

---

## 4. Microsoft GraphRAG

### Overview
- **GitHub:** [microsoft/graphrag](https://github.com/microsoft/graphrag) — High activity
- **Architecture:** Knowledge graph construction via LLM extraction → Leiden community detection → hierarchical summarization
- **Paper:** "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" (2024)

### How It Works

Five-phase indexing pipeline:
1. **Segment** source documents into atomic text units
2. **Extract** entities, relationships, and claims via LLM
3. **Generate** descriptions for each entity and relationship
4. **Detect communities** using Leiden algorithm (hierarchical clustering)
5. **Summarize** each community at each hierarchy level

Two query modes:
- **Local search:** Entity-specific queries — find entity → expand to neighbors → retrieve summaries + text
- **Global search:** Dataset-wide questions — identify relevant communities → map-reduce answers

### Performance
- **3.4x better accuracy** than vector RAG (80% vs 50% on global queries)
- **70-80% win rate** over naive RAG on comprehensiveness/diversity
- At lowest community level: competitive quality with 2-3% of full-context token cost

### Cost Problem (and Solutions)

| Approach | Indexing Cost (30K words) | Indexing Cost (large corpus) |
|----------|--------------------------|------------------------------|
| Full GraphRAG | ~$0.34 | Up to $33K |
| LazyGraphRAG | ~$0.003 (0.1% of full) | Dollars, not thousands |
| FastGraphRAG | ~$0.03 | Moderate |

**Graph extraction = 75% of indexing cost.** Cost reduction strategies:
- **LazyGraphRAG** (Jun 2025): Defers LLM use until query time. Indexing = vector RAG cost. Quality competitive with full GraphRAG at 4% of query cost.
- **FastGraphRAG:** Substitutes NLP for some LLM reasoning. Noisier graph but much cheaper.
- **GPT-4o-mini indexing:** 10x cheaper, slight quality reduction.
- **Incremental re-indexing:** Add new nodes/edges without rebuilding entire graph.

### Relevance to BitBit
**LOW-MEDIUM for direct adoption, HIGH for patterns.**

GraphRAG is designed for document corpus analysis (legal discovery, research synthesis). BitBit's use case is conversational + entity-tracking, not corpus summarization.

However, GraphRAG's patterns are valuable:
- **Community detection** could identify clusters of related contacts/projects
- **Hierarchical summarization** could power the Context Baseplate's entity profile generation
- **LazyGraphRAG** could enable cost-effective reasoning over email archives

**Don't adopt GraphRAG directly.** Instead, use Graphiti (which does real-time incremental updates) and borrow GraphRAG's community detection concept for entity clustering.

---

## 5. Cognee

### Overview
- **GitHub:** [topoteretes/cognee](https://github.com/topoteretes/cognee) — ~13K stars (Mar 2026)
- **Latest:** v0.5.4.dev1 (Mar 2026)
- **Architecture:** Knowledge engine combining graph DBs + vector search + cognitive science approaches
- **Tagline:** "Knowledge Engine for AI Agent Memory in 6 lines of code"

### Key Features
- Ingests structured AND unstructured data (docs, scans, images, audio with transcription)
- Combines vector search with graph databases for dual retrieval
- Multi-tenancy support (extended to pgvector and Neo4j in latest release)
- Multiquery triplet search, usage frequency tracking
- Cloud deployment: S3 support, JWT/CORS config, Helm charts
- **Graduated GitHub Secure Open Source** — security-audited

### Architecture
Cognee automatically:
1. Extracts entities, relationships, and key concepts from unstructured text
2. Builds knowledge graphs connecting discovered entities
3. Stores embeddings for semantic search
4. Combines graph traversal and vector similarity for retrieval

### Relevance to BitBit
**MEDIUM.** Cognee is a well-maintained, growing project that bridges the gap between vector search and knowledge graphs. However:
- Overlap with Graphiti's capabilities
- Less mature than Graphiti for temporal reasoning (no bi-temporal model)
- More general-purpose — not specifically designed for agent memory
- Could be interesting for processing email/document attachments into the knowledge graph

**Verdict:** Monitor but don't adopt. Graphiti is more mature and better suited for BitBit's temporal entity tracking needs.

---

## 6. LightRAG

### Overview
- **Architecture:** Graph-enhanced text indexing with dual-level retrieval
- **Paper:** EMNLP 2025
- **Key innovation:** Knowledge graph + vector store hybrid with incremental updates

### Dual-Level Retrieval
1. **Low-level:** Specific entities and direct relationships (authorship, definitions, attributes)
2. **High-level:** Broader themes and conceptual relationships spanning multiple entities

### Performance vs GraphRAG

| Metric | LightRAG | GraphRAG |
|--------|----------|----------|
| Tokens per query | ~100 | ~610,000 |
| API calls per query | 1 | Hundreds |
| Query latency | ~80ms | ~120ms |
| Indexing | Incremental | Full rebuild required |
| Cost | Very low | Very high |

### Relevance to BitBit
**LOW.** LightRAG occupies a similar niche to LazyGraphRAG — cost-effective graph reasoning over document corpora. But it lacks:
- Temporal modeling (critical for BitBit)
- Agent memory features (designed for document RAG)
- Production maturity compared to Graphiti

**Verdict:** Skip. Graphiti + pgvector covers the same ground with better temporal support.

---

## 7. Emerging Frameworks (2025-2026)

### MAGMA — Multi-Graph Agentic Memory Architecture
- **Paper:** [arXiv:2601.03236](https://arxiv.org/abs/2601.03236) (Jan 2026)
- **Innovation:** Represents each memory item across FOUR orthogonal graphs:

| Graph | Purpose | Query Type |
|-------|---------|------------|
| **Temporal** | Strict chronological ordering | "When did X happen?" |
| **Causal** | Logical entailment chains | "Why did X happen?" |
| **Semantic** | Conceptual similarity | "What's similar to X?" |
| **Entity** | Object permanence across timeline segments | "Tell me about person X" |

- **Retrieval:** Policy-guided traversal with intent classification → anchor identification → adaptive graph traversal
- **Performance:** SOTA on LoCoMo (0.700 judge score, beating Nemori 0.590 and MemoryOS 0.553). 61.2% on LongMemEval (vs 55.0% full-context). 95% token reduction vs full-context.
- **Status:** Research paper with open-source code. Not production-ready.
- **Relevance to BitBit:** HIGH conceptually — the four-graph decomposition maps well to BitBit's needs. But too immature for production. **Watch closely.**

### EverMemOS — Self-Organizing Memory OS
- **Paper:** [arXiv:2601.02163](https://arxiv.org/abs/2601.02163) (Jan 2026)
- **Company:** EverMind (launched cloud service + $80K competition, Mar 2026)
- **Architecture:** Engram-inspired lifecycle:
  1. **Episodic Trace Formation:** Dialogue → MemCells (episodic traces + atomic facts + foresight signals)
  2. **Semantic Consolidation:** MemCells → MemScenes (thematic clusters + user profiles)
  3. **Reconstructive Recollection:** MemScene-guided agentic retrieval
- **Performance:** **SOTA on LoCoMo at 93.05%** — dominates all existing systems. 83.00% on LongMemEval. +19.7% on multi-hop reasoning, +16.1% on temporal tasks.
- **Status:** Cloud service available. Open-source repo exists.
- **Relevance to BitBit:** HIGH — the consolidation lifecycle mirrors BitBit's intended Baseplate architecture. EverMemOS's "MemScene" concept (thematic clustering of consolidated memories) is essentially what entity profiles should become. **Serious contender for integration if it matures.**

### LangMem (LangChain)
- **GitHub:** [langchain-ai/langmem](https://github.com/langchain-ai/langmem)
- **Architecture:** Library for extracting + managing procedural, episodic, and semantic memories within LangGraph
- **Features:** Memory extraction tools, search tools, PostgreSQL-backed persistence
- **Performance:** Extremely slow — P50: 17.99s, P95: 59.82s search latency. **Impractical for interactive use.**
- **Verdict:** Only viable if deeply invested in LangGraph ecosystem. BitBit is not. **Skip.**

### MemoClaw
- Minimalist HTTP API for store/recall operations
- Blockchain wallet auth, 8K character limit per memory
- **Verdict:** Toy. Skip.

---

## 8. The Critical Question: Knowledge Graph + Vector Search — Combined or Either/Or?

### Industry Consensus (2026): BOTH

The debate is settled. Every serious production system in 2026 uses a **hybrid architecture** combining structured knowledge graphs with vector similarity search:

| Retrieval Type | Solves | Example Query |
|----------------|--------|---------------|
| **Vector similarity** | "Find things semantically similar to X" | "What did we discuss about platform stability?" |
| **BM25 keyword** | "Find exact terms" | "Find emails mentioning 'Project Omega'" |
| **Graph traversal** | "Follow relationships between entities" | "Who does Sarah report to, and what projects are they on?" |
| **Temporal graph** | "What was true at time T?" | "Who was our Stripe contact when we signed in October?" |

No single retrieval type covers all four. Hybrid architectures use **Reciprocal Rank Fusion (RRF)** to combine results from multiple retrieval paths.

### Should BitBit Use Zep/Graphiti + Pinecone?

**No to Pinecone (for now). Yes to Graphiti + pgvector on Supabase.**

Reasoning:
1. **Pinecone is overkill** for single-tenant. pgvector on Supabase handles 500K vectors comfortably (BitBit generates ~96K chunks/year per user).
2. **Graphiti needs a graph DB** — pgvector doesn't replace this. Use Kuzu (embedded, no server) or FalkorDB Lite.
3. **Supabase is already deployed** (Mumbai, project johvduasrhmufrfdxjus). Adding pgvector is trivial.
4. **Pinecone makes sense at multi-tenant scale** (100+ users, millions of vectors). Not today.

### Recommended Architecture for BitBit

```
                    ┌─────────────────────────────────┐
                    │         AGENT QUERY              │
                    └──────────┬──────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │      QUERY ROUTER / CLASSIFIER   │
                    │  (intent → retrieval strategy)   │
                    └──┬────────┬────────┬────────────┘
                       │        │        │
              ┌────────▼──┐ ┌──▼─────┐ ┌▼────────────┐
              │ VECTOR     │ │ BM25   │ │ GRAPH       │
              │ (pgvector) │ │ (FTS)  │ │ (Graphiti/  │
              │ Supabase   │ │Supabase│ │  Kuzu)      │
              └────────┬──┘ └──┬─────┘ └┬────────────┘
                       │        │        │
                    ┌──▼────────▼────────▼────────────┐
                    │   RECIPROCAL RANK FUSION (RRF)   │
                    │   + Temporal Filtering            │
                    └──────────┬──────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │      CONTEXT ASSEMBLY            │
                    │  (ranked results → prompt)       │
                    └─────────────────────────────────┘
```

**Three retrieval paths, one fusion layer, zero Pinecone.**

---

## 9. Compiled World Model vs Reactive RAG — Current Consensus

### The Debate
- **Compiled world model:** Pre-compute entity profiles, relationship graphs, and summaries during idle time. Fast retrieval, predictable latency, but stale.
- **Reactive RAG:** Query-time retrieval from raw data. Always fresh, but unpredictable latency.

### 2026 Consensus: Do Both (Sleep-Time Compute Bridges the Gap)

The industry has converged on a **three-layer approach:**

1. **Compiled layer (Context Baseplate):** Pre-computed entity profiles, relationship graphs, community summaries. Updated via sleep-time compute / background jobs. Used for fast, predictable queries.

2. **Reactive layer (Total Recall):** Vector + BM25 search over raw data. Used when compiled layer is insufficient or query requires fresh data.

3. **Consolidation layer (Sleep-Time Compute):** Background process that:
   - Ingests new conversations/emails into the knowledge graph
   - Invalidates stale facts
   - Updates entity profiles
   - Generates new community summaries
   - Runs on cheaper models during off-peak

**This maps perfectly to BitBit's existing architecture:**
- Context Baseplate → Compiled layer (use Graphiti for the knowledge graph)
- Total Recall → Reactive layer (use pgvector + BM25 on Supabase)
- Sleep-time jobs → Consolidation layer (run on Cloudflare Workers cron or Fly.io)

### The Key Insight
VentureBeat's 2026 prediction: "Contextual memory will become table stakes for operational agentic AI. Agentic memory is expected to surpass RAG in usage for adaptive AI workflows."

Translation: RAG is necessary but not sufficient. The winning systems also build and maintain structured memory (knowledge graphs, entity profiles) that enables reasoning beyond what similarity search provides.

---

## 10. Framework Comparison Matrix

| Framework | GitHub Stars | Graph Support | Vector Support | Temporal | Sleep-Time | Production Ready | Self-Host | Cost |
|-----------|-------------|---------------|----------------|----------|------------|-----------------|-----------|------|
| **Graphiti/Zep** | 23K | Neo4j, Kuzu, FalkorDB | Via backends | **Bi-temporal** | No | **Yes** | Yes (OSS) | Free OSS / Zep Cloud |
| **Mem0** | 49.6K | Pro tier only ($249/mo) | 24+ options | No | No | **Yes** | Partial | Free-$249/mo |
| **Letta** | ~38K | No (memory tiers) | No | No | **Yes** | Yes | Yes | Free OSS / Letta Cloud |
| **Cognee** | 13K | Neo4j, pgvector | Built-in | No | No | Growing | Yes | Free OSS |
| **GraphRAG** | High | Leiden communities | Via indexing | No | No | Yes | Yes | High indexing cost |
| **LightRAG** | Growing | Built-in KG | Built-in | No | No | Growing | Yes | Low |
| **EverMemOS** | New | MemScenes | Implicit | Partial | **Yes** (consolidation) | Cloud only | No | Unknown |
| **MAGMA** | New | 4 orthogonal graphs | Semantic graph | **Yes** | No | **No** (research) | Code available | N/A |

---

## 11. Specific Recommendations for BitBit

### Tier 1: Implement Now (Week 1-4)

**A. Graphiti for Context Baseplate Knowledge Graph**
- Deploy with **Kuzu** (embedded, zero-config, fast ingestion)
- Use Graphiti's episode ingestion API to process conversation threads
- Bi-temporal model maps to BitBit's entity profile evolution
- No LLM calls at retrieval time = cost-effective

**B. pgvector on Supabase for Total Recall Vector Search**
- Already have Supabase deployed (Mumbai)
- Enable pgvector extension, create embedding tables
- Hybrid search: vector similarity + Supabase FTS (built-in BM25)
- Use RRF to fuse results

**C. Sleep-Time Consolidation Jobs**
- Cloudflare Workers cron (already deployed: `bitbit-edge-cron`)
- Process new conversations → extract entities/relationships → update Graphiti graph
- Update entity profiles in Context Baseplate
- Invalidate stale facts via Graphiti's edge invalidation

### Tier 2: Implement Later (Week 5-8)

**D. MAGMA-Inspired Query Routing**
- Classify query intent (temporal, causal, semantic, entity)
- Route to optimal retrieval path
- Adaptive graph traversal based on intent

**E. Community Detection for Entity Clustering**
- Borrow from GraphRAG's Leiden community detection
- Identify clusters of related contacts/projects/topics
- Generate community summaries for dashboard insights

### Tier 3: Evaluate Post-MVP

**F. EverMemOS Integration**
- If their cloud API matures, evaluate for MemScene-based consolidation
- Their 93.05% LoCoMo score suggests genuinely superior memory management

**G. Pinecone Migration**
- Only if/when multi-tenant scale requires it (100+ users, millions of vectors)
- pgvector handles BitBit's current scale easily

---

## 12. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Kuzu is less battle-tested than Neo4j | Graphiti officially supports it; fallback to FalkorDB Lite |
| Graphiti adds infrastructure complexity | Kuzu is embedded (single file) — minimal ops burden |
| pgvector scaling limits | Supabase supports up to 500K vectors easily; Pinecone is the escape hatch |
| Sleep-time compute cost (LLM calls for consolidation) | Use cheaper models (gpt-4o-mini, Claude Haiku) for extraction; batch during off-peak |
| Knowledge graph stale after rapid changes | Graphiti's incremental updates process in real-time; cron as backup |
| Bi-temporal model adds query complexity | Graphiti handles this internally; BitBit queries via simple API |

---

## 13. Sources

- [Letta V1 Agent Architecture](https://www.letta.com/blog/letta-v1-agent)
- [Letta Sleep-Time Compute](https://www.letta.com/blog/sleep-time-compute)
- [Sleep-Time Compute Paper](https://arxiv.org/abs/2504.13171)
- [Zep: Temporal Knowledge Graph Architecture (arXiv:2501.13956)](https://arxiv.org/abs/2501.13956)
- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [Graphiti Hits 20K Stars + MCP Server 1.0](https://blog.getzep.com/graphiti-hits-20k-stars-mcp-server-1-0/)
- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Mem0 Paper (arXiv:2504.19413)](https://arxiv.org/abs/2504.19413)
- [Mem0 Graph Memory for AI Agents](https://mem0.ai/blog/graph-memory-solutions-ai-agents)
- [Mem0 vs Zep vs LangMem vs MemoClaw Comparison 2026](https://dev.to/anajuliabit/mem0-vs-zep-vs-langmem-vs-memoclaw-ai-agent-memory-comparison-2026-1l1k)
- [Mem0 vs Zep vs Claude-Mem 2026](https://serenitiesai.com/articles/ai-agent-memory-why-2026-is-the-year-of-persistent-context)
- [From Beta to Battle-Tested: Letta, Mem0, Zep](https://medium.com/asymptotic-spaghetti-integration/from-beta-to-battle-tested-picking-between-letta-mem0-zep-for-ai-memory-6850ca8703d1)
- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/)
- [GraphRAG Costs Explained](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/graphrag-costs-explained-what-you-need-to-know/4207978)
- [Cognee GitHub](https://github.com/topoteretes/cognee)
- [LightRAG: Simple and Fast Alternative](https://learnopencv.com/lightrag/)
- [MAGMA Paper (arXiv:2601.03236)](https://arxiv.org/abs/2601.03236)
- [EverMemOS Paper (arXiv:2601.02163)](https://arxiv.org/abs/2601.02163)
- [EverMind Launch](https://www.prnewswire.com/news-releases/end-agentic-amnesia-evermind-launches-a-memory-platform-and-an-80-000-global-competition-as-evermemos-sets-new-sota-results-across-multiple-benchmarks-302678025.html)
- [LangMem SDK](https://langchain-ai.github.io/langmem/)
- [Top 10 AI Memory Products 2026](https://medium.com/@bumurzaqov2/top-10-ai-memory-products-2026-09d7900b5ab1)
- [VentureBeat: 6 Data Predictions for 2026](https://venturebeat.com/data/six-data-shifts-that-will-shape-enterprise-ai-in-2026)
- [Graphiti Knowledge Graph Memory (Neo4j)](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)
- [Graph RAG in 2026: Practitioner's Guide](https://medium.com/graph-praxis/graph-rag-in-2026-a-practitioners-guide-to-what-actually-works-dca4962e7517)
- [Memory in the Age of AI Agents Survey](https://arxiv.org/abs/2512.13564)
- [Awesome GraphMemory Survey](https://github.com/DEEP-PolyU/Awesome-GraphMemory)
