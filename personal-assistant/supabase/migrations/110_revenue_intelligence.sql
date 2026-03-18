-- 110_revenue_intelligence.sql
-- Revenue Intelligence Engine: scoring, cash flow projections, scope tracking, scenarios

-- ─── Client Revenue Scores ───────────────────────────────────────────────────
-- Composite score per client computed from invoice frequency, payment speed,
-- project value, and trend.  All monetary values stored in cents.

CREATE TABLE client_revenue_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  -- Scoring dimensions (0-100 each)
  invoice_frequency_score INTEGER NOT NULL DEFAULT 0,
  payment_speed_score INTEGER NOT NULL DEFAULT 0,
  project_value_score INTEGER NOT NULL DEFAULT 0,
  trend_score INTEGER NOT NULL DEFAULT 0,
  -- Composite (weighted average, 0-100)
  composite_score INTEGER NOT NULL DEFAULT 0,
  -- Revenue stats (cents)
  total_revenue_cents BIGINT NOT NULL DEFAULT 0,
  revenue_last_90d_cents BIGINT NOT NULL DEFAULT 0,
  revenue_last_365d_cents BIGINT NOT NULL DEFAULT 0,
  avg_invoice_cents BIGINT NOT NULL DEFAULT 0,
  avg_payment_days REAL,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  overdue_count INTEGER NOT NULL DEFAULT 0,
  -- Trend
  trend TEXT NOT NULL DEFAULT 'stable' CHECK (trend IN ('growing','stable','declining','churned','new')),
  monthly_growth_rate REAL,  -- percentage change month-over-month
  -- Timestamps
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, contact_id)
);

-- ─── Cash Flow Projections ───────────────────────────────────────────────────
-- Forward-looking 30/60/90 day projections built from invoice pipeline

CREATE TABLE cash_flow_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  projection_date DATE NOT NULL,
  -- Projected inflows (cents)
  inflow_30d_cents BIGINT NOT NULL DEFAULT 0,
  inflow_60d_cents BIGINT NOT NULL DEFAULT 0,
  inflow_90d_cents BIGINT NOT NULL DEFAULT 0,
  -- Projected outflows (cents, from known commitments)
  outflow_30d_cents BIGINT NOT NULL DEFAULT 0,
  outflow_60d_cents BIGINT NOT NULL DEFAULT 0,
  outflow_90d_cents BIGINT NOT NULL DEFAULT 0,
  -- Net position (cents)
  net_30d_cents BIGINT NOT NULL DEFAULT 0,
  net_60d_cents BIGINT NOT NULL DEFAULT 0,
  net_90d_cents BIGINT NOT NULL DEFAULT 0,
  -- Confidence bands (low/mid/high estimates)
  confidence_low_30d_cents BIGINT,
  confidence_high_30d_cents BIGINT,
  -- Breakdown by source
  breakdown JSONB NOT NULL DEFAULT '{}',
  -- Metadata
  model_version TEXT NOT NULL DEFAULT 'v1',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, projection_date)
);

-- ─── Scope Tracking ─────────────────────────────────────────────────────────
-- Track deliverable count vs original scope per project

CREATE TABLE scope_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID,  -- references tasks or projects if applicable
  project_name TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  -- Scope counts
  original_deliverable_count INTEGER NOT NULL DEFAULT 0,
  current_deliverable_count INTEGER NOT NULL DEFAULT 0,
  scope_delta INTEGER GENERATED ALWAYS AS (current_deliverable_count - original_deliverable_count) STORED,
  scope_creep_pct REAL GENERATED ALWAYS AS (
    CASE WHEN original_deliverable_count > 0
      THEN ((current_deliverable_count - original_deliverable_count)::REAL / original_deliverable_count) * 100
      ELSE 0
    END
  ) STORED,
  -- Value tracking (cents)
  original_value_cents BIGINT NOT NULL DEFAULT 0,
  current_value_cents BIGINT NOT NULL DEFAULT 0,
  unbilled_value_cents BIGINT NOT NULL DEFAULT 0,
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','on_hold','cancelled')),
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  -- Timestamps
  started_at DATE,
  completed_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Revenue Insights ────────────────────────────────────────────────────────
-- Actionable insights the revenue engine surfaces (recoverable revenue, alerts, etc.)

CREATE TABLE revenue_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'unbilled_work',
    'scope_creep',
    'overdue_collection',
    'retainer_renewal',
    'rate_opportunity',
    'client_churn_risk',
    'cash_flow_warning',
    'revenue_milestone',
    'payment_pattern'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low','info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Monetary impact (cents)
  impact_cents BIGINT,
  -- References
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  -- Action metadata
  suggested_action TEXT,
  action_payload JSONB DEFAULT '{}',
  -- State
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','acknowledged','acted_on','dismissed','expired')),
  acknowledged_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Revenue Scenarios ───────────────────────────────────────────────────────
-- "What-if" scenario planning results (rate changes, churn, etc.)

CREATE TABLE revenue_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN (
    'rate_change',
    'client_churn',
    'new_client',
    'capacity_change',
    'seasonal_adjustment'
  )),
  -- Input parameters
  parameters JSONB NOT NULL DEFAULT '{}',
  -- Monte Carlo results
  simulations INTEGER NOT NULL DEFAULT 1000,
  results JSONB NOT NULL DEFAULT '{}',
  -- Summary stats (cents)
  projected_annual_cents BIGINT,
  current_annual_cents BIGINT,
  delta_cents BIGINT,
  probability_positive REAL,  -- 0.0-1.0
  -- Timestamps
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Payment Patterns ────────────────────────────────────────────────────────
-- Per-client payment behavior learned from invoice history

CREATE TABLE payment_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  -- Timing
  avg_days_to_pay REAL,
  median_days_to_pay REAL,
  fastest_payment_days INTEGER,
  slowest_payment_days INTEGER,
  -- Behavior
  preferred_payment_method TEXT,
  on_time_rate REAL,  -- 0.0-1.0
  -- Collection
  reminder_response_rate REAL,  -- how often reminders lead to payment
  optimal_reminder_day INTEGER,  -- best day to send reminders (1-7)
  -- Stats
  total_invoices_analyzed INTEGER NOT NULL DEFAULT 0,
  -- Timestamps
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, contact_id)
);

-- ─── Revenue Digests ─────────────────────────────────────────────────────────
-- Weekly/monthly revenue summaries

CREATE TABLE revenue_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly','monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Metrics (cents)
  invoiced_cents BIGINT NOT NULL DEFAULT 0,
  received_cents BIGINT NOT NULL DEFAULT 0,
  overdue_cents BIGINT NOT NULL DEFAULT 0,
  projected_30d_cents BIGINT NOT NULL DEFAULT 0,
  -- Counts
  invoices_sent INTEGER NOT NULL DEFAULT 0,
  invoices_paid INTEGER NOT NULL DEFAULT 0,
  new_clients INTEGER NOT NULL DEFAULT 0,
  -- Insights
  highlights JSONB NOT NULL DEFAULT '[]',
  -- Delivery
  delivered_at TIMESTAMPTZ,
  delivery_channel TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, period_type, period_start)
);

-- ─── RLS Policies ────────────────────────────────────────────────────────────

ALTER TABLE client_revenue_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_digests ENABLE ROW LEVEL SECURITY;

-- Org-scoped user access
CREATE POLICY crs_org ON client_revenue_scores FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
CREATE POLICY cfp_org ON cash_flow_projections FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
CREATE POLICY st_org ON scope_tracking FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
CREATE POLICY ri_org ON revenue_insights FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
CREATE POLICY rs_org ON revenue_scenarios FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
CREATE POLICY pp_org ON payment_patterns FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
CREATE POLICY rd_org ON revenue_digests FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);

-- Service role bypass for cron/workers
CREATE POLICY crs_service ON client_revenue_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY cfp_service ON cash_flow_projections FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY st_service ON scope_tracking FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ri_service ON revenue_insights FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY rs_service ON revenue_scenarios FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY pp_service ON payment_patterns FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY rd_service ON revenue_digests FOR ALL USING (auth.role() = 'service_role');

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_crs_org_score ON client_revenue_scores(org_id, composite_score DESC);
CREATE INDEX idx_crs_org_trend ON client_revenue_scores(org_id, trend);
CREATE INDEX idx_cfp_org_date ON cash_flow_projections(org_id, projection_date DESC);
CREATE INDEX idx_st_org_status ON scope_tracking(org_id, status);
CREATE INDEX idx_st_org_flagged ON scope_tracking(org_id) WHERE flagged = true;
CREATE INDEX idx_ri_org_type ON revenue_insights(org_id, insight_type, created_at DESC);
CREATE INDEX idx_ri_org_status ON revenue_insights(org_id, status, severity);
CREATE INDEX idx_ri_org_active ON revenue_insights(org_id) WHERE status = 'active';
CREATE INDEX idx_rs_org ON revenue_scenarios(org_id, created_at DESC);
CREATE INDEX idx_pp_org_contact ON payment_patterns(org_id, contact_id);
CREATE INDEX idx_rd_org_period ON revenue_digests(org_id, period_type, period_start DESC);

-- ─── Updated-at triggers ─────────────────────────────────────────────────────

CREATE TRIGGER trg_crs_updated_at BEFORE UPDATE ON client_revenue_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_st_updated_at BEFORE UPDATE ON scope_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON payment_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
