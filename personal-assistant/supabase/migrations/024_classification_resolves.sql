-- Add resolves and unblocks to channel_messages
ALTER TABLE channel_messages
  ADD COLUMN IF NOT EXISTS resolves JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS unblocks JSONB DEFAULT '[]';
