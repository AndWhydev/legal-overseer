-- 002_rls_policies.sql
-- Row Level Security policies for multi-tenant isolation

-- =============================================================================
-- HELPER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================

CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (id = get_user_org_id());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (id = get_user_org_id());

-- =============================================================================
-- PROFILES
-- =============================================================================

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (org_id = get_user_org_id() OR id = auth.uid());

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (id = auth.uid());

-- =============================================================================
-- KANBAN_COLUMNS
-- =============================================================================

CREATE POLICY "kanban_columns_select" ON kanban_columns
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "kanban_columns_insert" ON kanban_columns
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "kanban_columns_update" ON kanban_columns
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "kanban_columns_delete" ON kanban_columns
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- GOALS
-- =============================================================================

CREATE POLICY "goals_select" ON goals
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "goals_insert" ON goals
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "goals_update" ON goals
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "goals_delete" ON goals
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- TASKS
-- =============================================================================

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- CONTACTS
-- =============================================================================

CREATE POLICY "contacts_select" ON contacts
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "contacts_insert" ON contacts
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "contacts_update" ON contacts
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "contacts_delete" ON contacts
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- MEMORY_ENTRIES
-- =============================================================================

CREATE POLICY "memory_entries_select" ON memory_entries
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "memory_entries_insert" ON memory_entries
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "memory_entries_update" ON memory_entries
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "memory_entries_delete" ON memory_entries
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- ACTIVITY_FEED
-- =============================================================================

CREATE POLICY "activity_feed_select" ON activity_feed
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "activity_feed_insert" ON activity_feed
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "activity_feed_delete" ON activity_feed
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- AGENT_SESSIONS
-- =============================================================================

CREATE POLICY "agent_sessions_select" ON agent_sessions
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "agent_sessions_insert" ON agent_sessions
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "agent_sessions_update" ON agent_sessions
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "agent_sessions_delete" ON agent_sessions
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- USER_INTEGRATIONS
-- =============================================================================

CREATE POLICY "user_integrations_select" ON user_integrations
  FOR SELECT USING (org_id = get_user_org_id() AND user_id = auth.uid());

CREATE POLICY "user_integrations_insert" ON user_integrations
  FOR INSERT WITH CHECK (org_id = get_user_org_id() AND user_id = auth.uid());

CREATE POLICY "user_integrations_update" ON user_integrations
  FOR UPDATE USING (org_id = get_user_org_id() AND user_id = auth.uid());

CREATE POLICY "user_integrations_delete" ON user_integrations
  FOR DELETE USING (org_id = get_user_org_id() AND user_id = auth.uid());
