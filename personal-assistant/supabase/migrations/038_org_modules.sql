-- Add enabled_modules column to organisations
-- NULL = use tier defaults defined in application code
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT NULL;

COMMENT ON COLUMN organisations.enabled_modules IS
  'Override list of enabled tab/module IDs. NULL = use tier defaults.';
