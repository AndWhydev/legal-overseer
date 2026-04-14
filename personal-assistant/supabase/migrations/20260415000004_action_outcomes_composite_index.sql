-- Add composite index for trust-score-reader queries.
-- getSkillTrustScore() queries by (org_id, action_type, created_at).
-- Without this index, the query does a sequential scan on large tables.

CREATE INDEX IF NOT EXISTS idx_action_outcomes_org_type_created
  ON action_outcomes (org_id, action_type, created_at DESC);
