-- 092_role_engine_tables.sql
-- Role Engine foundation: configs, state, workflows, activity log, BI cache.
-- Supports the v1.3 Agent Roles & Autonomy Engine milestone.

-- Role type enum
CREATE TYPE role_type AS ENUM ('finance', 'comms', 'sales');

-- Autonomy level enum
CREATE TYPE autonomy_level AS ENUM ('observer', 'copilot', 'autopilot');

-- Role configurations (one per role per org)
CREATE TABLE role_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_type role_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  autonomy_level autonomy_level NOT NULL DEFAULT 'copilot',
  config JSONB NOT NULL DEFAULT '{}',
  tick_interval_seconds INTEGER NOT NULL DEFAULT 300,
  daily_budget_cents INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, role_type)
);

-- Role persistent state (working memory)
CREATE TABLE role_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_config_id UUID NOT NULL REFERENCES role_configs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  last_tick_at TIMESTAMPTZ,
  next_tick_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_config_id)
);

-- Multi-step workflow tracking
CREATE TABLE role_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_config_id UUID NOT NULL REFERENCES role_configs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','completed','failed','cancelled')),
  steps JSONB NOT NULL DEFAULT '[]',
  current_step INTEGER NOT NULL DEFAULT 0,
  context JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_step_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Role activity log (what the role did/found/learned)
CREATE TABLE role_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_config_id UUID NOT NULL REFERENCES role_configs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('insight','action','escalation','learning','error','workflow_step')),
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  confidence REAL,
  autonomy_mode autonomy_level,
  reasoning TEXT,
  reversible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business intelligence cache
CREATE TABLE bi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  UNIQUE(org_id, metric_type)
);

-- RLS
ALTER TABLE role_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE bi_snapshots ENABLE ROW LEVEL SECURITY;

-- Org-scoped access via org_members (matches codebase convention)
CREATE POLICY role_configs_org ON role_configs
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY role_states_org ON role_states
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY role_workflows_org ON role_workflows
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY role_activity_org ON role_activity
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY bi_snapshots_org ON bi_snapshots
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- Service role bypass for cron/workers
CREATE POLICY role_configs_service ON role_configs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY role_states_service ON role_states
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY role_workflows_service ON role_workflows
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY role_activity_service ON role_activity
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY bi_snapshots_service ON bi_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_role_configs_org ON role_configs(org_id);
CREATE INDEX idx_role_states_config ON role_states(role_config_id);
CREATE INDEX idx_role_states_next_tick ON role_states(next_tick_at) WHERE next_tick_at IS NOT NULL;
CREATE INDEX idx_role_workflows_config_status ON role_workflows(role_config_id, status);
CREATE INDEX idx_role_workflows_next_step ON role_workflows(next_step_at) WHERE status = 'active';
CREATE INDEX idx_role_activity_config_created ON role_activity(role_config_id, created_at DESC);
CREATE INDEX idx_role_activity_org_type ON role_activity(org_id, activity_type, created_at DESC);
CREATE INDEX idx_bi_snapshots_org_metric ON bi_snapshots(org_id, metric_type);

-- Updated_at triggers
CREATE TRIGGER trg_role_configs_updated_at
  BEFORE UPDATE ON role_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_role_states_updated_at
  BEFORE UPDATE ON role_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_role_workflows_updated_at
  BEFORE UPDATE ON role_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add role_id column to semantic_memories for role-specific knowledge
ALTER TABLE semantic_memories ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES role_configs(id);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_role ON semantic_memories(role_id) WHERE role_id IS NOT NULL;
