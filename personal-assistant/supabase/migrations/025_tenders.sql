-- 025_tenders.sql
-- Tender hunting: tenders discovered from AusTender and capability profiles

-- ---------------------------------------------------------------------------
-- Tenders
-- ---------------------------------------------------------------------------

CREATE TABLE tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  source text NOT NULL DEFAULT 'austender',
  url text NOT NULL,
  value numeric,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'awarded', 'cancelled', 'drafted')),
  fit_score numeric CHECK (fit_score >= 0 AND fit_score <= 100),
  requirements jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, url)
);

CREATE INDEX idx_tenders_org ON tenders (org_id, status);
CREATE INDEX idx_tenders_deadline ON tenders (org_id, deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_tenders_fit_score ON tenders (org_id, fit_score DESC) WHERE fit_score IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Capability profiles
-- ---------------------------------------------------------------------------

CREATE TABLE capability_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  skills text[] DEFAULT '{}',
  certifications text[] DEFAULT '{}',
  past_projects jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX idx_capability_profiles_org ON capability_profiles (org_id);

CREATE TRIGGER trg_capability_profiles_updated_at
  BEFORE UPDATE ON capability_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_profiles ENABLE ROW LEVEL SECURITY;

-- Tenders: org members can read/write their own org's tenders
CREATE POLICY tenders_select ON tenders
  FOR SELECT
  USING (
    org_id = get_user_org_id()
  );

CREATE POLICY tenders_insert ON tenders
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
  );

CREATE POLICY tenders_update ON tenders
  FOR UPDATE
  USING (
    org_id = get_user_org_id()
  )
  WITH CHECK (
    org_id = get_user_org_id()
  );

CREATE POLICY tenders_delete ON tenders
  FOR DELETE
  USING (
    org_id = get_user_org_id()
  );

-- Capability profiles: same pattern
CREATE POLICY capability_profiles_select ON capability_profiles
  FOR SELECT
  USING (
    org_id = get_user_org_id()
  );

CREATE POLICY capability_profiles_insert ON capability_profiles
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
  );

CREATE POLICY capability_profiles_update ON capability_profiles
  FOR UPDATE
  USING (
    org_id = get_user_org_id()
  )
  WITH CHECK (
    org_id = get_user_org_id()
  );

CREATE POLICY capability_profiles_delete ON capability_profiles
  FOR DELETE
  USING (
    org_id = get_user_org_id()
  );

-- Service role bypass (for agent-driven inserts)
CREATE POLICY tenders_service_role ON tenders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY capability_profiles_service_role ON capability_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
