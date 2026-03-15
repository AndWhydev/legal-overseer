-- 075_webhook_events.sql
-- Webhook event logging for monitoring and retry management

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('stripe', 'telnyx', 'meta', 'slack', 'calendly', 'asana', 'email')),
  event_type text NOT NULL,
  external_event_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'success', 'failed', 'retry')),
  response_code integer,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_webhook_events_org ON webhook_events (org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events (source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events (status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_external_id ON webhook_events (external_event_id) WHERE external_event_id IS NOT NULL;

-- RLS Policies
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_select ON webhook_events
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY webhook_events_service_role ON webhook_events
  FOR ALL USING (auth.role() = 'service_role');
