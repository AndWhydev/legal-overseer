-- 045_channel_oauth_expansion.sql
-- Expand channel_connections and channel_messages CHECK constraints to support
-- all channel types, and add content_hash column for cross-channel dedup.

-- 1. Expand channel_connections CHECK constraint
ALTER TABLE channel_connections DROP CONSTRAINT IF EXISTS channel_connections_channel_type_check;
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_channel_type_check
  CHECK (channel_type IN ('gmail', 'outlook', 'whatsapp', 'asana', 'calendly', 'stripe', 'imessage', 'calendar', 'reminders', 'gsc'));

-- 2. Expand channel_messages CHECK constraint
ALTER TABLE channel_messages DROP CONSTRAINT IF EXISTS channel_messages_channel_check;
ALTER TABLE channel_messages ADD CONSTRAINT channel_messages_channel_check
  CHECK (channel IN ('gmail', 'outlook', 'whatsapp', 'asana', 'calendly', 'stripe', 'imessage', 'calendar', 'reminders', 'gsc'));

-- 3. Add content_hash column for cross-channel deduplication
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- 4. Partial index on content_hash for efficient dedup lookups
CREATE INDEX IF NOT EXISTS idx_channel_messages_content_hash
  ON channel_messages(content_hash)
  WHERE content_hash IS NOT NULL;
