-- 130_client_portal_core.sql
-- Client Portal: access control, branding, files, requests, activity, notifications

-- =============================================================================
-- PORTAL ACCESS — links auth user to org + contact for scoped portal access
-- =============================================================================

CREATE TABLE portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL,
  invited_at timestamptz DEFAULT now(),
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE INDEX idx_portal_access_org ON portal_access (org_id);
CREATE INDEX idx_portal_access_user ON portal_access (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_portal_access_contact ON portal_access (contact_id);
CREATE INDEX idx_portal_access_email ON portal_access (email);

CREATE TRIGGER trg_portal_access_updated_at
  BEFORE UPDATE ON portal_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PORTAL BRANDING — per-org portal appearance configuration
-- =============================================================================

CREATE TABLE portal_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL UNIQUE,
  company_name text,
  logo_url text,
  favicon_url text,
  primary_color text DEFAULT '#2563EB',
  accent_color text DEFAULT '#3B82F6',
  background_color text DEFAULT '#FAFAFA',
  font_family text DEFAULT 'Inter',
  custom_css text,
  welcome_message text,
  support_email text,
  support_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER trg_portal_branding_updated_at
  BEFORE UPDATE ON portal_branding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PORTAL FILES — file exchange between agency and client
-- =============================================================================

CREATE TABLE portal_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES tasks ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users ON DELETE SET NULL,
  uploaded_by_role text NOT NULL DEFAULT 'agency' CHECK (uploaded_by_role IN ('agency', 'client')),
  file_name text NOT NULL,
  file_type text,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  description text,
  category text DEFAULT 'general' CHECK (category IN ('general', 'design', 'document', 'deliverable', 'asset', 'invoice', 'contract')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_files_org_contact ON portal_files (org_id, contact_id);
CREATE INDEX idx_portal_files_project ON portal_files (project_id) WHERE project_id IS NOT NULL;

-- =============================================================================
-- PORTAL REQUESTS — client-submitted requests that become kanban tasks
-- =============================================================================

CREATE TABLE portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,
  submitted_by uuid REFERENCES auth.users ON DELETE SET NULL,
  task_id uuid REFERENCES tasks ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  request_type text NOT NULL DEFAULT 'general' CHECK (request_type IN ('general', 'change_request', 'bug_report', 'new_work', 'question', 'feedback')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'in_progress', 'completed', 'closed')),
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_requests_org_contact ON portal_requests (org_id, contact_id);
CREATE INDEX idx_portal_requests_task ON portal_requests (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_portal_requests_status ON portal_requests (org_id, status);

CREATE TRIGGER trg_portal_requests_updated_at
  BEFORE UPDATE ON portal_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PORTAL ACTIVITY — activity feed for portal clients
-- =============================================================================

CREATE TABLE portal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN (
    'task_created', 'task_completed', 'task_updated',
    'invoice_sent', 'invoice_paid', 'invoice_overdue',
    'file_uploaded', 'file_shared',
    'request_submitted', 'request_updated', 'request_completed',
    'project_updated', 'milestone_reached',
    'message_sent', 'note_added'
  )),
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_activity_org_contact ON portal_activity (org_id, contact_id, created_at DESC);
CREATE INDEX idx_portal_activity_unread ON portal_activity (org_id, contact_id) WHERE NOT read;

-- =============================================================================
-- PORTAL NOTIFICATIONS — email/push notifications for clients
-- =============================================================================

CREATE TABLE portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,
  portal_access_id uuid REFERENCES portal_access ON DELETE CASCADE NOT NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'both')),
  notification_type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_notifications_access ON portal_notifications (portal_access_id, created_at DESC);
CREATE INDEX idx_portal_notifications_unread ON portal_notifications (portal_access_id) WHERE NOT read;

-- =============================================================================
-- PORTAL PROJECTS — lightweight project view linking tasks to client-visible projects
-- =============================================================================

CREATE TABLE portal_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_phase text,
  start_date date,
  target_date date,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_projects_org_contact ON portal_projects (org_id, contact_id);

CREATE TRIGGER trg_portal_projects_updated_at
  BEFORE UPDATE ON portal_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PORTAL PROJECT TASKS — links kanban tasks to portal projects
-- =============================================================================

CREATE TABLE portal_project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_project_id uuid REFERENCES portal_projects ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES tasks ON DELETE CASCADE NOT NULL,
  visible_to_client boolean NOT NULL DEFAULT true,
  display_name text,
  is_milestone boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  UNIQUE(portal_project_id, task_id)
);

CREATE INDEX idx_portal_project_tasks_project ON portal_project_tasks (portal_project_id);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_project_tasks ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user has portal access for a given org+contact
CREATE OR REPLACE FUNCTION has_portal_access(p_user_id uuid, p_org_id uuid, p_contact_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_access
    WHERE user_id = p_user_id
      AND org_id = p_org_id
      AND contact_id = p_contact_id
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is an org member (agency side)
CREATE OR REPLACE FUNCTION is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND org_id = p_org_id
  ) OR EXISTS (
    SELECT 1 FROM org_members WHERE user_id = p_user_id AND org_id = p_org_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get portal contact_id for current user + org
CREATE OR REPLACE FUNCTION portal_contact_id(p_user_id uuid, p_org_id uuid)
RETURNS uuid AS $$
  SELECT contact_id FROM portal_access
  WHERE user_id = p_user_id AND org_id = p_org_id AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── portal_access ──
CREATE POLICY "Agency members can manage portal access for their org"
  ON portal_access FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal users can read own access"
  ON portal_access FOR SELECT
  USING (user_id = auth.uid());

-- ── portal_branding ──
CREATE POLICY "Agency members manage branding"
  ON portal_branding FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal users can read branding for their portal org"
  ON portal_branding FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM portal_access
    WHERE portal_access.user_id = auth.uid()
      AND portal_access.org_id = portal_branding.org_id
      AND portal_access.status = 'active'
  ));

-- ── portal_files ──
CREATE POLICY "Agency members manage portal files"
  ON portal_files FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal clients see own files"
  ON portal_files FOR SELECT
  USING (has_portal_access(auth.uid(), org_id, contact_id));

CREATE POLICY "Portal clients can upload files"
  ON portal_files FOR INSERT
  WITH CHECK (has_portal_access(auth.uid(), org_id, contact_id));

-- ── portal_requests ──
CREATE POLICY "Agency members manage requests"
  ON portal_requests FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal clients see own requests"
  ON portal_requests FOR SELECT
  USING (has_portal_access(auth.uid(), org_id, contact_id));

CREATE POLICY "Portal clients can submit requests"
  ON portal_requests FOR INSERT
  WITH CHECK (has_portal_access(auth.uid(), org_id, contact_id));

-- ── portal_activity ──
CREATE POLICY "Agency members see portal activity"
  ON portal_activity FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal clients see own activity"
  ON portal_activity FOR SELECT
  USING (has_portal_access(auth.uid(), org_id, contact_id));

CREATE POLICY "Portal clients can mark activity read"
  ON portal_activity FOR UPDATE
  USING (has_portal_access(auth.uid(), org_id, contact_id))
  WITH CHECK (has_portal_access(auth.uid(), org_id, contact_id));

-- ── portal_notifications ──
CREATE POLICY "Agency members manage notifications"
  ON portal_notifications FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal clients see own notifications"
  ON portal_notifications FOR SELECT
  USING (portal_access_id IN (
    SELECT id FROM portal_access WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Portal clients can mark notifications read"
  ON portal_notifications FOR UPDATE
  USING (portal_access_id IN (
    SELECT id FROM portal_access WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ── portal_projects ──
CREATE POLICY "Agency members manage portal projects"
  ON portal_projects FOR ALL
  USING (is_org_member(auth.uid(), org_id))
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Portal clients see own projects"
  ON portal_projects FOR SELECT
  USING (has_portal_access(auth.uid(), org_id, contact_id));

-- ── portal_project_tasks ──
CREATE POLICY "Agency members manage project task links"
  ON portal_project_tasks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM portal_projects pp
    WHERE pp.id = portal_project_tasks.portal_project_id
      AND is_org_member(auth.uid(), pp.org_id)
  ));

CREATE POLICY "Portal clients see visible project tasks"
  ON portal_project_tasks FOR SELECT
  USING (
    visible_to_client AND EXISTS (
      SELECT 1 FROM portal_projects pp
      WHERE pp.id = portal_project_tasks.portal_project_id
        AND has_portal_access(auth.uid(), pp.org_id, pp.contact_id)
    )
  );

-- =============================================================================
-- STORAGE BUCKET for portal files
-- =============================================================================
-- NOTE: Run in Supabase dashboard or via supabase CLI:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('portal-files', 'portal-files', false);
-- Storage RLS policies should be configured via dashboard for path-based access control.
