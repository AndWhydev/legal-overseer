-- Migration 058: Create tables referenced by code but missing from schema
-- Tables: generated_reports, service_metrics, api_keys, projects
-- =========================================================================

-- 1. generated_reports
-- Used by: src/app/api/reports/route.ts, src/app/api/cron/monthly-report/route.ts
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  title TEXT,
  period_from TEXT,
  period_to TEXT,
  file_path TEXT,
  report_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_reports_org ON generated_reports(org_id);
CREATE INDEX idx_generated_reports_org_date ON generated_reports(org_id, created_at DESC);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON generated_reports
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 2. service_metrics
-- Used by: src/lib/monitoring/uptime-tracker.ts
CREATE TABLE IF NOT EXISTS service_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_metrics_org ON service_metrics(org_id);
CREATE INDEX idx_service_metrics_lookup ON service_metrics(org_id, service_name, recorded_at DESC);

ALTER TABLE service_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON service_metrics
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 3. api_keys
-- Used by: src/lib/security/api-key-validator.ts
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON api_keys
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 4. projects
-- Used by: src/lib/context/graph-query.ts
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_org_status ON projects(org_id, status);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON projects
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
