-- ============================================================================
-- 102_memory_patterns.sql
-- Memory Palace: Detected behavioral patterns across entities and time.
-- Auto-promoted to memories when confidence exceeds threshold.
-- ============================================================================

CREATE TABLE memory_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Pattern classification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'payment_timing', 'response_latency', 'scope_creep',
    'pricing_trend', 'communication_style', 'seasonal',
    'project_velocity', 'escalation', 'custom'
  )),

  -- Pattern content
  description TEXT NOT NULL,
  pattern_data JSONB NOT NULL DEFAULT '{}',

  -- Entities involved
  entity_ids UUID[] NOT NULL DEFAULT '{}',
  entity_names TEXT[] DEFAULT '{}',

  -- Statistical basis
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence FLOAT NOT NULL DEFAULT 0.0
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Evidence
  evidence_ids UUID[] DEFAULT '{}',  -- memory_palace_entries IDs
  source_data JSONB DEFAULT '{}',    -- raw statistical data

  -- Promotion tracking
  promoted_to_memory_id UUID REFERENCES memory_palace_entries(id) ON DELETE SET NULL,
  promotion_threshold FLOAT NOT NULL DEFAULT 0.75,

  -- Full-text search
  content_tsv TSVECTOR,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'promoted', 'invalidated', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate tsvector
CREATE OR REPLACE FUNCTION memory_patterns_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', NEW.description);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_memory_patterns_tsv
  BEFORE INSERT OR UPDATE OF description
  ON memory_patterns
  FOR EACH ROW EXECUTE FUNCTION memory_patterns_tsv_trigger();

CREATE TRIGGER trg_memory_patterns_updated_at
  BEFORE UPDATE ON memory_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_mp_patterns_org
  ON memory_patterns (org_id, pattern_type)
  WHERE status = 'active';

CREATE INDEX idx_mp_patterns_entities
  ON memory_patterns USING GIN (entity_ids);

CREATE INDEX idx_mp_patterns_tsv
  ON memory_patterns USING GIN (content_tsv);

CREATE INDEX idx_mp_patterns_confidence
  ON memory_patterns (org_id, confidence DESC)
  WHERE status = 'active';

-- Unique constraint: one active pattern per type per entity set
CREATE UNIQUE INDEX idx_mp_patterns_unique
  ON memory_patterns (org_id, pattern_type, entity_ids)
  WHERE status = 'active';
