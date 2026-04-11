-- ============================================================================
-- Phase 43-01: Delegation Mandates & Action Log
-- Tracks entity-level delegation mandates (infinite_autopilot, supervised,
-- standard) and logs every action taken under delegation authority.
-- ============================================================================

-- ============================================================================
-- DELEGATION_MANDATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS delegation_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  mandate_level TEXT NOT NULL CHECK (mandate_level IN ('infinite_autopilot', 'supervised', 'standard')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_via TEXT NOT NULL,       -- e.g. 'dashboard', 'whatsapp', 'api', 'onboarding'
  deactivated_at TIMESTAMPTZ,
  deactivated_via TEXT               -- e.g. 'dashboard', 'whatsapp', 'api', 'admin'
);

-- Only one active mandate per entity per org at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_delegation_mandates_active
  ON delegation_mandates (org_id, entity_id)
  WHERE deactivated_at IS NULL;

-- Lookup by org
CREATE INDEX IF NOT EXISTS idx_delegation_mandates_org
  ON delegation_mandates (org_id);

-- Lookup by entity
CREATE INDEX IF NOT EXISTS idx_delegation_mandates_entity
  ON delegation_mandates (entity_id);

-- ============================================================================
-- DELEGATION_ACTION_LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS delegation_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  mandate_id UUID REFERENCES delegation_mandates(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}',
  financial_impact JSONB,            -- e.g. {"amount": 1500, "currency": "AUD", "direction": "outbound"}
  evidence_urls TEXT[] DEFAULT '{}',
  fiduciary_evaluation JSONB,        -- e.g. {"risk": "low", "reasoning": "...", "score": 0.92}
  agent_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup by org + time range (for morning briefing)
CREATE INDEX IF NOT EXISTS idx_delegation_action_log_org_created
  ON delegation_action_log (org_id, created_at DESC);

-- Lookup by entity
CREATE INDEX IF NOT EXISTS idx_delegation_action_log_entity
  ON delegation_action_log (entity_id);

-- Lookup by mandate
CREATE INDEX IF NOT EXISTS idx_delegation_action_log_mandate
  ON delegation_action_log (mandate_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE delegation_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_action_log ENABLE ROW LEVEL SECURITY;

-- delegation_mandates: org members can read/write their own org's mandates
CREATE POLICY delegation_mandates_select ON delegation_mandates
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY delegation_mandates_insert ON delegation_mandates
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY delegation_mandates_update ON delegation_mandates
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- delegation_action_log: org members can read; inserts via service role only
CREATE POLICY delegation_action_log_select ON delegation_action_log
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY delegation_action_log_insert ON delegation_action_log
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );
