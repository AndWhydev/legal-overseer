-- 110_revenue_intelligence_core.sql
-- Revenue Intelligence Engine — core tables
-- All monetary values stored as integers (cents) to avoid floating point errors

-- ─── Revenue Snapshots ───────────────────────────────────────────────────────
-- Periodic snapshots of revenue state per org. Computed by batch job.
CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),

  -- Amounts in cents
  total_invoiced_cents bigint NOT NULL DEFAULT 0,
  total_collected_cents bigint NOT NULL DEFAULT 0,
  total_outstanding_cents bigint NOT NULL DEFAULT 0,
  total_overdue_cents bigint NOT NULL DEFAULT 0,
  total_cancelled_cents bigint NOT NULL DEFAULT 0,

  -- Counts
  invoices_sent integer NOT NULL DEFAULT 0,
  invoices_paid integer NOT NULL DEFAULT 0,
  invoices_overdue integer NOT NULL DEFAULT 0,
  new_clients integer NOT NULL DEFAULT 0,

  -- Derived
  collection_rate_pct numeric(5,2) DEFAULT 0,
  avg_days_to_pay numeric(5,1) DEFAULT 0,

  currency text NOT NULL DEFAULT 'AUD',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  UNIQUE(org_id, period_start, period_end, period_type)
);

CREATE INDEX idx_revenue_snapshots_org_period ON revenue_snapshots (org_id, period_type, period_start DESC);

-- ─── Client Revenue Scores ──────────────────────────────────────────────────
-- Per-client revenue scoring with trend tracking
CREATE TABLE IF NOT EXISTS client_revenue_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,

  -- Score components (0-100 scale)
  overall_score integer NOT NULL DEFAULT 0,
  invoice_frequency_score integer NOT NULL DEFAULT 0,
  payment_speed_score integer NOT NULL DEFAULT 0,
  project_value_score integer NOT NULL DEFAULT 0,
  consistency_score integer NOT NULL DEFAULT 0,
  trend_score integer NOT NULL DEFAULT 0,

  -- Revenue data (cents)
  total_revenue_cents bigint NOT NULL DEFAULT 0,
  revenue_last_90d_cents bigint NOT NULL DEFAULT 0,
  revenue_last_30d_cents bigint NOT NULL DEFAULT 0,
  avg_invoice_cents bigint NOT NULL DEFAULT 0,
  total_outstanding_cents bigint NOT NULL DEFAULT 0,

  -- Payment behavior
  avg_days_to_pay numeric(5,1) DEFAULT 0,
  on_time_rate_pct numeric(5,2) DEFAULT 0,
  invoices_total integer NOT NULL DEFAULT 0,
  invoices_paid integer NOT NULL DEFAULT 0,
  invoices_overdue integer NOT NULL DEFAULT 0,

  -- Trend
  trend_direction text NOT NULL DEFAULT 'stable' CHECK (trend_direction IN ('growing', 'stable', 'declining', 'new', 'churned')),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors jsonb NOT NULL DEFAULT '[]',

  -- Metadata
  last_invoice_date date,
  first_invoice_date date,
  currency text NOT NULL DEFAULT 'AUD',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(org_id, contact_id)
);

CREATE INDEX idx_client_scores_org ON client_revenue_scores (org_id, overall_score DESC);
CREATE INDEX idx_client_scores_risk ON client_revenue_scores (org_id, risk_level) WHERE risk_level IN ('high', 'critical');

-- ─── Revenue Insights ────────────────────────────────────────────────────────
-- Individual actionable insights (unbilled work, scope creep, overdue, etc.)
CREATE TABLE IF NOT EXISTS revenue_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,

  insight_type text NOT NULL CHECK (insight_type IN (
    'unbilled_work', 'scope_creep', 'overdue_invoice', 'payment_pattern',
    'retainer_renewal', 'retainer_underuse', 'retainer_overuse',
    'revenue_decline', 'collection_opportunity', 'rate_optimization'
  )),

  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'actioned', 'dismissed', 'expired')),

  -- Human-readable
  title text NOT NULL,
  description text NOT NULL,
  recommended_action text,

  -- Structured data
  amount_cents bigint DEFAULT 0,
  confidence numeric(3,2) NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '{}',

  -- References
  contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  project_reference text,
  invoice_id uuid,

  -- Lifecycle
  expires_at timestamptz,
  actioned_at timestamptz,
  actioned_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_revenue_insights_org_status ON revenue_insights (org_id, status, severity);
CREATE INDEX idx_revenue_insights_type ON revenue_insights (org_id, insight_type) WHERE status = 'active';
CREATE INDEX idx_revenue_insights_contact ON revenue_insights (contact_id) WHERE contact_id IS NOT NULL;

-- ─── Scope Tracking ──────────────────────────────────────────────────────────
-- Track project scope vs actual deliverables for scope creep detection
CREATE TABLE IF NOT EXISTS scope_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,

  project_reference text NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE SET NULL,

  -- Scope baseline
  original_deliverables integer NOT NULL DEFAULT 0,
  original_hours_estimate numeric(8,1) DEFAULT 0,
  original_value_cents bigint DEFAULT 0,

  -- Current state
  current_deliverables integer NOT NULL DEFAULT 0,
  current_hours_logged numeric(8,1) DEFAULT 0,
  current_value_cents bigint DEFAULT 0,

  -- Creep metrics
  deliverable_delta integer GENERATED ALWAYS AS (current_deliverables - original_deliverables) STORED,
  scope_creep_pct numeric(5,1) GENERATED ALWAYS AS (
    CASE WHEN original_deliverables > 0
      THEN ((current_deliverables - original_deliverables)::numeric / original_deliverables * 100)
      ELSE 0
    END
  ) STORED,

  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'change_ordered', 'archived')),
  change_order_sent boolean NOT NULL DEFAULT false,
  last_reviewed_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(org_id, project_reference)
);

CREATE INDEX idx_scope_tracking_org ON scope_tracking (org_id, status);
CREATE INDEX idx_scope_tracking_creep ON scope_tracking (org_id) WHERE current_deliverables > original_deliverables;

-- ─── Cash Flow Projections ──────────────────────────────────────────────────
-- Projected cash flow entries for 30/60/90 day forecasting
CREATE TABLE IF NOT EXISTS cash_flow_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,

  projection_date date NOT NULL,
  horizon_days integer NOT NULL CHECK (horizon_days IN (30, 60, 90)),

  -- Projected amounts (cents)
  projected_inflow_cents bigint NOT NULL DEFAULT 0,
  projected_outflow_cents bigint NOT NULL DEFAULT 0,
  net_cash_flow_cents bigint NOT NULL DEFAULT 0,

  -- Confidence
  confidence_low_cents bigint NOT NULL DEFAULT 0,
  confidence_high_cents bigint NOT NULL DEFAULT 0,
  confidence_pct numeric(3,2) NOT NULL DEFAULT 0.5,

  -- Breakdown
  from_outstanding_cents bigint NOT NULL DEFAULT 0,
  from_recurring_cents bigint NOT NULL DEFAULT 0,
  from_pipeline_cents bigint NOT NULL DEFAULT 0,

  -- Sources used for projection
  sources jsonb NOT NULL DEFAULT '{}',

  currency text NOT NULL DEFAULT 'AUD',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  UNIQUE(org_id, projection_date, horizon_days)
);

CREATE INDEX idx_cash_flow_org_date ON cash_flow_projections (org_id, projection_date DESC);

-- ─── Scenarios ──────────────────────────────────────────────────────────────
-- What-if scenario modeling
CREATE TABLE IF NOT EXISTS revenue_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,

  name text NOT NULL,
  description text,

  -- Scenario parameters
  scenario_type text NOT NULL CHECK (scenario_type IN (
    'rate_change', 'client_churn', 'capacity_change', 'new_client', 'custom'
  )),
  parameters jsonb NOT NULL DEFAULT '{}',

  -- Results (computed)
  baseline_revenue_cents bigint DEFAULT 0,
  projected_revenue_cents bigint DEFAULT 0,
  revenue_delta_cents bigint DEFAULT 0,
  revenue_delta_pct numeric(6,2) DEFAULT 0,

  -- Monte Carlo results
  simulation_runs integer DEFAULT 0,
  p10_revenue_cents bigint DEFAULT 0,
  p50_revenue_cents bigint DEFAULT 0,
  p90_revenue_cents bigint DEFAULT 0,

  -- Impact analysis
  impact_summary text,
  affected_clients jsonb DEFAULT '[]',
  risk_factors jsonb DEFAULT '[]',

  -- Lifecycle
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'computed', 'saved', 'archived')),
  computed_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_scenarios_org ON revenue_scenarios (org_id, status);

-- ─── Retainer Tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retainer_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,

  name text NOT NULL,
  monthly_amount_cents bigint NOT NULL,
  hours_allocated numeric(6,1) DEFAULT 0,
  currency text NOT NULL DEFAULT 'AUD',

  start_date date NOT NULL,
  end_date date,
  renewal_date date,
  auto_renew boolean NOT NULL DEFAULT false,

  -- Usage tracking
  current_month_hours numeric(6,1) NOT NULL DEFAULT 0,
  current_month_amount_cents bigint NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'cancelled')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(org_id, contact_id, name)
);

CREATE INDEX idx_retainers_org ON retainer_agreements (org_id, status);
CREATE INDEX idx_retainers_renewal ON retainer_agreements (org_id, renewal_date) WHERE status = 'active';

-- ─── RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE revenue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_revenue_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE retainer_agreements ENABLE ROW LEVEL SECURITY;

-- User policies (session-based, via get_user_org_id())
CREATE POLICY revenue_snapshots_select ON revenue_snapshots FOR SELECT TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY client_scores_select ON client_revenue_scores FOR SELECT TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY revenue_insights_select ON revenue_insights FOR SELECT TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY revenue_insights_update ON revenue_insights FOR UPDATE TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY scope_tracking_select ON scope_tracking FOR SELECT TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY cash_flow_select ON cash_flow_projections FOR SELECT TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY scenarios_select ON revenue_scenarios FOR SELECT TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY scenarios_insert ON revenue_scenarios FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id());
CREATE POLICY scenarios_update ON revenue_scenarios FOR UPDATE TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY scenarios_delete ON revenue_scenarios FOR DELETE TO authenticated USING (org_id = get_user_org_id());
CREATE POLICY retainers_select ON retainer_agreements FOR SELECT TO authenticated USING (org_id = get_user_org_id());

-- Service role policies (for background cron / agent compute)
CREATE POLICY revenue_snapshots_service ON revenue_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY client_scores_service ON client_revenue_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY revenue_insights_service ON revenue_insights FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY scope_tracking_service ON scope_tracking FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY cash_flow_service ON cash_flow_projections FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY scenarios_service ON revenue_scenarios FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY retainers_service ON retainer_agreements FOR ALL USING (auth.role() = 'service_role');

-- ─── Triggers ───────────────────────────────────────────────────────────────

CREATE TRIGGER trg_client_scores_updated_at
  BEFORE UPDATE ON client_revenue_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_revenue_insights_updated_at
  BEFORE UPDATE ON revenue_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_scope_tracking_updated_at
  BEFORE UPDATE ON scope_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_scenarios_updated_at
  BEFORE UPDATE ON revenue_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_retainers_updated_at
  BEFORE UPDATE ON retainer_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
