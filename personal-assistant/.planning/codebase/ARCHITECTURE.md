# Architecture

## Pattern

**Cognitive Operating System** — Next.js App Router frontend backed by an agentic TAOR (Think-Act-Observe-Reflect) loop that processes user messages through multi-layered intelligence.

## Layer Diagram

```
Presentation (React/Next.js App Router)
    |
API Routes (Next.js route handlers)
    |
Agent Engine (TAOR loop)
    |
Intelligence Layer (analytics, proactive signals)
    |
Memory Layer (Memory Palace, Knowledge Graph)
    |
Data Layer (Supabase, Pinecone, Redis)
```

## Core Flow

1. **User message** arrives via chat or channel
2. **Auth** — session validation via Supabase Auth
3. **TAOR Loop** executes:
   - **Pre-flight** — input validation, safety checks
   - **Model routing** — selects Haiku/Sonnet/Opus based on complexity
   - **Context assembly** — builds relevant context (<200ms target, 48K token budget)
   - **Tool planning** — determines which tools to invoke
   - **Execution** — runs tools, gathers results
   - **Response guard** — safety filtering before delivery
4. **Stream** — response streamed back to client

## Context Assembly (4-tier)

Assembles context within a 48K token budget with <200ms latency target:

1. **Conversation history** — recent messages
2. **RAG retrieval** — hybrid sparse + dense + graph-aware from Pinecone
3. **Knowledge graph** — entity relationships from pgvector
4. **Memory Palace** — episodic + semantic memories with decay and consolidation

## Proactive Intelligence

Runs every 15 minutes via cron routes:

1. **Signal gathering** — polls channels, monitors events
2. **Aggregation** — combines signals into actionable patterns
3. **Classification** — prioritizes by urgency and relevance
4. **Execution** — triggers actions or queues notifications

27+ cron routes handle scheduled intelligence tasks.

## Memory Palace

- **Episodic memory** — conversation-specific, decays over time
- **Semantic memory** — consolidated knowledge, long-lived
- **Decay model** — memories fade unless reinforced
- **Consolidation** — important episodic memories promote to semantic

## Knowledge Graph

Stored in pgvector via Supabase:

- `entity_nodes` — people, places, concepts with embeddings
- `entity_edges` — typed relationships between entities
- `event_tuples` — temporal events linking entities

## RAG Pipeline

Hybrid retrieval combining three strategies:

1. **Sparse retrieval** — keyword/BM25 matching
2. **Dense retrieval** — vector similarity via Voyage AI embeddings
3. **Graph-aware retrieval** — entity-relationship traversal

Results merged and re-ranked before context injection.

## Tool System

- **Eager core tools** — always loaded (calendar, search, etc.)
- **Deferred tools** — loaded on demand via tool-RAG (matches user intent to tool descriptions)
- **60+ tool files** in `src/lib/agent/`

## Safety & Reliability

- **Response guard** — filters harmful/inappropriate output before delivery
- **Circuit breaker** — prevents cascading failures in external service calls
- **Dead letter queue (DLQ)** — captures failed operations for retry
- **Cost guard** — monitors and limits API spend per request/user
