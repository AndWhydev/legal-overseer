-- 140_swarm_tables.sql
-- Agent Swarm: multi-agent orchestration system.
-- Tables: swarm_definitions, swarm_templates, swarm_runs, swarm_steps, swarm_messages

-- ---------------------------------------------------------------------------
-- Swarm Definitions — reusable DAG blueprints
-- ---------------------------------------------------------------------------
CREATE TABLE swarm_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- The DAG: agents, steps, edges, input/output contracts
  dag JSONB NOT NULL DEFAULT '{}',
  -- Input schema: what params this swarm expects
  input_schema JSONB NOT NULL DEFAULT '{}',
  -- Output schema: what the swarm produces
  output_schema JSONB NOT NULL DEFAULT '{}',
  -- Which template this was created from (null if custom)
  template_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Swarm Templates — org-agnostic reusable patterns
-- ---------------------------------------------------------------------------
CREATE TABLE swarm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  -- Template DAG (same shape as swarm_definitions.dag)
  dag JSONB NOT NULL DEFAULT '{}',
  -- What params the template expects (filled at instantiation)
  param_schema JSONB NOT NULL DEFAULT '{}',
  -- NL trigger patterns for matching user intent
  trigger_patterns TEXT[] NOT NULL DEFAULT '{}',
  -- Built-in vs user-created
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  -- Optional: org_id for org-specific templates (null = global)
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Swarm Runs — execution instances of a swarm definition
-- ---------------------------------------------------------------------------
CREATE TABLE swarm_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  definition_id UUID REFERENCES swarm_definitions(id) ON DELETE SET NULL,
  template_id UUID REFERENCES swarm_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','paused','completed','failed','cancelled','rolling_back')),
  -- Filled input params
  input_params JSONB NOT NULL DEFAULT '{}',
  -- Aggregated output from all steps
  output JSONB NOT NULL DEFAULT '{}',
  -- The DAG snapshot at execution time (immutable copy from definition)
  dag_snapshot JSONB NOT NULL DEFAULT '{}',
  -- Cost tracking
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  total_tokens_in INTEGER NOT NULL DEFAULT 0,
  total_tokens_out INTEGER NOT NULL DEFAULT 0,
  -- Trigger info
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  trigger_input TEXT,
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Swarm Steps — individual step executions within a swarm run
-- ---------------------------------------------------------------------------
CREATE TABLE swarm_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,  -- matches the step_id in the DAG
  step_type TEXT NOT NULL DEFAULT 'sequential'
    CHECK (step_type IN ('parallel','sequential','conditional')),
  agent_type TEXT NOT NULL,  -- which agent/role handles this step
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','skipped','rolled_back')),
  -- Step input (from upstream steps or swarm params)
  input JSONB NOT NULL DEFAULT '{}',
  -- Step output (findings, results)
  output JSONB NOT NULL DEFAULT '{}',
  -- For conditional steps: the condition expression
  condition JSONB,
  -- Rollback action if this step needs to be undone
  rollback_action JSONB,
  -- Cost tracking per step
  cost_cents INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  -- Error info
  error TEXT,
  -- Ordering within the DAG
  execution_order INTEGER NOT NULL DEFAULT 0,
  -- Dependencies: step_ids that must complete before this step
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Swarm Messages — inter-agent communication within a swarm run
-- ---------------------------------------------------------------------------
CREATE TABLE swarm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_step_id TEXT NOT NULL,
  to_step_id TEXT,  -- null = broadcast to all
  message_type TEXT NOT NULL DEFAULT 'finding'
    CHECK (message_type IN ('finding','request','response','conflict','resolution','status')),
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------
ALTER TABLE swarm_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_messages ENABLE ROW LEVEL SECURITY;

-- Org-scoped access
CREATE POLICY swarm_definitions_org ON swarm_definitions
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY swarm_templates_org ON swarm_templates
  FOR ALL USING (
    org_id IS NULL  -- global templates visible to all
    OR org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY swarm_runs_org ON swarm_runs
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY swarm_steps_org ON swarm_steps
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY swarm_messages_org ON swarm_messages
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- Service role bypass for workers/crons
CREATE POLICY swarm_definitions_service ON swarm_definitions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY swarm_templates_service ON swarm_templates
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY swarm_runs_service ON swarm_runs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY swarm_steps_service ON swarm_steps
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY swarm_messages_service ON swarm_messages
  FOR ALL USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_swarm_definitions_org ON swarm_definitions(org_id);
CREATE INDEX idx_swarm_templates_slug ON swarm_templates(slug);
CREATE INDEX idx_swarm_templates_category ON swarm_templates(category);
CREATE INDEX idx_swarm_runs_org_status ON swarm_runs(org_id, status);
CREATE INDEX idx_swarm_runs_org_created ON swarm_runs(org_id, created_at DESC);
CREATE INDEX idx_swarm_steps_run ON swarm_steps(swarm_run_id);
CREATE INDEX idx_swarm_steps_status ON swarm_steps(swarm_run_id, status);
CREATE INDEX idx_swarm_messages_run ON swarm_messages(swarm_run_id);
CREATE INDEX idx_swarm_messages_run_type ON swarm_messages(swarm_run_id, message_type);

-- ---------------------------------------------------------------------------
-- Updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_swarm_definitions_updated_at
  BEFORE UPDATE ON swarm_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_swarm_templates_updated_at
  BEFORE UPDATE ON swarm_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_swarm_runs_updated_at
  BEFORE UPDATE ON swarm_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- NOTIFY trigger for real-time message bus
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_swarm_message()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'swarm_message',
    json_build_object(
      'id', NEW.id,
      'swarm_run_id', NEW.swarm_run_id,
      'from_step_id', NEW.from_step_id,
      'to_step_id', NEW.to_step_id,
      'message_type', NEW.message_type
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_swarm_message_notify
  AFTER INSERT ON swarm_messages
  FOR EACH ROW EXECUTE FUNCTION notify_swarm_message();

-- Also notify on swarm step status changes
CREATE OR REPLACE FUNCTION notify_swarm_step_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'swarm_step_change',
      json_build_object(
        'id', NEW.id,
        'swarm_run_id', NEW.swarm_run_id,
        'step_id', NEW.step_id,
        'status', NEW.status,
        'agent_type', NEW.agent_type
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_swarm_step_notify
  AFTER UPDATE ON swarm_steps
  FOR EACH ROW EXECUTE FUNCTION notify_swarm_step_change();
