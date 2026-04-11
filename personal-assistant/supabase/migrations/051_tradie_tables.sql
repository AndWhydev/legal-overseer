-- Tradie vertical: jobs and quotes tables
-- =========================================================================

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id),
  lead_id uuid REFERENCES leads(id),
  quote_id uuid,
  title text NOT NULL,
  description text,
  job_type text,
  status text NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted','booked','in-progress','complete','invoiced','cancelled')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  address text,
  value numeric(12,2),
  assigned_to uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_org_id ON jobs(org_id);
CREATE INDEX idx_jobs_status ON jobs(org_id, status);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON jobs
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id),
  lead_id uuid REFERENCES leads(id),
  job_id uuid REFERENCES jobs(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','declined','expired')),
  line_items jsonb NOT NULL DEFAULT '[]',
  labor_total numeric(12,2) DEFAULT 0,
  materials_total numeric(12,2) DEFAULT 0,
  gst_total numeric(12,2) DEFAULT 0,
  grand_total numeric(12,2) DEFAULT 0,
  valid_until date,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotes_org_id ON quotes(org_id);
CREATE INDEX idx_quotes_status ON quotes(org_id, status);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON quotes
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
