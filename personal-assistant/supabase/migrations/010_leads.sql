-- 010_leads.sql
-- Lead pipeline for Lead Swarm agent

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  source_channel text NOT NULL,
  source_detail text,
  contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'booked', 'converted', 'lost')),
  score text NOT NULL DEFAULT 'cold' CHECK (score IN ('hot', 'warm', 'cold')),
  budget_range text,
  service_interest text[] DEFAULT '{}',
  qualified_at timestamptz,
  converted_at timestamptz,
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_leads_org_status ON leads (org_id, status);
CREATE INDEX idx_leads_org_score ON leads (org_id, score);
CREATE INDEX idx_leads_contact ON leads (contact_id) WHERE contact_id IS NOT NULL;

-- Trigger
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
