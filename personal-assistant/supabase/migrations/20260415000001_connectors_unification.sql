-- 20260415000001_connectors_unification.sql
--
-- Connector lifecycle unification — adds columns required by the new
-- ConnectorLifecycle / ConnectorManager abstraction so the same row in
-- org_connections can be managed by any transport (bridge / composio /
-- poll / webhook) through a single code path.
--
-- Additive only. Backfills data already stored in `config` jsonb onto
-- typed columns so indexes + queries don't have to traverse jsonb.

-- 1. New columns on org_connections ------------------------------------------
ALTER TABLE org_connections
  ADD COLUMN IF NOT EXISTS auth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS connected_account_id text,
  ADD COLUMN IF NOT EXISTS trigger_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS last_health_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifecycle_version int NOT NULL DEFAULT 1;

-- 2. Expand status CHECK constraint ------------------------------------------
-- Adds 'auth_expired' (OAuth expiry detected) and 'needs_reauth' (composio
-- account invalid and requires user action). Keeps backwards-compat names.
ALTER TABLE org_connections DROP CONSTRAINT IF EXISTS org_connections_status_check;
ALTER TABLE org_connections ADD CONSTRAINT org_connections_status_check
  CHECK (status IN (
    'pending',
    'provisioning',
    'connected',
    'suspended',
    'error',
    'disabled',
    'auth_expired',
    'needs_reauth'
  ));

-- 3. Backfill connected_account_id from existing config ----------------------
-- Composio rows already store this in config->>'composio_connected_account_id'
UPDATE org_connections
SET connected_account_id = config->>'composio_connected_account_id'
WHERE transport = 'composio'
  AND connected_account_id IS NULL
  AND config ? 'composio_connected_account_id';

-- 4. Indexes for health sweep + refresh cron ---------------------------------
CREATE INDEX IF NOT EXISTS idx_org_connections_health
  ON org_connections (status, last_health_at);

CREATE INDEX IF NOT EXISTS idx_org_connections_auth_expiry
  ON org_connections (auth_expires_at)
  WHERE auth_expires_at IS NOT NULL AND status = 'connected';

CREATE INDEX IF NOT EXISTS idx_org_connections_transport_status
  ON org_connections (transport, status);

-- 5. Comment documentation ---------------------------------------------------
COMMENT ON COLUMN org_connections.auth_expires_at IS
  'OAuth/credential expiry timestamp (for Composio + other OAuth providers).';
COMMENT ON COLUMN org_connections.connected_account_id IS
  'Remote-system identifier (e.g. Composio connected_account_id). Denormalized from config for indexability.';
COMMENT ON COLUMN org_connections.trigger_ids IS
  'IDs of remote triggers/webhooks registered for this connection (e.g. Composio trigger IDs).';
COMMENT ON COLUMN org_connections.last_health_at IS
  'Last time any ConnectorLifecycle.healthCheck ran against this connection.';
COMMENT ON COLUMN org_connections.consecutive_failures IS
  'Health-check failure streak. Reset to 0 on any success. Triggers alerting after N failures.';
COMMENT ON COLUMN org_connections.lifecycle_version IS
  'Schema version for the lifecycle contract. Bumped when fields are added, so old workers can be detected.';
