-- 150_role_type_builder.sql
-- Extend role_type ENUM to support the builder role (website generation & deployment).
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'builder';

-- ---------------------------------------------------------------------------
-- website_projects — Generated website projects per org
-- ---------------------------------------------------------------------------
CREATE TABLE website_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  template_id text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generating', 'preview', 'deployed', 'archived')),
  html_content text,
  css_content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_url text,
  deploy_target jsonb,
  deployed_at timestamptz,
  deployed_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_website_projects_org ON website_projects(org_id);
CREATE INDEX idx_website_projects_status ON website_projects(org_id, status);

CREATE TRIGGER trg_website_projects_updated_at
  BEFORE UPDATE ON website_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- website_revisions — Revision history for website projects
-- ---------------------------------------------------------------------------
CREATE TABLE website_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES website_projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  html_content text NOT NULL,
  css_content text,
  change_summary text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE website_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_revisions ENABLE ROW LEVEL SECURITY;

-- Org members can CRUD their own org's website projects
CREATE POLICY website_projects_org ON website_projects
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY website_projects_service ON website_projects
  FOR ALL USING (auth.role() = 'service_role');

-- Revisions follow project access
CREATE POLICY website_revisions_org ON website_revisions
  FOR ALL USING (
    project_id IN (
      SELECT wp.id FROM website_projects wp
      JOIN org_members om ON om.org_id = wp.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY website_revisions_service ON website_revisions
  FOR ALL USING (auth.role() = 'service_role');
