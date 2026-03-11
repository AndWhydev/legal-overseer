-- Migration 064: Action outcomes for confidence auto-calibration
-- Tracks approval/rejection outcomes per agent type to dynamically adjust confidence thresholds

-- Action outcomes table: records every approve/reject/auto-act decision
CREATE TABLE IF NOT EXISTS action_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  confidence_score NUMERIC(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  was_approved BOOLEAN NOT NULL,
  was_correct BOOLEAN, -- nullable: user may not always provide correctness feedback
  threshold_source TEXT NOT NULL DEFAULT 'static', -- 'static', 'calibrated', 'agent_config'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for calibration queries: last 30 days per org+agent_type
CREATE INDEX IF NOT EXISTS idx_action_outcomes_calibration
  ON action_outcomes (org_id, agent_type, created_at DESC);

-- Index for confidence band analysis
CREATE INDEX IF NOT EXISTS idx_action_outcomes_confidence
  ON action_outcomes (org_id, agent_type, confidence_score);

-- RLS policies
ALTER TABLE action_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_outcomes_org_isolation" ON action_outcomes
  FOR ALL USING (org_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "action_outcomes_service_role" ON action_outcomes
  FOR ALL USING (auth.role() = 'service_role');

-- Add calibrated_thresholds column to agent_configs for storing computed thresholds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_configs' AND column_name = 'calibrated_thresholds'
  ) THEN
    ALTER TABLE agent_configs
      ADD COLUMN calibrated_thresholds JSONB DEFAULT NULL;
    COMMENT ON COLUMN agent_configs.calibrated_thresholds IS 'Auto-calibrated confidence thresholds: {act, ask, escalate, sampleSize, lastCalibrated}';
  END IF;
END $$;
