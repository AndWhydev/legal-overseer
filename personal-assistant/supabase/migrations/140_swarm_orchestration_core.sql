-- ============================================================================
-- Migration 140: Swarm Orchestration Core Schema
-- Multi-agent swarm coordination tables with RLS
-- ============================================================================

-- ── Swarm Templates ─────────────────────────────────────────────────────────
-- Reusable swarm definitions with DAG structure, agent personas, and governance

CREATE TABLE IF NOT EXISTS swarm_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,                    -- e.g. "Pitch Prep", "Client Onboarding"
  slug        text NOT NULL,                    -- URL-safe identifier
  description text,
  category    text NOT NULL DEFAULT 'custom',   -- pitch, onboarding, finance, operations, custom
  trigger_patterns text[] DEFAULT '{}',         -- NL patterns that match this template

  -- DAG definition: steps with dependencies, agent assignments, I/O contracts
  definition  jsonb NOT NULL DEFAULT '{}',

  -- Governance: which steps need approval, escalation paths
  governance  jsonb NOT NULL DEFAULT '{}',

  -- Composability: sub-swarm references
  parent_template_id uuid REFERENCES swarm_templates(id) ON DELETE SET NULL,

  -- Learning metrics
  total_runs      int NOT NULL DEFAULT 0,
  success_runs    int NOT NULL DEFAULT 0,
  avg_duration_ms int,
  avg_cost        numeric(10,4),
  success_rate    numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_runs > 0 THEN (success_runs::numeric / total_runs * 100) ELSE 0 END
  ) STORED,

  is_builtin  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, slug)
);

CREATE INDEX idx_swarm_templates_org ON swarm_templates(org_id) WHERE is_active = true;
CREATE INDEX idx_swarm_templates_category ON swarm_templates(org_id, category);

-- RLS
ALTER TABLE swarm_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY swarm_templates_org_read ON swarm_templates
  FOR SELECT USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_templates_org_write ON swarm_templates
  FOR ALL USING (org_id = (current_setting('app.org_id', true))::uuid);

-- Service role bypass
CREATE POLICY swarm_templates_service ON swarm_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Swarm Runs ──────────────────────────────────────────────────────────────
-- Execution instances of swarm templates

CREATE TYPE swarm_run_status AS ENUM (
  'pending',      -- created but not started
  'planning',     -- coordinator analyzing and filling parameters
  'executing',    -- steps are being executed
  'negotiating',  -- agents are negotiating/resolving conflicts
  'completed',    -- all steps finished successfully
  'partial',      -- some steps succeeded, some failed
  'failed',       -- critical step failed, swarm aborted
  'rolled_back',  -- swarm was rolled back
  'cancelled'     -- manually cancelled
);

CREATE TABLE IF NOT EXISTS swarm_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES swarm_templates(id) ON DELETE SET NULL,
  template_slug   text,                           -- snapshot in case template is deleted

  -- Trigger context
  trigger_type    text NOT NULL DEFAULT 'chat',   -- chat, api, cron, sub-swarm
  trigger_input   text NOT NULL,                  -- original NL command or API input
  trigger_params  jsonb NOT NULL DEFAULT '{}',    -- extracted parameters (client name, etc.)

  -- Parent swarm (for sub-swarm composition)
  parent_run_id   uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  parent_step_id  uuid,                           -- step in parent that spawned this

  status          swarm_run_status NOT NULL DEFAULT 'pending',

  -- Execution tracking
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     int,

  -- Cost tracking (aggregated from steps)
  total_cost      numeric(10,4) NOT NULL DEFAULT 0,
  total_tokens_in  int NOT NULL DEFAULT 0,
  total_tokens_out int NOT NULL DEFAULT 0,

  -- Results
  result_summary  text,
  result_data     jsonb,
  error_message   text,

  -- Rollback state
  rollback_log    jsonb,                          -- ordered list of reversible actions
  rolled_back_at  timestamptz,

  -- Advisory lock key for preventing duplicate execution
  lock_key        bigint GENERATED ALWAYS AS (
    ('x' || left(replace(id::text, '-', ''), 15))::bit(60)::bigint
  ) STORED,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_swarm_runs_org ON swarm_runs(org_id);
CREATE INDEX idx_swarm_runs_status ON swarm_runs(org_id, status);
CREATE INDEX idx_swarm_runs_template ON swarm_runs(template_id);
CREATE INDEX idx_swarm_runs_parent ON swarm_runs(parent_run_id) WHERE parent_run_id IS NOT NULL;
CREATE INDEX idx_swarm_runs_created ON swarm_runs(org_id, created_at DESC);

-- RLS
ALTER TABLE swarm_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY swarm_runs_org_read ON swarm_runs
  FOR SELECT USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_runs_org_write ON swarm_runs
  FOR ALL USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_runs_service ON swarm_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Swarm Steps ─────────────────────────────────────────────────────────────
-- Individual step execution within a swarm run

CREATE TYPE swarm_step_status AS ENUM (
  'pending',        -- waiting for dependencies
  'ready',          -- dependencies met, ready to execute
  'executing',      -- currently running
  'completed',      -- finished successfully
  'failed',         -- execution failed
  'skipped',        -- conditional step skipped
  'negotiating',    -- agent pushed back, awaiting resolution
  'rolled_back',    -- step was rolled back
  'blocked'         -- blocked by failed dependency
);

CREATE TABLE IF NOT EXISTS swarm_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Step definition (from template)
  step_key        text NOT NULL,                  -- unique key within the swarm (e.g. "gather_history")
  step_type       text NOT NULL DEFAULT 'agent',  -- agent, parallel_group, conditional, sub_swarm
  agent_role      text,                           -- which agent role executes this (finance, sales, comms)

  -- Agent persona for this step
  persona         jsonb,                          -- { style, risk_tolerance, priority_weight }

  -- Capability boundaries (tool groups this step can use)
  allowed_tools   text[],                         -- subset of tool groups allowed

  -- Execution
  prompt          text,                           -- the instruction for the agent
  input_data      jsonb NOT NULL DEFAULT '{}',    -- input from dependencies
  output_data     jsonb,                          -- step result

  -- Dependencies (step_keys this depends on)
  depends_on      text[] NOT NULL DEFAULT '{}',

  -- Conditional execution
  condition       jsonb,                          -- predicate to evaluate (for conditional steps)

  status          swarm_step_status NOT NULL DEFAULT 'pending',

  -- Tracking
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     int,
  cost_estimate   numeric(10,4) NOT NULL DEFAULT 0,
  tokens_in       int NOT NULL DEFAULT 0,
  tokens_out      int NOT NULL DEFAULT 0,
  model_used      text,

  -- Agent run reference (links to existing agent_runs table)
  agent_run_id    uuid,

  -- Rollback info
  reversible_actions jsonb,                       -- list of actions that can be undone

  -- Negotiation
  negotiation     jsonb,                          -- counter-proposal if agent pushed back

  error_message   text,
  retry_count     int NOT NULL DEFAULT 0,
  max_retries     int NOT NULL DEFAULT 2,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(run_id, step_key)
);

CREATE INDEX idx_swarm_steps_run ON swarm_steps(run_id);
CREATE INDEX idx_swarm_steps_status ON swarm_steps(run_id, status);
CREATE INDEX idx_swarm_steps_org ON swarm_steps(org_id);

-- RLS
ALTER TABLE swarm_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY swarm_steps_org_read ON swarm_steps
  FOR SELECT USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_steps_org_write ON swarm_steps
  FOR ALL USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_steps_service ON swarm_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Swarm Messages ──────────────────────────────────────────────────────────
-- Inter-agent message bus for finding sharing, warnings, and handoffs

CREATE TYPE swarm_message_type AS ENUM (
  'finding',      -- discovered information to share
  'warning',      -- something downstream agents should know
  'blocker',      -- stops downstream execution until resolved
  'handoff',      -- passing control/context to next agent
  'completion',   -- step finished notification
  'negotiation',  -- counter-proposal or pushback
  'status'        -- progress update
);

CREATE TABLE IF NOT EXISTS swarm_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  from_step_key   text NOT NULL,                  -- which step sent this
  to_step_key     text,                           -- target step (null = broadcast to all)

  message_type    swarm_message_type NOT NULL,
  content         text NOT NULL,                  -- human-readable message
  data            jsonb,                          -- structured data payload

  -- For blocker type: has it been resolved?
  resolved        boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_by     text,                           -- step_key that resolved it

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_swarm_messages_run ON swarm_messages(run_id);
CREATE INDEX idx_swarm_messages_target ON swarm_messages(run_id, to_step_key);
CREATE INDEX idx_swarm_messages_type ON swarm_messages(run_id, message_type);

-- RLS
ALTER TABLE swarm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY swarm_messages_org_read ON swarm_messages
  FOR SELECT USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_messages_org_write ON swarm_messages
  FOR ALL USING (org_id = (current_setting('app.org_id', true))::uuid);

CREATE POLICY swarm_messages_service ON swarm_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── NOTIFY trigger for real-time message bus ────────────────────────────────

CREATE OR REPLACE FUNCTION notify_swarm_message()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'swarm_messages',
    json_build_object(
      'id', NEW.id,
      'run_id', NEW.run_id,
      'from_step_key', NEW.from_step_key,
      'to_step_key', NEW.to_step_key,
      'message_type', NEW.message_type,
      'content', NEW.content
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_swarm_message_notify
  AFTER INSERT ON swarm_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_swarm_message();


-- ── Updated_at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_swarm_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_swarm_templates_updated
  BEFORE UPDATE ON swarm_templates
  FOR EACH ROW EXECUTE FUNCTION update_swarm_updated_at();

CREATE TRIGGER trg_swarm_runs_updated
  BEFORE UPDATE ON swarm_runs
  FOR EACH ROW EXECUTE FUNCTION update_swarm_updated_at();

CREATE TRIGGER trg_swarm_steps_updated
  BEFORE UPDATE ON swarm_steps
  FOR EACH ROW EXECUTE FUNCTION update_swarm_updated_at();
