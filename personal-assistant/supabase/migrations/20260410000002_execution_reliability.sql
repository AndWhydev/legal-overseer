-- Phase 42-01: execution_reliability table + aggregation view
-- Tracks success/failure per service per tier for model context injection.
-- The learning signal that makes the tool resolver improve over time.

-- execution_reliability: per-execution outcome tracking
CREATE TABLE IF NOT EXISTS execution_reliability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('api', 'browser', 'workspace', 'human')),
  success boolean NOT NULL,
  error_category text,
  error_message text,
  latency_ms int,
  cost_estimate_cents numeric(10, 2),
  task_id uuid,
  tool_name text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_execution_reliability_org_service
  ON execution_reliability(org_id, service_name, created_at DESC);

CREATE INDEX idx_execution_reliability_org_tier
  ON execution_reliability(org_id, tier, created_at DESC);

-- RLS
ALTER TABLE execution_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_reliability_org_isolation ON execution_reliability
  FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

-- 7-day rolling reliability summary view
CREATE OR REPLACE VIEW execution_reliability_summary AS
SELECT
  org_id,
  service_name,
  tier,
  count(*)::int AS total_executions,
  round(avg(CASE WHEN success THEN 1.0 ELSE 0.0 END), 4) AS success_rate,
  round(avg(latency_ms)::numeric, 1) AS avg_latency_ms,
  round(avg(cost_estimate_cents)::numeric, 2) AS avg_cost_cents,
  mode() WITHIN GROUP (ORDER BY error_category) FILTER (WHERE error_category IS NOT NULL) AS most_common_error
FROM execution_reliability
WHERE created_at > now() - interval '7 days'
GROUP BY org_id, service_name, tier;
