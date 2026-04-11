-- 005_entity_relationships.sql
-- Entity relationship graph for semantic context engine

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  entity_a_type text NOT NULL CHECK (entity_a_type IN ('contact', 'task', 'invoice', 'project', 'channel_message', 'goal')),
  entity_a_id uuid NOT NULL,
  entity_b_type text NOT NULL CHECK (entity_b_type IN ('contact', 'task', 'invoice', 'project', 'channel_message', 'goal')),
  entity_b_id uuid NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('works_on', 'bills_for', 'assigned_to', 'mentioned_in', 'related_to', 'manages', 'created_by', 'client_of', 'vendor_for', 'part_of')),
  strength float NOT NULL DEFAULT 1.0,
  metadata jsonb DEFAULT '{}',
  last_evidence_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, entity_a_type, entity_a_id, entity_b_type, entity_b_id, relationship_type)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_entity_rel_org ON entity_relationships (org_id);
CREATE INDEX idx_entity_rel_a ON entity_relationships (org_id, entity_a_type, entity_a_id);
CREATE INDEX idx_entity_rel_b ON entity_relationships (org_id, entity_b_type, entity_b_id);
CREATE INDEX idx_entity_rel_type ON entity_relationships (org_id, relationship_type);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_entity_relationships_updated_at
  BEFORE UPDATE ON entity_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
