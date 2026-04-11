-- 032_missing_org_indexes.sql
-- Add missing org_id and created_at indexes for tables that lacked them.

-- profiles: queried by org_id for team/member lookups
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles (org_id);

-- kanban_columns: queried by org_id for board rendering
CREATE INDEX IF NOT EXISTS idx_kanban_columns_org ON kanban_columns (org_id, position);

-- goals: queried by org_id + status for dashboard
CREATE INDEX IF NOT EXISTS idx_goals_org_status ON goals (org_id, status);

-- contacts: queried by org_id for contact list (GIN indexes exist for search fields only)
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts (org_id, name);

-- memory_entries: queried by org_id + category
CREATE INDEX IF NOT EXISTS idx_memory_entries_org ON memory_entries (org_id, category, created_at DESC);

-- agent_sessions: queried by org_id for session history
CREATE INDEX IF NOT EXISTS idx_agent_sessions_org ON agent_sessions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions (org_id, status)
  WHERE status = 'active';

-- user_integrations: queried by org_id + provider
CREATE INDEX IF NOT EXISTS idx_user_integrations_org_provider ON user_integrations (org_id, provider);
