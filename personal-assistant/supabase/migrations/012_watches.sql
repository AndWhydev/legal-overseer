-- 012_watches.sql
-- Background monitoring watches for Sentry agent

CREATE TABLE watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  agent_config_id uuid REFERENCES agent_configs ON DELETE SET NULL,
  watch_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  channel text,
  conditions jsonb NOT NULL DEFAULT '{}',
  interval_seconds integer NOT NULL DEFAULT 300,
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'triggered', 'expired')),
  notification_targets jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_watches_org ON watches (org_id, status) WHERE status = 'active';
CREATE INDEX idx_watches_agent ON watches (agent_config_id) WHERE agent_config_id IS NOT NULL;
CREATE INDEX idx_watches_due ON watches (org_id, last_checked_at) WHERE status = 'active';

-- Trigger
CREATE TRIGGER trg_watches_updated_at
  BEFORE UPDATE ON watches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
