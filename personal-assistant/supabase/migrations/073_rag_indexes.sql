-- Migration: 073_rag_indexes.sql
-- Purpose: Optimize database indexes for RAG retrieval and backfill operations
-- Target: Improve performance of vector search queries and backfill job management

-- Optimize backfill cursor queries
-- Used when seeking messages after a certain point in a channel
CREATE INDEX IF NOT EXISTS idx_channel_messages_org_channel_received
  ON channel_messages (org_id, channel, received_at);

-- Optimize cross-channel backfill queries
-- Used when scanning all messages for an org in chronological order
CREATE INDEX IF NOT EXISTS idx_channel_messages_org_received
  ON channel_messages (org_id, received_at);

-- Optimize backfill job lookups
-- Used when querying backfill job status and progress
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_org_channel_status
  ON backfill_jobs (org_id, channel_type, status);
