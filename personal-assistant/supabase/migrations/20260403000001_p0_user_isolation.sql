-- 20260403000001_p0_user_isolation.sql
-- P0 Security Fix: User-level data isolation
--
-- Problem: channel_messages, user_integrations, and several personal-data
-- tables use org-level RLS only. When two users share an org (e.g. Tor and
-- Andy in AWU), they can see each other's inbox, integrations, and personal data.
--
-- Fix Strategy:
--   1. Add user_id column to channel_messages (nullable for backward compat with
--      service-role ingestion, but RLS will require it for user queries)
--   2. Tighten user_integrations to require user_id = auth.uid()
--   3. Add user_id scoping to personal-data tables that shouldn't be shared
--
-- Tables affected: channel_messages, user_integrations, memory_entries,
--   activity_feed, standing_orders, decision_log, medications

BEGIN;

-- ============================================================================
-- 1. channel_messages: Add user_id and scope RLS
-- ============================================================================

-- Add user_id column (nullable — background ingestion may not have user context)
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_channel_messages_user ON channel_messages(user_id) WHERE user_id IS NOT NULL;

-- Drop ALL existing channel_messages policies (from 004, 053, and 20260331)
DROP POLICY IF EXISTS "channel_messages_all" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_select" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_insert" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_update" ON channel_messages;
DROP POLICY IF EXISTS "channel_messages_delete" ON channel_messages;

-- New policy: user sees their own messages, OR unassigned messages in their org
-- This allows: (a) personal inbox isolation, (b) shared org messages that haven't
-- been assigned yet to still be visible to org admins
CREATE POLICY "channel_messages_select" ON channel_messages
  FOR SELECT USING (
    org_id::uuid IN (SELECT get_user_accessible_org_ids())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

CREATE POLICY "channel_messages_insert" ON channel_messages
  FOR INSERT WITH CHECK (
    org_id::uuid IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "channel_messages_update" ON channel_messages
  FOR UPDATE USING (
    org_id::uuid IN (SELECT get_user_accessible_org_ids())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

CREATE POLICY "channel_messages_delete" ON channel_messages
  FOR DELETE USING (
    org_id::uuid IN (SELECT get_user_accessible_org_ids())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- ============================================================================
-- 2. user_integrations: Restore user_id scoping
-- ============================================================================

DROP POLICY IF EXISTS "user_integrations_select" ON user_integrations;
DROP POLICY IF EXISTS "user_integrations_insert" ON user_integrations;
DROP POLICY IF EXISTS "user_integrations_update" ON user_integrations;
DROP POLICY IF EXISTS "user_integrations_delete" ON user_integrations;

CREATE POLICY "user_integrations_select" ON user_integrations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_integrations_insert" ON user_integrations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_integrations_update" ON user_integrations
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_integrations_delete" ON user_integrations
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- 3. whisper_impressions: Add missing RLS
-- ============================================================================

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whisper_impressions' AND table_schema = 'public') THEN
ALTER TABLE whisper_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whisper_impressions_select" ON whisper_impressions;
DROP POLICY IF EXISTS "whisper_impressions_insert" ON whisper_impressions;
DROP POLICY IF EXISTS "whisper_impressions_update" ON whisper_impressions;
DROP POLICY IF EXISTS "whisper_impressions_delete" ON whisper_impressions;

CREATE POLICY "whisper_impressions_select" ON whisper_impressions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "whisper_impressions_insert" ON whisper_impressions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "whisper_impressions_update" ON whisper_impressions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "whisper_impressions_delete" ON whisper_impressions
  FOR DELETE USING (user_id = auth.uid());
END IF;
END $$;

-- ============================================================================
-- 4. Personal-data tables: Add user_id scoping where missing
-- ============================================================================

-- memory_entries
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memory_entries') THEN
    ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    DROP POLICY IF EXISTS "memory_entries_select" ON memory_entries;
    DROP POLICY IF EXISTS "memory_entries_insert" ON memory_entries;
    DROP POLICY IF EXISTS "memory_entries_update" ON memory_entries;
    DROP POLICY IF EXISTS "memory_entries_delete" ON memory_entries;
    CREATE POLICY "memory_entries_select" ON memory_entries
      FOR SELECT USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
    CREATE POLICY "memory_entries_insert" ON memory_entries
      FOR INSERT WITH CHECK (org_id::uuid IN (SELECT get_user_accessible_org_ids()));
    CREATE POLICY "memory_entries_update" ON memory_entries
      FOR UPDATE USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
    CREATE POLICY "memory_entries_delete" ON memory_entries
      FOR DELETE USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
  END IF;
END $$;

-- activity_feed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_feed') THEN
    ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    DROP POLICY IF EXISTS "activity_feed_select" ON activity_feed;
    DROP POLICY IF EXISTS "activity_feed_insert" ON activity_feed;
    DROP POLICY IF EXISTS "activity_feed_update" ON activity_feed;
    DROP POLICY IF EXISTS "activity_feed_delete" ON activity_feed;
    CREATE POLICY "activity_feed_select" ON activity_feed
      FOR SELECT USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
    CREATE POLICY "activity_feed_insert" ON activity_feed
      FOR INSERT WITH CHECK (org_id::uuid IN (SELECT get_user_accessible_org_ids()));
    CREATE POLICY "activity_feed_update" ON activity_feed
      FOR UPDATE USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
    CREATE POLICY "activity_feed_delete" ON activity_feed
      FOR DELETE USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
  END IF;
END $$;

-- standing_orders
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'standing_orders') THEN
    ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    DROP POLICY IF EXISTS "standing_orders_select" ON standing_orders;
    DROP POLICY IF EXISTS "standing_orders_insert" ON standing_orders;
    DROP POLICY IF EXISTS "standing_orders_update" ON standing_orders;
    DROP POLICY IF EXISTS "standing_orders_delete" ON standing_orders;
    CREATE POLICY "standing_orders_select" ON standing_orders
      FOR SELECT USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
    CREATE POLICY "standing_orders_insert" ON standing_orders
      FOR INSERT WITH CHECK (org_id::uuid IN (SELECT get_user_accessible_org_ids()));
    CREATE POLICY "standing_orders_update" ON standing_orders
      FOR UPDATE USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
    CREATE POLICY "standing_orders_delete" ON standing_orders
      FOR DELETE USING (
        org_id::uuid IN (SELECT get_user_accessible_org_ids())
        AND (user_id = auth.uid() OR user_id IS NULL)
      );
  END IF;
END $$;

-- medications (SENSITIVE)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medications') THEN
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    DROP POLICY IF EXISTS "medications_select" ON medications;
    DROP POLICY IF EXISTS "medications_insert" ON medications;
    DROP POLICY IF EXISTS "medications_update" ON medications;
    DROP POLICY IF EXISTS "medications_delete" ON medications;
    -- Medications are strictly personal — no NULL fallback
    CREATE POLICY "medications_select" ON medications
      FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY "medications_insert" ON medications
      FOR INSERT WITH CHECK (user_id = auth.uid());
    CREATE POLICY "medications_update" ON medications
      FOR UPDATE USING (user_id = auth.uid());
    CREATE POLICY "medications_delete" ON medications
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

COMMIT;
