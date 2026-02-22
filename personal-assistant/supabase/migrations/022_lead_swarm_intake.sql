-- 022_lead_swarm_intake.sql
-- Lead Swarm intake metadata on leads for classification, scoring, and acknowledgements.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source_message_id uuid REFERENCES channel_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_label text,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS timeline_days integer,
  ADD COLUMN IF NOT EXISTS ack_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ack_draft_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_source_message
  ON leads (org_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_org_status_ack_status
  ON leads (org_id, status, ack_status);

CREATE INDEX IF NOT EXISTS idx_leads_org_ack_status_created
  ON leads (org_id, ack_status, created_at DESC);
