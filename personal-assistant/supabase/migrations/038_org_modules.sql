-- Add enabled_modules column to organizations
-- NULL = use tier defaults defined in application code
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT NULL;

COMMENT ON COLUMN organizations.enabled_modules IS
  'Override list of enabled tab/module IDs. NULL = use tier defaults.';
