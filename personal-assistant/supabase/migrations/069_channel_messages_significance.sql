-- Add significance column to channel_messages for fast inbox priority queries.
-- Used by channel-triage.ts queryInbox() and inbox-tab.tsx to display message importance.
-- Values: 0-10 scale set by LLM classification pipeline.
ALTER TABLE channel_messages
  ADD COLUMN IF NOT EXISTS significance INTEGER;
