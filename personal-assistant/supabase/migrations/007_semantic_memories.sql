-- 007_semantic_memories.sql
-- Learnable facts with confidence, supersession, and source tracking

CREATE TABLE semantic_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  entity_ids uuid[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('preference', 'relationship', 'financial', 'behavioral', 'factual', 'general', 'procedural')),
  content text NOT NULL,
  confidence float NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  source_events uuid[] DEFAULT '{}',
  superseded_by uuid REFERENCES semantic_memories ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  extracted_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memories_org ON semantic_memories (org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_memories_entities ON semantic_memories USING GIN (entity_ids);
CREATE INDEX idx_memories_source ON semantic_memories USING GIN (source_events);
CREATE INDEX idx_memories_category ON semantic_memories (org_id, category) WHERE is_active = true;

-- Trigger
CREATE TRIGGER trg_semantic_memories_updated_at
  BEFORE UPDATE ON semantic_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
