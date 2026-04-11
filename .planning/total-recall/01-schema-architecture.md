# Schema Architecture: BitBit Total Recall

## Summary of Findings

**Existing State:**
1. `conversation_threads` table does NOT exist in any migration -- the `conversation-interface.ts` code references it but the table was never created (it is documented as a requirement in `CONVERSATION-INTERFACE.md` and `CONVERSATION-INTEGRATION.md`).
2. The current web chat route (`/api/agent/chat/route.ts`) is purely stateless -- single-turn with no history.
3. `entity_threads` exists (migration 059) but serves a different purpose -- it tracks email/channel threads linked to entity IDs for the context baseplate, not user-to-AI conversations.
4. The existing `ConversationRouter` in `conversation-interface.ts` already writes to `conversation_threads` (lines 290, 400) but the table does not exist, so those writes silently fail.
5. Identity resolution is fragmented: WhatsApp uses `channel_configs.external_id`, contacts have `emails[]` and `phones[]` arrays plus the normalized `contact_emails` table, but there is no unified `channel_identities` mapping from channel addresses to user_id.
6. The `contacts` table has `emails text[]`, `phones text[]`, and `contact_emails` (normalized). But contacts are business contacts (clients, vendors), NOT the platform users themselves.
7. RLS uses dual-tier pattern: `get_user_accessible_org_ids()` for SELECT, `get_user_active_org_id()` for INSERT. Newer tables also include `service_role` bypass policies.
8. The `approval_queue` has no thread linkage -- it has `context_snapshot jsonb` but no `thread_id` or `message_id` to trace back to the conversation turn where it was proposed.

---

## Entity-Relationship Diagram

```
profiles (auth.users)
    |
    | user_id (uuid)
    |
    +--- conversation_continua (1:1 active per user+org)
    |        |
    |        | continuum_id (uuid)
    |        |
    |        +--- conversation_messages (1:N, ordered by created_at)
    |        |        |
    |        |        +--- references approval_queue via thread_id + message_id
    |        |
    |        +--- thread_summaries (1:N, compressed history windows)
    |
    +--- channel_identities (1:N, cross-channel identity resolution)
    |
    +--- entity_profiles (existing, linked via entity mentions)
```

## Key Design Decisions

**Decision 1: Rename "conversation_threads" to "conversation_continua"**
The existing codebase has `entity_threads` for baseplate thread tracking. Using the same name `conversation_threads` for a fundamentally different table (flat message store vs thread metadata) would create confusion. The spec calls this concept a "continuum" -- one unbroken thread per user that persists across channels. However, since the existing `conversation-interface.ts` already references `conversation_threads`, I recommend keeping the name `conversation_threads` for the metadata/header table and using `conversation_messages` for the individual messages. This is the cleanest separation: `conversation_threads` is the thread (one active per user), `conversation_messages` holds the turns.

**Decision 2: Separate thread header from messages**
The original `CONVERSATION-INTEGRATION.md` proposed a flat table where every row is a message but also carries `thread_id`. The Total Recall design needs proper thread lifecycle (active/archived/compiled), summary compression, and efficient "find active thread" lookups. A separate header table is mandatory.

**Decision 3: Message content stored as text + structured JSONB for tool calls**
Messages from the user/assistant are plain text content. Tool calls and results go into a JSONB `tool_data` column. This avoids polluting the text content with serialized JSON, while still preserving full tool call continuity.

**Decision 4: channel_identities on user_id not contact_id**
Contacts are external entities (clients, vendors). The identity table maps channel addresses to platform users (auth.users). This is necessary because WhatsApp messages come from a phone number that must resolve to a Supabase user, not just a contact record.

## Tables

### 1. conversation_threads (Thread Header)

```sql
CREATE TABLE conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'compiled')),
  title TEXT,  -- auto-generated or user-set thread title
  message_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,  -- running estimate of context tokens
  last_channel TEXT,  -- most recent channel used
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,  -- when thread was archived (24h inactivity)
  compiled_summary TEXT,  -- persistent memory extracted at archive time
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Rationale:**
- `user_id + org_id` scoping: a user has one continuum per org context. Personal org has its own thread, shared org has its own.
- `status`: `active` (current), `archived` (24h idle), `compiled` (summary extracted, raw messages eligible for cleanup).
- `token_estimate`: maintained incrementally so the engine knows when to trigger summary compression without counting every time.
- `compiled_summary`: the persistent "compiled memory" that survives forever even after message cleanup. This is the thread's lasting contribution to the user's world model.
- `last_channel`: useful for "continue where you left off" UX hints.

### 2. conversation_messages (Turn-by-Turn History)

```sql
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool_call', 'tool_result')),
  channel TEXT NOT NULL CHECK (channel IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage', 'api'
  )),
  content TEXT NOT NULL DEFAULT '',
  tool_data JSONB,  -- for role='tool_call': {name, input}; for role='tool_result': {name, result, success}
  token_count INTEGER,  -- estimated tokens for this message
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Rationale:**
- `role` includes `tool_call` and `tool_result` as first-class citizens. The engine emits these as events; storing them enables full replay and continuity when the user references a previous tool action.
- `channel` per message, not per thread. This is the core of cross-channel continuity -- the thread is channel-agnostic, each message records where it came from.
- `user_id` and `org_id` denormalized from thread for RLS efficiency -- avoids joins in hot-path queries.
- `token_count` per message enables precise context window management.
- No `updated_at` -- messages are append-only, never modified.

### 3. thread_summaries (Tiered Compression)

```sql
CREATE TABLE thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  turn_range_start INTEGER NOT NULL,  -- first message ordinal in this summary
  turn_range_end INTEGER NOT NULL,    -- last message ordinal in this summary
  summary_text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  model_used TEXT NOT NULL DEFAULT 'claude-haiku-4-20250514',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (turn_range_end > turn_range_start)
);
```

**Rationale:**
- `turn_range_start`/`turn_range_end` are ordinal positions within the thread (1-indexed, based on creation order), not message IDs. This allows efficient "which messages are covered by summaries" queries.
- Summaries are generated by Haiku for cost efficiency.
- When context window exceeds a threshold (e.g., 10 turns / ~4000 tokens), older messages get compressed into summaries. The engine then loads: summaries + last N raw messages.

### 4. channel_identities (Cross-Channel Identity Resolution)

```sql
CREATE TABLE channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage'
  )),
  channel_identifier TEXT NOT NULL,  -- phone number, email, Slack user ID, etc.
  display_name TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, channel_type, channel_identifier)
);
```

**Rationale:**
- This table answers "who is the user sending this WhatsApp message from +61400123456?"
- `verified`: whether the identity link has been confirmed (e.g., user verified their phone number in the dashboard).
- Unique constraint on `(org_id, channel_type, channel_identifier)` prevents duplicate identity claims within an org.
- Separate from `contacts` which tracks external entities. This tracks platform user identities.

### 5. approval_queue Enhancement

No new table needed. Add two columns to the existing `approval_queue`:

```sql
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL;
```

**Rationale:**
- Links approval records back to the exact conversation turn where they were proposed.
- `ON DELETE SET NULL` because thread/message cleanup should not cascade-delete approval records.
- Enables "show me the conversation context for this approval" in the dashboard.
- Enables re-queue: when an expired approval is re-queued, the agent can load the original thread context.

## Indexes

### conversation_threads

```sql
-- Hot path: find active thread for user+org
CREATE UNIQUE INDEX idx_conv_threads_active_user
  ON conversation_threads (user_id, org_id)
  WHERE status = 'active';

-- Archival cron: find threads idle > 24h
CREATE INDEX idx_conv_threads_stale
  ON conversation_threads (last_activity_at)
  WHERE status = 'active';

-- Lookup by org for admin views
CREATE INDEX idx_conv_threads_org
  ON conversation_threads (org_id, last_activity_at DESC);
```

**Key index: `idx_conv_threads_active_user`** -- This is a partial unique index. It enforces that each user has at most ONE active thread per org, and provides O(1) lookup for the "get or create active thread" operation. This is the most critical index in the system.

### conversation_messages

```sql
-- Hot path: load last N messages for a thread
CREATE INDEX idx_conv_messages_thread_time
  ON conversation_messages (thread_id, created_at DESC);

-- User history across threads (admin/search)
CREATE INDEX idx_conv_messages_user_time
  ON conversation_messages (user_id, created_at DESC);

-- Channel-specific message lookup
CREATE INDEX idx_conv_messages_org_channel
  ON conversation_messages (org_id, channel, created_at DESC);
```

### thread_summaries

```sql
-- Load summaries for a thread
CREATE INDEX idx_thread_summaries_thread
  ON thread_summaries (thread_id, turn_range_start);
```

### channel_identities

```sql
-- Hot path: resolve user from channel address
CREATE INDEX idx_channel_identities_resolve
  ON channel_identities (channel_type, channel_identifier)
  WHERE verified = true;

-- User's linked identities
CREATE INDEX idx_channel_identities_user
  ON channel_identities (user_id);
```

### approval_queue additions

```sql
CREATE INDEX idx_approval_queue_thread
  ON approval_queue (thread_id)
  WHERE thread_id IS NOT NULL;
```

## RLS Policies

Following the dual-tier pattern from migration 053:

### conversation_threads

```sql
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

-- Users see their own threads in accessible orgs
CREATE POLICY "conversation_threads_select" ON conversation_threads
  FOR SELECT USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

-- Users create threads in their active org only
CREATE POLICY "conversation_threads_insert" ON conversation_threads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id = get_user_active_org_id()
  );

-- Users update their own threads
CREATE POLICY "conversation_threads_update" ON conversation_threads
  FOR UPDATE USING (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  ) WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT get_user_accessible_org_ids())
  );

-- Service role bypass for agent/cron operations
CREATE POLICY "conversation_threads_service_role" ON conversation_threads
  FOR ALL USING (auth.role() = 'service_role');
```

### conversation_messages

```sql
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
```

### thread_summaries

```sql
ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_summaries_select" ON thread_summaries
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- Only service role creates summaries (background compression job)
CREATE POLICY "thread_summaries_service_role" ON thread_summaries
  FOR ALL USING (auth.role() = 'service_role');
```

### channel_identities

```sql
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
```

## Migration File Content

This would be migration `067_total_recall.sql`. Full SQL:

```sql
-- 067_total_recall.sql
-- BitBit Total Recall: Conversational memory and cross-channel continuity
-- Creates: conversation_threads, conversation_messages, thread_summaries, channel_identities
-- Alters: approval_queue (add thread linkage)

-- 1. CONVERSATION_THREADS (Thread Header / Continuum)

CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'compiled')),
  title TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  last_channel TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  compiled_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active thread per user per org (enforced + fast lookup)
CREATE UNIQUE INDEX idx_conv_threads_active_user
  ON conversation_threads (user_id, org_id)
  WHERE status = 'active';

CREATE INDEX idx_conv_threads_stale
  ON conversation_threads (last_activity_at)
  WHERE status = 'active';

CREATE INDEX idx_conv_threads_org
  ON conversation_threads (org_id, last_activity_at DESC);

CREATE TRIGGER trg_conversation_threads_updated_at
  BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

-- 2. CONVERSATION_MESSAGES (Turn-by-Turn History)

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool_call', 'tool_result')),
  channel TEXT NOT NULL CHECK (channel IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage', 'api'
  )),
  content TEXT NOT NULL DEFAULT '',
  tool_data JSONB,
  token_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_messages_thread_time
  ON conversation_messages (thread_id, created_at DESC);

CREATE INDEX idx_conv_messages_user_time
  ON conversation_messages (user_id, created_at DESC);

CREATE INDEX idx_conv_messages_org_channel
  ON conversation_messages (org_id, channel, created_at DESC);

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

CREATE POLICY "conversation_messages_service_role" ON conversation_messages
  FOR ALL USING (auth.role() = 'service_role');

-- 3. THREAD_SUMMARIES (Tiered Compression)

CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  turn_range_start INTEGER NOT NULL,
  turn_range_end INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  model_used TEXT NOT NULL DEFAULT 'claude-haiku-4-20250514',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (turn_range_end > turn_range_start)
);

CREATE INDEX idx_thread_summaries_thread
  ON thread_summaries (thread_id, turn_range_start);

ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_summaries_select" ON thread_summaries
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "thread_summaries_service_role" ON thread_summaries
  FOR ALL USING (auth.role() = 'service_role');

-- 4. CHANNEL_IDENTITIES (Cross-Channel Identity Resolution)

CREATE TABLE IF NOT EXISTS channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage'
  )),
  channel_identifier TEXT NOT NULL,
  display_name TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, channel_type, channel_identifier)
);

CREATE INDEX idx_channel_identities_resolve
  ON channel_identities (channel_type, channel_identifier)
  WHERE verified = true;

CREATE INDEX idx_channel_identities_user
  ON channel_identities (user_id);

CREATE TRIGGER trg_channel_identities_updated_at
  BEFORE UPDATE ON channel_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

-- 5. APPROVAL_QUEUE ENHANCEMENT (Thread Linkage)

ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_approval_queue_thread
  ON approval_queue (thread_id)
  WHERE thread_id IS NOT NULL;

-- 6. HELPER FUNCTION: Get or Create Active Thread

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
```

## Relationship to Existing Tables

| Existing Table | Relationship | Notes |
|---|---|---|
| `profiles` | `conversation_threads.user_id` -> `auth.users.id` (via profiles) | Thread owner is a platform user |
| `organizations` | `conversation_threads.org_id` -> `organizations.id` | Thread scoped to org context |
| `approval_queue` | New `thread_id` + `source_message_id` columns | Links approvals back to conversation context |
| `entity_threads` (059) | No FK, conceptually distinct | `entity_threads` tracks external channel threads; `conversation_threads` tracks user-AI conversations |
| `channel_messages` (004) | No FK, but channel_identities enables cross-referencing | Inbound channel_messages can trigger conversation_messages via the router |
| `entity_profiles` (060) | Loaded as context during prompt building | The compiled_summary in conversation_threads feeds into entity_profiles |
| `semantic_memories` (007) | Can be extracted from compiled_summary | Thread compilation generates new semantic memories |
| `channel_configs` (041) | Used for org resolution, not directly linked | Webhook routes use channel_configs to find org, then channel_identities to find user |
| `contact_emails` (044) | Potential cross-reference for identity bootstrapping | When linking a user's email, can check if it matches a known contact |

## Query Patterns

### 1. Get Active Thread (Most Common -- Every Chat Request)

```sql
-- Via helper function (recommended):
SELECT get_or_create_active_thread('02ce2616-...', '7abcbfb1-...');

-- Direct query:
SELECT id, message_count, token_estimate, last_channel, metadata
FROM conversation_threads
WHERE user_id = $1 AND org_id = $2 AND status = 'active';
-- Uses: idx_conv_threads_active_user (unique partial index, O(1))
```

### 2. Load Last N Messages for Context Window

```sql
SELECT role, channel, content, tool_data, token_count, created_at
FROM conversation_messages
WHERE thread_id = $1
ORDER BY created_at DESC
LIMIT $2;  -- typically 15
-- Uses: idx_conv_messages_thread_time
-- Expected: <5ms for 15 rows
```

### 3. Load Summaries + Recent Messages (Tiered Context Assembly)

```sql
-- Step 1: Get summaries covering older turns
SELECT summary_text, token_count, turn_range_start, turn_range_end
FROM thread_summaries
WHERE thread_id = $1
ORDER BY turn_range_start;

-- Step 2: Get raw messages not covered by summaries
SELECT role, channel, content, tool_data, token_count
FROM conversation_messages
WHERE thread_id = $1
ORDER BY created_at DESC
LIMIT 15;
```

### 4. Resolve User from Channel Address (Webhook Hot Path)

```sql
SELECT user_id, org_id
FROM channel_identities
WHERE channel_type = $1  -- e.g., 'whatsapp'
  AND channel_identifier = $2  -- e.g., '+61400123456'
  AND verified = true;
-- Uses: idx_channel_identities_resolve
-- Expected: <2ms
```

### 5. Archive Stale Threads (Cron Job)

```sql
UPDATE conversation_threads
SET status = 'archived',
    archived_at = now()
WHERE status = 'active'
  AND last_activity_at < now() - interval '24 hours'
RETURNING id, user_id, org_id;
-- Uses: idx_conv_threads_stale
-- Returns list of threads to compile summaries for
```

### 6. Insert Message and Update Thread Counters

```sql
-- In a transaction:
INSERT INTO conversation_messages (thread_id, user_id, org_id, role, channel, content, token_count)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

UPDATE conversation_threads
SET message_count = message_count + 1,
    token_estimate = token_estimate + $7,
    last_channel = $5,
    last_activity_at = now()
WHERE id = $1;
```

### 7. Get Conversation Context for Approval

```sql
SELECT cm.role, cm.channel, cm.content, cm.created_at
FROM conversation_messages cm
WHERE cm.thread_id = (
  SELECT thread_id FROM approval_queue WHERE id = $1
)
ORDER BY cm.created_at DESC
LIMIT 10;
```

### 8. User's Conversation History (Dashboard)

```sql
SELECT ct.id, ct.status, ct.title, ct.message_count, ct.last_channel,
       ct.last_activity_at, ct.created_at
FROM conversation_threads ct
WHERE ct.user_id = $1
  AND ct.org_id = $2
ORDER BY ct.last_activity_at DESC
LIMIT 20;
```

## Data Lifecycle

### Active Phase (0-24h of activity)
- Messages accumulate in `conversation_messages`.
- Thread header's `message_count`, `token_estimate`, and `last_activity_at` updated on each insert.
- When `message_count` exceeds 10, a summary compression job runs:
  - Takes the oldest N messages not yet summarized.
  - Sends to Haiku for summarization.
  - Inserts into `thread_summaries`.
  - Raw messages are NOT deleted yet (retained for replay/debug).

### Archival Phase (24h inactivity)
- Cron job (Cloudflare Edge worker, every 5 minutes) runs the stale thread query.
- Archived threads get a final `compiled_summary` generated from all summaries + remaining raw messages.
- The `compiled_summary` is a single paragraph distillation of the entire thread.
- Status set to `'archived'`.

### Compiled Phase (Post-Archival)
- A background job extracts durable facts from `compiled_summary` into `semantic_memories`.
- Status set to `'compiled'` once extraction is complete.
- Raw `conversation_messages` for compiled threads are eligible for cleanup after 30 days.
- The `compiled_summary` on the thread header persists indefinitely.
- `thread_summaries` for compiled threads are eligible for cleanup after 30 days.

### Cleanup Schedule
| Data | Retention | Cleanup Trigger |
|---|---|---|
| Raw messages (active threads) | Indefinite | -- |
| Raw messages (compiled threads) | 30 days post-compilation | Cron job |
| Thread summaries (compiled threads) | 30 days post-compilation | Cron job |
| Thread headers | Indefinite | Never deleted |
| `compiled_summary` | Indefinite | Part of thread header |
| `semantic_memories` (extracted) | Indefinite | Part of world model |

### New Thread Creation
- When user sends a message and no active thread exists, `get_or_create_active_thread()` creates one.
- The new thread's context includes: (a) the previous thread's `compiled_summary`, (b) relevant `semantic_memories`, (c) entity_profiles context.
- This gives the illusion of continuous memory even across thread boundaries.

## Performance Targets

| Operation | Target | Index Used | Strategy |
|---|---|---|---|
| Get active thread | <5ms | `idx_conv_threads_active_user` (unique partial) | Single index seek |
| Load last 15 messages | <10ms | `idx_conv_messages_thread_time` | Index scan, LIMIT 15 |
| Resolve channel identity | <5ms | `idx_channel_identities_resolve` (partial) | Single index seek |
| Insert message | <10ms | -- | Single insert + counter update |
| Archive stale threads | <100ms | `idx_conv_threads_stale` | Batch update |
| Full context assembly | <50ms | Combined thread + messages + summaries | 3 queries in parallel |

## Migration Compatibility Notes

1. The table name `conversation_threads` is deliberately chosen to match what `conversation-interface.ts` already references (lines 290, 400). However, the schema is different -- the existing code writes messages directly to `conversation_threads` as a flat table, while this design separates the thread header from messages. The TypeScript code will need to be updated to write to `conversation_messages` instead.

2. The `entity_threads` table (migration 059) is NOT being replaced or modified. It serves a different purpose (tracking external channel threads for baseplate entity linking). The two systems will coexist -- `entity_threads` for external channel thread metadata, `conversation_threads` for user-AI conversation state.

3. The `channel` CHECK constraint on `conversation_messages` includes `'imessage'` and `'api'` which are not in the current `ConversationMessage` TypeScript type. The TypeScript type union should be expanded to match.

4. The `get_or_create_active_thread` function uses `SECURITY DEFINER` because it needs to operate within webhook handlers that run as service role. The function itself enforces the single-active-thread invariant via the partial unique index.

### Critical Files for Implementation
- `personal-assistant/src/lib/agent/conversation-interface.ts` - Must be refactored: currently writes flat rows to `conversation_threads`, needs to write to `conversation_messages` and use the new thread header pattern with `get_or_create_active_thread`
- `personal-assistant/src/app/api/agent/chat/route.ts` - The web chat entry point that must be wired to use ConversationRouter with thread persistence instead of stateless single-turn
- `personal-assistant/supabase/migrations/020_approval_queue.sql` - Reference for the existing approval_queue schema that will be altered to add thread_id and source_message_id columns
- `personal-assistant/src/app/api/channels/whatsapp/route.ts` - Webhook handler that must be updated to resolve user via channel_identities and route messages through the thread system
- `personal-assistant/supabase/migrations/053_dual_tier_rls_policies.sql` - Pattern reference for all RLS policies (dual-tier pattern with `get_user_accessible_org_ids()` / `get_user_active_org_id()`)
