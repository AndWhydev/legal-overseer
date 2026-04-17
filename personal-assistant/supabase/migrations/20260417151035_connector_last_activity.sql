-- Phase 51 D2 — connector freshness
--
-- channel_connections.last_sync is misleading: for webhook-driven providers
-- (Gmail push, Sendblue) there is no "sync" action, only live arrivals. The
-- agent's prompt currently reports "synced <date>" based on this column,
-- which doesn't correspond to actual activity.
--
-- This view surfaces the real signal: MAX(channel_messages.received_at)
-- per connection, joined on (org_id, channel_type = channel).

CREATE OR REPLACE VIEW connector_last_activity AS
SELECT
  cc.id                                    AS connection_id,
  cc.org_id                                AS org_id,
  cc.channel_type                          AS channel_type,
  cc.status                                AS status,
  cc.last_sync                             AS last_sync,        -- legacy column, kept for callers migrating over
  MAX(cm.received_at)                      AS last_message_at,  -- real activity signal
  COUNT(cm.id) FILTER (WHERE cm.received_at > NOW() - INTERVAL '7 days') AS messages_last_7d
FROM channel_connections cc
LEFT JOIN channel_messages cm
  ON cm.org_id = cc.org_id
 AND cm.channel = cc.channel_type
GROUP BY cc.id, cc.org_id, cc.channel_type, cc.status, cc.last_sync;

COMMENT ON VIEW connector_last_activity IS
  'Phase 51 D2 — real connector freshness. Use last_message_at (not last_sync) for "is this connector active?" checks. Populated from MAX(channel_messages.received_at) joined on (org_id, channel).';
