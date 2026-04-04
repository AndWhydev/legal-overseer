-- Procedural Memory System (Plan 40-02)
-- Stores learned workflows/procedures that trigger automatically based on regex patterns.

CREATE TABLE IF NOT EXISTS procedural_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_pattern TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  success_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'explicit' CHECK (source IN ('observed', 'explicit', 'consolidation')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedural_memories_org ON procedural_memories (org_id) WHERE is_active = true;

ALTER TABLE procedural_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "procedural_memories_select" ON procedural_memories FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "procedural_memories_insert" ON procedural_memories FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "procedural_memories_update" ON procedural_memories FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "procedural_memories_delete" ON procedural_memories FOR DELETE USING (org_id = get_user_org_id());

CREATE TRIGGER trg_procedural_memories_updated_at
  BEFORE UPDATE ON procedural_memories
  FOR EACH ROW EXECUTE FUNCTION update_entity_nodes_updated_at();
