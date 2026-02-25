-- 031_performance_indexes.sql
-- Performance indexes for high-frequency query patterns.
-- Only adds indexes that don't already exist.

-- agent_runs(org_id, created_at) -- already exists as idx_agent_runs_org
-- So we add a composite with trigger_type for filtered queries:
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_trigger
  ON agent_runs (org_id, trigger_type, created_at DESC);

-- messages(org_id, channel, created_at) -- idx_channel_messages_channel covers (org_id, channel)
-- Add time-sorted version for recent message queries:
CREATE INDEX IF NOT EXISTS idx_channel_messages_org_channel_time
  ON channel_messages (org_id, channel, created_at DESC);

-- leads(org_id, status, score) -- idx_leads_org_status covers (org_id, status)
-- Add composite with score for qualified lead queries:
CREATE INDEX IF NOT EXISTS idx_leads_org_status_score
  ON leads (org_id, status, score DESC);

-- approvals(org_id, status) -- idx_approval_queue_org_status already exists
-- Add time-sorted for dashboard queries:
CREATE INDEX IF NOT EXISTS idx_approval_queue_org_status_time
  ON approval_queue (org_id, status, created_at DESC);

-- invoices(org_id, status) -- idx_invoices_org_status already exists
-- Add composite with due_date for overdue scanning:
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_due
  ON invoices (org_id, status, due_date)
  WHERE status IN ('draft', 'sent', 'viewed', 'overdue');

-- Notifications read/unread (new table from 028)
CREATE INDEX IF NOT EXISTS idx_notifications_org_unread
  ON notifications (org_id, created_at DESC)
  WHERE NOT read;

-- Onboardings active status (new table from 028)
CREATE INDEX IF NOT EXISTS idx_onboardings_active
  ON onboardings (org_id, status)
  WHERE status NOT IN ('completed', 'stalled');
