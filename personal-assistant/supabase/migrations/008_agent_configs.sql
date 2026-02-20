-- 008_agent_configs.sql
-- Agent registry and configuration table.
-- Each org has one config row per agent type.

CREATE TABLE agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  agent_type text NOT NULL CHECK (agent_type IN (
    'lead-swarm', 'invoice-flow', 'channel-triage', 'client-comms',
    'proposal-bot', 'ad-script-gen', 'client-onboarding',
    'ai-search-optimizer', 'tender-hunter', 'sentry'
  )),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  policy_rules jsonb DEFAULT '{}',
  channel_access text[] DEFAULT '{}',
  model_tier_override text CHECK (model_tier_override IN ('haiku', 'sonnet', 'opus')),
  confidence_thresholds jsonb DEFAULT '{}',
  notification_config jsonb DEFAULT '{}',
  schedule jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, agent_type)
);

-- Indexes
CREATE INDEX idx_agent_configs_org ON agent_configs (org_id);
CREATE INDEX idx_agent_configs_enabled ON agent_configs (org_id) WHERE enabled = true;

-- Updated_at trigger (reuses function from 001_core_schema.sql)
CREATE TRIGGER trg_agent_configs_updated_at
  BEFORE UPDATE ON agent_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
