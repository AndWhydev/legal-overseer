-- 080_api_keys.sql
-- API key management for partner integrations

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  last_4 text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{"read"}',
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX idx_api_keys_org_created ON api_keys(org_id, created_at DESC);
CREATE INDEX idx_api_keys_org_active ON api_keys(org_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select" ON api_keys
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "api_keys_insert" ON api_keys
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "api_keys_update" ON api_keys
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "api_keys_delete" ON api_keys
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
