-- 065_relationship_scores.sql
-- Add relationship_strength column to contacts for relationship health tracking.
-- Used by the relationship scorer to persist computed decay scores.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_strength integer DEFAULT 0
  CHECK (relationship_strength >= 0 AND relationship_strength <= 100);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_trend text
  CHECK (relationship_trend IS NULL OR relationship_trend IN ('rising', 'stable', 'declining', 'cold'));

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_scored_at timestamptz;

-- Index for efficient cold-relationship queries
CREATE INDEX idx_contacts_relationship_strength
  ON contacts (org_id, relationship_strength DESC)
  WHERE relationship_strength IS NOT NULL;
