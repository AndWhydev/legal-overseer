-- ============================================================================
-- Neural Knowledge Graph — Hebbian synaptic schema
-- Transforms sparse entity graph into brain-like associative network
-- ============================================================================

-- Extend node types to support richer concept taxonomy
ALTER TABLE kg_nodes DROP CONSTRAINT IF EXISTS kg_nodes_node_type_check;
ALTER TABLE kg_nodes ADD CONSTRAINT kg_nodes_node_type_check
  CHECK (node_type IN (
    'Person', 'Organization', 'Topic',
    'Concept', 'Project', 'Skill', 'Event', 'Location', 'Decision'
  ));

-- Add neural properties to nodes
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS activation_level float NOT NULL DEFAULT 0;
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS fire_count integer NOT NULL DEFAULT 0;
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS last_fired_at timestamptz;
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

-- Extend edge types for synaptic connections
ALTER TABLE kg_edges DROP CONSTRAINT IF EXISTS kg_edges_edge_type_check;
ALTER TABLE kg_edges ADD CONSTRAINT kg_edges_edge_type_check
  CHECK (edge_type IN (
    'MENTIONED_IN', 'DISCUSSED', 'CONTACTED_BY',
    'RELATES_TO', 'CO_OCCURS', 'LEADS_TO', 'PART_OF', 'DERIVES_FROM'
  ));

-- Add synaptic properties to edges
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS weight float NOT NULL DEFAULT 0.1;
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS fire_count integer NOT NULL DEFAULT 1;
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS last_fired_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS decay_rate float NOT NULL DEFAULT 0.01;

-- Indexes for neural queries
CREATE INDEX IF NOT EXISTS idx_kg_nodes_activation
  ON kg_nodes (org_id, activation_level DESC)
  WHERE activation_level > 0;

CREATE INDEX IF NOT EXISTS idx_kg_edges_weight
  ON kg_edges (org_id, weight DESC)
  WHERE expired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kg_nodes_type_name
  ON kg_nodes (org_id, node_type, name);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_aliases
  ON kg_nodes USING gin (aliases)
  WHERE aliases != '{}';

-- Full-text search on node names and descriptions
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_kg_nodes_search ON kg_nodes USING gin (search_tsv);

-- ============================================================================
-- Hebbian weight update function
-- "Neurons that fire together wire together"
-- w = w + α * (1 - w), where α = learning_rate
-- Creates bidirectional edges for CO_OCCURS and RELATES_TO
-- ============================================================================
CREATE OR REPLACE FUNCTION hebbian_strengthen(
  p_org_id uuid,
  p_source_id text,
  p_target_id text,
  p_edge_type text DEFAULT 'CO_OCCURS',
  p_learning_rate float DEFAULT 0.1
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO kg_edges (org_id, source_id, target_id, edge_type, weight, fire_count, last_fired_at)
  VALUES (p_org_id, p_source_id, p_target_id, p_edge_type, p_learning_rate, 1, now())
  ON CONFLICT (org_id, source_id, target_id, edge_type)
  DO UPDATE SET
    weight = kg_edges.weight + p_learning_rate * (1.0 - kg_edges.weight),
    fire_count = kg_edges.fire_count + 1,
    last_fired_at = now(),
    updated_at = now();

  -- Bidirectional for undirected relationship types
  IF p_edge_type IN ('CO_OCCURS', 'RELATES_TO') THEN
    INSERT INTO kg_edges (org_id, source_id, target_id, edge_type, weight, fire_count, last_fired_at)
    VALUES (p_org_id, p_target_id, p_source_id, p_edge_type, p_learning_rate, 1, now())
    ON CONFLICT (org_id, source_id, target_id, edge_type)
    DO UPDATE SET
      weight = kg_edges.weight + p_learning_rate * (1.0 - kg_edges.weight),
      fire_count = kg_edges.fire_count + 1,
      last_fired_at = now(),
      updated_at = now();
  END IF;
END;
$$;

-- ============================================================================
-- Spreading activation query
-- Fires a seed node and propagates activation through weighted edges,
-- decaying by distance and time since last fire.
-- Returns all activated nodes sorted by activation level.
-- ============================================================================
CREATE OR REPLACE FUNCTION spreading_activation(
  p_org_id uuid,
  p_seed_entity_id text,
  p_max_depth int DEFAULT 3,
  p_decay_factor float DEFAULT 0.5,
  p_min_activation float DEFAULT 0.05,
  p_time_decay_lambda float DEFAULT 0.01
)
RETURNS TABLE (
  entity_id text,
  node_type text,
  name text,
  activation float,
  depth int,
  path text[]
)
LANGUAGE plpgsql
VOLATILE
AS $$
#variable_conflict use_column
DECLARE
  v_current_depth int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _sa_activation (
    entity_id text PRIMARY KEY,
    node_type text,
    name text,
    activation float,
    depth int,
    path text[]
  ) ON COMMIT DROP;

  TRUNCATE _sa_activation;

  -- Seed node fires at activation = 1.0
  INSERT INTO _sa_activation
  SELECT n.entity_id, n.node_type, n.name, 1.0, 0, ARRAY[n.entity_id]
  FROM kg_nodes n
  WHERE n.org_id = p_org_id AND n.entity_id = p_seed_entity_id
  LIMIT 1;

  -- BFS propagation with weighted decay
  WHILE v_current_depth < p_max_depth LOOP
    INSERT INTO _sa_activation (entity_id, node_type, name, activation, depth, path)
    SELECT DISTINCT ON (n.entity_id)
      n.entity_id,
      n.node_type,
      n.name,
      a.activation * e.weight
        * EXP(-p_time_decay_lambda * EXTRACT(EPOCH FROM (now() - e.last_fired_at)) / 86400.0)
        * p_decay_factor,
      v_current_depth + 1,
      a.path || n.entity_id
    FROM _sa_activation a
    JOIN kg_edges e ON e.org_id = p_org_id
      AND e.source_id = a.entity_id
      AND (e.expired_at IS NULL)
    JOIN kg_nodes n ON n.org_id = p_org_id
      AND n.entity_id = e.target_id
    WHERE a.depth = v_current_depth
      AND NOT EXISTS (SELECT 1 FROM _sa_activation x WHERE x.entity_id = n.entity_id)
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
-- Batch temporal decay — run daily via cron
-- Applies exponential decay to all edge weights and prunes dead synapses
-- ============================================================================
CREATE OR REPLACE FUNCTION neural_decay_batch(
  p_prune_threshold float DEFAULT 0.01
)
RETURNS TABLE (total_edges bigint, pruned bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total bigint;
  v_pruned bigint;
BEGIN
  -- Apply temporal decay: w = w * e^(-λ * days_since_fire)
  UPDATE kg_edges SET
    weight = weight * EXP(-decay_rate * EXTRACT(EPOCH FROM (now() - last_fired_at)) / 86400.0),
    updated_at = now()
  WHERE weight > p_prune_threshold
    AND last_fired_at < now() - interval '1 day';

  GET DIAGNOSTICS v_total = ROW_COUNT;

  -- Prune dead synapses (weight below threshold and not recently fired)
  DELETE FROM kg_edges
  WHERE weight < p_prune_threshold
    AND last_fired_at < now() - interval '7 days';

  GET DIAGNOSTICS v_pruned = ROW_COUNT;

  RETURN QUERY SELECT v_total, v_pruned;
END;
$$;
