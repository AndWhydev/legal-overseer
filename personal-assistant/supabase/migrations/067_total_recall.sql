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
  title TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  last_channel TEXT DEFAULT 'web'
    CHECK (last_channel IN ('web', 'whatsapp', 'sms', 'email', 'slack', 'imessage', 'api')),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  compiled_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONVERSATION_MESSAGES (Turn-by-Turn History)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool_call', 'tool_result')),
  channel TEXT NOT NULL CHECK (channel IN (
    'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage', 'api'
  )),
  content TEXT NOT NULL DEFAULT '',
  tool_data JSONB,
  channel_metadata JSONB DEFAULT '{}',
  token_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(thread_id, turn_number)
);

CREATE INDEX idx_conv_messages_thread_time
  ON conversation_messages (thread_id, created_at DESC);

CREATE INDEX idx_conv_messages_thread_turn
  ON conversation_messages (thread_id, turn_number);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THREAD_SUMMARIES (Tiered Compression)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('compressed', 'key_facts', 'archived')),
  turn_range_start INTEGER NOT NULL,
  turn_range_end INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  entity_ids UUID[] DEFAULT '{}',
  key_facts JSONB DEFAULT '[]',
  supersedes UUID REFERENCES thread_summaries(id) ON DELETE SET NULL,
  model_used TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (turn_range_end > turn_range_start),
  UNIQUE(thread_id, tier, turn_range_start)
);

CREATE INDEX idx_thread_summaries_thread
  ON thread_summaries (thread_id, tier, turn_range_start);

CREATE INDEX idx_thread_summaries_org
  ON thread_summaries (org_id);

ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_summaries_select" ON thread_summaries
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "thread_summaries_service_role" ON thread_summaries
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHANNEL_IDENTITIES (Cross-Channel Identity Resolution)
-- ─────────────────────────────────────────────────────────────────────────────

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
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

CREATE INDEX idx_channel_identities_org
  ON channel_identities (org_id, channel_type);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. APPROVAL_QUEUE ENHANCEMENTS (Thread linkage + Execution state)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL;

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

CREATE INDEX IF NOT EXISTS idx_approval_queue_thread
  ON approval_queue (thread_id)
  WHERE thread_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

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
  SELECT id INTO v_thread_id
  FROM conversation_threads
  WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND status = 'active';

  IF v_thread_id IS NOT NULL THEN
    UPDATE conversation_threads
    SET last_activity_at = now()
    WHERE id = v_thread_id;
    RETURN v_thread_id;
  END IF;

  INSERT INTO conversation_threads (user_id, org_id, status)
  VALUES (p_user_id, p_org_id, 'active')
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

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
