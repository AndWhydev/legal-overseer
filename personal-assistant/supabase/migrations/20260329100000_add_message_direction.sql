-- Add direction column to channel_messages to distinguish inbound vs outbound messages.
-- Defaults to 'inbound' so all existing rows are treated as inbound (safe default).
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';

-- Index for filtering outbound messages during triage
CREATE INDEX IF NOT EXISTS idx_channel_messages_direction
  ON channel_messages(org_id, direction)
  WHERE direction = 'outbound';
