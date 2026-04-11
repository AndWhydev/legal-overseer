-- 100_memory_palace_core.sql
-- Memory Palace: institutional knowledge system with typed memories,
-- confidence scoring, decay, provenance tracking, and entity linkage.

-- ─── Memory Entries ─────────────────────────────────────────────────────────
-- Core table: every piece of institutional knowledge lives here.

CREATE TABLE memory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,

  -- Memory classification
  memory_type text NOT NULL CHECK (memory_type IN (
    'conversation', 'decision', 'pattern', 'fact',
    'relationship', 'pricing', 'lesson_learned'
  )),

  -- Content
  title text NOT NULL,
  content text NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED,

  -- Type-specific structured metadata
  -- e.g., decisions: {alternatives, reasoning_chain, outcome}
  -- e.g., pricing: {amount, currency, project_type, scope}
  -- e.g., patterns: {sample_count, pattern_data}
  type_metadata jsonb NOT NULL DEFAULT '{}',

  -- Confidence & decay
  confidence float NOT NULL DEFAULT 0.7 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  decay_rate text NOT NULL DEFAULT 'normal' CHECK (decay_rate IN ('never', 'slow', 'normal', 'fast')),
  corroboration_count int NOT NULL DEFAULT 0,
  last_corroborated_at timestamptz,

  -- Provenance: where did this memory come from?
  source_type text NOT NULL DEFAULT 'extraction' CHECK (source_type IN (
    'extraction', 'user_explicit', 'agent_reflection', 'consolidation', 'import'
  )),
  source_thread_id uuid,
  source_message_ids uuid[] DEFAULT '{}',
  source_channel text,

  -- Entity linkage (contact, project, invoice, task UUIDs)
  entity_ids uuid[] NOT NULL DEFAULT '{}',
  entity_names text[] NOT NULL DEFAULT '{}',

  -- Lifecycle
  is_active boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES memory_entries ON DELETE SET NULL,
  archived_at timestamptz,
  archive_reason text,

  -- Timestamps
  occurred_at timestamptz NOT NULL DEFAULT now(), -- when the memory event happened
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for memory_entries
CREATE INDEX idx_mem_entries_org_active ON memory_entries (org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_mem_entries_type ON memory_entries (org_id, memory_type) WHERE is_active = true;
CREATE INDEX idx_mem_entries_entities ON memory_entries USING GIN (entity_ids);
CREATE INDEX idx_mem_entries_tsv ON memory_entries USING GIN (content_tsv);
CREATE INDEX idx_mem_entries_confidence ON memory_entries (org_id, confidence) WHERE is_active = true;
CREATE INDEX idx_mem_entries_occurred ON memory_entries (org_id, occurred_at DESC) WHERE is_active = true;
CREATE INDEX idx_mem_entries_source_thread ON memory_entries (source_thread_id) WHERE source_thread_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER trg_memory_entries_updated_at
  BEFORE UPDATE ON memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Memory Decisions ───────────────────────────────────────────────────────
-- Dedicated table for decision tracking with reasoning chains.
-- Links back to memory_entries for the core memory record.

CREATE TABLE memory_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  memory_entry_id uuid REFERENCES memory_entries ON DELETE CASCADE NOT NULL,

  -- Decision details
  decision_summary text NOT NULL,
  alternatives jsonb NOT NULL DEFAULT '[]', -- [{option, pros, cons}]
  reasoning_chain text NOT NULL DEFAULT '',
  participants text[] NOT NULL DEFAULT '{}', -- who was involved
  domain text, -- 'pricing', 'hiring', 'technical', 'client', etc.

  -- Outcome tracking
  outcome_status text NOT NULL DEFAULT 'pending' CHECK (outcome_status IN (
    'pending', 'successful', 'failed', 'revised', 'unknown'
  )),
  outcome_notes text,
  outcome_recorded_at timestamptz,

  -- Lesson learned (populated after outcome)
  lesson_learned text,

  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mem_decisions_org ON memory_decisions (org_id);
CREATE INDEX idx_mem_decisions_domain ON memory_decisions (org_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_mem_decisions_entry ON memory_decisions (memory_entry_id);

CREATE TRIGGER trg_memory_decisions_updated_at
  BEFORE UPDATE ON memory_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Consolidation Log ──────────────────────────────────────────────────────
-- Tracks maintenance operations: decay runs, merges, archival.

CREATE TABLE memory_consolidation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,

  operation text NOT NULL CHECK (operation IN (
    'decay', 'merge', 'archive', 'corroborate', 'forget_entity'
  )),

  -- What was affected
  affected_memory_ids uuid[] NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mem_consol_org ON memory_consolidation_log (org_id, created_at DESC);


-- ─── RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_consolidation_log ENABLE ROW LEVEL SECURITY;

-- memory_entries: users see their org's memories
CREATE POLICY "memory_entries_org_read" ON memory_entries
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "memory_entries_org_insert" ON memory_entries
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "memory_entries_org_update" ON memory_entries
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "memory_entries_org_delete" ON memory_entries
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

-- memory_decisions: same org-scoped access
CREATE POLICY "memory_decisions_org_read" ON memory_decisions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "memory_decisions_org_insert" ON memory_decisions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "memory_decisions_org_update" ON memory_decisions
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

-- consolidation_log: read-only for users
CREATE POLICY "memory_consol_log_org_read" ON memory_consolidation_log
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid())
  );

-- Service role bypass (for background jobs)
CREATE POLICY "memory_entries_service" ON memory_entries
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "memory_decisions_service" ON memory_decisions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "memory_consol_log_service" ON memory_consolidation_log
  FOR ALL USING (auth.role() = 'service_role');


-- ─── Helper Functions ───────────────────────────────────────────────────────

-- Full-text search function with ranking
CREATE OR REPLACE FUNCTION search_memories(
  p_org_id uuid,
  p_query text,
  p_memory_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_min_confidence float DEFAULT 0.1,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  memory_type text,
  title text,
  content text,
  confidence float,
  entity_ids uuid[],
  entity_names text[],
  occurred_at timestamptz,
  source_type text,
  type_metadata jsonb,
  rank float
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.memory_type,
    me.title,
    me.content,
    me.confidence,
    me.entity_ids,
    me.entity_names,
    me.occurred_at,
    me.source_type,
    me.type_metadata,
    ts_rank_cd(me.content_tsv, websearch_to_tsquery('english', p_query)) AS rank
  FROM memory_entries me
  WHERE me.org_id = p_org_id
    AND me.is_active = true
    AND me.confidence >= p_min_confidence
    AND (p_memory_type IS NULL OR me.memory_type = p_memory_type)
    AND (p_entity_id IS NULL OR p_entity_id = ANY(me.entity_ids))
    AND (
      me.content_tsv @@ websearch_to_tsquery('english', p_query)
      OR me.title ILIKE '%' || p_query || '%'
    )
  ORDER BY rank DESC, me.confidence DESC, me.occurred_at DESC
  LIMIT p_limit;
END;
$$;

-- Forget entity: cascading delete of all memories related to an entity
CREATE OR REPLACE FUNCTION forget_entity(
  p_org_id uuid,
  p_entity_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted_memories int := 0;
  v_updated_memories int := 0;
  v_deleted_decisions int := 0;
  v_affected_ids uuid[];
BEGIN
  -- 1. Find memories solely about this entity (delete them)
  WITH sole_entity_memories AS (
    SELECT id FROM memory_entries
    WHERE org_id = p_org_id
      AND entity_ids = ARRAY[p_entity_id]::uuid[]
  )
  DELETE FROM memory_entries
  WHERE id IN (SELECT id FROM sole_entity_memories)
  RETURNING id INTO v_affected_ids;

  GET DIAGNOSTICS v_deleted_memories = ROW_COUNT;

  -- 2. Remove entity from memories that reference multiple entities
  UPDATE memory_entries
  SET entity_ids = array_remove(entity_ids, p_entity_id),
      entity_names = (
        SELECT array_agg(n)
        FROM unnest(entity_names) WITH ORDINALITY AS t(n, i)
        WHERE i != (
          SELECT ordinality FROM unnest(entity_ids) WITH ORDINALITY AS e(eid, ordinality)
          WHERE eid = p_entity_id LIMIT 1
        )
      )
  WHERE org_id = p_org_id
    AND p_entity_id = ANY(entity_ids)
    AND array_length(entity_ids, 1) > 1;

  GET DIAGNOSTICS v_updated_memories = ROW_COUNT;

  -- 3. Delete decisions linked to deleted memories
  DELETE FROM memory_decisions
  WHERE org_id = p_org_id
    AND memory_entry_id = ANY(COALESCE(v_affected_ids, '{}'::uuid[]));

  GET DIAGNOSTICS v_deleted_decisions = ROW_COUNT;

  -- 4. Log the forget operation
  INSERT INTO memory_consolidation_log (org_id, operation, affected_memory_ids, details)
  VALUES (
    p_org_id,
    'forget_entity',
    COALESCE(v_affected_ids, '{}'::uuid[]),
    jsonb_build_object(
      'entity_id', p_entity_id,
      'deleted_memories', v_deleted_memories,
      'updated_memories', v_updated_memories,
      'deleted_decisions', v_deleted_decisions,
      'forgotten_at', now()
    )
  );

  RETURN jsonb_build_object(
    'deleted_memories', v_deleted_memories,
    'updated_memories', v_updated_memories,
    'deleted_decisions', v_deleted_decisions
  );
END;
$$;

-- Decay confidence on stale memories
CREATE OR REPLACE FUNCTION decay_stale_memories(
  p_org_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decayed int := 0;
  v_archived int := 0;
BEGIN
  -- Apply decay based on decay_rate and time since last corroboration/creation
  UPDATE memory_entries
  SET confidence = GREATEST(0.0, confidence - CASE decay_rate
    WHEN 'fast' THEN 0.05
    WHEN 'normal' THEN 0.02
    WHEN 'slow' THEN 0.008
    WHEN 'never' THEN 0.0
  END)
  WHERE org_id = p_org_id
    AND is_active = true
    AND decay_rate != 'never'
    AND (last_corroborated_at IS NULL OR last_corroborated_at < now() - interval '7 days')
    AND updated_at < now() - interval '1 day';

  GET DIAGNOSTICS v_decayed = ROW_COUNT;

  -- Archive memories that decayed below threshold
  UPDATE memory_entries
  SET is_active = false,
      archived_at = now(),
      archive_reason = 'confidence_decay'
  WHERE org_id = p_org_id
    AND is_active = true
    AND confidence < 0.1;

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- Log
  IF v_decayed > 0 OR v_archived > 0 THEN
    INSERT INTO memory_consolidation_log (org_id, operation, details)
    VALUES (p_org_id, 'decay', jsonb_build_object(
      'decayed', v_decayed,
      'archived', v_archived,
      'run_at', now()
    ));
  END IF;

  RETURN jsonb_build_object('decayed', v_decayed, 'archived', v_archived);
END;
$$;
