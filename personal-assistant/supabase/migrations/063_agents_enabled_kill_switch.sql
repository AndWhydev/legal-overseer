-- Kill switch: allow orgs to disable all agent execution
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS agents_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN organizations.agents_enabled IS 'Master kill switch for agent execution. When false, no agents run for this org.';
