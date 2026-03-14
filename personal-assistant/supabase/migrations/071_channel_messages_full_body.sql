-- Migration 071: Add body_full column for complete message content (RAG embedding)
-- The existing `body` column stores truncated snippets (max 2000 chars).
-- `body_full` stores the complete message body for accurate vector embedding.
-- Nullable: old messages keep NULL until backfilled.

ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS body_full TEXT;

COMMENT ON COLUMN channel_messages.body_full IS 'Full untruncated message body for RAG embedding. Falls back to body if NULL.';
