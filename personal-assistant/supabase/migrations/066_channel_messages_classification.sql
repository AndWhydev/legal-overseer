-- Add classification column to channel_messages
-- Relay-daemon writes 'pending' or 'unclassified' here; without this column
-- every insert triggers 3 retries with exponential backoff (~7s wasted per message).
ALTER TABLE channel_messages
  ADD COLUMN IF NOT EXISTS classification TEXT;
