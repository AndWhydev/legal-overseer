-- ============================================================================
-- Phase 44-01: Knowledge WAL + Dossier Foundation Tables
-- Creates knowledge_log (write-ahead log), entity_dossiers (pre-compiled
-- per-entity brain state), and domain_profiles (cross-entity rollups)
-- for the Living Brain architecture.
-- ============================================================================

-- ============================================================================
-- KNOWLEDGE_LOG (append-only WAL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_ids UUID[] DEFAULT '{}',
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'message', 'invoice', 'calendar', 'pattern', 'correction',
    'decision', 'relationship', 'pricing', 'fiduciary'
  )),
  content TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  source_memory_id UUID,
  source_thread_id UUID,
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- ENTITY_DOSSIERS (pre-compiled brain state)
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  dossier_markdown TEXT DEFAULT '',
  schema_json JSONB DEFAULT '{}',
  version INT DEFAULT 1,
  last_compiled_at TIMESTAMPTZ DEFAULT now(),
  stale_since TIMESTAMPTZ,
  token_count INT DEFAULT 0,
  facts_incorporated INT DEFAULT 0,
  last_fact_id UUID,
  compilation_model TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (org_id, entity_id)
);

-- ============================================================================
-- DOMAIN_PROFILES (cross-entity rollups)
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN (
    'financial', 'relational', 'operational', 'behavioral'
  )),
  profile_markdown TEXT DEFAULT '',
  constituent_hashes JSONB DEFAULT '{}',
  version INT DEFAULT 1,
  last_compiled_at TIMESTAMPTZ DEFAULT now(),
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (org_id, domain)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- knowledge_log indexes
CREATE INDEX IF NOT EXISTS idx_klog_unconsolidated
  ON knowledge_log (org_id, created_at DESC)
  WHERE consolidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_klog_org_created
  ON knowledge_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_klog_entity_ids
  ON knowledge_log USING GIN (entity_ids);

-- entity_dossiers indexes
CREATE INDEX IF NOT EXISTS idx_dossiers_stale
  ON entity_dossiers (org_id, stale_since)
  WHERE stale_since IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dossiers_org_entity
  ON entity_dossiers (org_id, entity_id);

-- domain_profiles: unique constraint covers the primary query pattern

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE knowledge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_profiles ENABLE ROW LEVEL SECURITY;

-- knowledge_log policies
CREATE POLICY "knowledge_log_select" ON knowledge_log FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "knowledge_log_insert" ON knowledge_log FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "knowledge_log_update" ON knowledge_log FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "knowledge_log_delete" ON knowledge_log FOR DELETE USING (org_id = get_user_org_id());

-- entity_dossiers policies
CREATE POLICY "entity_dossiers_select" ON entity_dossiers FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "entity_dossiers_insert" ON entity_dossiers FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "entity_dossiers_update" ON entity_dossiers FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "entity_dossiers_delete" ON entity_dossiers FOR DELETE USING (org_id = get_user_org_id());

-- domain_profiles policies
CREATE POLICY "domain_profiles_select" ON domain_profiles FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "domain_profiles_insert" ON domain_profiles FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "domain_profiles_update" ON domain_profiles FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "domain_profiles_delete" ON domain_profiles FOR DELETE USING (org_id = get_user_org_id());

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_entity_dossiers_updated_at
  BEFORE UPDATE ON entity_dossiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_domain_profiles_updated_at
  BEFORE UPDATE ON domain_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
