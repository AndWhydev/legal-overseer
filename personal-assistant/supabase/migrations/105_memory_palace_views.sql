-- ============================================================================
-- 105_memory_palace_views.sql
-- Memory Palace: Materialized views and helper queries for performance.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENTITY MEMORY SUMMARY — Quick lookup of memory counts per entity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION entity_memory_summary(
  p_org_id UUID,
  p_entity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'entity_id', p_entity_id,
    'memory_count', (
      SELECT count(*) FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true AND p_entity_id = ANY(entity_ids)
    ),
    'decision_count', (
      SELECT count(*) FROM decision_log
      WHERE org_id = p_org_id AND status = 'active' AND p_entity_id = ANY(entity_ids)
    ),
    'pattern_count', (
      SELECT count(*) FROM memory_patterns
      WHERE org_id = p_org_id AND status = 'active' AND p_entity_id = ANY(entity_ids)
    ),
    'category_breakdown', (
      SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
      FROM (
        SELECT category, count(*) AS cnt
        FROM memory_palace_entries
        WHERE org_id = p_org_id AND is_active = true AND p_entity_id = ANY(entity_ids)
        GROUP BY category
      ) sub
    ),
    'avg_confidence', (
      SELECT COALESCE(round(avg(confidence)::numeric, 3), 0)
      FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true AND p_entity_id = ANY(entity_ids)
    ),
    'latest_memory_at', (
      SELECT max(created_at)
      FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true AND p_entity_id = ANY(entity_ids)
    ),
    'latest_decision_at', (
      SELECT max(decided_at)
      FROM decision_log
      WHERE org_id = p_org_id AND status = 'active' AND p_entity_id = ANY(entity_ids)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CORROBORATE MEMORY — Increase confidence when same fact is seen again
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION corroborate_memory(
  p_memory_id UUID,
  p_new_confidence FLOAT DEFAULT 0.7
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_confidence FLOAT;
  v_current_count INTEGER;
  v_new_confidence FLOAT;
BEGIN
  SELECT confidence, corroboration_count
  INTO v_current_confidence, v_current_count
  FROM memory_palace_entries
  WHERE id = p_memory_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Weighted average: more corroborations = more weight to existing
  v_new_confidence := LEAST(1.0,
    (v_current_confidence * (v_current_count + 1) + p_new_confidence) / (v_current_count + 2)
  );

  UPDATE memory_palace_entries
  SET
    confidence = v_new_confidence,
    corroboration_count = v_current_count + 1,
    last_decayed_at = now()  -- reset decay timer
  WHERE id = p_memory_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RECENT MEMORIES FEED — Paginated recent memories for the explorer
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recent_memories_feed(
  p_org_id UUID,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  category TEXT,
  title TEXT,
  content TEXT,
  confidence FLOAT,
  decay_rate TEXT,
  entity_ids UUID[],
  entity_names TEXT[],
  source TEXT,
  tags TEXT[],
  corroboration_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.category,
    e.title,
    e.content,
    e.confidence,
    e.decay_rate,
    e.entity_ids,
    e.entity_names,
    e.source,
    e.tags,
    e.corroboration_count,
    e.created_at
  FROM memory_palace_entries e
  WHERE e.org_id = p_org_id
    AND e.is_active = true
    AND (p_category IS NULL OR e.category = p_category)
  ORDER BY e.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DECISION SEARCH — Full-text search across decision log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_decisions(
  p_org_id UUID,
  p_query TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_domain TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  decision TEXT,
  reasoning TEXT,
  outcome TEXT,
  entity_ids UUID[],
  entity_names TEXT[],
  domain TEXT,
  impact TEXT,
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  rank FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tsquery TSQUERY;
BEGIN
  v_tsquery := plainto_tsquery('english', p_query);

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.decision,
    d.reasoning,
    d.outcome,
    d.entity_ids,
    d.entity_names,
    d.domain,
    d.impact,
    d.decided_at,
    d.decided_by,
    ts_rank(d.content_tsv, v_tsquery) AS rank
  FROM decision_log d
  WHERE d.org_id = p_org_id
    AND d.status = 'active'
    AND d.content_tsv @@ v_tsquery
    AND (p_entity_id IS NULL OR p_entity_id = ANY(d.entity_ids))
    AND (p_domain IS NULL OR d.domain = p_domain)
  ORDER BY rank DESC, d.decided_at DESC
  LIMIT p_limit;
END;
$$;
