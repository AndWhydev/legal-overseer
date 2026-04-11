-- Embedding Job Queue Table
-- Purpose: Decouple message embedding from the relay daemon
-- Workers poll this table and process jobs asynchronously

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  error TEXT DEFAULT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,

  -- Composite index for efficient polling
  UNIQUE(org_id, message_id)
);

-- Indexes for job polling and monitoring
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status_created ON embedding_jobs(status, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_org_status ON embedding_jobs(org_id, status);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_org_created ON embedding_jobs(org_id, created_at);

-- Row-level security
ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their org's embedding jobs
CREATE POLICY "Users can view their org's embedding jobs" ON embedding_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = embedding_jobs.org_id
      AND organizations.id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- Service role can manage all embedding jobs
CREATE POLICY "Service role can manage embedding jobs" ON embedding_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
