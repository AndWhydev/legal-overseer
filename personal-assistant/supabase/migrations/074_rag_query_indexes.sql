-- Migration 074: Additional indexes for RAG query optimization
-- Purpose: Optimize database queries for RAG backfill, embedding pipeline, and memory search
-- Target: Improve performance of context assembly and knowledge graph operations

-- Ensure pg_trgm extension for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for embedding pipeline (finding messages with full body for embedding)
CREATE INDEX IF NOT EXISTS idx_channel_messages_org_body_full
  ON channel_messages(org_id) WHERE body_full IS NOT NULL;

-- Index for backfill job polling (status lookups by org)
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_org_status
  ON backfill_jobs(org_id, status);

-- Index for memory entries category filtering
CREATE INDEX IF NOT EXISTS idx_memory_entries_org_category
  ON memory_entries(org_id, category);

-- Index for memory entries text search using trigram matching
CREATE INDEX IF NOT EXISTS idx_memory_entries_content_trgm
  ON memory_entries USING gin(content gin_trgm_ops);
