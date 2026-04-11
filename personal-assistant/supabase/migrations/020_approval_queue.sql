-- 020_approval_queue.sql
-- Queue for agent actions requiring human approval.

CREATE TABLE approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  agent_config_id uuid REFERENCES agent_configs ON DELETE CASCADE NOT NULL,
  agent_run_id uuid REFERENCES agent_runs ON DELETE SET NULL,
  action_type text NOT NULL,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_summary text NOT NULL,
  confidence_score float NOT NULL,
  routing_decision text NOT NULL CHECK (routing_decision IN ('ask', 'escalate')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
  digest_eligible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'auto_expired')),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_by uuid REFERENCES auth.users ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_via text CHECK (resolved_via IS NULL OR resolved_via IN ('dashboard', 'whatsapp', 'auto_expire')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_queue_org_status
  ON approval_queue (org_id, status);

CREATE INDEX idx_approval_queue_org_digest_status
  ON approval_queue (org_id, digest_eligible, status);

CREATE INDEX idx_approval_queue_expires_pending
  ON approval_queue (expires_at)
  WHERE status = 'pending';

ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_queue_select" ON approval_queue
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "approval_queue_update" ON approval_queue
  FOR UPDATE USING (org_id = get_user_org_id());
