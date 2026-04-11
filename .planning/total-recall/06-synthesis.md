# Total Recall -- Unified Synthesis

This document reconciles the 5 architecture specs (Docs 01-05) into a single canonical specification. Where those docs conflict on naming, schema, or behavior, this document is authoritative.

Docs 01-05 are preserved as the architectural analysis and rationale. This doc is the implementation blueprint.

---

## 1. Reconciliation Decisions

### 1.1 Table Naming

| Concept | Doc 01 | Doc 04 | Doc 05 | **Canonical** | Rationale |
|---------|--------|--------|--------|---------------|-----------|
| Thread header | `conversation_threads` | `unified_threads` | `thread_metadata` | **`conversation_threads`** | Existing `conversation-interface.ts` already references this name; 3/5 docs use it |
| Message store | `conversation_messages` | `unified_messages` | `conversation_messages` | **`conversation_messages`** | 4/5 docs agree |
| Summaries | `thread_summaries` | (not defined) | `thread_summaries` | **`thread_summaries`** | Unanimous where defined |
| Identity map | `channel_identities` | `channel_identity_map` | (not defined) | **`channel_identities`** | More descriptive; Doc 01's dual-tier RLS is production-ready |

### 1.2 Column Naming

| Concept | Doc 01 | Doc 04 | Doc 05 | **Canonical** | Rationale |
|---------|--------|--------|--------|---------------|-----------|
| Thread ID type | `UUID` | `UUID` | `TEXT` | **`UUID`** | Standard for Supabase; stronger type safety; FK relationships work natively |
| Thread status values | `active/archived/compiled` | `active/archived/expired` | `active/archived` | **`active/archived/compiled`** | "compiled" accurately describes the state machine (summary extracted); "expired" is confusing |
| Compiled summary | `compiled_summary` | `compiled_context` | `final_summary_id` FK | **`compiled_summary`** | Self-describing; Doc 05's FK approach is too normalized for a hot-path read |
| Identity column: type | `channel_type` | `channel` | -- | **`channel_type`** | Avoids collision with reserved words; more explicit |
| Identity column: ID | `channel_identifier` | `external_identifier` | -- | **`channel_identifier`** | Consistent with channel_type naming |
| Tool data column | `tool_data JSONB` | `tool_calls JSONB` | `tool_calls JSONB` | **`tool_data JSONB`** | Column stores both tool_call and tool_result data, not just calls |
| Message roles | `user/assistant/system/tool_call/tool_result` | `user/assistant/system` | `user/assistant` | **`user/assistant/system/tool_call/tool_result`** | Full tool continuity needed for replay and context assembly |

### 1.3 Structural Decisions

| Decision | Source | Alternative | **Winner** | Rationale |
|----------|--------|-------------|------------|-----------|
| Summary tiers | Doc 05: `compressed/key_facts/archived` | Doc 01: flat ranges only | **Doc 05** | Tier-based summaries enable the 3-tier compression pipeline (verbatim / compressed / key facts) |
| Summary supersedes chain | Doc 05: `supersedes UUID FK` | Doc 01: no chain | **Doc 05** | When a summary is re-generated (incremental), the old one is preserved and linked |
| `entity_ids` on summaries | Doc 05: `entity_ids uuid[]` | Doc 01: none | **Doc 05** | Enables 1-hop entity graph traversal for proactive context surfacing |
| `key_facts JSONB` on summaries | Doc 05: structured facts | Doc 01: none | **Doc 05** | Structured facts enable semantic search and contradiction detection |
| `turn_number` on messages | Doc 05: explicit ordinal | Docs 01/04: implicit via `created_at` | **Doc 05** | Explicit ordinals enable precise range references in `thread_summaries.turn_range_start/end` |
| `channel_metadata JSONB` on messages | Doc 04: explicit column | Doc 01: inside `metadata` | **Doc 04** | Channel-specific data (WA message_id, email subject, attachments) deserves its own column |
| `last_used_at` on identities | Doc 04: has it | Doc 01: missing | **Doc 04** | Tracks identity freshness; helps with stale identity cleanup |
| `display_name`, `verified_at` on identities | Doc 01: has both | Doc 04: missing | **Doc 01** | UX-critical for dashboard display and security audit trail |
| `token_estimate` on threads | Doc 01: has it | Doc 04/05: missing | **Doc 01** | Critical for context assembly; avoids counting every time |
| `title` on threads | Doc 01: has it | Doc 04/05: missing | **Doc 01** | Auto-generated thread titles for dashboard UX |
| RLS pattern | Doc 01: dual-tier (matches codebase) | Doc 04: simplified | **Doc 01** | Must match existing `get_user_accessible_org_ids()` / `get_user_active_org_id()` pattern |
| `get_or_create_active_thread()` | Doc 01: PL/pgSQL function | Doc 04: app-level logic | **Doc 01** | Atomic thread resolution at DB level prevents race conditions |
| `archive_stale_threads()` | Doc 04: PL/pgSQL function | Doc 01: cron query | **Both** | The function from Doc 04 + the cron pattern from Doc 01 |
| approval_queue additions | Doc 01: `thread_id`, `source_message_id` | Doc 03: execution columns | **Both** | Thread linkage (Doc 01) + execution state (Doc 03) are complementary |
| `last_channel` CHECK constraint | Doc 04: has CHECK | Doc 01: no CHECK | **Doc 04** | Validates channel values at DB level |

---

## 2. Canonical Schema

Migration: `067_total_recall.sql`

```sql
-- ============================================================================
-- 067_total_recall.sql
-- BitBit Total Recall: Conversational memory and cross-channel continuity
--
-- Creates: conversation_threads, conversation_messages, thread_summaries, channel_identities
-- Alters:  approval_queue (thread linkage + execution state)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONVERSATION_THREADS (Thread Header)
-- One active thread per user per org. All channels write to the same thread.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'compiled')),
  title TEXT,                                        -- auto-generated thread title
  message_count INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,             -- distinct user+assistant turns (not tool_call/tool_result)
  token_estimate INTEGER NOT NULL DEFAULT 0,         -- running estimate for context budget
  last_channel TEXT DEFAULT 'web'
    CHECK (last_channel IN ('web', 'whatsapp', 'sms', 'email', 'slack', 'imessage', 'api')),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  compiled_summary TEXT,                             -- persistent summary surviving cleanup
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforces: at most ONE active thread per user per org (O(1) lookup)
CREATE UNIQUE INDEX idx_conv_threads_active_user
  ON conversation_threads (user_id, org_id)
  WHERE status = 'active';

-- Archival cron: find idle threads
CREATE INDEX idx_conv_threads_stale
  ON conversation_threads (last_activity_at)
  WHERE status = 'active';

-- Admin/dashboard: threads by org
CREATE INDEX idx_conv_threads_org
  ON conversation_threads (org_id, last_activity_at DESC);

CREATE TRIGGER trg_conversation_threads_updated_at
  BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (dual-tier pattern per migration 053)
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_threads_select" ON conversation_threads
  FOR SELECT USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "conversation_threads_insert" ON conversation_threads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id = get_user_active_org_id()
  );

CREATE POLICY "conversation_threads_update" ON conversation_threads
  FOR UPDATE USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  ) WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "conversation_threads_service_role" ON conversation_threads
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONVERSATION_MESSAGES (Turn-by-Turn History)
-- Append-only. Each message records its channel of origin.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,                     -- explicit ordinal within thread
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool_call', 'tool_result')),
  channel TEXT NOT NULL CHECK (channel IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage', 'api'
  )),
  content TEXT NOT NULL DEFAULT '',
  tool_data JSONB,                                  -- role=tool_call: {name, input}; role=tool_result: {name, result, success}
  channel_metadata JSONB DEFAULT '{}',              -- channel-specific: WA message_id, email subject, attachments
  token_count INTEGER,                              -- pre-computed for budget management
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(thread_id, turn_number)
);

-- Hot path: load last N messages for a thread
CREATE INDEX idx_conv_messages_thread_time
  ON conversation_messages (thread_id, created_at DESC);

-- Ordinal lookups for summary ranges
CREATE INDEX idx_conv_messages_thread_turn
  ON conversation_messages (thread_id, turn_number);

-- User history across threads
CREATE INDEX idx_conv_messages_user_time
  ON conversation_messages (user_id, created_at DESC);

-- Channel-specific lookups
CREATE INDEX idx_conv_messages_org_channel
  ON conversation_messages (org_id, channel, created_at DESC);

-- RLS
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_messages_select" ON conversation_messages
  FOR SELECT USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "conversation_messages_insert" ON conversation_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id = get_user_active_org_id()
  );

-- Messages are immutable -- no UPDATE policy for user role

CREATE POLICY "conversation_messages_service_role" ON conversation_messages
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THREAD_SUMMARIES (Tiered Compression)
-- Three tiers: compressed (turns 11-30), key_facts (turns 31+), archived (full thread)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('compressed', 'key_facts', 'archived')),
  turn_range_start INTEGER NOT NULL,                -- first turn ordinal covered
  turn_range_end INTEGER NOT NULL,                  -- last turn ordinal covered
  summary_text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  entity_ids UUID[] DEFAULT '{}',                   -- entities mentioned (for 1-hop surfacing)
  key_facts JSONB DEFAULT '[]',                     -- structured facts for key_facts tier
  supersedes UUID REFERENCES thread_summaries(id) ON DELETE SET NULL,  -- previous version
  model_used TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (turn_range_end > turn_range_start),
  UNIQUE(thread_id, tier, turn_range_start)
);

-- Load summaries for a thread by tier
CREATE INDEX idx_thread_summaries_thread
  ON thread_summaries (thread_id, tier, turn_range_start);

-- Org-level summary cleanup
CREATE INDEX idx_thread_summaries_org
  ON thread_summaries (org_id);

-- RLS
ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_summaries_select" ON thread_summaries
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "thread_summaries_service_role" ON thread_summaries
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHANNEL_IDENTITIES (Cross-Channel Identity Resolution)
-- Maps external channel identifiers to internal Supabase users.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage'
  )),
  channel_identifier TEXT NOT NULL,                  -- E.164 phone, email, Slack user ID
  display_name TEXT,                                 -- human-readable label
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- identity freshness
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, channel_type, channel_identifier)
);

-- Hot path: resolve user from channel address
CREATE INDEX idx_channel_identities_resolve
  ON channel_identities (channel_type, channel_identifier)
  WHERE verified = true;

-- User's linked identities (settings page)
CREATE INDEX idx_channel_identities_user
  ON channel_identities (user_id);

-- Org-level identity management
CREATE INDEX idx_channel_identities_org
  ON channel_identities (org_id, channel_type);

CREATE TRIGGER trg_channel_identities_updated_at
  BEFORE UPDATE ON channel_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE channel_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_identities_select" ON channel_identities
  FOR SELECT USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "channel_identities_insert" ON channel_identities
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id = get_user_active_org_id()
  );

CREATE POLICY "channel_identities_update" ON channel_identities
  FOR UPDATE USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  ) WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "channel_identities_delete" ON channel_identities
  FOR DELETE USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "channel_identities_service_role" ON channel_identities
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. APPROVAL_QUEUE ENHANCEMENTS
-- Thread linkage (Doc 01) + Execution state (Doc 03)
-- ─────────────────────────────────────────────────────────────────────────────

-- Thread linkage
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL;

-- Execution state
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_result JSONB,
  ADD COLUMN IF NOT EXISTS execution_error TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- Extend status CHECK for execution lifecycle
ALTER TABLE approval_queue DROP CONSTRAINT IF EXISTS approval_queue_status_check;
ALTER TABLE approval_queue ADD CONSTRAINT approval_queue_status_check
  CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rejected', 'expired', 'auto_expired'));

-- Extend resolved_via CHECK for chat approval
ALTER TABLE approval_queue DROP CONSTRAINT IF EXISTS approval_queue_resolved_via_check;
-- Note: if resolved_via has no CHECK constraint, this is a no-op. Verify actual constraint name.

-- Indexes for thread linkage
CREATE INDEX IF NOT EXISTS idx_approval_queue_thread
  ON approval_queue (thread_id)
  WHERE thread_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Atomic thread resolution (prevents race conditions via partial unique index)
CREATE OR REPLACE FUNCTION get_or_create_active_thread(
  p_user_id UUID,
  p_org_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  -- Try to find existing active thread
  SELECT id INTO v_thread_id
  FROM conversation_threads
  WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND status = 'active';

  -- If found, touch last_activity_at and return
  IF v_thread_id IS NOT NULL THEN
    UPDATE conversation_threads
    SET last_activity_at = now()
    WHERE id = v_thread_id;
    RETURN v_thread_id;
  END IF;

  -- Create new thread
  INSERT INTO conversation_threads (user_id, org_id, status)
  VALUES (p_user_id, p_org_id, 'active')
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

-- Batch archive stale threads (called by Cloudflare edge cron)
CREATE OR REPLACE FUNCTION archive_stale_threads()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE conversation_threads
  SET status = 'archived', archived_at = now()
  WHERE status = 'active'
    AND last_activity_at < now() - interval '24 hours'
  RETURNING id;
END;
$$;

-- Next turn number for a thread (gap-free sequence)
CREATE OR REPLACE FUNCTION next_turn_number(p_thread_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(turn_number), 0) + 1 INTO v_next
  FROM conversation_messages
  WHERE thread_id = p_thread_id;
  RETURN v_next;
END;
$$;
```

---

## 3. Canonical TypeScript Interfaces

```typescript
// File: personal-assistant/src/lib/conversation/types.ts

// ─── Channel & Identity ─────────────────────────────────────────────────────

export type Channel = 'web' | 'whatsapp' | 'sms' | 'email' | 'slack' | 'imessage' | 'api'

export interface ChannelIdentifier {
  channelType: Channel
  channelIdentifier: string   // E.164 phone, email, Slack user ID
  context?: Record<string, string>  // e.g., { workspaceId } for Slack
}

export interface ResolvedIdentity {
  userId: string              // auth.users.id
  orgId: string               // organizations.id
  contactId?: string          // contacts.id (if user has a matching contact)
  displayName?: string
  isAuthenticated: boolean    // true for web (session), false for external channels
}

export interface ChannelIdentityRecord {
  id: string
  userId: string
  orgId: string
  channelType: Channel
  channelIdentifier: string
  displayName?: string
  verified: boolean
  verifiedAt?: string
  lastUsedAt: string
  createdAt: string
}

// ─── Thread ─────────────────────────────────────────────────────────────────

export type ThreadStatus = 'active' | 'archived' | 'compiled'

export interface ConversationThread {
  id: string
  userId: string
  orgId: string
  status: ThreadStatus
  title?: string
  messageCount: number
  turnCount: number
  tokenEstimate: number
  lastChannel: Channel
  lastActivityAt: string
  archivedAt?: string
  compiledSummary?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ThreadResolutionResult {
  thread: ConversationThread
  isNew: boolean
  inheritedContext?: string   // compiled_summary from previous archived thread
}

// ─── Message ────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'

export interface ConversationMessage {
  id: string
  threadId: string
  userId: string
  orgId: string
  turnNumber: number
  role: MessageRole
  channel: Channel
  content: string
  toolData?: ToolData
  channelMetadata?: ChannelMetadata
  tokenCount?: number
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ToolData {
  name: string
  input?: Record<string, unknown>    // for tool_call
  result?: unknown                   // for tool_result
  success?: boolean                  // for tool_result
}

export interface ChannelMetadata {
  externalId?: string                // WA message_id, email message-id
  subject?: string                   // email subject
  isVoiceNote?: boolean              // WA voice messages
  attachments?: Array<{
    type: string
    url: string
    name: string
  }>
}

// ─── Summaries & Compression ────────────────────────────────────────────────

export type SummaryTier = 'compressed' | 'key_facts' | 'archived'

export interface ThreadSummary {
  id: string
  threadId: string
  orgId: string
  tier: SummaryTier
  turnRangeStart: number
  turnRangeEnd: number
  summaryText: string
  tokenCount: number
  entityIds: string[]
  keyFacts: KeyFact[]
  supersedes?: string               // previous summary version ID
  modelUsed: string
  createdAt: string
}

export interface KeyFact {
  type: 'commitment' | 'decision' | 'financial' | 'deadline' | 'entity_state' | 'action_item'
  text: string
  entityIds: string[]
  confidence: number
  extractedFromTurns: number[]
}

// ─── Context Assembly ───────────────────────────────────────────────────────

export interface ThreadContext {
  threadId: string
  turnCount: number
  recentTurns: ConversationMessage[]   // verbatim last N
  compressedSummary: string | null     // turns 11-30
  keyFacts: KeyFact[]                  // turns 31+
  compiledSummary: string | null       // from previous archived thread
  totalTokens: number
}

export interface CompressionConfig {
  verbatimTurns: number               // default: 10
  verbatimBudget: number              // default: 3000 tokens
  compressedBudget: number            // default: 500 tokens
  keyFactsBudget: number              // default: 200 tokens
  compressionThreshold: number        // default: 10 turns
  keyFactsThreshold: number           // default: 30 turns
  summarizationModel: string          // default: 'claude-haiku-4-5-20251001'
}

// ─── Action Execution ───────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean
  transportMessageId?: string         // Resend/Telnyx/Meta message ID
  error?: string
  metadata?: Record<string, unknown>
}
```

---

## 4. Implementation Order

### Phase 1: Foundation (no behavior changes)

| Step | File | Action | Source Doc |
|------|------|--------|-----------|
| 1a | `supabase/migrations/067_total_recall.sql` | Create migration from Section 2 above | 01, 05 |
| 1b | `src/lib/conversation/types.ts` | Create TypeScript interfaces from Section 3 | All |
| 1c | `src/lib/conversation/identity-resolver.ts` | `resolveChannelIdentity()` with cascade per channel | 04 |
| 1d | `src/lib/conversation/thread-resolver.ts` | `resolveActiveThread()` using `get_or_create_active_thread()` | 01, 04 |
| 1e | `src/lib/conversation/unified-pipeline.ts` | Orchestrates: identity -> thread -> store -> context -> engine -> store response | 04 |
| 1f | Backfill script | Seed `channel_identities` from `contacts.phones` + `contacts.emails` | 04 |

### Phase 2: Web Chat Integration

| Step | File | Action | Source Doc |
|------|------|--------|-----------|
| 2a | `src/app/api/agent/chat/route.ts` | Accept `{ message, threadId? }`, route through unified pipeline | 04 |
| 2b | `src/app/api/agent/chat/history/route.ts` | New: `GET /api/agent/chat/history` endpoint | 04 |
| 2c | `src/lib/agent/engine.ts` | Add `history?: Anthropic.MessageParam[]` to EngineConfig | 02, 04 |
| 2d | `src/components/chat/chat-interface.tsx` | Load history on mount, send threadId, channel badges, Realtime sub | 04 |

### Phase 3: Context Assembly

| Step | File | Action | Source Doc |
|------|------|--------|-----------|
| 3a | `src/lib/context-assembly/context-assembler.ts` | New: `ContextAssembler.assemble()` with parallel fetch | 02 |
| 3b | `src/lib/context-assembly/token-budget-manager.ts` | New: priority-based allocation within 8K budget | 02 |
| 3c | `src/lib/agent/prompt-builder.ts` | Inject pending approvals section (fixes Gap A) | 03 |
| 3d | Wire into `engine.ts` | Replace `buildEntityAwarePrompt` call with `ContextAssembler.assemble()` | 02 |

### Phase 4: Action Execution

| Step | File | Action | Source Doc |
|------|------|--------|-----------|
| 4a | `src/lib/agent/action-executor.ts` | New: `executeApprovedAction()` with TRANSPORT_MAP | 03 |
| 4b | `src/lib/agent/tools/superpower-tools.ts` | Add `approve_action` tool definition + handler | 03 |
| 4c | `src/lib/agent/approval-queue.ts` | Wire execution trigger after `resolveApproval()` | 03 |
| 4d | `src/app/api/agent/approvals/route.ts` | Trigger execution after dashboard approval | 03 |

### Phase 5: Channel Migration

| Step | File | Action | Source Doc |
|------|------|--------|-----------|
| 5a | `src/app/api/channels/whatsapp/route.ts` | Route through unified pipeline via identity + thread resolution | 04 |
| 5b | `src/lib/channels/sms.ts` adapter | Route through unified pipeline | 04 |
| 5c | `src/lib/channels/email-command.ts` adapter | Route through unified pipeline | 04 |
| 5d | Deprecate in-memory `activeConversations` Map | Remove after all channels migrated | 04 |

### Phase 6: Compression & Memory

| Step | File | Action | Source Doc |
|------|------|--------|-----------|
| 6a | `src/lib/memory/conversation-compressor.ts` | New: 3-tier compression with Haiku | 05 |
| 6b | `src/lib/memory/memory-consolidator.ts` | New: fact extraction, contradiction detection | 05 |
| 6c | `src/lib/memory/thread-archiver.ts` | New: compiled_summary generation on archive | 05 |
| 6d | Cloudflare edge cron | Add `archive_stale_threads()` call every 15 minutes | 01, 04 |

### Phase 7: Cleanup

| Step | Action |
|------|--------|
| 7a | Deprecate `ConversationRouter` string-packing approach |
| 7b | Add message cleanup cron for compiled threads (30-day retention) |
| 7c | Add identity backfill for new user signups |

---

## 5. Cross-Reference: Doc Provenance

Each architecture doc remains the authoritative source for its domain's **rationale, edge cases, and sequence diagrams**:

| Topic | Canonical Source |
|-------|-----------------|
| Schema DDL, indexes, RLS, query patterns, data lifecycle | This doc (06) + Doc 01 for rationale |
| Context assembly pipeline, TokenBudgetManager, tier degradation | Doc 02 |
| Action execution, approve_action tool, TRANSPORT_MAP, retry logic | Doc 03 |
| Identity resolution cascades, shadow identities, sequence diagrams, channel formatting | Doc 04 |
| 3-tier compression, Haiku prompts, fact extraction, contradiction detection, worked examples | Doc 05 |

---

## 6. Performance Targets

| Operation | Target | Strategy |
|-----------|--------|----------|
| Get/create active thread | <5ms | `get_or_create_active_thread()` + partial unique index |
| Load last 15 messages | <10ms | `idx_conv_messages_thread_time`, LIMIT 15 |
| Resolve channel identity | <5ms | `idx_channel_identities_resolve` partial index |
| Insert message + update counters | <10ms | Single transaction |
| Full context assembly (all tiers) | <200ms | Parallel fetches, cached system prompt |
| Compression (Haiku call) | ~500ms | Async, fire-and-forget |
| Archive stale threads batch | <100ms | `idx_conv_threads_stale` |
