-- Migration 072: Backfill job tracking for RAG historical import
-- Tracks cursor-based, resumable backfill operations per org/channel.

CREATE TABLE IF NOT EXISTS backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'paused')),
  cursor TEXT,
  total_messages INTEGER DEFAULT 0,
  embedded_messages INTEGER DEFAULT 0,
  failed_messages INTEGER DEFAULT 0,
  error_message TEXT,
  backfill_days INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- One active backfill per org/channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_backfill_jobs_active
  ON backfill_jobs (org_id, channel_type)
  WHERE status IN ('pending', 'in_progress');

-- RLS
ALTER TABLE backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY backfill_jobs_org_policy ON backfill_jobs
  FOR ALL USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
  ));
