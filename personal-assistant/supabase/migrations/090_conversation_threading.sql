-- ============================================================================
-- 090_conversation_threading.sql
-- Per-channel threading: web chat gets 1 active thread per channel per user,
-- while WhatsApp/SMS/email remain single continuous threads.
--
-- Changes:
--   1. Replace unique index to allow multiple active threads (one per channel)
--   2. Replace get_or_create_active_thread() with channel-aware version
--   3. Add list_user_threads() for thread listing with message preview
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Replace unique index: (user_id, org_id) → (user_id, org_id, last_channel)
--    This allows one active thread per channel per user/org pair.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_conv_threads_active_user;

CREATE UNIQUE INDEX idx_conv_threads_active_user_channel
  ON conversation_threads (user_id, org_id, last_channel)
  WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace get_or_create_active_thread() — now channel-aware
--    Defaults to 'web' for backward compatibility.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_or_create_active_thread(
  p_user_id UUID,
  p_org_id UUID,
  p_channel TEXT DEFAULT 'web'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  -- Look for an existing active thread for this user/org/channel
  SELECT id INTO v_thread_id
  FROM conversation_threads
  WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND last_channel = p_channel
    AND status = 'active';

  IF v_thread_id IS NOT NULL THEN
    -- Touch last_activity_at and return
    UPDATE conversation_threads
    SET last_activity_at = now()
    WHERE id = v_thread_id;
    RETURN v_thread_id;
  END IF;

  -- No active thread for this channel — create one
  INSERT INTO conversation_threads (user_id, org_id, status, last_channel)
  VALUES (p_user_id, p_org_id, 'active', p_channel)
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. list_user_threads() — paginated thread list with most-recent message preview
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION list_user_threads(
  p_user_id UUID,
  p_org_id UUID,
  p_channel TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  id UUID,
  title TEXT,
  status TEXT,
  last_channel TEXT,
  message_count INTEGER,
  last_activity_at TIMESTAMPTZ,
  preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ct.id,
    ct.title,
    ct.status,
    ct.last_channel,
    ct.message_count,
    ct.last_activity_at,
    (
      SELECT cm.content
      FROM conversation_messages cm
      WHERE cm.thread_id = ct.id
      ORDER BY cm.created_at DESC
      LIMIT 1
    ) AS preview
  FROM conversation_threads ct
  WHERE ct.user_id = p_user_id
    AND ct.org_id = p_org_id
    AND (p_channel IS NULL OR ct.last_channel = p_channel)
  ORDER BY ct.last_activity_at DESC
  LIMIT p_limit;
END;
$$;

COMMIT;
