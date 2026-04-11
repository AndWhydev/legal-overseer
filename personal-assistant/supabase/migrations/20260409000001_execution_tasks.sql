-- Phase 39-01: execution_tasks + execution_steps tables
-- 7-state FSM for durable async task execution with org-scoped RLS

-- execution_tasks: primary task tracking table
CREATE TABLE IF NOT EXISTS execution_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES chat_threads(id) ON DELETE SET NULL,
  task_type text NOT NULL DEFAULT 'standard',
  task_name text NOT NULL,
  task_payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'working', 'paused', 'completed', 'failed', 'cancelled')),
  priority int NOT NULL DEFAULT 1,
  current_step int NOT NULL DEFAULT 0,
  total_steps int,
  progress_pct int NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  progress_message text NOT NULL DEFAULT '',
  result jsonb,
  error_message text,
  error_stack text,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 3,
  retry_policy jsonb NOT NULL DEFAULT '{"strategy": "exponential", "base_delay_ms": 1000, "max_delay_ms": 30000}',
  worker_id text,
  heartbeat_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  partial_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_execution_tasks_org_status ON execution_tasks(org_id, status);
CREATE INDEX idx_execution_tasks_thread ON execution_tasks(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_execution_tasks_heartbeat ON execution_tasks(heartbeat_at) WHERE status IN ('claimed', 'working');
CREATE INDEX idx_execution_tasks_pending ON execution_tasks(priority, created_at) WHERE status = 'pending';

-- RLS
ALTER TABLE execution_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_tasks_org_isolation ON execution_tasks
  FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

-- Auto-update updated_at
CREATE TRIGGER execution_tasks_updated_at
  BEFORE UPDATE ON execution_tasks
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Enable Realtime for live progress
ALTER PUBLICATION supabase_realtime ADD TABLE execution_tasks;

-- execution_steps: per-step execution history
CREATE TABLE IF NOT EXISTS execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES execution_tasks(id) ON DELETE CASCADE,
  step_number int NOT NULL,
  step_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'working', 'completed', 'failed', 'skipped')),
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, step_number)
);

CREATE INDEX idx_execution_steps_task ON execution_steps(task_id, step_number);

ALTER TABLE execution_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_steps_via_task ON execution_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM execution_tasks
      WHERE execution_tasks.id = execution_steps.task_id
        AND execution_tasks.org_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid
    )
  );
