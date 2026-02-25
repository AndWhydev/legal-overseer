-- 028_missing_tables.sql
-- Tables referenced in application code but missing from previous migrations.
-- Covers: notifications, onboardings, ad_script_batches, secret_rotations,
--         subscriptions, agent_activity

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
-- Used by: ai-visibility-audit.ts

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  title text NOT NULL,
  body text,
  channel text,  -- 'email', 'whatsapp', 'dashboard'
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_org ON notifications (org_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY notifications_delete ON notifications
  FOR DELETE USING (org_id = get_user_org_id());
CREATE POLICY notifications_service_role ON notifications
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- ONBOARDINGS
-- =============================================================================
-- Used by: client-onboarding.ts

CREATE TABLE IF NOT EXISTS onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  proposal_id uuid REFERENCES proposals ON DELETE SET NULL,
  client_contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'welcome_sent', 'credentials_requested', 'credentials_received',
    'project_created', 'kickoff_scheduled', 'completed', 'stalled'
  )),
  checklist jsonb DEFAULT '[]',
  welcome_sent_at timestamptz,
  credentials_status jsonb DEFAULT '{}',
  project_url text,
  kickoff_date timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_onboardings_org_status ON onboardings (org_id, status);
CREATE INDEX idx_onboardings_proposal ON onboardings (proposal_id) WHERE proposal_id IS NOT NULL;

CREATE TRIGGER trg_onboardings_updated_at
  BEFORE UPDATE ON onboardings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE onboardings ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboardings_select ON onboardings
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY onboardings_insert ON onboardings
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY onboardings_update ON onboardings
  FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY onboardings_delete ON onboardings
  FOR DELETE USING (org_id = get_user_org_id());
CREATE POLICY onboardings_service_role ON onboardings
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- AD_SCRIPT_BATCHES
-- =============================================================================
-- Used by: ad-script-gen.ts

CREATE TABLE IF NOT EXISTS ad_script_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin')),
  hook_type text,
  scripts jsonb DEFAULT '[]',
  storyboard jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'active', 'archived')),
  offer_package_id uuid REFERENCES offer_packages ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ad_script_batches_org ON ad_script_batches (org_id, status);
CREATE INDEX idx_ad_script_batches_platform ON ad_script_batches (org_id, platform);

CREATE TRIGGER trg_ad_script_batches_updated_at
  BEFORE UPDATE ON ad_script_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ad_script_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_script_batches_select ON ad_script_batches
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY ad_script_batches_insert ON ad_script_batches
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY ad_script_batches_update ON ad_script_batches
  FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY ad_script_batches_delete ON ad_script_batches
  FOR DELETE USING (org_id = get_user_org_id());
CREATE POLICY ad_script_batches_service_role ON ad_script_batches
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- SECRET_ROTATIONS
-- =============================================================================
-- Used by: security/secrets.ts

CREATE TABLE IF NOT EXISTS secret_rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  secret_name text NOT NULL,
  provider text NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  rotated_by text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_secret_rotations_org ON secret_rotations (org_id, created_at DESC);

ALTER TABLE secret_rotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY secret_rotations_select ON secret_rotations
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY secret_rotations_insert ON secret_rotations
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY secret_rotations_service_role ON secret_rotations
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- SUBSCRIPTIONS
-- =============================================================================
-- Used by: billing/checkout.ts, analytics/churn.ts, analytics/mrr.ts

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  amount numeric(10,2),
  currency text DEFAULT 'AUD',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_subscriptions_org ON subscriptions (org_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_stripe ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY subscriptions_insert ON subscriptions
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY subscriptions_update ON subscriptions
  FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY subscriptions_service_role ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- AGENT_ACTIVITY
-- =============================================================================
-- Used by: analytics/churn.ts, analytics/usage.ts

CREATE TABLE IF NOT EXISTS agent_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  agent_type text,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_activity_org ON agent_activity (org_id, created_at DESC);
CREATE INDEX idx_agent_activity_user ON agent_activity (user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_activity_select ON agent_activity
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY agent_activity_insert ON agent_activity
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY agent_activity_service_role ON agent_activity
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- ORGANISATIONS VIEW (UK spelling alias)
-- =============================================================================
-- Code in onboarding/multi-tenant.ts and analytics/churn.ts uses 'organisations'
CREATE OR REPLACE VIEW organisations AS SELECT * FROM organizations;
