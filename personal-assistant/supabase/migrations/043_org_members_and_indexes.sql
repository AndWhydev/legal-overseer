-- 043_org_members_and_indexes.sql
-- Org members table for explicit membership tracking + composite/BRIN indexes.

-- =============================================================================
-- ORG_MEMBERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS org_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- RLS
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own org members"
  ON org_members
  FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage members"
  ON org_members
  FOR ALL
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Index on org_members
CREATE INDEX IF NOT EXISTS idx_org_members_org_role
  ON org_members (org_id, role);

CREATE INDEX IF NOT EXISTS idx_org_members_user
  ON org_members (user_id);

-- =============================================================================
-- COMPOSITE INDEXES on existing tables
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_approval_queue_org_status_created
  ON approval_queue (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_org_status_score_created
  ON leads (org_id, status, score, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_org_status_due_created
  ON invoices (org_id, status, due_date, created_at DESC);

-- =============================================================================
-- BRIN INDEXES for time-series tables
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_runs_created_brin
  ON agent_runs USING brin (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_brin
  ON audit_log USING brin (created_at);
