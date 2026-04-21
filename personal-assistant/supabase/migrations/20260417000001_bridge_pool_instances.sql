-- 20260417000001_bridge_pool_instances.sql
--
-- Dedicated pool of pre-provisioned bridge VPS instances (currently only
-- iMessage via the proprietary BitBit Mac VPS provider).
--
-- Replaces the previous `__bitbit_pool__` sentinel hack that tried to
-- overload `org_connections` for pool entries. That sentinel never worked
-- because `org_connections.org_id` is a uuid column and the sentinel was a
-- literal string — inserts silently failed, so the pool stayed empty and
-- `claimInstance()` always returned null.
--
-- This table is separate because a pool instance is infrastructure, not a
-- user connection. It becomes a user connection only at claim time, when
-- its config is copied into the real `org_connections` row.

CREATE TABLE IF NOT EXISTS bridge_pool_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('imessage')),

  -- Remote VPS identity (opaque ID from the underlying VPS provider)
  vps_id text NOT NULL UNIQUE,
  vps_ip inet NOT NULL,

  -- BlueBubbles server config
  bb_server_url text NOT NULL,
  bb_password text NOT NULL,

  -- SSH + VNC access
  ssh_key_fingerprint text NOT NULL,
  vnc_port int NOT NULL DEFAULT 5900,
  vnc_password text NOT NULL,

  -- Pool lifecycle
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'warm', 'claimed', 'destroying', 'error')),
  claimed_by_connection_id uuid REFERENCES org_connections(id) ON DELETE SET NULL,
  claimed_at timestamptz,

  -- Operational metadata
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_pool_warm
  ON bridge_pool_instances (provider, status, created_at)
  WHERE status = 'warm';

CREATE INDEX IF NOT EXISTS idx_bridge_pool_claimed
  ON bridge_pool_instances (claimed_by_connection_id)
  WHERE claimed_by_connection_id IS NOT NULL;

COMMENT ON TABLE bridge_pool_instances IS
  'Pool of pre-warmed bridge VPS instances. One row per VPS. Consumed by claimInstance() when a user connects.';
COMMENT ON COLUMN bridge_pool_instances.status IS
  'provisioning: booting + running setup.sh. warm: ready to be claimed. claimed: assigned to a user connection. destroying: being torn down. error: failed setup.';
COMMENT ON COLUMN bridge_pool_instances.vps_id IS
  'Opaque ID from the underlying VPS provider (currently LightNode). Internal only — never exposed to users.';
