-- 130_portal_tables.sql
-- Client Portal: portal_access, portal_branding, portal_files, portal_requests
-- SECURITY CRITICAL: RLS policies ensure clients only see their own data

-- =============================================================================
-- PORTAL ACCESS (links Supabase auth user → org → contact)
-- =============================================================================

CREATE TABLE portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  invite_token uuid DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  permissions jsonb NOT NULL DEFAULT '{"view_projects": true, "view_invoices": true, "upload_files": true, "submit_requests": true}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE INDEX idx_portal_access_org ON portal_access (org_id, status);
CREATE INDEX idx_portal_access_user ON portal_access (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_portal_access_contact ON portal_access (contact_id);
CREATE INDEX idx_portal_access_token ON portal_access (invite_token) WHERE status = 'invited';

CREATE TRIGGER trg_portal_access_updated_at
  BEFORE UPDATE ON portal_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PORTAL BRANDING (per-org white-label customization)
-- =============================================================================

CREATE TABLE portal_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  logo_url text,
  favicon_url text,
  primary_color text NOT NULL DEFAULT '#2563eb',
  secondary_color text NOT NULL DEFAULT '#1e40af',
  font_family text NOT NULL DEFAULT 'Inter',
  company_name text,
  tagline text,
  custom_domain text,
  custom_css text,
  footer_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_portal_branding_updated_at
  BEFORE UPDATE ON portal_branding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PORTAL FILES (file exchange between agency and client)
-- =============================================================================

CREATE TABLE portal_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  uploaded_by_portal boolean NOT NULL DEFAULT false,
  uploaded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  storage_path text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_files_org_contact ON portal_files (org_id, contact_id);
CREATE INDEX idx_portal_files_project ON portal_files (project_id) WHERE project_id IS NOT NULL;

-- =============================================================================
-- PORTAL REQUESTS (change requests / bug reports from clients)
-- =============================================================================

CREATE TABLE portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'change_request' CHECK (type IN ('change_request', 'bug_report', 'question', 'feedback')),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'acknowledged', 'in_progress', 'completed', 'closed')),
  attachments jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_requests_org_contact ON portal_requests (org_id, contact_id);
CREATE INDEX idx_portal_requests_status ON portal_requests (org_id, status);
CREATE INDEX idx_portal_requests_task ON portal_requests (task_id) WHERE task_id IS NOT NULL;

CREATE TRIGGER trg_portal_requests_updated_at
  BEFORE UPDATE ON portal_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- RLS POLICIES — SECURITY CRITICAL
-- =============================================================================

ALTER TABLE portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_requests ENABLE ROW LEVEL SECURITY;

-- Helper: get portal contact_id for the current user within an org
CREATE OR REPLACE FUNCTION get_portal_contact_id(p_org_id uuid)
RETURNS uuid AS $$
  SELECT contact_id FROM portal_access
  WHERE user_id = auth.uid() AND org_id = p_org_id AND status = 'active'
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth;

-- Helper: check if current user is a portal user for a given org
CREATE OR REPLACE FUNCTION is_portal_user(p_org_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM portal_access
    WHERE user_id = auth.uid() AND org_id = p_org_id AND status = 'active'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth;

-- ── PORTAL ACCESS ──────────────────────────────────────────────────
-- Agency staff: full CRUD on their org's portal access records
CREATE POLICY "portal_access_agency_select" ON portal_access
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "portal_access_agency_insert" ON portal_access
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "portal_access_agency_update" ON portal_access
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "portal_access_agency_delete" ON portal_access
  FOR DELETE USING (org_id = get_user_org_id());

-- Portal users: can only see their own access record
CREATE POLICY "portal_access_client_select" ON portal_access
  FOR SELECT USING (user_id = auth.uid() AND status = 'active');

-- ── PORTAL BRANDING ────────────────────────────────────────────────
-- Agency staff: full CRUD
CREATE POLICY "portal_branding_agency_all" ON portal_branding
  FOR ALL USING (org_id = get_user_org_id());

-- Portal users: read-only for their org's branding
CREATE POLICY "portal_branding_client_select" ON portal_branding
  FOR SELECT USING (is_portal_user(org_id));

-- ── PORTAL FILES ───────────────────────────────────────────────────
-- Agency staff: full access within org
CREATE POLICY "portal_files_agency_all" ON portal_files
  FOR ALL USING (org_id = get_user_org_id());

-- Portal users: see only files linked to their contact_id
CREATE POLICY "portal_files_client_select" ON portal_files
  FOR SELECT USING (contact_id = get_portal_contact_id(org_id));

-- Portal users: can upload files (uploaded_by_portal must be true)
CREATE POLICY "portal_files_client_insert" ON portal_files
  FOR INSERT WITH CHECK (
    contact_id = get_portal_contact_id(org_id)
    AND uploaded_by_portal = true
  );

-- ── PORTAL REQUESTS ────────────────────────────────────────────────
-- Agency staff: full access within org
CREATE POLICY "portal_requests_agency_all" ON portal_requests
  FOR ALL USING (org_id = get_user_org_id());

-- Portal users: see only their own requests
CREATE POLICY "portal_requests_client_select" ON portal_requests
  FOR SELECT USING (contact_id = get_portal_contact_id(org_id));

-- Portal users: can create requests linked to their contact
CREATE POLICY "portal_requests_client_insert" ON portal_requests
  FOR INSERT WITH CHECK (contact_id = get_portal_contact_id(org_id));

-- ── CROSS-TABLE PORTAL ACCESS ──────────────────────────────────────
-- Portal users need read access to projects, tasks, invoices scoped to their contact

-- Projects: portal users can see projects linked to their contact
CREATE POLICY "projects_portal_select" ON projects
  FOR SELECT USING (
    contact_id IS NOT NULL
    AND contact_id = get_portal_contact_id(org_id)
  );

-- Tasks: portal users can see tasks on projects they have access to
CREATE POLICY "tasks_portal_select" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.metadata->>'project_id'::text::uuid
        AND p.contact_id = get_portal_contact_id(tasks.org_id)
    )
    OR EXISTS (
      SELECT 1 FROM portal_requests pr
      WHERE pr.task_id = tasks.id
        AND pr.contact_id = get_portal_contact_id(tasks.org_id)
    )
  );

-- Invoices: portal users can see invoices linked to their contact
CREATE POLICY "invoices_portal_select" ON invoices
  FOR SELECT USING (
    client_contact_id IS NOT NULL
    AND client_contact_id = get_portal_contact_id(org_id)
  );

-- Contacts: portal users can see their own contact record
CREATE POLICY "contacts_portal_select" ON contacts
  FOR SELECT USING (
    id = get_portal_contact_id(org_id)
  );

-- Service role bypass for all portal tables (background jobs, invites)
CREATE POLICY "portal_access_service" ON portal_access
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "portal_branding_service" ON portal_branding
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "portal_files_service" ON portal_files
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "portal_requests_service" ON portal_requests
  FOR ALL USING (auth.role() = 'service_role');
