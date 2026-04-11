-- 071_create_org_integrations.sql
-- Re-create org_integrations table (026 failed due to FK referencing 'organizations' before it existed)
-- Uses 'organisations' (British spelling) which is the actual base table name

CREATE TABLE IF NOT EXISTS org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON org_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_provider ON org_integrations(org_id, provider);
CREATE INDEX IF NOT EXISTS idx_org_integrations_status ON org_integrations(org_id, status);

-- updated_at trigger (reuse existing function)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_org_integrations_updated_at'
  ) THEN
    CREATE TRIGGER trg_org_integrations_updated_at
      BEFORE UPDATE ON org_integrations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

-- Service role full access (cron jobs, relay daemon)
CREATE POLICY "org_integrations_service_role" ON org_integrations
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Org members can manage their own integrations
CREATE POLICY "org_members_manage_integrations" ON org_integrations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );
