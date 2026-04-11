-- ============================================================================
-- Phase 44-03: Unified Neural Knowledge Graph
-- Merges kg_nodes/kg_edges neural properties into entity_nodes/entity_edges,
-- creating a single graph with Hebbian synaptic learning and spreading
-- activation.  kg_nodes/kg_edges are NOT dropped (kept for audit trail).
-- ============================================================================

-- ============================================================================
-- 1. Add neural columns to entity_nodes
-- ============================================================================

ALTER TABLE entity_nodes ADD COLUMN IF NOT EXISTS activation_level FLOAT NOT NULL DEFAULT 0;
ALTER TABLE entity_nodes ADD COLUMN IF NOT EXISTS fire_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entity_nodes ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMPTZ;
ALTER TABLE entity_nodes ADD COLUMN IF NOT EXISTS description TEXT;

-- Full-text search vector (generated column)
-- Must use DO block because ADD COLUMN IF NOT EXISTS + GENERATED ALWAYS is not
-- idempotent in plain ALTER TABLE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_nodes' AND column_name = 'search_tsv'
  ) THEN
    ALTER TABLE entity_nodes ADD COLUMN search_tsv TSVECTOR
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED;
  END IF;
END $$;

-- ============================================================================
-- 2. Add synaptic columns to entity_edges
-- ============================================================================

ALTER TABLE entity_edges ADD COLUMN IF NOT EXISTS weight FLOAT NOT NULL DEFAULT 0.1;
ALTER TABLE entity_edges ADD COLUMN IF NOT EXISTS fire_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE entity_edges ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE entity_edges ADD COLUMN IF NOT EXISTS decay_rate FLOAT NOT NULL DEFAULT 0.01;
ALTER TABLE entity_edges ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- ============================================================================
-- 3. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_entity_nodes_activation
  ON entity_nodes (org_id, activation_level DESC)
  WHERE activation_level > 0;

CREATE INDEX IF NOT EXISTS idx_entity_edges_weight
  ON entity_edges (org_id, weight DESC)
  WHERE expired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entity_nodes_search
  ON entity_nodes USING gin (search_tsv);

-- Unique constraint for Hebbian upserts (one edge per directed relation)
-- Clean up duplicate edges before unique constraint
DELETE FROM entity_edges a USING entity_edges b
WHERE a.id > b.id
  AND a.org_id = b.org_id
  AND a.source_id = b.source_id
  AND a.target_id = b.target_id
  AND a.relation_type = b.relation_type
  AND a.relation_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_edges_unique_rel
  ON entity_edges (org_id, source_id, target_id, relation_type)
  WHERE relation_type IS NOT NULL;

-- ============================================================================
-- 4. Migrate kg_nodes data into entity_nodes
-- ============================================================================

INSERT INTO entity_nodes (org_id, entity_type, name, aliases, properties, activation_level, fire_count, last_fired_at, description, created_at, updated_at)
SELECT
  kn.org_id,
  CASE kn.node_type
    WHEN 'Person'       THEN 'person'
    WHEN 'Organization' THEN 'company'
    WHEN 'Project'      THEN 'project'
    ELSE 'channel'
  END :: TEXT,
  kn.name,
  COALESCE(kn.aliases, '{}'),
  COALESCE(kn.metadata, '{}'),
  COALESCE(kn.activation_level, 0),
  COALESCE(kn.fire_count, 0),
  kn.last_fired_at,
  kn.description,
  kn.created_at,
  kn.updated_at
FROM kg_nodes kn
WHERE NOT EXISTS (
  SELECT 1 FROM entity_nodes en
  WHERE en.org_id = kn.org_id AND lower(en.name) = lower(kn.name)
);

-- ============================================================================
-- 5. Migrate kg_edges data into entity_edges
-- ============================================================================

WITH source_lookup AS (
  -- Map kg_nodes.entity_id -> entity_nodes.id
  -- Join on org_id + name (case-insensitive) since we just migrated by name
  SELECT kn.org_id, kn.entity_id AS kg_entity_id, en.id AS entity_uuid
  FROM kg_nodes kn
  JOIN entity_nodes en ON en.org_id = kn.org_id AND lower(en.name) = lower(kn.name)
)
INSERT INTO entity_edges (org_id, source_id, target_id, relation_type, properties, weight, fire_count, last_fired_at, decay_rate, confidence, valid_from, ingested_at)
SELECT
  ke.org_id,
  src.entity_uuid,
  tgt.entity_uuid,
  ke.edge_type,
  COALESCE(ke.metadata, '{}'),
  COALESCE(ke.weight, 0.1),
  COALESCE(ke.fire_count, 1),
  COALESCE(ke.last_fired_at, now()),
  COALESCE(ke.decay_rate, 0.01),
  0.8,
  ke.created_at,
  ke.created_at
FROM kg_edges ke
JOIN source_lookup src ON src.org_id = ke.org_id AND src.kg_entity_id = ke.source_id
JOIN source_lookup tgt ON tgt.org_id = ke.org_id AND tgt.kg_entity_id = ke.target_id
ON CONFLICT (org_id, source_id, target_id, relation_type) WHERE relation_type IS NOT NULL
DO NOTHING;

-- ============================================================================
-- 6. Hebbian strengthen function (UUID-based, operates on entity_edges)
-- ============================================================================

CREATE OR REPLACE FUNCTION hebbian_strengthen(
  p_org_id UUID,
  p_source_id UUID,
  p_target_id UUID,
  p_edge_type TEXT DEFAULT 'CO_OCCURS',
  p_learning_rate FLOAT DEFAULT 0.1
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO entity_edges (org_id, source_id, target_id, relation_type, weight, fire_count, last_fired_at, confidence, valid_from)
  VALUES (p_org_id, p_source_id, p_target_id, p_edge_type, p_learning_rate, 1, now(), 0.8, now())
  ON CONFLICT (org_id, source_id, target_id, relation_type) WHERE relation_type IS NOT NULL
  DO UPDATE SET
    weight = entity_edges.weight + p_learning_rate * (1.0 - entity_edges.weight),
    fire_count = entity_edges.fire_count + 1,
    last_fired_at = now();

  -- Bidirectional for undirected relationship types
  IF p_edge_type IN ('CO_OCCURS', 'RELATES_TO') THEN
    INSERT INTO entity_edges (org_id, source_id, target_id, relation_type, weight, fire_count, last_fired_at, confidence, valid_from)
    VALUES (p_org_id, p_target_id, p_source_id, p_edge_type, p_learning_rate, 1, now(), 0.8, now())
    ON CONFLICT (org_id, source_id, target_id, relation_type) WHERE relation_type IS NOT NULL
    DO UPDATE SET
      weight = entity_edges.weight + p_learning_rate * (1.0 - entity_edges.weight),
      fire_count = entity_edges.fire_count + 1,
      last_fired_at = now();
  END IF;
END;
$$;

-- ============================================================================
-- 7. Spreading activation function (UUID-based, operates on entity tables)
-- ============================================================================

CREATE OR REPLACE FUNCTION spreading_activation(
  p_org_id UUID,
  p_seed_entity_id UUID,
  p_max_depth INT DEFAULT 3,
  p_decay_factor FLOAT DEFAULT 0.5,
  p_min_activation FLOAT DEFAULT 0.05,
  p_time_decay_lambda FLOAT DEFAULT 0.01
)
RETURNS TABLE (
  entity_id UUID,
  node_type TEXT,
  name TEXT,
  activation FLOAT,
  depth INT,
  path UUID[]
)
LANGUAGE plpgsql
VOLATILE
AS $$
#variable_conflict use_column
DECLARE
  v_current_depth INT := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _sa_activation (
    entity_id UUID PRIMARY KEY,
    node_type TEXT,
    name TEXT,
    activation FLOAT,
    depth INT,
    path UUID[]
  ) ON COMMIT DROP;

  TRUNCATE _sa_activation;

  -- Seed node fires at activation = 1.0
  INSERT INTO _sa_activation
  SELECT n.id, n.entity_type, n.name, 1.0, 0, ARRAY[n.id]
  FROM entity_nodes n
  WHERE n.org_id = p_org_id AND n.id = p_seed_entity_id
  LIMIT 1;

  -- BFS propagation with weighted decay
  WHILE v_current_depth < p_max_depth LOOP
    INSERT INTO _sa_activation (entity_id, node_type, name, activation, depth, path)
    SELECT DISTINCT ON (n.id)
      n.id,
      n.entity_type,
      n.name,
      a.activation * e.weight
        * EXP(-p_time_decay_lambda * EXTRACT(EPOCH FROM (now() - e.last_fired_at)) / 86400.0)
        * p_decay_factor,
      v_current_depth + 1,
      a.path || n.id
    FROM _sa_activation a
    JOIN entity_edges e ON e.org_id = p_org_id
      AND e.source_id = a.entity_id
      AND (e.expired_at IS NULL)
    JOIN entity_nodes n ON n.org_id = p_org_id
      AND n.id = e.target_id
    WHERE a.depth = v_current_depth
      AND NOT EXISTS (SELECT 1 FROM _sa_activation x WHERE x.entity_id = n.id)
      AND a.activation * e.weight * p_decay_factor >= p_min_activation
    ON CONFLICT (entity_id) DO UPDATE SET
      activation = GREATEST(_sa_activation.activation, EXCLUDED.activation);

    v_current_depth := v_current_depth + 1;
  END LOOP;

  RETURN QUERY
  SELECT a.entity_id, a.node_type, a.name, a.activation, a.depth, a.path
  FROM _sa_activation a
  ORDER BY a.activation DESC;
END;
$$;

-- ============================================================================
-- 8. Neural decay batch (operates on entity_edges)
-- ============================================================================

CREATE OR REPLACE FUNCTION neural_decay_batch(
  p_prune_threshold FLOAT DEFAULT 0.01
)
RETURNS TABLE (total_edges BIGINT, pruned BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total BIGINT;
  v_pruned BIGINT;
BEGIN
  -- Apply temporal decay: w = w * e^(-lambda * days_since_fire)
  UPDATE entity_edges SET
    weight = weight * EXP(-decay_rate * EXTRACT(EPOCH FROM (now() - last_fired_at)) / 86400.0)
  WHERE weight > p_prune_threshold
    AND last_fired_at < now() - interval '1 day';

  GET DIAGNOSTICS v_total = ROW_COUNT;

  -- Mark dead synapses as expired (weight below threshold and not recently fired)
  UPDATE entity_edges SET
    expired_at = now()
  WHERE weight < p_prune_threshold
    AND last_fired_at < now() - interval '7 days'
    AND expired_at IS NULL;

  GET DIAGNOSTICS v_pruned = ROW_COUNT;

  RETURN QUERY SELECT v_total, v_pruned;
END;
$$;
