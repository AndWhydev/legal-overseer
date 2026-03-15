-- ============================================================================
-- 068_conversation_checkpoints.sql
-- BitBit Conversation Checkpoints: Cross-platform continuity & session boundaries
--
-- Creates: conversation_checkpoints table for marking conversation snapshots
-- Alters:  conversation_messages (adds session_boundary column)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONVERSATION_CHECKPOINTS (Conversation snapshots for continuity)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT 'Checkpoint',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkpoints_thread ON conversation_checkpoints(thread_id);
CREATE INDEX idx_checkpoints_user ON conversation_checkpoints(user_id);
CREATE INDEX idx_checkpoints_thread_created ON conversation_checkpoints(thread_id, created_at DESC);

-- RLS
ALTER TABLE conversation_checkpoints ENABLE ROW LEVEL SECURITY;

-- Users can manage their own checkpoints
CREATE POLICY "checkpoints_select" ON conversation_checkpoints
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "checkpoints_insert" ON conversation_checkpoints
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "checkpoints_delete" ON conversation_checkpoints
  FOR DELETE USING (
    user_id = auth.uid()
  );

CREATE POLICY "checkpoints_service_role" ON conversation_checkpoints
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SESSION_BOUNDARY column on conversation_messages
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_messages' AND column_name = 'session_boundary'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN session_boundary BOOLEAN DEFAULT FALSE;
    CREATE INDEX idx_conversation_messages_session_boundary ON conversation_messages(thread_id, session_boundary)
    WHERE session_boundary = TRUE;
  END IF;
END $$;
