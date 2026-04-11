-- 046_billing_extensions.sql
-- Extend subscriptions table and add usage tracking

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled_reason text;

-- Usage event tracking for metered billing / plan gating
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org
  ON usage_events (org_id, event_type, created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_events_select ON usage_events
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY usage_events_service_role ON usage_events
  FOR ALL USING (auth.role() = 'service_role');
