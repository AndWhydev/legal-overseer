-- 070_contact_avatars.sql
-- Per-channel avatar storage for contacts.
-- Each channel (gmail, whatsapp, instagram, etc.) can contribute a profile picture.
-- The best available avatar is promoted to contacts.avatar_url for fast reads.

-- Add avatar_url column to contacts for quick single-read access
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;

-- Per-channel avatar storage
CREATE TABLE IF NOT EXISTS contact_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel text NOT NULL,          -- e.g. 'gmail', 'whatsapp', 'instagram', 'linkedin', 'manual'
  avatar_url text NOT NULL,
  priority int NOT NULL DEFAULT 50, -- lower = higher priority (manual=10, google=20, whatsapp=30, etc.)
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(contact_id, channel)
);

CREATE INDEX idx_contact_avatars_contact ON contact_avatars(contact_id);

-- Trigger: after insert/update/delete on contact_avatars, pick the highest-priority
-- avatar and write it to contacts.avatar_url
CREATE OR REPLACE FUNCTION sync_contact_avatar()
RETURNS TRIGGER AS $$
DECLARE
  target_contact_id uuid;
  best_url text;
BEGIN
  target_contact_id := COALESCE(NEW.contact_id, OLD.contact_id);

  SELECT ca.avatar_url INTO best_url
  FROM contact_avatars ca
  WHERE ca.contact_id = target_contact_id
  ORDER BY ca.priority ASC, ca.fetched_at DESC
  LIMIT 1;

  UPDATE contacts SET avatar_url = best_url WHERE id = target_contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_contact_avatar
  AFTER INSERT OR UPDATE OR DELETE ON contact_avatars
  FOR EACH ROW EXECUTE FUNCTION sync_contact_avatar();

-- RLS
ALTER TABLE contact_avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_avatars_select" ON contact_avatars
  FOR SELECT USING (
    contact_id IN (SELECT id FROM contacts WHERE org_id IN (SELECT get_user_accessible_org_ids()))
  );
CREATE POLICY "contact_avatars_insert" ON contact_avatars
  FOR INSERT WITH CHECK (
    contact_id IN (SELECT id FROM contacts WHERE org_id = get_user_active_org_id())
  );
CREATE POLICY "contact_avatars_update" ON contact_avatars
  FOR UPDATE USING (
    contact_id IN (SELECT id FROM contacts WHERE org_id IN (SELECT get_user_accessible_org_ids()))
  );
CREATE POLICY "contact_avatars_delete" ON contact_avatars
  FOR DELETE USING (
    contact_id IN (SELECT id FROM contacts WHERE org_id IN (SELECT get_user_accessible_org_ids()))
  );
