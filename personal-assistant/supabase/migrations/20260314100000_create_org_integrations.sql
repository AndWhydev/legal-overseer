-- Create org_integrations table
-- Drop first in case partial creation from 026
DROP TABLE IF EXISTS org_integrations CASCADE;

CREATE TABLE org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  provider TEXT NOT NULL,
  credentials_encrypted TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  connected_by UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON org_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_provider ON org_integrations(org_id, provider);

ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_integrations_service_role" ON org_integrations
  FOR ALL USING (true) WITH CHECK (true);
