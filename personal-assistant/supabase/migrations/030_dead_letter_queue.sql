-- Dead letter queue for permanently failed agent actions
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_type    text NOT NULL,
  agent_config_id uuid REFERENCES agent_configs(id) ON DELETE SET NULL,
  agent_run_id  uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  error_message text NOT NULL,
  error_stack   text,
  payload       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX idx_dlq_org_unresolved ON dead_letter_queue (org_id, resolved_at)
  WHERE resolved_at IS NULL;

CREATE INDEX idx_dlq_agent_type ON dead_letter_queue (agent_type);

-- RLS
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org dead letters"
  ON dead_letter_queue FOR SELECT
  USING (org_id IN (
    SELECT p.org_id FROM profiles p WHERE p.id = auth.uid()
  ));

CREATE POLICY "Service role can manage dead letters"
  ON dead_letter_queue FOR ALL
  USING (true)
  WITH CHECK (true);
