# Total Recall -- Architecture Documents

This directory contains the architecture specifications for BitBit's Total Recall system: persistent conversational memory with cross-channel continuity.

## Canonical Specification

### [06 - Unified Synthesis](./06-synthesis.md) (START HERE)
Reconciles all 5 architecture docs into a single canonical spec. Where docs conflict on naming, schema, or behavior, this document is authoritative. Contains the final migration SQL (`067_total_recall.sql`), canonical TypeScript interfaces, reconciliation decisions with rationale, and the 7-phase implementation order.

## Architecture Analysis Documents

### [01 - Schema Architecture](./01-schema-architecture.md)
Database schema design for the Total Recall system. Defines four new tables (`conversation_threads`, `conversation_messages`, `thread_summaries`, `channel_identities`), alterations to `approval_queue`, all indexes, RLS policies, helper functions, and the complete migration SQL (`067_total_recall.sql`). Includes query patterns, data lifecycle (active/archived/compiled phases), and performance targets.

### [02 - Context Assembly Pipeline](./02-context-assembly-architecture.md)
The `ContextAssembler` module that replaces the current stateless prompt building. Defines a four-tier context system (system prompt, session history, compiled memory, action state) with a `TokenBudgetManager` for priority-based allocation within an 8,000-token budget. Covers parallel fetch orchestration, tier degradation on failure, caching strategy, and integration points with `engine.ts`, `prompt-builder.ts`, and the chat API route.

### [03 - Action Execution](./03-action-execution-architecture.md)
Closes two critical gaps: (A) pending approvals not visible to the LLM in the system prompt, and (B) approved actions never actually executing. Introduces the `approve_action` LLM tool, a central `executeApprovedAction()` dispatcher with a transport map (email/SMS/WhatsApp/task/invoice), state machine extensions (`executing`/`completed`/`failed`), retry logic, and expired action re-queue flow.

### [04 - Cross-Channel Continuity](./04-cross-channel-architecture.md)
Unifies the currently disconnected web chat (stateless), WhatsApp (in-memory), and email (siloed) pipelines into a single conversation thread per user. Defines the identity resolution layer (phone/email/Slack ID to Supabase user), thread resolution algorithm (one active thread per user+org with 24h inactivity archival), unified message storage, real-time cross-channel updates via Supabase Realtime, and the shadow identity pattern for unknown senders.

### [05 - Compression & Memory Consolidation](./05-compression-memory-architecture.md)
Three-tier conversation compression (verbatim last 10 turns, compressed summary for turns 11-30, key facts for turns 31+) with async Haiku-powered summarization. Covers the `ConversationCompressor` and `MemoryConsolidator` interfaces, prompt templates for summarization and fact extraction, contradiction detection against existing `semantic_memories`, thread archival cron, and proactive context surfacing with 1-hop entity graph traversal. Includes a worked 50-turn example showing the compression pipeline in action.

## Naming Note
Docs 01, 02, 05 use `conversation_threads` / `conversation_messages` / `channel_identities`. Doc 04 uses `unified_threads` / `unified_messages` / `channel_identity_map`. Doc 05 uses `thread_metadata` with TEXT IDs. The synthesis (Doc 06) reconciles all names to the canonical `conversation_*` / `channel_identities` schema with UUID IDs.

## System Overview

```
User Message
    |
    v
Identity Resolution (04) --> Channel Identity Map
    |
    v
Thread Resolution (01/04) --> conversation_threads (one active per user+org)
    |
    v
Context Assembly (02) --> TokenBudgetManager, 4-tier context, <200ms
    |
    v
Engine (Anthropic API) --> approve_action tool available (03)
    |
    v
Response + Async Processing
    |
    +-- Store message (01) --> conversation_messages
    +-- Compress history (05) --> thread_summaries (Haiku)
    +-- Extract facts (05) --> semantic_memories (Haiku)
    +-- Execute actions (03) --> Transport Map (Resend/Telnyx/Meta)
    +-- Cross-channel notify (04) --> Supabase Realtime
```
