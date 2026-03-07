-- 056_missing_tables_phase2.sql
-- Create missing tables referenced in application code.
--
-- Tables:
-- 1. generated_reports (reports/route.ts, cron/monthly-report/route.ts)
-- 2. service_metrics (monitoring/uptime-tracker.ts)
-- 3. api_keys (security/api-key-validator.ts)
-- 4. projects (context/graph-query.ts)
--
-- Context:
-- - All tables use dual-tier tenancy model with org_id as primary scoping key.
-- - RLS policies follow the pattern: SELECT/UPDATE/DELETE scoped to
--   get_user_accessible_org_ids(), INSERT scoped to get_user_active_org_id().
-- - Includes standard service_role bypass policies.

-- =============================================================================
-- GENERATED_REPORTS
-- =============================================================================
-- Used by: personal-assistant/src/app/api/reports/route.ts
--          personal-assistant/src/app/api/cron/monthly-report/route.ts

CREATE TABLE IF NOT EXISTS generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  report_type text NOT NULL,
  title text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_reports_org ON generated_reports (org_id, created_at DESC);
CREATE INDEX idx_generated_reports_type ON generated_reports (org_id, report_type);
CREATE INDEX idx_generated_reports_user ON generated_reports (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE TRIGGER trg_generated_reports_updated_at
  BEFORE UPDATE ON generated_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generated_reports_select" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_insert" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_update" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_delete" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_service_role" ON generated_reports;

CREATE POLICY "generated_reports_select" ON generated_reports
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "generated_reports_insert" ON generated_reports
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "generated_reports_update" ON generated_reports
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "generated_reports_delete" ON generated_reports
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "generated_reports_service_role" ON generated_reports
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- SERVICE_METRICS
-- =============================================================================
-- Used by: personal-assistant/src/lib/monitoring/uptime-tracker.ts

CREATE TABLE IF NOT EXISTS service_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  response_time_ms integer,
  metadata jsonb DEFAULT '{}',
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_metrics_org ON service_metrics (org_id, service_name, checked_at DESC);
CREATE INDEX idx_service_metrics_service ON service_metrics (service_name, created_at DESC);

ALTER TABLE service_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_metrics_select" ON service_metrics;
DROP POLICY IF EXISTS "service_metrics_insert" ON service_metrics;
DROP POLICY IF EXISTS "service_metrics_update" ON service_metrics;
DROP POLICY IF EXISTS "service_metrics_delete" ON service_metrics;
DROP POLICY IF EXISTS "service_metrics_service_role" ON service_metrics;

CREATE POLICY "service_metrics_select" ON service_metrics
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "service_metrics_insert" ON service_metrics
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "service_metrics_update" ON service_metrics
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "service_metrics_delete" ON service_metrics
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "service_metrics_service_role" ON service_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- API_KEYS
-- =============================================================================
-- Used by: personal-assistant/src/lib/security/api-key-validator.ts

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_org ON api_keys (org_id, revoked_at);
CREATE INDEX idx_api_keys_user ON api_keys (user_id, revoked_at);
CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix) WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select" ON api_keys;
DROP POLICY IF EXISTS "api_keys_insert" ON api_keys;
DROP POLICY IF EXISTS "api_keys_update" ON api_keys;
DROP POLICY IF EXISTS "api_keys_delete" ON api_keys;
DROP POLICY IF EXISTS "api_keys_service_role" ON api_keys;

CREATE POLICY "api_keys_select" ON api_keys
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "api_keys_insert" ON api_keys
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "api_keys_update" ON api_keys
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "api_keys_delete" ON api_keys
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "api_keys_service_role" ON api_keys
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- PROJECTS
-- =============================================================================
-- Used by: personal-assistant/src/lib/context/graph-query.ts

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  contact_id uuid REFERENCES contacts(id),
  metadata jsonb DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects (org_id, status);
CREATE INDEX idx_projects_contact ON projects (contact_id) WHERE contact_id IS NOT NULL;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;
DROP POLICY IF EXISTS "projects_service_role" ON projects;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "projects_update" ON projects
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "projects_service_role" ON projects
  FOR ALL USING (auth.role() = 'service_role');
