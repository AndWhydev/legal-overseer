-- 015_offer_packages.sql
-- Service packages and pricing for proposal generation

CREATE TABLE offer_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  service_type text NOT NULL,
  price_range text NOT NULL,
  inclusions text[] DEFAULT '{}',
  exclusions text[] DEFAULT '{}',
  usp text[] DEFAULT '{}',
  target_audience text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Indexes
CREATE INDEX idx_offer_packages_org ON offer_packages (org_id, status) WHERE status = 'active';
CREATE INDEX idx_offer_packages_service ON offer_packages (org_id, service_type);

-- Trigger
CREATE TRIGGER trg_offer_packages_updated_at
  BEFORE UPDATE ON offer_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
