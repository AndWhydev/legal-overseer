-- ============================================================================
-- Plan 35-01: Cognitive Memory OS — Entity Graph Tables
-- Creates entity_nodes, entity_edges, event_tuples for knowledge graph
-- ============================================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================================
-- ENTITY_NODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person','project','company','invoice','channel')),
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  properties JSONB DEFAULT '{}',
  embedding extensions.vector(768),
  text_embedding extensions.vector(1024),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- ENTITY_EDGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT now(),
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  source_memory_id UUID
);

-- ============================================================================
-- EVENT_TUPLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_tuples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  verb TEXT NOT NULL,
  object_text TEXT,
  object_id UUID REFERENCES entity_nodes(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  occurred_until TIMESTAMPTZ,
  source_memory_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- entity_nodes indexes
CREATE INDEX IF NOT EXISTS idx_entity_nodes_aliases ON entity_nodes USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_org_type ON entity_nodes (org_id, entity_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_entity_nodes_embedding ON entity_nodes USING hnsw (embedding extensions.vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_text_embedding ON entity_nodes USING hnsw (text_embedding extensions.vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- entity_edges indexes
CREATE INDEX IF NOT EXISTS idx_entity_edges_source ON entity_edges (source_id) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_edges_target ON entity_edges (target_id) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_edges_org_type ON entity_edges (org_id, relation_type);

-- event_tuples indexes
CREATE INDEX IF NOT EXISTS idx_event_tuples_subject ON event_tuples (org_id, subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_tuples_time ON event_tuples (org_id, occurred_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE entity_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tuples ENABLE ROW LEVEL SECURITY;

-- entity_nodes policies
CREATE POLICY "entity_nodes_select" ON entity_nodes FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "entity_nodes_insert" ON entity_nodes FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "entity_nodes_update" ON entity_nodes FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "entity_nodes_delete" ON entity_nodes FOR DELETE USING (org_id = get_user_org_id());

-- entity_edges policies
CREATE POLICY "entity_edges_select" ON entity_edges FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "entity_edges_insert" ON entity_edges FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "entity_edges_update" ON entity_edges FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "entity_edges_delete" ON entity_edges FOR DELETE USING (org_id = get_user_org_id());

-- event_tuples policies
CREATE POLICY "event_tuples_select" ON event_tuples FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "event_tuples_insert" ON event_tuples FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "event_tuples_update" ON event_tuples FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "event_tuples_delete" ON event_tuples FOR DELETE USING (org_id = get_user_org_id());

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_entity_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entity_nodes_updated_at
  BEFORE UPDATE ON entity_nodes
  FOR EACH ROW EXECUTE FUNCTION update_entity_nodes_updated_at();

-- ============================================================================
-- VECTOR SEARCH RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION match_entity_nodes(
  query_embedding extensions.vector(768),
  match_org_id UUID,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  entity_type TEXT,
  properties JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    entity_nodes.id,
    entity_nodes.name,
    entity_nodes.entity_type,
    entity_nodes.properties,
    1 - (entity_nodes.embedding <=> query_embedding) AS similarity
  FROM entity_nodes
  WHERE entity_nodes.org_id = match_org_id
    AND entity_nodes.is_active = true
    AND entity_nodes.embedding IS NOT NULL
  ORDER BY entity_nodes.embedding <=> query_embedding
  LIMIT match_count;
$$;
