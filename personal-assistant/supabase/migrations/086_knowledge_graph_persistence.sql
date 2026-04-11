-- Knowledge Graph Persistence
-- Backs the in-memory KnowledgeGraphClient with Supabase tables.
-- Supports Person, Organization, Topic nodes and
-- MENTIONED_IN, DISCUSSED, CONTACTED_BY edges.

-- ─── Nodes ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kg_nodes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  node_type  text NOT NULL CHECK (node_type IN ('Person', 'Organization', 'Topic')),
  entity_id  text NOT NULL,  -- external ID (contact UUID, topic slug, etc.)
  name       text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One node per (org, type, entity_id) — upsert-safe
CREATE UNIQUE INDEX IF NOT EXISTS idx_kg_nodes_unique
  ON kg_nodes (org_id, node_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_org
  ON kg_nodes (org_id);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_entity
  ON kg_nodes (entity_id);

-- ─── Edges ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kg_edges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id  text NOT NULL,   -- entity_id of source node
  target_id  text NOT NULL,   -- entity_id of target node
  edge_type  text NOT NULL CHECK (edge_type IN ('MENTIONED_IN', 'DISCUSSED', 'CONTACTED_BY')),
  metadata   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One edge per (org, source, target, type) — upsert-safe
CREATE UNIQUE INDEX IF NOT EXISTS idx_kg_edges_unique
  ON kg_edges (org_id, source_id, target_id, edge_type);

-- Fast lookups for graph traversal (both directions)
CREATE INDEX IF NOT EXISTS idx_kg_edges_source
  ON kg_edges (org_id, source_id);

CREATE INDEX IF NOT EXISTS idx_kg_edges_target
  ON kg_edges (org_id, target_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE kg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kg_edges ENABLE ROW LEVEL SECURITY;

-- Service-role and org-member access
CREATE POLICY kg_nodes_org_access ON kg_nodes
  FOR ALL USING (
    org_id IN (
      SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY kg_edges_org_access ON kg_edges
  FOR ALL USING (
    org_id IN (
      SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
    )
  );

-- ─── updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_kg_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kg_nodes_updated_at
  BEFORE UPDATE ON kg_nodes
  FOR EACH ROW EXECUTE FUNCTION update_kg_updated_at();

CREATE TRIGGER trg_kg_edges_updated_at
  BEFORE UPDATE ON kg_edges
  FOR EACH ROW EXECUTE FUNCTION update_kg_updated_at();
