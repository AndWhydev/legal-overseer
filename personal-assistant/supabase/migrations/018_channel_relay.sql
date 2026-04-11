-- Add relay daemon tracking columns to channel_connections
ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS poll_cursor TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS relay_enabled BOOLEAN NOT NULL DEFAULT false;
