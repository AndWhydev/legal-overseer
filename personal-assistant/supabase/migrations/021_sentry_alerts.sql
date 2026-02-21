-- 021_sentry_alerts.sql
-- Sentry alerts persistence, escalation metadata, and watch due scheduling.

CREATE TABLE sentry_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  watch_id uuid REFERENCES watches ON DELETE CASCADE NOT NULL,
  agent_config_id uuid REFERENCES agent_configs ON DELETE SET NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('error_keyword', 'uptime', 'negative_sentiment')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  issue_summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  remediation_suggestion text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'escalated')),
  acknowledged_by uuid REFERENCES auth.users ON DELETE SET NULL,
  acknowledged_at timestamptz,
  escalated_at timestamptz,
  escalation_count integer NOT NULL DEFAULT 0,
  next_escalation_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE watches
  ADD COLUMN escalation_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN escalation_channel text NOT NULL DEFAULT 'whatsapp' CHECK (escalation_channel IN ('whatsapp', 'dashboard')),
  ADD COLUMN next_check_at timestamptz;

CREATE INDEX idx_sentry_alerts_org_status_created
  ON sentry_alerts (org_id, status, created_at DESC);

CREATE INDEX idx_sentry_alerts_org_next_escalation_due
  ON sentry_alerts (org_id, next_escalation_at)
  WHERE status IN ('pending', 'escalated');

CREATE INDEX idx_watches_active_next_check
  ON watches (org_id, status, next_check_at)
  WHERE status = 'active';

CREATE TRIGGER trg_sentry_alerts_updated_at
  BEFORE UPDATE ON sentry_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sentry_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sentry_alerts_select" ON sentry_alerts
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "sentry_alerts_update" ON sentry_alerts
  FOR UPDATE USING (org_id = get_user_org_id());
