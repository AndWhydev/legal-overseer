-- Sub-project D: Self-Improvement Loop
-- Add quality score columns to agent_runs + create consolidation_metrics table

-- 1. Quality score columns on agent_runs
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS quality_tool_efficiency real,
  ADD COLUMN IF NOT EXISTS quality_context_utilisation real,
  ADD COLUMN IF NOT EXISTS quality_confidence_calibration real,
  ADD COLUMN IF NOT EXISTS quality_overall real,
  ADD COLUMN IF NOT EXISTS quality_notes text;

-- 2. Consolidation metrics table for tracking Stage 3 precision over time
CREATE TABLE IF NOT EXISTS consolidation_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  date date NOT NULL,
  stage text NOT NULL,
  precision real NOT NULL,
  total_inferred integer NOT NULL DEFAULT 0,
  total_invalidated integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, date, stage)
);

-- 3. RLS for consolidation_metrics
ALTER TABLE consolidation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_consolidation_metrics"
  ON consolidation_metrics FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_write_consolidation_metrics"
  ON consolidation_metrics FOR INSERT
  WITH CHECK (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_update_consolidation_metrics"
  ON consolidation_metrics FOR UPDATE
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- 4. Index for efficient threshold lookups (last 7 days by org + stage)
CREATE INDEX IF NOT EXISTS idx_consolidation_metrics_lookup
  ON consolidation_metrics (org_id, stage, date DESC);

-- 5. Index for quality score aggregation queries
CREATE INDEX IF NOT EXISTS idx_agent_runs_quality_lookup
  ON agent_runs (org_id, created_at DESC)
  WHERE quality_overall IS NOT NULL;
