-- Migration: add content_embedding vector column to memory_palace_entries
-- Supports hybrid search (tsvector + vector) via Reciprocal Rank Fusion
-- Depends on pgvector extension (already enabled for entity_nodes.text_embedding)

-- Add vector column
ALTER TABLE memory_palace_entries
  ADD COLUMN IF NOT EXISTS content_embedding vector(1024);

-- IVFFlat index for cosine similarity search (partial: active memories only)
CREATE INDEX IF NOT EXISTS idx_memory_palace_embedding
  ON memory_palace_entries
  USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE is_active = true;

-- RPC: vector similarity search on memory_palace_entries
CREATE OR REPLACE FUNCTION search_memories_vector(
  p_org_id UUID,
  p_embedding vector(1024),
  p_category TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_min_confidence FLOAT DEFAULT 0.1,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  confidence FLOAT,
  entity_ids TEXT[],
  entity_names TEXT[],
  created_at TIMESTAMPTZ,
  source TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.title, m.content, m.category, m.confidence,
    m.entity_ids, m.entity_names, m.created_at, m.source, m.metadata,
    1 - (m.content_embedding <=> p_embedding) AS similarity
  FROM memory_palace_entries m
  WHERE m.org_id = p_org_id
    AND m.is_active = true
    AND m.content_embedding IS NOT NULL
    AND m.confidence >= p_min_confidence
    AND (p_category IS NULL OR m.category = p_category)
    AND (p_entity_id IS NULL OR p_entity_id = ANY(m.entity_ids))
  ORDER BY m.content_embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
