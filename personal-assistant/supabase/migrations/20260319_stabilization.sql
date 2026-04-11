-- ============================================================
-- Stabilization Migration — 2026-03-19
-- Fixes all runtime schema gaps after v1.3/v1.4/v1.5 merge
-- ============================================================

BEGIN;

-- ─── 1. Add missing column to organizations base table ──────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT 'agency';

-- ─── 2. Recreate organisations view with ALL columns ────────
-- The view was created with only 7 columns, hiding newer columns
-- from the base table (enabled_modules, ui_profile, etc.)
DROP VIEW IF EXISTS organisations CASCADE;
CREATE VIEW organisations AS SELECT * FROM organizations;

-- Grant access so PostgREST/Supabase can query through it
GRANT SELECT, INSERT, UPDATE, DELETE ON organisations TO authenticated;
GRANT SELECT ON organisations TO anon;

-- ─── 3. Create generated_content table ──────────────────────
CREATE TABLE IF NOT EXISTS generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('ad_scripts', 'social_posts', 'email_campaigns', 'blog_posts')),
  inputs jsonb NOT NULL,
  output text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published')),
  scheduled_for timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_content_org_created ON generated_content(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_content_template ON generated_content(org_id, template_type);
CREATE INDEX IF NOT EXISTS idx_generated_content_status ON generated_content(org_id, status);
CREATE INDEX IF NOT EXISTS idx_generated_content_scheduled ON generated_content(org_id, scheduled_for) WHERE scheduled_for IS NOT NULL;

ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gc_select" ON generated_content FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "gc_insert" ON generated_content FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "gc_update" ON generated_content FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "gc_delete" ON generated_content FOR DELETE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ─── 4. Create quotes table ────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id),
  lead_id uuid REFERENCES leads(id),
  job_id uuid,
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

CREATE INDEX IF NOT EXISTS idx_quotes_org_id ON quotes(org_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(org_id, status);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_tenant" ON quotes
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "quotes_insert" ON quotes FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "quotes_update" ON quotes FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "quotes_delete" ON quotes FOR DELETE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ─── 5. Create jobs table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_jobs_org_id ON jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(org_id, status);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_tenant" ON jobs
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "jobs_insert" ON jobs FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "jobs_update" ON jobs FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "jobs_delete" ON jobs FOR DELETE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Add FK from quotes.job_id now that jobs exists
ALTER TABLE quotes
  ADD CONSTRAINT quotes_job_id_fk FOREIGN KEY (job_id) REFERENCES jobs(id);

-- ─── 6. Create org_settings table ──────────────────────────
CREATE TABLE IF NOT EXISTS org_settings (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled_agents text[] DEFAULT ARRAY[]::text[],
  daily_cost_limit numeric(10,2) DEFAULT 10.0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_settings_tenant" ON org_settings
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_settings_insert" ON org_settings FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_settings_update" ON org_settings FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ─── 7. Add missing columns ────────────────────────────────
-- contacts.avatar_url
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;

-- tasks.due_date
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- offer_packages.pain_points
ALTER TABLE offer_packages ADD COLUMN IF NOT EXISTS pain_points text[] DEFAULT ARRAY[]::text[];

-- ad_script_batches: add offer_name and variations
ALTER TABLE ad_script_batches ADD COLUMN IF NOT EXISTS offer_name text;
ALTER TABLE ad_script_batches ADD COLUMN IF NOT EXISTS variations jsonb;

COMMIT;
