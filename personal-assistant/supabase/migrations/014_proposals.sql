-- 014_proposals.sql
-- Proposal tracking for Proposal Bot agent

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  client_contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  tiers jsonb NOT NULL DEFAULT '[]',  -- array of ProposalTier objects
  selected_tier text,  -- name of chosen tier
  pdf_url text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  follow_up_count integer NOT NULL DEFAULT 0,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_proposals_org_status ON proposals (org_id, status);
CREATE INDEX idx_proposals_client ON proposals (client_contact_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
