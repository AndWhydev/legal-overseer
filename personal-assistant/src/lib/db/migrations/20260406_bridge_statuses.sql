-- Add 'provisioning' and 'suspended' to org_connections status check
ALTER TABLE org_connections DROP CONSTRAINT IF EXISTS org_connections_status_check;
ALTER TABLE org_connections ADD CONSTRAINT org_connections_status_check
  CHECK (status IN ('pending', 'provisioning', 'connected', 'suspended', 'error', 'disabled'));
