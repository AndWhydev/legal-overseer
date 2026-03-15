-- 081_generated_content_scheduling.sql
-- Adds scheduling support to generated_content table

ALTER TABLE generated_content
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published')),
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_generated_content_status ON generated_content(org_id, status);
CREATE INDEX IF NOT EXISTS idx_generated_content_scheduled ON generated_content(org_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;
