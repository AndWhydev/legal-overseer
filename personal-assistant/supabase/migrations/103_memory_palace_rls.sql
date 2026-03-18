-- ============================================================================
-- 103_memory_palace_rls.sql
-- Row Level Security policies for all Memory Palace tables.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. memory_palace_entries RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE memory_palace_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp_entries_select" ON memory_palace_entries
  FOR SELECT USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "mp_entries_insert" ON memory_palace_entries
  FOR INSERT WITH CHECK (
    org_id = get_user_active_org_id()
  );

CREATE POLICY "mp_entries_update" ON memory_palace_entries
  FOR UPDATE USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  ) WITH CHECK (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "mp_entries_delete" ON memory_palace_entries
  FOR DELETE USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "mp_entries_service_role" ON memory_palace_entries
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. decision_log RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_log_select" ON decision_log
  FOR SELECT USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "decision_log_insert" ON decision_log
  FOR INSERT WITH CHECK (
    org_id = get_user_active_org_id()
  );

CREATE POLICY "decision_log_update" ON decision_log
  FOR UPDATE USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  ) WITH CHECK (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "decision_log_delete" ON decision_log
  FOR DELETE USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "decision_log_service_role" ON decision_log
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. memory_patterns RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE memory_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_patterns_select" ON memory_patterns
  FOR SELECT USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "memory_patterns_insert" ON memory_patterns
  FOR INSERT WITH CHECK (
    org_id = get_user_active_org_id()
  );

CREATE POLICY "memory_patterns_update" ON memory_patterns
  FOR UPDATE USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  ) WITH CHECK (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "memory_patterns_delete" ON memory_patterns
  FOR DELETE USING (
    org_id IN (SELECT get_user_accessible_org_ids())
  );

CREATE POLICY "memory_patterns_service_role" ON memory_patterns
  FOR ALL USING (auth.role() = 'service_role');
