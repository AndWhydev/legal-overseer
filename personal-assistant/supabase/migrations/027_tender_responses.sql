-- 027_tender_responses.sql
-- Extend tender hunting: add tender_responses table and missing columns on tenders

-- ---------------------------------------------------------------------------
-- Add missing columns to tenders
-- ---------------------------------------------------------------------------

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS tender_number text,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS budget_min numeric,
  ADD COLUMN IF NOT EXISTS budget_max numeric,
  ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER trg_tenders_updated_at
  BEFORE UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Add missing columns to capability_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE capability_profiles
  ADD COLUMN IF NOT EXISTS service_category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_coverage text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_contract_value numeric;

-- ---------------------------------------------------------------------------
-- Tender responses
-- ---------------------------------------------------------------------------

CREATE TABLE tender_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  tender_id uuid REFERENCES tenders ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'submitted', 'won', 'lost')),
  content jsonb NOT NULL DEFAULT '{}',
  compliance_score numeric CHECK (compliance_score >= 0 AND compliance_score <= 100),
  fit_score numeric CHECK (fit_score >= 0 AND fit_score <= 100),
  estimated_effort_hours numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, tender_id)
);

CREATE INDEX idx_tender_responses_org ON tender_responses (org_id, status);
CREATE INDEX idx_tender_responses_tender ON tender_responses (tender_id);

CREATE TRIGGER trg_tender_responses_updated_at
  BEFORE UPDATE ON tender_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security for tender_responses
-- ---------------------------------------------------------------------------

ALTER TABLE tender_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tender_responses_select ON tender_responses
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY tender_responses_insert ON tender_responses
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY tender_responses_update ON tender_responses
  FOR UPDATE USING (org_id = get_user_org_id()) WITH CHECK (org_id = get_user_org_id());

CREATE POLICY tender_responses_delete ON tender_responses
  FOR DELETE USING (org_id = get_user_org_id());

CREATE POLICY tender_responses_service_role ON tender_responses
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
