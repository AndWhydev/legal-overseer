-- 044_normalize_jsonb_columns.sql
-- Normalize JSONB arrays into proper relational tables.

-- =============================================================================
-- CONTACT_EMAILS
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_emails (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email      text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_emails_contact
  ON contact_emails (contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_emails_email
  ON contact_emails (email);

ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_emails_org_isolation"
  ON contact_emails
  FOR ALL
  USING (
    contact_id IN (
      SELECT id FROM contacts
      WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );

-- =============================================================================
-- INVOICE_LINE_ITEMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity   numeric(12,4) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total      numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
  ON invoice_line_items (invoice_id);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_line_items_org_isolation"
  ON invoice_line_items
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );

-- =============================================================================
-- AGENT_RUN_TOOLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_run_tools (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name    text NOT NULL,
  input        jsonb DEFAULT '{}'::jsonb,
  output       jsonb DEFAULT '{}'::jsonb,
  success      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_tools_run
  ON agent_run_tools (agent_run_id);

CREATE INDEX IF NOT EXISTS idx_agent_run_tools_name
  ON agent_run_tools (tool_name);

ALTER TABLE agent_run_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_run_tools_org_isolation"
  ON agent_run_tools
  FOR ALL
  USING (
    agent_run_id IN (
      SELECT id FROM agent_runs
      WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );
