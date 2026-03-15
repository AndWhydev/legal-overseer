-- Add content_hash column to channel_messages for tracking embeddings
-- Supports deduplication: skip re-embedding if content hasn't changed

ALTER TABLE channel_messages
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Index for fast lookups during deduplication checks
CREATE INDEX IF NOT EXISTS idx_channel_messages_content_hash
ON channel_messages(content_hash)
WHERE content_hash IS NOT NULL;
