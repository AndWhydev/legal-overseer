-- Phase 51 D1 — user timezone
--
-- Every user gets a timezone captured at signup (from Intl.DateTimeFormat().resolvedOptions().timeZone).
-- The agent's system prompt renders dates/times in the user's zone instead of the hardcoded en-AU locale.
-- Nullable: public.profiles who signed up before this column is live keep null until next login refresh.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN public.profiles.timezone IS
  'IANA timezone (e.g. Australia/Brisbane, America/New_York). Captured at signup from browser Intl API.';

-- Backfill Tor (primary dogfood user) — Brisbane.
UPDATE public.profiles
SET timezone = 'Australia/Brisbane'
WHERE id = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
  AND timezone IS NULL;

-- Backfill Andy — also Brisbane per MEMORY.md context.
UPDATE public.profiles
SET timezone = 'Australia/Brisbane'
WHERE id = '1d74c2d5-4dbc-4eea-86c5-639cda23256d'
  AND timezone IS NULL;
