-- 041_channel_configs_rls_credential_audit.sql
-- 1. Create missing channel_configs table with RLS
-- 2. Add 'credential' entity_type to audit_log for credential access tracking

-- =============================================================================
-- 1. CHANNEL_CONFIGS TABLE
-- =============================================================================
-- Referenced by: gmail.ts, outlook.ts, beta-flow.ts, multi-tenant.ts, whatsapp/route.ts
-- Was never created as a migration — code writes to it but table didn't exist.

CREATE TABLE IF NOT EXISTS channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  external_id TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  credentials_encrypted TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_channel_configs_org ON channel_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_channel_configs_org_channel ON channel_configs(org_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_channel_configs_external ON channel_configs(channel_type, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE channel_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_configs_select" ON channel_configs
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "channel_configs_insert" ON channel_configs
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "channel_configs_update" ON channel_configs
  FOR UPDATE USING (org_id = get_user_org_id());

CREATE POLICY "channel_configs_delete" ON channel_configs
  FOR DELETE USING (org_id = get_user_org_id());

CREATE POLICY "channel_configs_service_role" ON channel_configs
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- 2. AUDIT_LOG — allow 'credential' entity_type for credential access tracking
-- =============================================================================

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('invoice','lead','approval','contact','task','message','proposal','tender','watch','credential'));
