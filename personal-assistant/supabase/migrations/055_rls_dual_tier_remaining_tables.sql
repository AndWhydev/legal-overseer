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
-- rate_limit_buckets — system table, no org_id column. Keep existing
-- "rate_limit_buckets_service_only" policy from migration 042.
-- =============================================================================

-- =============================================================================
-- Helper: apply org-scoped RLS only if table exists AND has org_id column.
-- Tables without org_id (system tables) keep their existing policies.
-- =============================================================================

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'usage_events', 'capability_profiles',
    'whatsapp_sessions', 'whatsapp_outbox',
    'contact_emails', 'invoice_line_items', 'agent_run_tools'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Only apply if table exists AND has org_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'org_id'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', tbl, tbl);

      EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (org_id = get_user_active_org_id())', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;
