-- ============================================================================
-- 068_add_read_state.sql
-- Add persistent read state for inbox messages
-- ============================================================================

-- Add read_at column to channel_messages
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient unread message queries
CREATE INDEX IF NOT EXISTS idx_channel_messages_read_at
  ON channel_messages (org_id, read_at)
  WHERE read_at IS NULL;

-- Add metadata.category for priority filtering
-- (This is already used via JSONB, no schema change needed)
