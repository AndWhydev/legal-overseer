-- 093_approval_queue_role_columns.sql
-- Add role engine columns to approval_queue for role-generated approvals.
-- Links approvals to the role that generated them and records the autonomy mode.

ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS role_config_id UUID REFERENCES role_configs(id);
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS autonomy_mode TEXT;

-- Index for querying approvals by role
CREATE INDEX IF NOT EXISTS idx_approval_queue_role_config ON approval_queue(role_config_id) WHERE role_config_id IS NOT NULL;
