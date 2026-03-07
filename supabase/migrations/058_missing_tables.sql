-- 058: Missing Tables
-- Creates generated_reports, service_metrics, api_keys, and projects tables
-- with RLS policies following dual-tier tenancy pattern.

-- =========================================================================
-- generated_reports
-- =========================================================================

CREATE TABLE IF NOT EXISTS generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  report_type text NOT NULL,
  title text,
  period_from text,
  period_to text,
  file_path text,
  report_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_org_id ON generated_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_created ON generated_reports(org_id, created_at DESC);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON generated_reports
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- =========================================================================
-- service_metrics
-- =========================================================================

CREATE TABLE IF NOT EXISTS service_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  endpoint text,
  method text,
  metric_type text NOT NULL,
  request_count integer,
  error_count integer,
  value numeric,
  avg_latency_ms numeric,
  metadata jsonb DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_metrics_org_id ON service_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_service_metrics_composite ON service_metrics(org_id, service_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_metrics_created ON service_metrics(org_id, created_at DESC);

ALTER TABLE service_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON service_metrics
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- =========================================================================
-- api_keys
-- =========================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  prefix text NOT NULL,
  scopes text[] DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON api_keys
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- =========================================================================
-- projects
-- =========================================================================

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(org_id, status);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON projects
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
