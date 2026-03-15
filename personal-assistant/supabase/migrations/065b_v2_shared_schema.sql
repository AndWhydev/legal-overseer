-- Migration 065: v2.0 Shared Schema
-- Adds business_metrics, behavioral_patterns, agent_action_outcomes tables
-- and extends entity_profiles with relationship intelligence columns.

-- ─── business_metrics ────────────────────────────────────────────────────────
-- Time-series metrics per org for dashboards, briefings, and trend analysis.

CREATE TABLE IF NOT EXISTS business_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'revenue', 'pipeline_value', 'utilization', 'client_count', 'overdue_amount'
  )),
  value NUMERIC NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_metrics_lookup
  ON business_metrics (org_id, metric_type, measured_at DESC);

ALTER TABLE business_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_metrics_org_select" ON business_metrics
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "business_metrics_org_insert" ON business_metrics
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "business_metrics_org_update" ON business_metrics
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "business_metrics_org_delete" ON business_metrics
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "business_metrics_service_role" ON business_metrics
  FOR ALL USING (auth.role() = 'service_role');


-- ─── behavioral_patterns ─────────────────────────────────────────────────────
-- Trigger-action pairs observed from user behavior for proactive agent actions.

CREATE TABLE IF NOT EXISTS behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'project_complete', 'message_received', 'deadline_approaching', 'payment_received'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_invoice', 'send_followup', 'schedule_meeting', 'update_status'
  )),
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  occurrence_count INT NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pattern_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_behavioral_patterns_lookup
  ON behavioral_patterns (org_id, trigger_type);

ALTER TABLE behavioral_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "behavioral_patterns_org_select" ON behavioral_patterns
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "behavioral_patterns_org_insert" ON behavioral_patterns
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "behavioral_patterns_org_update" ON behavioral_patterns
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "behavioral_patterns_org_delete" ON behavioral_patterns
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "behavioral_patterns_service_role" ON behavioral_patterns
  FOR ALL USING (auth.role() = 'service_role');


-- ─── agent_action_outcomes ───────────────────────────────────────────────────
-- Tracks results of agent actions for learning and improvement.
-- NOTE: Separate from action_outcomes (064) which tracks confidence calibration.
-- This table tracks broader action results including user feedback.

CREATE TABLE IF NOT EXISTS agent_action_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL CHECK (outcome IN (
    'success', 'failure', 'partial', 'corrected', 'unknown'
  )),
  outcome_data JSONB NOT NULL DEFAULT '{}',
  user_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_action_outcomes_lookup
  ON agent_action_outcomes (org_id, action_type, created_at DESC);

ALTER TABLE agent_action_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_action_outcomes_org_select" ON agent_action_outcomes
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_action_outcomes_org_insert" ON agent_action_outcomes
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "agent_action_outcomes_org_update" ON agent_action_outcomes
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_action_outcomes_org_delete" ON agent_action_outcomes
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_action_outcomes_service_role" ON agent_action_outcomes
  FOR ALL USING (auth.role() = 'service_role');


-- ─── entity_profiles extensions ──────────────────────────────────────────────
-- Add relationship intelligence columns to existing entity_profiles table.

DO $$
BEGIN
  -- sentiment_trajectory: array of {score, timestamp, source}
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'sentiment_trajectory'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN sentiment_trajectory JSONB;
    COMMENT ON COLUMN entity_profiles.sentiment_trajectory IS 'Array of {score, timestamp, source} tracking sentiment over time';
  END IF;

  -- communication_style: {preferred_channel, tone, response_speed, best_times}
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'communication_style'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN communication_style JSONB;
    COMMENT ON COLUMN entity_profiles.communication_style IS 'Preferred channel, tone, response speed, best contact times';
  END IF;

  -- optimal_contact_windows: array of {day_of_week, hour_start, hour_end, response_rate}
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'optimal_contact_windows'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN optimal_contact_windows JSONB;
    COMMENT ON COLUMN entity_profiles.optimal_contact_windows IS 'Array of {day_of_week, hour_start, hour_end, response_rate}';
  END IF;

  -- predicted_ltv: predicted lifetime value
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'predicted_ltv'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN predicted_ltv NUMERIC;
    COMMENT ON COLUMN entity_profiles.predicted_ltv IS 'Predicted lifetime value of this entity';
  END IF;

  -- churn_risk_score: 0-1 probability of churn
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'churn_risk_score'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN churn_risk_score NUMERIC;
    COMMENT ON COLUMN entity_profiles.churn_risk_score IS 'Churn risk probability 0-1';
  END IF;

  -- relationship_strength: 0-100 composite score
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'relationship_strength'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN relationship_strength NUMERIC;
    COMMENT ON COLUMN entity_profiles.relationship_strength IS 'Composite relationship strength 0-100';
  END IF;

  -- last_interaction_at: most recent interaction timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_profiles' AND column_name = 'last_interaction_at'
  ) THEN
    ALTER TABLE entity_profiles ADD COLUMN last_interaction_at TIMESTAMPTZ;
    COMMENT ON COLUMN entity_profiles.last_interaction_at IS 'Most recent interaction with this entity';
  END IF;
END $$;
