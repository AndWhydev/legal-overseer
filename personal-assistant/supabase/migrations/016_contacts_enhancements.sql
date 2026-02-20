-- 016_contacts_enhancements.sql
-- Add agent-intelligence columns to existing contacts table

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score text CHECK (lead_score IN ('hot', 'warm', 'cold'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifetime_value numeric(12,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_channel text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS voice_profile_id uuid REFERENCES voice_profiles ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Indexes
CREATE INDEX idx_contacts_lead_score ON contacts (org_id, lead_score) WHERE lead_score IS NOT NULL;
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags);
CREATE INDEX idx_contacts_voice ON contacts (voice_profile_id) WHERE voice_profile_id IS NOT NULL;
CREATE INDEX idx_contacts_last_interaction ON contacts (org_id, last_interaction_at DESC) WHERE last_interaction_at IS NOT NULL;
