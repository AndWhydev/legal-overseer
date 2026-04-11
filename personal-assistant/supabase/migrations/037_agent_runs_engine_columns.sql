-- Add columns to agent_runs for engine integration (run logger v2)
-- These columns support the new engine.ts cost guard + observability pipeline.

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success';
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS result_summary text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS trigger_payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS cost_estimate numeric(10,6) NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS tool_calls integer NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS iterations integer NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS model_used text NOT NULL DEFAULT 'sonnet';

-- Index for cost guard daily spend query
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_created
  ON agent_runs (org_id, created_at DESC);

-- Index for status filtering in activity tab
CREATE INDEX IF NOT EXISTS idx_agent_runs_status
  ON agent_runs (org_id, status);

COMMENT ON COLUMN agent_runs.status IS 'Run outcome: success, error, max_iterations, cost_blocked';
COMMENT ON COLUMN agent_runs.cost_estimate IS 'Estimated USD cost based on token counts and model tier';
COMMENT ON COLUMN agent_runs.tool_calls IS 'Total number of tool invocations in this run';
COMMENT ON COLUMN agent_runs.iterations IS 'Number of LLM request/response cycles';
