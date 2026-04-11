-- Add classification columns to channel_messages
ALTER TABLE channel_messages
  ADD COLUMN IF NOT EXISTS significance INTEGER,
  ADD COLUMN IF NOT EXISTS time_sensitivity TEXT CHECK (time_sensitivity IN ('immediate', 'today', 'this_week', 'whenever', 'none')),
  ADD COLUMN IF NOT EXISTS recommended_actions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS classification_model TEXT,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Index for querying by significance
CREATE INDEX IF NOT EXISTS idx_channel_messages_significance
  ON channel_messages(org_id, significance DESC)
  WHERE significance IS NOT NULL;
