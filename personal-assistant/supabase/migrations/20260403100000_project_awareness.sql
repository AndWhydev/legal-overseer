-- Project Awareness: add phases, blockers, and next_action to projects table
-- This extends the basic projects table (created in 056_missing_tables_phase2.sql)
-- to support structured project state tracking.

-- Add columns for project state machine
ALTER TABLE projects ADD COLUMN IF NOT EXISTS phases jsonb DEFAULT '[]';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_phase text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS blockers jsonb DEFAULT '[]';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_action_due timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_invoiced numeric DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

-- Index for active project lookups
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects (org_id, status) WHERE status IN ('active', 'blocked');
CREATE INDEX IF NOT EXISTS idx_projects_next_action ON projects (next_action_due) WHERE next_action_due IS NOT NULL;

COMMENT ON COLUMN projects.phases IS 'Array of {id, title, status, description} objects tracking project phases';
COMMENT ON COLUMN projects.blockers IS 'Array of {description, since, severity} objects tracking what is blocking progress';
COMMENT ON COLUMN projects.next_action IS 'Human-readable next step for this project';
COMMENT ON COLUMN projects.next_action_due IS 'When the next action should be completed by';
