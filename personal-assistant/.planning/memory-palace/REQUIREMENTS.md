# Memory Palace Requirements

## Core Memory System

### MEM-01: Structured Memory Types
Every memory entry has a typed classification: `conversation`, `decision`, `pattern`, `fact`, `relationship`, `pricing`, `lesson_learned`. Each type carries type-specific metadata (e.g., decisions have reasoning chains and outcomes, patterns have sample counts and confidence).

### MEM-02: Source Provenance Tracking
Every memory links to its source: conversation thread ID, message IDs, channel, timestamp, and the entities involved. When a memory is surfaced, the user can trace it back to the exact conversation or event that created it.

### MEM-03: Confidence Scoring with Decay
Memories start at initial confidence (0.5-1.0 based on source reliability). Confidence increases when corroborated by new evidence. Confidence decays over time without reinforcement (configurable decay rates per memory type). Memories below 0.1 confidence are auto-archived.

### MEM-04: Contradiction Detection and Resolution
When a new memory contradicts an existing one (detected via semantic similarity + Haiku verification), the system either supersedes the old memory (if new source is more reliable), flags for review, or stores both with coexistence annotation.

### MEM-05: Entity-Memory Linkage
Every memory links to 0-N source entities (contacts, projects, invoices, tasks). Bidirectional: from any entity page, see all memories about that entity. From any memory, navigate to all linked entities.

## Query & Retrieval

### MEM-06: Conversation Archaeology
Natural language queries like "Why did we stop working with TechCorp?" surface the exact conversation(s) and reasoning. Combines full-text search (tsvector), semantic search (Pinecone), and entity-scoped memory lookup to find relevant memories and their source conversations.

### MEM-07: Decision Tracking
Business decisions logged with: what was decided, alternatives considered, reasoning chain, who was involved, outcome (if known), and lessons learned. Queryable: "What decisions have we made about pricing?" returns a timeline of pricing decisions with context.

### MEM-08: Pricing Intelligence
"What did we charge last 3 WordPress builds?" queries the memory palace for pricing-type memories linked to project entities, returning actual historical data with project context and outcomes.

### MEM-09: Pattern Recognition
"Has this client ever been late?" cross-references years of payment timeline data, invoice events, and behavioral pattern memories to build a composite answer with evidence.

## Proactive & Autonomous

### MEM-10: Proactive Recall
During conversations, the Memory Palace automatically surfaces relevant memories without being asked. When entities are mentioned, relevant memories (decisions, patterns, facts) are injected into context. Triggered by entity mention detection already in the pipeline.

### MEM-11: Memory Extraction Pipeline
Every conversation turn is analyzed for memory-worthy content. Extends the existing MemoryConsolidator to extract structured memory types (decisions, facts, patterns) not just flat facts. Fire-and-forget, async post-response.

### MEM-12: Memory Consolidation Cron
Periodic background job that: (a) decays confidence on stale memories, (b) merges duplicate/overlapping memories, (c) archives low-confidence memories, (d) recomputes entity memory summaries.

## Data Governance

### MEM-13: GDPR Forget Entity
`forgetEntity(entityId)` cascading delete: removes all memories linked to that entity, removes entity from all memory entity_ids arrays, removes related timeline events, removes knowledge graph nodes/edges. Irreversible, audit-logged.

### MEM-14: Memory Access Control
All memory tables have RLS policies scoped to org_id. Users can only access memories within their organization. Service-role bypass for background jobs.

## Dashboard & API

### MEM-15: Memory Palace API
REST API at `/api/memory-palace/`:
- `POST /search` — hybrid search (text + semantic + entity-scoped)
- `GET /entity/:id` — all memories for an entity
- `GET /decisions` — decision timeline
- `POST /remember` — explicit memory creation
- `DELETE /forget/:entityId` — GDPR forget
- `GET /stats` — memory health metrics

### MEM-16: Memory Palace Dashboard Component
React component showing: memory search, decision timeline, entity memory cards, memory health metrics (total active, confidence distribution, type breakdown). Uses glassmorphic design system.

### MEM-17: Memory Integration with Chat
The agent chat interface can invoke memory palace tools: `search_memories`, `recall_decisions`, `remember_this`, `forget_entity`. Results are formatted as rich context in the conversation.
