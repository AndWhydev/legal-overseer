-- ============================================================================
-- 104_memory_palace_functions.sql
-- Memory Palace: GDPR forget_entity cascade + helper functions.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GDPR FORGET ENTITY — cascade-delete all memories linked to an entity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION forget_entity(
  p_org_id UUID,
  p_entity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_memories_deleted INTEGER := 0;
  v_decisions_deleted INTEGER := 0;
  v_patterns_deleted INTEGER := 0;
  v_timeline_deleted INTEGER := 0;
  v_semantic_deleted INTEGER := 0;
BEGIN
  -- 1. Delete from memory_palace_entries
  WITH deleted AS (
    DELETE FROM memory_palace_entries
    WHERE org_id = p_org_id AND p_entity_id = ANY(entity_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_memories_deleted FROM deleted;

  -- 2. Delete from decision_log
  WITH deleted AS (
    DELETE FROM decision_log
    WHERE org_id = p_org_id AND p_entity_id = ANY(entity_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_decisions_deleted FROM deleted;

  -- 3. Delete from memory_patterns
  WITH deleted AS (
    DELETE FROM memory_patterns
    WHERE org_id = p_org_id AND p_entity_id = ANY(entity_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_patterns_deleted FROM deleted;

  -- 4. Delete from entity_timeline
  WITH deleted AS (
    DELETE FROM entity_timeline
    WHERE org_id = p_org_id AND entity_id = p_entity_id
    RETURNING id
  )
  SELECT count(*) INTO v_timeline_deleted FROM deleted;

  -- 5. Delete from semantic_memories (legacy)
  WITH deleted AS (
    DELETE FROM semantic_memories
    WHERE org_id = p_org_id AND p_entity_id = ANY(entity_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_semantic_deleted FROM deleted;

  RETURN jsonb_build_object(
    'entity_id', p_entity_id,
    'memories_deleted', v_memories_deleted,
    'decisions_deleted', v_decisions_deleted,
    'patterns_deleted', v_patterns_deleted,
    'timeline_deleted', v_timeline_deleted,
    'semantic_deleted', v_semantic_deleted,
    'forgotten_at', now()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MEMORY SEARCH — hybrid full-text search with ts_rank
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_memory_palace(
  p_org_id UUID,
  p_query TEXT,
  p_category TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  id UUID,
  category TEXT,
  title TEXT,
  content TEXT,
  confidence FLOAT,
  entity_ids UUID[],
  entity_names TEXT[],
  source TEXT,
  rank FLOAT,
  created_at TIMESTAMPTZ
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
    e.id,
    e.category,
    e.title,
    e.content,
    e.confidence,
    e.entity_ids,
    e.entity_names,
    e.source,
    ts_rank(e.content_tsv, v_tsquery) AS rank,
    e.created_at
  FROM memory_palace_entries e
  WHERE e.org_id = p_org_id
    AND e.is_active = true
    AND e.content_tsv @@ v_tsquery
    AND (p_category IS NULL OR e.category = p_category)
    AND (p_entity_id IS NULL OR p_entity_id = ANY(e.entity_ids))
  ORDER BY rank DESC, e.confidence DESC
  LIMIT p_limit;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MEMORY STATS — aggregate counts and health metrics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION memory_palace_stats(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_memories', (
      SELECT count(*) FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true
    ),
    'by_category', (
      SELECT jsonb_object_agg(category, cnt)
      FROM (
        SELECT category, count(*) AS cnt
        FROM memory_palace_entries
        WHERE org_id = p_org_id AND is_active = true
        GROUP BY category
      ) sub
    ),
    'avg_confidence', (
      SELECT COALESCE(round(avg(confidence)::numeric, 3), 0)
      FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true
    ),
    'decisions_count', (
      SELECT count(*) FROM decision_log
      WHERE org_id = p_org_id AND status = 'active'
    ),
    'patterns_count', (
      SELECT count(*) FROM memory_patterns
      WHERE org_id = p_org_id AND status = 'active'
    ),
    'needing_decay', (
      SELECT count(*) FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true
        AND decay_rate != 'never'
        AND (last_decayed_at IS NULL OR last_decayed_at < now() - interval '24 hours')
    ),
    'low_confidence', (
      SELECT count(*) FROM memory_palace_entries
      WHERE org_id = p_org_id AND is_active = true AND confidence < 0.3
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DECAY BATCH — apply confidence decay to stale memories
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decay_memory_confidence(
  p_org_id UUID,
  p_batch_size INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
BEGIN
  -- Apply decay based on rate:
  -- fast:   -0.05 per day
  -- normal: -0.02 per day
  -- slow:   -0.005 per day
  -- never:  no decay (skip)

  WITH to_decay AS (
    SELECT id, confidence, decay_rate
    FROM memory_palace_entries
    WHERE org_id = p_org_id
      AND is_active = true
      AND decay_rate != 'never'
      AND (last_decayed_at IS NULL OR last_decayed_at < now() - interval '24 hours')
    ORDER BY last_decayed_at NULLS FIRST
    LIMIT p_batch_size
  ),
  updated AS (
    UPDATE memory_palace_entries e
    SET
      confidence = GREATEST(0.01, e.confidence - CASE e.decay_rate
        WHEN 'fast' THEN 0.05
        WHEN 'normal' THEN 0.02
        WHEN 'slow' THEN 0.005
        ELSE 0
      END),
      last_decayed_at = now(),
      -- Auto-archive memories that drop below threshold
      is_active = CASE
        WHEN e.confidence - CASE e.decay_rate
          WHEN 'fast' THEN 0.05
          WHEN 'normal' THEN 0.02
          WHEN 'slow' THEN 0.005
          ELSE 0
        END < 0.05 THEN false
        ELSE true
      END
    FROM to_decay td
    WHERE e.id = td.id
    RETURNING e.id
  )
  SELECT count(*) INTO v_processed FROM updated;

  RETURN v_processed;
END;
$$;
