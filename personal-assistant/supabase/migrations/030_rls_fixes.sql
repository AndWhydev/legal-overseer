-- 030_rls_fixes.sql
-- RLS audit fixes: add missing policies and tighten overly-permissive ones.
--
-- Issues found:
-- 1. sentry_alerts: missing insert/delete policies + service_role
-- 2. approval_queue: missing insert/delete policies + service_role
-- 3. channel_connections: FOR ALL USING (true) - not org-isolated
-- 4. channel_messages: FOR ALL USING (true) - not org-isolated

-- =============================================================================
-- 1. SENTRY_ALERTS - add missing insert, delete, service_role
-- =============================================================================

CREATE POLICY "sentry_alerts_insert" ON sentry_alerts
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "sentry_alerts_delete" ON sentry_alerts
  FOR DELETE USING (org_id = get_user_org_id());

CREATE POLICY "sentry_alerts_service_role" ON sentry_alerts
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- 2. APPROVAL_QUEUE - add missing insert, delete, service_role
-- =============================================================================

CREATE POLICY "approval_queue_insert" ON approval_queue
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "approval_queue_delete" ON approval_queue
  FOR DELETE USING (org_id = get_user_org_id());

CREATE POLICY "approval_queue_service_role" ON approval_queue
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- 3. CHANNEL_CONNECTIONS - replace permissive policy with org-isolated
-- =============================================================================

DROP POLICY IF EXISTS "channel_connections_all" ON channel_connections;

CREATE POLICY "channel_connections_select" ON channel_connections
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "channel_connections_insert" ON channel_connections
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "channel_connections_update" ON channel_connections
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "channel_connections_delete" ON channel_connections
  FOR DELETE USING (org_id = get_user_org_id());

CREATE POLICY "channel_connections_service_role" ON channel_connections
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- 4. CHANNEL_MESSAGES - replace permissive policy with org-isolated
-- =============================================================================

DROP POLICY IF EXISTS "channel_messages_all" ON channel_messages;

CREATE POLICY "channel_messages_select" ON channel_messages
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "channel_messages_insert" ON channel_messages
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "channel_messages_update" ON channel_messages
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "channel_messages_delete" ON channel_messages
  FOR DELETE USING (org_id = get_user_org_id());

CREATE POLICY "channel_messages_service_role" ON channel_messages
  FOR ALL USING (auth.role() = 'service_role');
