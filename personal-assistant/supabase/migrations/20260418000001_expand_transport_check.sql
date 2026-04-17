-- 20260418000001_expand_transport_check.sql
--
-- Expands org_connections.transport CHECK constraint to include the
-- values the code actually uses. The original constraint from the
-- custom-connections RFC only covered poll / webhook / bridge / stream,
-- but the Composio OAuth callback + BYOK route both write
-- `transport = 'composio'`.
--
-- Without this, every Composio connect attempt (OAuth and BYOK) violated
-- the check constraint on INSERT/UPDATE. OAuth appeared to work because
-- the callback swallows upsert errors and redirects anyway — the row
-- never landed, but subsequent UI fetches showed the account in other
-- places (Composio side) and the bug stayed hidden. BYOK failed loudly
-- because it surfaces write errors to the user.

ALTER TABLE org_connections DROP CONSTRAINT IF EXISTS org_connections_transport_check;

ALTER TABLE org_connections ADD CONSTRAINT org_connections_transport_check
  CHECK (transport IN ('poll', 'webhook', 'bridge', 'stream', 'composio'));

COMMENT ON CONSTRAINT org_connections_transport_check ON org_connections IS
  'Allowed transport values. Extended from the original RFC set (poll/webhook/bridge/stream) to add composio when that integration transport was introduced. Expand further if new transport implementations are added under src/lib/connectors/lifecycles/.';
