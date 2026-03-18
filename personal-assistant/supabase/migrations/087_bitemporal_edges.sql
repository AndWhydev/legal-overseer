-- Bitemporal Knowledge Graph Edges
-- Adds validity windows to kg_edges following the Graphiti bitemporal model.
-- Every edge now carries four timestamps:
--   valid_from / valid_until  — when the fact was true in reality
--   created_at / expired_at   — when the system recorded/invalidated it
-- This enables queries like "what did we know about Steve as of January 15?"

ALTER TABLE kg_edges
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz DEFAULT NULL;

-- Index for temporal queries: find edges valid at a point in time
CREATE INDEX IF NOT EXISTS idx_kg_edges_temporal
  ON kg_edges (org_id, source_id, valid_from, valid_until)
  WHERE expired_at IS NULL;

-- Add strategy_memories table for Reflexion loop
-- Stores lessons learned from user corrections and outcome feedback
CREATE TABLE IF NOT EXISTS strategy_memories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain     text NOT NULL,        -- e.g. 'email_triage', 'task_creation', 'contact_resolution'
  trigger    text NOT NULL,        -- what situation triggered the original action
  lesson     text NOT NULL,        -- what was learned (e.g. "sender X is high priority")
  outcome    text NOT NULL CHECK (outcome IN ('corrected', 'approved', 'ignored')),
  confidence float NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  source_action_id text,           -- original approval_queue or agent_run ID
  times_applied int NOT NULL DEFAULT 0,
  last_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_memories_domain
  ON strategy_memories (org_id, domain);

CREATE INDEX IF NOT EXISTS idx_strategy_memories_lookup
  ON strategy_memories (org_id, domain, confidence DESC);

ALTER TABLE strategy_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategy_memories_org_access ON strategy_memories
  FOR ALL USING (
    org_id IN (
      SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_strategy_memories_updated_at
  BEFORE UPDATE ON strategy_memories
  FOR EACH ROW EXECUTE FUNCTION update_kg_updated_at();

-- Add memory_admission_scores column to semantic_memories for tracking why a memory was stored
ALTER TABLE semantic_memories
  ADD COLUMN IF NOT EXISTS admission_score float DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS decay_rate text DEFAULT 'normal' CHECK (decay_rate IN ('slow', 'normal', 'fast', 'never'));
