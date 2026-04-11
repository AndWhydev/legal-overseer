-- 053_dual_tier_rls_policies.sql
-- Rewrites tenant-scoped RLS policies for dual-tier tenancy.
--
-- Context:
-- - Users now have a personal org and can belong to multiple shared orgs.
-- - SELECT/UPDATE/DELETE should allow all accessible orgs.
-- - INSERT should pin writes to the user's active org context.
--
-- Safety:
-- - Uses DROP POLICY IF EXISTS before CREATE POLICY.
-- - Leaves service-role policies intact.
-- - Optional tables are guarded with existence checks.

-- =============================================================================
-- STANDARD TENANT TABLES
-- =============================================================================

-- tasks
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- contacts
DROP POLICY IF EXISTS "contacts_select" ON contacts;
DROP POLICY IF EXISTS "contacts_insert" ON contacts;
DROP POLICY IF EXISTS "contacts_update" ON contacts;
DROP POLICY IF EXISTS "contacts_delete" ON contacts;

CREATE POLICY "contacts_select" ON contacts
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "contacts_insert" ON contacts
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "contacts_update" ON contacts
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "contacts_delete" ON contacts
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- goals
DROP POLICY IF EXISTS "goals_select" ON goals;
DROP POLICY IF EXISTS "goals_insert" ON goals;
DROP POLICY IF EXISTS "goals_update" ON goals;
DROP POLICY IF EXISTS "goals_delete" ON goals;

CREATE POLICY "goals_select" ON goals
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "goals_insert" ON goals
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "goals_update" ON goals
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "goals_delete" ON goals
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- kanban_columns
DROP POLICY IF EXISTS "kanban_columns_select" ON kanban_columns;
DROP POLICY IF EXISTS "kanban_columns_insert" ON kanban_columns;
DROP POLICY IF EXISTS "kanban_columns_update" ON kanban_columns;
DROP POLICY IF EXISTS "kanban_columns_delete" ON kanban_columns;

CREATE POLICY "kanban_columns_select" ON kanban_columns
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "kanban_columns_insert" ON kanban_columns
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "kanban_columns_update" ON kanban_columns
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "kanban_columns_delete" ON kanban_columns
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- memory_entries
DROP POLICY IF EXISTS "memory_entries_select" ON memory_entries;
DROP POLICY IF EXISTS "memory_entries_insert" ON memory_entries;
DROP POLICY IF EXISTS "memory_entries_update" ON memory_entries;
DROP POLICY IF EXISTS "memory_entries_delete" ON memory_entries;

CREATE POLICY "memory_entries_select" ON memory_entries
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "memory_entries_insert" ON memory_entries
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "memory_entries_update" ON memory_entries
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "memory_entries_delete" ON memory_entries
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- activity_feed
DROP POLICY IF EXISTS "activity_feed_select" ON activity_feed;
DROP POLICY IF EXISTS "activity_feed_insert" ON activity_feed;
DROP POLICY IF EXISTS "activity_feed_update" ON activity_feed;
DROP POLICY IF EXISTS "activity_feed_delete" ON activity_feed;

CREATE POLICY "activity_feed_select" ON activity_feed
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "activity_feed_insert" ON activity_feed
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "activity_feed_update" ON activity_feed
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "activity_feed_delete" ON activity_feed
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- agent_sessions
DROP POLICY IF EXISTS "agent_sessions_select" ON agent_sessions;
DROP POLICY IF EXISTS "agent_sessions_insert" ON agent_sessions;
DROP POLICY IF EXISTS "agent_sessions_update" ON agent_sessions;
DROP POLICY IF EXISTS "agent_sessions_delete" ON agent_sessions;

CREATE POLICY "agent_sessions_select" ON agent_sessions
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_sessions_insert" ON agent_sessions
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "agent_sessions_update" ON agent_sessions
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_sessions_delete" ON agent_sessions
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- leads
DROP POLICY IF EXISTS "leads_select" ON leads;
DROP POLICY IF EXISTS "leads_insert" ON leads;
DROP POLICY IF EXISTS "leads_update" ON leads;
DROP POLICY IF EXISTS "leads_delete" ON leads;

CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "leads_update" ON leads
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "leads_delete" ON leads
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- invoices
DROP POLICY IF EXISTS "invoices_select" ON invoices;
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
DROP POLICY IF EXISTS "invoices_update" ON invoices;
DROP POLICY IF EXISTS "invoices_delete" ON invoices;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- proposals
DROP POLICY IF EXISTS "proposals_select" ON proposals;
DROP POLICY IF EXISTS "proposals_insert" ON proposals;
DROP POLICY IF EXISTS "proposals_update" ON proposals;
DROP POLICY IF EXISTS "proposals_delete" ON proposals;

CREATE POLICY "proposals_select" ON proposals
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "proposals_delete" ON proposals
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- entity_relationships
DROP POLICY IF EXISTS "entity_relationships_select" ON entity_relationships;
DROP POLICY IF EXISTS "entity_relationships_insert" ON entity_relationships;
DROP POLICY IF EXISTS "entity_relationships_update" ON entity_relationships;
DROP POLICY IF EXISTS "entity_relationships_delete" ON entity_relationships;

CREATE POLICY "entity_relationships_select" ON entity_relationships
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "entity_relationships_insert" ON entity_relationships
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "entity_relationships_update" ON entity_relationships
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "entity_relationships_delete" ON entity_relationships
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- entity_timeline
DROP POLICY IF EXISTS "entity_timeline_select" ON entity_timeline;
DROP POLICY IF EXISTS "entity_timeline_insert" ON entity_timeline;
DROP POLICY IF EXISTS "entity_timeline_update" ON entity_timeline;
DROP POLICY IF EXISTS "entity_timeline_delete" ON entity_timeline;

CREATE POLICY "entity_timeline_select" ON entity_timeline
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "entity_timeline_insert" ON entity_timeline
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "entity_timeline_update" ON entity_timeline
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "entity_timeline_delete" ON entity_timeline
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- semantic_memories
DROP POLICY IF EXISTS "semantic_memories_select" ON semantic_memories;
DROP POLICY IF EXISTS "semantic_memories_insert" ON semantic_memories;
DROP POLICY IF EXISTS "semantic_memories_update" ON semantic_memories;
DROP POLICY IF EXISTS "semantic_memories_delete" ON semantic_memories;

CREATE POLICY "semantic_memories_select" ON semantic_memories
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "semantic_memories_insert" ON semantic_memories
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "semantic_memories_update" ON semantic_memories
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "semantic_memories_delete" ON semantic_memories
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- agent_configs
DROP POLICY IF EXISTS "agent_configs_select" ON agent_configs;
DROP POLICY IF EXISTS "agent_configs_insert" ON agent_configs;
DROP POLICY IF EXISTS "agent_configs_update" ON agent_configs;
DROP POLICY IF EXISTS "agent_configs_delete" ON agent_configs;

CREATE POLICY "agent_configs_select" ON agent_configs
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_configs_insert" ON agent_configs
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "agent_configs_update" ON agent_configs
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_configs_delete" ON agent_configs
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- agent_runs
DROP POLICY IF EXISTS "agent_runs_select" ON agent_runs;
DROP POLICY IF EXISTS "agent_runs_insert" ON agent_runs;
DROP POLICY IF EXISTS "agent_runs_update" ON agent_runs;
DROP POLICY IF EXISTS "agent_runs_delete" ON agent_runs;

CREATE POLICY "agent_runs_select" ON agent_runs
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_runs_insert" ON agent_runs
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "agent_runs_update" ON agent_runs
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "agent_runs_delete" ON agent_runs
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- approval_queue
DROP POLICY IF EXISTS "approval_queue_select" ON approval_queue;
DROP POLICY IF EXISTS "approval_queue_insert" ON approval_queue;
DROP POLICY IF EXISTS "approval_queue_update" ON approval_queue;
DROP POLICY IF EXISTS "approval_queue_delete" ON approval_queue;

CREATE POLICY "approval_queue_select" ON approval_queue
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "approval_queue_insert" ON approval_queue
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "approval_queue_update" ON approval_queue
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "approval_queue_delete" ON approval_queue
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- watches
DROP POLICY IF EXISTS "watches_select" ON watches;
DROP POLICY IF EXISTS "watches_insert" ON watches;
DROP POLICY IF EXISTS "watches_update" ON watches;
DROP POLICY IF EXISTS "watches_delete" ON watches;

CREATE POLICY "watches_select" ON watches
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "watches_insert" ON watches
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "watches_update" ON watches
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "watches_delete" ON watches
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- templates
DROP POLICY IF EXISTS "templates_select" ON templates;
DROP POLICY IF EXISTS "templates_insert" ON templates;
DROP POLICY IF EXISTS "templates_update" ON templates;
DROP POLICY IF EXISTS "templates_delete" ON templates;

CREATE POLICY "templates_select" ON templates
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "templates_insert" ON templates
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "templates_update" ON templates
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "templates_delete" ON templates
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- voice_profiles
DROP POLICY IF EXISTS "voice_profiles_select" ON voice_profiles;
DROP POLICY IF EXISTS "voice_profiles_insert" ON voice_profiles;
DROP POLICY IF EXISTS "voice_profiles_update" ON voice_profiles;
DROP POLICY IF EXISTS "voice_profiles_delete" ON voice_profiles;

CREATE POLICY "voice_profiles_select" ON voice_profiles
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "voice_profiles_insert" ON voice_profiles
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "voice_profiles_update" ON voice_profiles
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "voice_profiles_delete" ON voice_profiles
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- channel_connections
DROP POLICY IF EXISTS "channel_connections_select" ON channel_connections;
DROP POLICY IF EXISTS "channel_connections_insert" ON channel_connections;
DROP POLICY IF EXISTS "channel_connections_update" ON channel_connections;
DROP POLICY IF EXISTS "channel_connections_delete" ON channel_connections;

CREATE POLICY "channel_connections_select" ON channel_connections
  FOR SELECT USING (org_id::uuid IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "channel_connections_insert" ON channel_connections
  FOR INSERT WITH CHECK (org_id::uuid = get_user_active_org_id());

CREATE POLICY "channel_connections_update" ON channel_connections
  FOR UPDATE
  USING (org_id::uuid IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id::uuid IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "channel_connections_delete" ON channel_connections
  FOR DELETE USING (org_id::uuid IN (SELECT get_user_accessible_org_ids()));

-- channel_messages
DROP POLICY IF EXISTS "channel_messages_select" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_insert" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_update" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_delete" ON channel_messages;

CREATE POLICY "channel_messages_select" ON channel_messages
  FOR SELECT USING (org_id::uuid IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "channel_messages_insert" ON channel_messages
  FOR INSERT WITH CHECK (org_id::uuid = get_user_active_org_id());

CREATE POLICY "channel_messages_update" ON channel_messages
  FOR UPDATE
  USING (org_id::uuid IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id::uuid IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "channel_messages_delete" ON channel_messages
  FOR DELETE USING (org_id::uuid IN (SELECT get_user_accessible_org_ids()));

-- channel_configs
DROP POLICY IF EXISTS "channel_configs_select" ON channel_configs;
DROP POLICY IF EXISTS "channel_configs_insert" ON channel_configs;
DROP POLICY IF EXISTS "channel_configs_update" ON channel_configs;
DROP POLICY IF EXISTS "channel_configs_delete" ON channel_configs;

CREATE POLICY "channel_configs_select" ON channel_configs
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "channel_configs_insert" ON channel_configs
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "channel_configs_update" ON channel_configs
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "channel_configs_delete" ON channel_configs
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- offer_packages
DROP POLICY IF EXISTS "offer_packages_select" ON offer_packages;
DROP POLICY IF EXISTS "offer_packages_insert" ON offer_packages;
DROP POLICY IF EXISTS "offer_packages_update" ON offer_packages;
DROP POLICY IF EXISTS "offer_packages_delete" ON offer_packages;

CREATE POLICY "offer_packages_select" ON offer_packages
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "offer_packages_insert" ON offer_packages
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "offer_packages_update" ON offer_packages
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "offer_packages_delete" ON offer_packages
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- tenders
DROP POLICY IF EXISTS "tenders_select" ON tenders;
DROP POLICY IF EXISTS "tenders_insert" ON tenders;
DROP POLICY IF EXISTS "tenders_update" ON tenders;
DROP POLICY IF EXISTS "tenders_delete" ON tenders;

CREATE POLICY "tenders_select" ON tenders
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "tenders_insert" ON tenders
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "tenders_update" ON tenders
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "tenders_delete" ON tenders
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- tender_responses
DROP POLICY IF EXISTS "tender_responses_select" ON tender_responses;
DROP POLICY IF EXISTS "tender_responses_insert" ON tender_responses;
DROP POLICY IF EXISTS "tender_responses_update" ON tender_responses;
DROP POLICY IF EXISTS "tender_responses_delete" ON tender_responses;

CREATE POLICY "tender_responses_select" ON tender_responses
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "tender_responses_insert" ON tender_responses
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "tender_responses_update" ON tender_responses
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "tender_responses_delete" ON tender_responses
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- audit_log
DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
DROP POLICY IF EXISTS "audit_log_update" ON audit_log;
DROP POLICY IF EXISTS "audit_log_delete" ON audit_log;

CREATE POLICY "audit_log_select" ON audit_log
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "audit_log_update" ON audit_log
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "audit_log_delete" ON audit_log
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- dead_letter_queue
DROP POLICY IF EXISTS "dead_letter_queue_select" ON dead_letter_queue;
DROP POLICY IF EXISTS "dead_letter_queue_insert" ON dead_letter_queue;
DROP POLICY IF EXISTS "dead_letter_queue_update" ON dead_letter_queue;
DROP POLICY IF EXISTS "dead_letter_queue_delete" ON dead_letter_queue;

CREATE POLICY "dead_letter_queue_select" ON dead_letter_queue
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "dead_letter_queue_insert" ON dead_letter_queue
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "dead_letter_queue_update" ON dead_letter_queue
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "dead_letter_queue_delete" ON dead_letter_queue
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- user_integrations
DROP POLICY IF EXISTS "user_integrations_select" ON user_integrations;
DROP POLICY IF EXISTS "user_integrations_insert" ON user_integrations;
DROP POLICY IF EXISTS "user_integrations_update" ON user_integrations;
DROP POLICY IF EXISTS "user_integrations_delete" ON user_integrations;

CREATE POLICY "user_integrations_select" ON user_integrations
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "user_integrations_insert" ON user_integrations
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "user_integrations_update" ON user_integrations
  FOR UPDATE
  USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "user_integrations_delete" ON user_integrations
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- org_integrations (deferred to 056 where table is created)
-- DO $$ BEGIN
-- IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'org_integrations' AND table_schema = 'public') THEN
-- DROP POLICY IF EXISTS "org_integrations_insert" ON org_integrations;
-- DROP POLICY IF EXISTS "org_integrations_update" ON org_integrations;
-- DROP POLICY IF EXISTS "org_integrations_delete" ON org_integrations;

-- CREATE POLICY "org_integrations_select" ON org_integrations
--   FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- CREATE POLICY "org_integrations_insert" ON org_integrations
--   FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

-- CREATE POLICY "org_integrations_update" ON org_integrations
--   FOR UPDATE
--   USING (org_id IN (SELECT get_user_accessible_org_ids()))
--   WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

-- CREATE POLICY "org_integrations_delete" ON org_integrations
--   FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- END IF; END $$;

-- =============================================================================
-- LEGACY POLICY CLEANUP (NON-STANDARD NAMES)
-- =============================================================================

DROP POLICY IF EXISTS "channel_connections_all" ON channel_connections;
DROP POLICY IF EXISTS "channel_messages_all" ON channel_messages;
DROP POLICY IF EXISTS "audit_log_org_isolation" ON audit_log;
DROP POLICY IF EXISTS "Users can view own org dead letters" ON dead_letter_queue;
-- DROP POLICY IF EXISTS "org_members_manage_integrations" ON org_integrations;
DROP POLICY IF EXISTS "Users can see own org members" ON org_members;
DROP POLICY IF EXISTS "Admins can manage members" ON org_members;
DROP POLICY IF EXISTS "org_admins_manage_invitations" ON invitations;
DROP POLICY IF EXISTS "users_view_own_invitations" ON invitations;

-- =============================================================================
-- ORG_MEMBERS (SPECIAL)
-- =============================================================================

DROP POLICY IF EXISTS "org_members_select" ON org_members;
DROP POLICY IF EXISTS "org_members_insert" ON org_members;
DROP POLICY IF EXISTS "org_members_update" ON org_members;
DROP POLICY IF EXISTS "org_members_delete" ON org_members;

CREATE POLICY "org_members_select" ON org_members
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "org_members_insert" ON org_members
  FOR INSERT
  WITH CHECK (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members_update" ON org_members
  FOR UPDATE
  USING (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members_delete" ON org_members
  FOR DELETE
  USING (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- INVITATIONS (SPECIAL)
-- =============================================================================

DROP POLICY IF EXISTS "invitations_select" ON invitations;
DROP POLICY IF EXISTS "invitations_insert" ON invitations;
DROP POLICY IF EXISTS "invitations_update" ON invitations;
DROP POLICY IF EXISTS "invitations_delete" ON invitations;

CREATE POLICY "invitations_select" ON invitations
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT
  WITH CHECK (
    org_id = get_user_active_org_id()
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = invitations.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE
  USING (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = invitations.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = invitations.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "invitations_delete" ON invitations
  FOR DELETE
  USING (
    org_id IN (SELECT get_user_accessible_org_ids())
    AND EXISTS (
      SELECT 1
      FROM org_members om
      WHERE om.org_id = invitations.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- OPTIONAL TABLES (ONLY IF PRESENT)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'notification_preferences'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "notification_preferences_select" ON notification_preferences';
    EXECUTE 'DROP POLICY IF EXISTS "notification_preferences_insert" ON notification_preferences';
    EXECUTE 'DROP POLICY IF EXISTS "notification_preferences_update" ON notification_preferences';
    EXECUTE 'DROP POLICY IF EXISTS "notification_preferences_delete" ON notification_preferences';

    EXECUTE 'CREATE POLICY "notification_preferences_select" ON notification_preferences FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "notification_preferences_insert" ON notification_preferences FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "notification_preferences_update" ON notification_preferences FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "notification_preferences_delete" ON notification_preferences FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ui_profile'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "ui_profile_select" ON ui_profile';
    EXECUTE 'DROP POLICY IF EXISTS "ui_profile_insert" ON ui_profile';
    EXECUTE 'DROP POLICY IF EXISTS "ui_profile_update" ON ui_profile';
    EXECUTE 'DROP POLICY IF EXISTS "ui_profile_delete" ON ui_profile';

    EXECUTE 'CREATE POLICY "ui_profile_select" ON ui_profile FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "ui_profile_insert" ON ui_profile FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "ui_profile_update" ON ui_profile FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "ui_profile_delete" ON ui_profile FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'org_policies'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "org_policies_select" ON org_policies';
    EXECUTE 'DROP POLICY IF EXISTS "org_policies_insert" ON org_policies';
    EXECUTE 'DROP POLICY IF EXISTS "org_policies_update" ON org_policies';
    EXECUTE 'DROP POLICY IF EXISTS "org_policies_delete" ON org_policies';

    EXECUTE 'CREATE POLICY "org_policies_select" ON org_policies FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "org_policies_insert" ON org_policies FOR INSERT WITH CHECK (org_id = get_user_active_org_id())';
    EXECUTE 'CREATE POLICY "org_policies_update" ON org_policies FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids())) WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()))';
    EXECUTE 'CREATE POLICY "org_policies_delete" ON org_policies FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()))';
  END IF;
END;
$$;
