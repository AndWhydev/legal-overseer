-- ============================================================================
-- Phase 46-01: Anomaly Baselines + Brain Alerts Foundation Tables
-- Creates anomaly_baselines (per-entity metric baselines for z-score
-- deviation detection), brain_alerts (surfaced anomalies and learning
-- prompts), and extends knowledge_log signal_type to include 'clarification'
-- for active learning signals.
-- ============================================================================

-- ============================================================================
-- ANOMALY_BASELINES (rolling statistical baselines per entity per metric)
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomaly_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL CHECK (metric_name IN (
    'payment_timing', 'payment_amount', 'message_frequency', 'response_latency'
  )),
  mean FLOAT NOT NULL DEFAULT 0,
  stddev FLOAT NOT NULL DEFAULT 0,
  sample_count INT NOT NULL DEFAULT 0,
  last_computed TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, entity_id, metric_name)
);

-- ============================================================================
-- BRAIN_ALERTS (surfaced anomalies, pattern breaks, learning prompts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS brain_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('anomaly', 'pattern_break', 'learning_prompt')),
  metric_name TEXT,
  z_score FLOAT,
  baseline_text TEXT NOT NULL,
  explanation TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  channel TEXT,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- anomaly_baselines indexes
CREATE INDEX IF NOT EXISTS idx_anomaly_baselines_entity
  ON anomaly_baselines (org_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_anomaly_baselines_metric
  ON anomaly_baselines (org_id, metric_name);

-- brain_alerts indexes
CREATE INDEX IF NOT EXISTS idx_brain_alerts_entity_time
  ON brain_alerts (org_id, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_alerts_type
  ON brain_alerts (org_id, alert_type, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE anomaly_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_alerts ENABLE ROW LEVEL SECURITY;

-- anomaly_baselines policies
CREATE POLICY "anomaly_baselines_select" ON anomaly_baselines FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "anomaly_baselines_insert" ON anomaly_baselines FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "anomaly_baselines_update" ON anomaly_baselines FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "anomaly_baselines_delete" ON anomaly_baselines FOR DELETE USING (org_id = get_user_org_id());

-- brain_alerts policies
CREATE POLICY "brain_alerts_select" ON brain_alerts FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "brain_alerts_insert" ON brain_alerts FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "brain_alerts_update" ON brain_alerts FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "brain_alerts_delete" ON brain_alerts FOR DELETE USING (org_id = get_user_org_id());

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE TRIGGER trg_anomaly_baselines_updated_at
  BEFORE UPDATE ON anomaly_baselines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- EXTEND SIGNAL_TYPE CONSTRAINT (add 'clarification' for active learning)
-- ============================================================================

ALTER TABLE knowledge_log
  DROP CONSTRAINT IF EXISTS knowledge_log_signal_type_check;

ALTER TABLE knowledge_log
  ADD CONSTRAINT knowledge_log_signal_type_check
  CHECK (signal_type IN (
    'message',
    'invoice',
    'calendar',
    'pattern',
    'correction',
    'decision',
    'relationship',
    'pricing',
    'fiduciary',
    'delegated_action',
    'clarification'
  ));
