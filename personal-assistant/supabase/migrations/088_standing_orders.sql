-- Standing Orders: persistent directives that apply across all conversations and agent actions
CREATE TABLE IF NOT EXISTS standing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  directive text NOT NULL,           -- "Always flag Steve's emails as high priority"
  category text NOT NULL CHECK (category IN ('triage', 'communication', 'financial', 'scheduling', 'general')),
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 0,   -- higher = more important
  conditions jsonb DEFAULT '{}',     -- optional: {"contact_name": "Steve", "channel": "email"}
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_standing_orders_org ON standing_orders (org_id, is_active, priority DESC);

ALTER TABLE standing_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY standing_orders_org_access ON standing_orders FOR ALL USING (
  org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
);
