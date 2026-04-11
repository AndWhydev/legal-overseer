-- Fix spreading_activation RPC
-- 1. VOLATILE instead of STABLE (temp tables require volatile)
-- 2. #variable_conflict use_column to resolve ambiguity between RETURNS TABLE
--    column names and temp table column names

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
