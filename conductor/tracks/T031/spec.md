# T031 — Total Recall: Conversational Memory & Cross-Channel Continuity

## Summary

Persistent conversation threads with cross-channel identity resolution, tiered compression, action execution, and a unified conversation pipeline. Replaces the stateless per-request chat model with a continuous memory system where BitBit remembers every conversation across every channel.

## Problem

Before Total Recall, every chat request was stateless. The web chat had no history beyond the current browser session. WhatsApp, SMS, and email each had their own isolated context. The LLM couldn't reference earlier conversations. Approved actions sat in the approval queue but never executed. The system prompt didn't show pending approvals, so the LLM couldn't match "yep, send it" to any specific action.

## Solution

### 1. Schema (migration 067_total_recall.sql)

Four new tables:
- `conversation_threads` — one active thread per user per org, all channels write here
- `conversation_messages` — turn-by-turn history with role, channel, tool_data, token_count
- `thread_summaries` — tiered compression (compressed, key_facts, archived) with entity linking
- `channel_identities` — maps channel_type + identifier to authenticated user_id

Plus execution columns on `approval_queue` (execution_started_at, execution_completed_at, execution_result, execution_error, retry_count) and extended status CHECK (adding executing, completed, failed).

Three PL/pgSQL functions: `get_or_create_active_thread()`, `archive_stale_threads()`, `next_turn_number()`.

### 2. Identity Resolution (identity-resolver.ts)

Channel-specific cascading lookup:
- Web: direct Supabase auth
- WhatsApp/SMS: channel_identities → contacts phone fallback
- Email: channel_identities → contact_emails fallback
- Slack/iMessage: channel_identities only

### 3. Thread Management (thread-resolver.ts)

One active thread per user per org (enforced by partial unique index). New threads inherit `compiled_summary` from most recently archived thread for continuity. Messages stored with auto-incrementing turn numbers via `next_turn_number()` RPC.

### 4. Context Assembly (context-assembler.ts + token-budget-manager.ts)

Four-tier context system assembled in parallel (<200ms target):
- System prompt (highest priority)
- Pending actions (approval IDs, summaries, confidence %)
- Recent turns (converted to Anthropic message format)
- Entity context + compressed history + key facts (lowest priority)

TokenBudgetManager allocates 8K token budget across 6 tiers using 3-phase algorithm: minimums → fill by priority → trim from lowest.

### 5. Conversation Compression (conversation-compressor.ts)

Three tiers:
- Last 10 turns: verbatim (~3K tokens)
- Turns 11-30: compressed summary via Haiku (~500 tokens)
- Turns 31+: key facts extraction (commitments, decisions, deadlines, financial, entity_state, action_items) (~200 tokens)

Incremental: extends existing summary rather than re-summarizing all turns.

### 6. Memory Consolidation (memory-consolidator.ts)

Per-turn pipeline:
- High-value signal gating (regex for $ amounts, dates, commitments)
- Contradiction detection against existing semantic_memories
- Fact extraction and storage

### 7. Action Execution (action-executor.ts)

TRANSPORT_MAP dispatcher with 7 handlers:
- send_email → Resend
- send_sms → Telnyx
- send_whatsapp → Meta Cloud API
- create_task → shared-tools
- invoice_create → invoice-flow
- invoice_send → invoice-sender
- schedule_reminder → channel-tools

Idempotency guard: conditional `UPDATE WHERE status='approved'` prevents double-execution.
Retry: exponential backoff, max 3 attempts.
Post-execution: reflectAction + dispatchNotification (fire-and-forget).

### 8. approve_action Tool (tools.ts)

LLM tool for conversational approval:
- 3-strategy lookup: exact ID → fuzzy match pending → fuzzy match expired (re-queue)
- Pending approvals surfaced in system prompt (fixes Gap A)
- Execution triggered immediately after approval (fixes Gap B)

### 9. Unified Pipeline (unified-pipeline.ts)

7-step async generator:
1. Identity resolution
2. Thread resolution
3. Store inbound message
4. Load history + summaries
5. Engine call (with context assembly)
6. Store response
7. Post-processing (compression check, memory consolidation)

### 10. Thread Archival (thread-archiver.ts + /api/cron/archive-threads)

Cron every 15 minutes. Archives threads inactive >24h with compiled summary.

## Status

**Core implementation: COMPLETE** (committed 2c8e081b, 2026-03-13)

### Remaining
- [ ] Apply migration 067 to Supabase remote
- [ ] Phase 5: Channel adapter migration (WhatsApp/SMS/email through unified pipeline)
- [ ] Phase 7: Deprecate ConversationRouter string-packing, message cleanup cron, identity backfill
- [ ] Channel badges and Realtime subscription in chat UI (nice-to-have)

## Architecture Docs

Full specifications in `.planning/total-recall/`:
- 01: Schema Architecture
- 02: Context Assembly Pipeline
- 03: Action Execution
- 04: Cross-Channel Continuity
- 05: Compression & Memory Consolidation
- 06: Unified Synthesis (canonical, reconciles all 5)
