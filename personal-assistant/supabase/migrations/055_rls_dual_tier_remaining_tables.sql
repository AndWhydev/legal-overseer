-- 055_rls_dual_tier_remaining_tables.sql
-- Fixes 15 tables missed by migration 053 that still use get_user_org_id()
-- (single active org) instead of get_user_accessible_org_ids() (all accessible orgs).
--
-- Without this fix, SELECT queries on these tables only return data from the
-- user's currently active org, not all orgs they belong to.

-- =============================================================================
-- notifications
-- =============================================================================
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- =============================================================================
-- onboardings
-- =============================================================================
DROP POLICY IF EXISTS "onboardings_select" ON onboardings;
DROP POLICY IF EXISTS "onboardings_insert" ON onboardings;
DROP POLICY IF EXISTS "onboardings_update" ON onboardings;
DROP POLICY IF EXISTS "onboardings_delete" ON onboardings;

CREATE POLICY "onboardings_select" ON onboardings
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "onboardings_insert" ON onboardings
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "onboardings_update" ON onboardings
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "onboardings_delete" ON onboardings
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- =============================================================================
-- ad_script_batches
-- =============================================================================
DROP POLICY IF EXISTS "ad_script_batches_select" ON ad_script_batches;
DROP POLICY IF EXISTS "ad_script_batches_insert" ON ad_script_batches;
DROP POLICY IF EXISTS "ad_script_batches_update" ON ad_script_batches;
DROP POLICY IF EXISTS "ad_script_batches_delete" ON ad_script_batches;

CREATE POLICY "ad_script_batches_select" ON ad_script_batches
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "ad_script_batches_insert" ON ad_script_batches
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "ad_script_batches_update" ON ad_script_batches
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "ad_script_batches_delete" ON ad_script_batches
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- =============================================================================
-- secret_rotations
-- =============================================================================
DROP POLICY IF EXISTS "secret_rotations_select" ON secret_rotations;
DROP POLICY IF EXISTS "secret_rotations_insert" ON secret_rotations;

CREATE POLICY "secret_rotations_select" ON secret_rotations
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "secret_rotations_insert" ON secret_rotations
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

-- =============================================================================
-- subscriptions
-- =============================================================================
DROP POLICY IF EXISTS "subscriptions_select" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update" ON subscriptions;

CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "subscriptions_insert" ON subscriptions
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "subscriptions_update" ON subscriptions
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

-- =============================================================================
-- agent_activity
-- =============================================================================
DROP POLICY IF EXISTS "agent_activity_select" ON agent_activity;
DROP POLICY IF EXISTS "agent_activity_insert" ON agent_activity;

CREATE POLICY "agent_activity_select" ON agent_activity
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "agent_activity_insert" ON agent_activity
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

-- =============================================================================
-- sentry_alerts
-- =============================================================================
DROP POLICY IF EXISTS "sentry_alerts_select" ON sentry_alerts;
DROP POLICY IF EXISTS "sentry_alerts_update" ON sentry_alerts;

CREATE POLICY "sentry_alerts_select" ON sentry_alerts
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "sentry_alerts_update" ON sentry_alerts
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

-- =============================================================================
-- rate_limit_buckets
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "rate_limit_buckets_select" ON rate_limit_buckets';
    EXECUTE 'DROP POLICY IF EXISTS "rate_limit_buckets_insert" ON rate_limit_buckets';
    EXECUTE 'DROP POLICY IF EXISTS "rate_limit_buckets_update" ON rate_limit_buckets';
    EXECUTE 'DROP POLICY IF EXISTS "rate_limit_buckets_delete" ON rate_limit_buckets';

    EXECUTE 'CREATE POLICY "rate_limit_buckets_select" ON rate_limit_buckets FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "rate_limit_buckets_insert" ON rate_limit_buckets FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "rate_limit_buckets_update" ON rate_limit_buckets FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "rate_limit_buckets_delete" ON rate_limit_buckets FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

-- =============================================================================
-- usage_events
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'usage_events'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "usage_events_select" ON usage_events';
    EXECUTE 'DROP POLICY IF EXISTS "usage_events_insert" ON usage_events';

    EXECUTE 'CREATE POLICY "usage_events_select" ON usage_events FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "usage_events_insert" ON usage_events FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
  END IF;
END;
$$;

-- =============================================================================
-- capability_profiles
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'capability_profiles'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "capability_profiles_select" ON capability_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "capability_profiles_insert" ON capability_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "capability_profiles_update" ON capability_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "capability_profiles_delete" ON capability_profiles';

    EXECUTE 'CREATE POLICY "capability_profiles_select" ON capability_profiles FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "capability_profiles_insert" ON capability_profiles FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "capability_profiles_update" ON capability_profiles FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "capability_profiles_delete" ON capability_profiles FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

-- =============================================================================
-- whatsapp_sessions
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_sessions'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_sessions_select" ON whatsapp_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_sessions_insert" ON whatsapp_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_sessions_update" ON whatsapp_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_sessions_delete" ON whatsapp_sessions';

    EXECUTE 'CREATE POLICY "whatsapp_sessions_select" ON whatsapp_sessions FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "whatsapp_sessions_insert" ON whatsapp_sessions FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "whatsapp_sessions_update" ON whatsapp_sessions FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "whatsapp_sessions_delete" ON whatsapp_sessions FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

-- =============================================================================
-- whatsapp_outbox
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_outbox'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_outbox_select" ON whatsapp_outbox';
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_outbox_insert" ON whatsapp_outbox';
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_outbox_update" ON whatsapp_outbox';
    EXECUTE 'DROP POLICY IF EXISTS "whatsapp_outbox_delete" ON whatsapp_outbox';

    EXECUTE 'CREATE POLICY "whatsapp_outbox_select" ON whatsapp_outbox FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "whatsapp_outbox_insert" ON whatsapp_outbox FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "whatsapp_outbox_update" ON whatsapp_outbox FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "whatsapp_outbox_delete" ON whatsapp_outbox FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

-- =============================================================================
-- contact_emails
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contact_emails'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "contact_emails_select" ON contact_emails';
    EXECUTE 'DROP POLICY IF EXISTS "contact_emails_insert" ON contact_emails';
    EXECUTE 'DROP POLICY IF EXISTS "contact_emails_update" ON contact_emails';
    EXECUTE 'DROP POLICY IF EXISTS "contact_emails_delete" ON contact_emails';

    EXECUTE 'CREATE POLICY "contact_emails_select" ON contact_emails FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "contact_emails_insert" ON contact_emails FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "contact_emails_update" ON contact_emails FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "contact_emails_delete" ON contact_emails FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

-- =============================================================================
-- invoice_line_items
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoice_line_items'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "invoice_line_items_select" ON invoice_line_items';
    EXECUTE 'DROP POLICY IF EXISTS "invoice_line_items_insert" ON invoice_line_items';
    EXECUTE 'DROP POLICY IF EXISTS "invoice_line_items_update" ON invoice_line_items';
    EXECUTE 'DROP POLICY IF EXISTS "invoice_line_items_delete" ON invoice_line_items';

    EXECUTE 'CREATE POLICY "invoice_line_items_select" ON invoice_line_items FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "invoice_line_items_insert" ON invoice_line_items FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "invoice_line_items_update" ON invoice_line_items FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "invoice_line_items_delete" ON invoice_line_items FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

-- =============================================================================
-- agent_run_tools
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_run_tools'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "agent_run_tools_select" ON agent_run_tools';
    EXECUTE 'DROP POLICY IF EXISTS "agent_run_tools_insert" ON agent_run_tools';
    EXECUTE 'DROP POLICY IF EXISTS "agent_run_tools_update" ON agent_run_tools';
    EXECUTE 'DROP POLICY IF EXISTS "agent_run_tools_delete" ON agent_run_tools';

    EXECUTE 'CREATE POLICY "agent_run_tools_select" ON agent_run_tools FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "agent_run_tools_insert" ON agent_run_tools FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "agent_run_tools_update" ON agent_run_tools FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "agent_run_tools_delete" ON agent_run_tools FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;
