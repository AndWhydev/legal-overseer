-- Entity-level overrides for delegation mandates, LTV scaling, and budget control.
-- Phase 37: Engine Flexibility (ENGINE-01 through ENGINE-05)

CREATE TABLE IF NOT EXISTS entity_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delegation_mandate TEXT NOT NULL DEFAULT 'standard'
    CHECK (delegation_mandate IN ('standard', 'supervised', 'infinite_autopilot')),
  ltv_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00
    CHECK (ltv_multiplier >= 0.1 AND ltv_multiplier <= 10.0),
  iteration_cap INTEGER CHECK (iteration_cap IS NULL OR (iteration_cap >= 1 AND iteration_cap <= 500)),
  budget_preset TEXT NOT NULL DEFAULT 'standard'
    CHECK (budget_preset IN ('standard', 'dynamic_workspace')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, org_id)
);

-- RLS: org members can read/write their own org's overrides
ALTER TABLE entity_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_overrides_org_access" ON entity_overrides
  FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Index for fast lookup by entity + org
CREATE INDEX idx_entity_overrides_entity_org ON entity_overrides(entity_id, org_id);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER entity_overrides_updated_at
  BEFORE UPDATE ON entity_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
