-- Workflow Rules: user-defined automation rules with triggers, conditions, and actions
-- Phase 35: Proactive Workflows & Standing Orders

CREATE TABLE workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('event', 'schedule', 'condition')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_rules_org_enabled ON workflow_rules(org_id, enabled);
CREATE INDEX idx_workflow_rules_trigger ON workflow_rules(org_id, trigger_type) WHERE enabled = true;

ALTER TABLE workflow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_rules_org ON workflow_rules
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY workflow_rules_service ON workflow_rules
  FOR ALL USING (auth.role() = 'service_role');

-- Link user-defined rules to their workflow runs
ALTER TABLE role_workflows ADD COLUMN IF NOT EXISTS workflow_rule_id UUID REFERENCES workflow_rules(id);
CREATE INDEX idx_role_workflows_rule ON role_workflows(workflow_rule_id) WHERE workflow_rule_id IS NOT NULL;
