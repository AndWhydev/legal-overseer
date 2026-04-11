-- 052_dual_tier_tenancy_schema.sql
-- Dual-tier tenancy migration:
-- 1) Every user gets a personal org (tier = 'personal') for private workspace context.
-- 2) Users can also belong to shared orgs via org_members (tier = 'shared').
-- 3) profiles tracks both the personal org and the currently active org context.

-- =============================================================================
-- ORGANIZATIONS: add tier (personal/shared)
-- =============================================================================

ALTER TABLE IF EXISTS organizations
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'shared'
  CHECK (tier IN ('personal', 'shared'));

-- Personal org slug uniqueness (scoped to tier='personal').
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_personal_slug
  ON organizations(slug)
  WHERE tier = 'personal';

-- =============================================================================
-- PROFILES: decouple hard single-org requirement + add personal/active org pointers
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'org_id'
  ) THEN
    ALTER TABLE profiles
      ALTER COLUMN org_id DROP NOT NULL;
  END IF;
END;
$$;

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS personal_org_id uuid REFERENCES organizations(id);

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS active_org_id uuid REFERENCES organizations(id);

-- Preserve current behavior for existing users until active org is explicitly switched.
UPDATE profiles
SET active_org_id = org_id
WHERE active_org_id IS NULL
  AND org_id IS NOT NULL;

-- =============================================================================
-- TENANCY HELPER FUNCTIONS
-- =============================================================================

-- Returns the current user's personal org id.
CREATE OR REPLACE FUNCTION get_user_personal_org_id()
RETURNS uuid AS $$
  SELECT personal_org_id
  FROM profiles
  WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth;

-- Returns all org ids the current user can access:
-- - personal_org_id from profile
-- - all memberships from org_members
CREATE OR REPLACE FUNCTION get_user_accessible_org_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  has_org_members boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'org_members'
  )
  INTO has_org_members;

  IF has_org_members THEN
    RETURN QUERY
    SELECT org_id
    FROM (
      SELECT p.personal_org_id AS org_id
      FROM profiles p
      WHERE p.id = auth.uid()
      UNION
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.uid()
    ) accessible
    WHERE org_id IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT p.personal_org_id
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.personal_org_id IS NOT NULL;
  END IF;
END;
$$;

-- Returns the active org context the current user is viewing.
CREATE OR REPLACE FUNCTION get_user_active_org_id()
RETURNS uuid AS $$
  SELECT active_org_id
  FROM profiles
  WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth;

-- Backward compatibility: keep get_user_org_id(), but make it resolve to active org.
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
  SELECT get_user_active_org_id()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth;

-- =============================================================================
-- AUTO-CREATE PERSONAL ORG ON PROFILE INSERT
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_create_personal_org()
RETURNS TRIGGER AS $$
DECLARE
  new_personal_org_id uuid;
  personal_slug text;
BEGIN
  personal_slug := 'personal-' || NEW.id::text;

  IF NEW.personal_org_id IS NULL THEN
    INSERT INTO organizations (name, slug, tier)
    VALUES ('Personal', personal_slug, 'personal')
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO new_personal_org_id;

    IF new_personal_org_id IS NULL THEN
      SELECT id
      INTO new_personal_org_id
      FROM organizations
      WHERE slug = personal_slug;
    END IF;
  ELSE
    new_personal_org_id := NEW.personal_org_id;
  END IF;

  UPDATE profiles
  SET personal_org_id = new_personal_org_id,
      active_org_id = new_personal_org_id
  WHERE id = NEW.id;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'org_members'
  ) THEN
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (new_personal_org_id, NEW.id, 'owner')
    ON CONFLICT (org_id, user_id) DO UPDATE
      SET role = EXCLUDED.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
  ) THEN
    DROP TRIGGER IF EXISTS trg_auto_create_personal_org ON profiles;

    CREATE TRIGGER trg_auto_create_personal_org
      AFTER INSERT ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION auto_create_personal_org();
  END IF;
END;
$$;

-- =============================================================================
-- ORG_MEMBERS INDEX FOR RLS LOOKUPS
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'org_members'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_org_members_user_id
      ON org_members(user_id);
  END IF;
END;
$$;
