-- 054_backfill_personal_orgs.sql
-- Backfill personal organizations and membership links for existing users.
--
-- Context:
-- - Migration 052 introduced dual-tier tenancy and auto-creation of personal orgs
--   for new profiles.
-- - This migration backfills data for profiles that already existed before 052.
--
-- Idempotency:
-- - Every statement is guarded with IS NULL / NOT EXISTS predicates so this file
--   can be executed multiple times safely.

-- =============================================================================
-- 1) Create a personal organization for each profile missing personal_org_id
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, tier, settings)
SELECT
  gen_random_uuid(),
  'Personal',
  'personal-' || p.id::text,
  'free',
  'personal',
  '{}'::jsonb
FROM profiles p
WHERE p.personal_org_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM organizations o
    WHERE o.slug = 'personal-' || p.id::text
  );

-- =============================================================================
-- 2) Point profiles.personal_org_id to the corresponding personal org
-- =============================================================================
UPDATE profiles p
SET personal_org_id = o.id
FROM organizations o
WHERE o.slug = 'personal-' || p.id::text
  AND o.tier = 'personal'
  AND p.personal_org_id IS NULL;

-- =============================================================================
-- 3) If active_org_id is null, default it to personal_org_id
-- =============================================================================
UPDATE profiles
SET active_org_id = COALESCE(active_org_id, personal_org_id)
WHERE active_org_id IS NULL
  AND personal_org_id IS NOT NULL;

-- =============================================================================
-- 4) Ensure owner membership exists for each user's personal org
-- =============================================================================
INSERT INTO org_members (id, org_id, user_id, role)
SELECT
  gen_random_uuid(),
  p.personal_org_id,
  p.id,
  'owner'
FROM profiles p
WHERE p.personal_org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM org_members om
    WHERE om.org_id = p.personal_org_id
      AND om.user_id = p.id
  );

-- =============================================================================
-- 5) Preserve legacy org_id relationships by ensuring membership there too
-- =============================================================================
INSERT INTO org_members (id, org_id, user_id, role)
SELECT
  gen_random_uuid(),
  p.org_id,
  p.id,
  p.role
FROM profiles p
WHERE p.org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM org_members om
    WHERE om.org_id = p.org_id
      AND om.user_id = p.id
  );
