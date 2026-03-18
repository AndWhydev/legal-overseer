-- ============================================================================
-- 101_decision_log.sql
-- Memory Palace: Decision log with full reasoning chains.
-- Supports archaeology queries ("Why did we stop working with X?")
-- ============================================================================

CREATE TABLE decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES memory_palace_entries(id) ON DELETE SET NULL,

  -- Decision content
  title TEXT NOT NULL,
  decision TEXT NOT NULL,               -- What was decided
  alternatives JSONB DEFAULT '[]',      -- [{option, pros, cons}]
  reasoning TEXT NOT NULL,              -- Why this choice was made
  outcome TEXT,                         -- What happened (filled later)
  lessons_learned TEXT,                 -- Retrospective insight

  -- Context
  entity_ids UUID[] NOT NULL DEFAULT '{}',
  entity_names TEXT[] DEFAULT '{}',
  source_thread_id UUID,
  decided_by TEXT,                      -- user name or 'bitbit_auto'
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Classification
  domain TEXT NOT NULL DEFAULT 'general'
    CHECK (domain IN ('pricing', 'staffing', 'tooling', 'process',
                      'client', 'vendor', 'general')),
  impact TEXT NOT NULL DEFAULT 'low'
    CHECK (impact IN ('low', 'medium', 'high', 'critical')),

  -- Full-text search
  content_tsv TSVECTOR,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'reversed', 'archived')),
  superseded_by UUID REFERENCES decision_log(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate tsvector
CREATE OR REPLACE FUNCTION decision_log_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    NEW.decision || ' ' ||
    NEW.reasoning || ' ' ||
    COALESCE(NEW.outcome, '') || ' ' ||
    COALESCE(NEW.lessons_learned, '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decision_log_tsv
  BEFORE INSERT OR UPDATE OF title, decision, reasoning, outcome, lessons_learned
  ON decision_log
  FOR EACH ROW EXECUTE FUNCTION decision_log_tsv_trigger();

CREATE TRIGGER trg_decision_log_updated_at
  BEFORE UPDATE ON decision_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_decision_log_org
  ON decision_log (org_id, decided_at DESC)
  WHERE status = 'active';

CREATE INDEX idx_decision_log_entities
  ON decision_log USING GIN (entity_ids);

CREATE INDEX idx_decision_log_tsv
  ON decision_log USING GIN (content_tsv);

CREATE INDEX idx_decision_log_domain
  ON decision_log (org_id, domain)
  WHERE status = 'active';

CREATE INDEX idx_decision_log_impact
  ON decision_log (org_id, impact)
  WHERE status = 'active';
