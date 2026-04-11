-- 029_awu_seed_data.sql
-- ORIGINAL CONTENT EXTRACTED to supabase/seeds/awu.sql
-- This migration is now a no-op to prevent AWU-specific data from being
-- applied on every fresh database reset.
--
-- To seed AWU data for the All Webbed Up deployment, run:
--   psql $DATABASE_URL -f supabase/seeds/awu.sql
-- Or via Supabase SQL Editor.

DO $$ BEGIN RAISE NOTICE 'Migration 029: AWU seed data extracted to supabase/seeds/awu.sql (no-op)'; END $$;
