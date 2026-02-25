-- 026_org_integrations.sql
-- Organization integrations table for storing connected service credentials

CREATE TABLE IF NOT EXISTS org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credentials_encrypted TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
  connected_at TIMESTAMPTZ,
  connected_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE INDEX idx_org_integrations_org ON org_integrations(org_id);
CREATE INDEX idx_org_integrations_provider ON org_integrations(org_id, provider);
CREATE INDEX idx_org_integrations_status ON org_integrations(org_id, status);

CREATE TRIGGER trg_org_integrations_updated_at
  BEFORE UPDATE ON org_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_integrations" ON org_integrations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "org_integrations_service_role" ON org_integrations
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
