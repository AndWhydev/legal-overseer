-- 017_rls_new_tables.sql
-- Row Level Security policies for all new tables from Phase 2

-- =============================================================================
-- ENABLE RLS ON ALL NEW TABLES
-- =============================================================================

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_packages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SEMANTIC CONTEXT TABLES
-- =============================================================================

-- entity_relationships (full CRUD)
CREATE POLICY "entity_relationships_select" ON entity_relationships
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "entity_relationships_insert" ON entity_relationships
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "entity_relationships_update" ON entity_relationships
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "entity_relationships_delete" ON entity_relationships
  FOR DELETE USING (org_id = get_user_org_id());

-- entity_timeline (append-only: SELECT + INSERT)
CREATE POLICY "entity_timeline_select" ON entity_timeline
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "entity_timeline_insert" ON entity_timeline
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

-- semantic_memories (full CRUD)
CREATE POLICY "semantic_memories_select" ON semantic_memories
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "semantic_memories_insert" ON semantic_memories
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "semantic_memories_update" ON semantic_memories
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "semantic_memories_delete" ON semantic_memories
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- AGENT INFRASTRUCTURE TABLES
-- =============================================================================

-- agent_configs (full CRUD)
CREATE POLICY "agent_configs_select" ON agent_configs
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "agent_configs_insert" ON agent_configs
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "agent_configs_update" ON agent_configs
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "agent_configs_delete" ON agent_configs
  FOR DELETE USING (org_id = get_user_org_id());

-- agent_runs (append-only: SELECT + INSERT)
CREATE POLICY "agent_runs_select" ON agent_runs
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "agent_runs_insert" ON agent_runs
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

-- =============================================================================
-- DOMAIN TABLES
-- =============================================================================

-- leads (full CRUD)
CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "leads_delete" ON leads
  FOR DELETE USING (org_id = get_user_org_id());

-- invoices (full CRUD)
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (org_id = get_user_org_id());

-- watches (full CRUD)
CREATE POLICY "watches_select" ON watches
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "watches_insert" ON watches
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "watches_update" ON watches
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "watches_delete" ON watches
  FOR DELETE USING (org_id = get_user_org_id());

-- =============================================================================
-- COMMUNICATION TABLES
-- =============================================================================

-- voice_profiles (full CRUD)
CREATE POLICY "voice_profiles_select" ON voice_profiles
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "voice_profiles_insert" ON voice_profiles
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "voice_profiles_update" ON voice_profiles
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "voice_profiles_delete" ON voice_profiles
  FOR DELETE USING (org_id = get_user_org_id());

-- templates (full CRUD)
CREATE POLICY "templates_select" ON templates
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "templates_insert" ON templates
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "templates_update" ON templates
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "templates_delete" ON templates
  FOR DELETE USING (org_id = get_user_org_id());

-- proposals (full CRUD)
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "proposals_delete" ON proposals
  FOR DELETE USING (org_id = get_user_org_id());

-- offer_packages (full CRUD)
CREATE POLICY "offer_packages_select" ON offer_packages
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "offer_packages_insert" ON offer_packages
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "offer_packages_update" ON offer_packages
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "offer_packages_delete" ON offer_packages
  FOR DELETE USING (org_id = get_user_org_id());
