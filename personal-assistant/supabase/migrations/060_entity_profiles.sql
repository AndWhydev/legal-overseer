-- 060_entity_profiles.sql
-- Pre-computed entity understanding for fast context reads.
-- Replaces expensive multi-table assembly with single-row lookup.

CREATE TABLE IF NOT EXISTS entity_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  display_name text,
  summary text,
  profile_data jsonb NOT NULL DEFAULT '{}',
  computed_from_events int DEFAULT 0,
  event_count_at_compute int DEFAULT 0,
  computed_at timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT (now() + interval '6 hours'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, entity_type, entity_id)
);

CREATE INDEX idx_entity_profiles_lookup ON entity_profiles(org_id, entity_type, entity_id);
CREATE INDEX idx_entity_profiles_stale ON entity_profiles(valid_until);

ALTER TABLE entity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_profiles_select" ON entity_profiles
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_profiles_insert" ON entity_profiles
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "entity_profiles_update" ON entity_profiles
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_profiles_delete" ON entity_profiles
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));
