-- 009_agent_runs.sql
-- Agent execution logging table.
-- Append-only log of every agent run for cost tracking and debugging.

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  agent_config_id uuid REFERENCES agent_configs ON DELETE CASCADE NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled', 'webhook', 'manual', 'watch')),
  input_summary text NOT NULL DEFAULT '',
  output_summary text NOT NULL DEFAULT '',
  actions_taken jsonb DEFAULT '[]',
  tools_called text[] DEFAULT '{}',
  model_used text NOT NULL DEFAULT 'sonnet' CHECK (model_used IN ('haiku', 'sonnet', 'opus')),
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  confidence_score float NOT NULL DEFAULT 0.0,
  routing_decision text NOT NULL DEFAULT 'escalate' CHECK (routing_decision IN ('act', 'ask', 'escalate')),
  duration_ms integer NOT NULL DEFAULT 0,
  error text,
  approved_by uuid REFERENCES auth.users ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_runs_config ON agent_runs (agent_config_id, created_at DESC);
CREATE INDEX idx_agent_runs_org ON agent_runs (org_id, created_at DESC);
CREATE INDEX idx_agent_runs_routing ON agent_runs (org_id, routing_decision) WHERE routing_decision = 'ask';
