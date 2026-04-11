# Neural Knowledge Graph — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform BitBit's sparse knowledge graph into a brain-like neural network with Hebbian learning, spreading activation, temporal decay, and associative discovery — like Obsidian's bidirectional linking but with AI-driven connection strength and emergent topic clusters.

**Architecture:** Extend the existing `kg_nodes`/`kg_edges` Supabase tables with new node types, synaptic edge types with weight/decay, and a server-side neural graph engine. The engine runs spreading activation queries and Hebbian weight updates. The Knowledge tab gets a force-directed graph visualizer with real-time exploration.

**Tech Stack:** Supabase (storage), TypeScript neural engine (server), React force-graph (UI), existing embedding pipeline (trigger)

---

## Core Concepts

### Hebbian Learning: "Neurons that fire together wire together"
- When two concepts co-occur in a message/conversation, their connection strengthens
- Weight formula: `w = w + α * (1 - w)` where α = learning rate (0.1)
- Reinforcement: each co-occurrence bumps `fire_count` and recalculates weight

### Spreading Activation
- Query a concept → it "fires" with activation=1.0
- Connected nodes activate proportional to edge weight × decay factor
- Activation propagates up to 4 hops, decaying by 0.5× per hop
- Returns activation landscape: all concepts that "lit up" sorted by activation level

### Temporal Decay
- Synapses weaken over time: `w_effective = w * e^(-λ * days_since_last_fire)`
- λ = 0.01 (slow decay, ~70 day half-life for weight=1.0)
- Firing resets the decay clock
- Concepts that haven't been mentioned in months fade, but never fully disappear

### Emergent Clusters
- Topics naturally cluster through co-occurrence patterns
- Community detection via connected component analysis with weight threshold
- Clusters get auto-labels from their highest-weight member

---

## Task 1: Database Migration — Neural Schema

**Files:**
- Create: `personal-assistant/supabase/migrations/135_neural_knowledge_graph.sql`

```sql
-- ============================================================================
-- Neural Knowledge Graph — Hebbian synaptic schema
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
DECLARE
  v_current_weight float;
BEGIN
  -- Upsert edge with Hebbian weight update
  INSERT INTO kg_edges (org_id, source_id, target_id, edge_type, weight, fire_count, last_fired_at)
  VALUES (p_org_id, p_source_id, p_target_id, p_edge_type, p_learning_rate, 1, now())
  ON CONFLICT (org_id, source_id, target_id, edge_type)
  DO UPDATE SET
    weight = kg_edges.weight + p_learning_rate * (1.0 - kg_edges.weight),
    fire_count = kg_edges.fire_count + 1,
    last_fired_at = now(),
    updated_at = now();

  -- Also create reverse edge (bidirectional) for undirected relationships
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
-- Spreading activation query function
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
STABLE
AS $$
DECLARE
  v_current_depth int := 0;
BEGIN
  -- Create temp table for BFS with activation levels
  CREATE TEMP TABLE IF NOT EXISTS _activation (
    entity_id text PRIMARY KEY,
    node_type text,
    name text,
    activation float,
    depth int,
    path text[]
  ) ON COMMIT DROP;

  TRUNCATE _activation;

  -- Seed node
  INSERT INTO _activation
  SELECT n.entity_id, n.node_type, n.name, 1.0, 0, ARRAY[n.entity_id]
  FROM kg_nodes n
  WHERE n.org_id = p_org_id AND n.entity_id = p_seed_entity_id
  LIMIT 1;

  -- BFS propagation
  WHILE v_current_depth < p_max_depth LOOP
    INSERT INTO _activation (entity_id, node_type, name, activation, depth, path)
    SELECT DISTINCT ON (n.entity_id)
      n.entity_id,
      n.node_type,
      n.name,
      a.activation * e.weight
        * EXP(-p_time_decay_lambda * EXTRACT(EPOCH FROM (now() - e.last_fired_at)) / 86400.0)
        * p_decay_factor,
      v_current_depth + 1,
      a.path || n.entity_id
    FROM _activation a
    JOIN kg_edges e ON e.org_id = p_org_id
      AND e.source_id = a.entity_id
      AND (e.expired_at IS NULL)
    JOIN kg_nodes n ON n.org_id = p_org_id
      AND n.entity_id = e.target_id
    WHERE a.depth = v_current_depth
      AND NOT EXISTS (SELECT 1 FROM _activation x WHERE x.entity_id = n.entity_id)
      AND a.activation * e.weight * p_decay_factor >= p_min_activation
    ON CONFLICT (entity_id) DO UPDATE SET
      activation = GREATEST(_activation.activation, EXCLUDED.activation);

    v_current_depth := v_current_depth + 1;
  END LOOP;

  RETURN QUERY
  SELECT a.entity_id, a.node_type, a.name, a.activation, a.depth, a.path
  FROM _activation a
  ORDER BY a.activation DESC;
END;
$$;
```

**Step 1:** Apply migration to remote DB
Run: `npx supabase db query --linked --file personal-assistant/supabase/migrations/135_neural_knowledge_graph.sql`

**Step 2:** Verify
Run: `npx supabase db query --linked "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'kg_edges' AND column_name IN ('weight', 'fire_count', 'decay_rate')"`

---

## Task 2: Neural Graph Engine

**Files:**
- Create: `personal-assistant/src/lib/neural-graph/engine.ts`
- Create: `personal-assistant/src/lib/neural-graph/types.ts`
- Create: `personal-assistant/src/lib/neural-graph/co-occurrence.ts`

The engine handles:
- Spreading activation queries (calls the Supabase RPC function)
- Hebbian weight updates (calls the RPC function)
- Co-occurrence extraction from text
- Concept upsert with alias resolution
- Graph statistics and cluster detection

**Types** (`types.ts`):
```typescript
export interface NeuralNode {
  id: string
  entityId: string
  nodeType: 'Person' | 'Organization' | 'Topic' | 'Concept' | 'Project' | 'Skill' | 'Event' | 'Location' | 'Decision'
  name: string
  description?: string
  aliases: string[]
  activationLevel: number
  fireCount: number
  lastFiredAt: string | null
  metadata: Record<string, unknown>
}

export interface Synapse {
  id: string
  sourceId: string
  targetId: string
  edgeType: 'RELATES_TO' | 'CO_OCCURS' | 'LEADS_TO' | 'PART_OF' | 'DERIVES_FROM' | 'MENTIONED_IN' | 'DISCUSSED' | 'CONTACTED_BY'
  weight: number
  fireCount: number
  lastFiredAt: string
  decayRate: number
  effectiveWeight?: number // weight after temporal decay
}

export interface ActivationResult {
  entityId: string
  nodeType: string
  name: string
  activation: number
  depth: number
  path: string[]
}

export interface GraphCluster {
  id: string
  label: string
  members: NeuralNode[]
  cohesion: number // avg internal weight
}
```

**Engine** (`engine.ts`):
- `activate(seedEntityId: string, opts?)` → calls `spreading_activation` RPC
- `strengthen(sourceId, targetId, edgeType?)` → calls `hebbian_strengthen` RPC
- `upsertConcept(name, type, opts?)` → creates/finds node with alias matching
- `findOrCreateByName(name, type)` → fuzzy match on name/aliases before creating
- `getNeighbors(entityId, minWeight?)` → direct connections above threshold
- `findPath(fromId, toId)` → shortest weighted path between two concepts
- `getClusters(minWeight?)` → connected component analysis
- `getHotTopics(limit?)` → highest recent activation
- `decayAll()` → batch apply temporal decay to all edges (cron job)

**Co-occurrence** (`co-occurrence.ts`):
- `extractAndLink(text, orgId, messageContext)` → find all concepts in text, create CO_OCCURS edges between each pair
- Uses simple NLP: extract noun phrases, named entities, and known node names
- For each pair of extracted concepts: call `hebbian_strengthen`

---

## Task 3: Co-occurrence Extraction Pipeline

**Files:**
- Create: `personal-assistant/src/lib/neural-graph/concept-extractor.ts`
- Modify: `personal-assistant/src/lib/rag/graph-populator.ts`

The extractor:
1. Takes message text + metadata
2. Extracts entities using existing `extractEntities()` function
3. Additionally extracts topic phrases (2-4 word noun phrases)
4. Looks up each extracted term against existing `kg_nodes` (fuzzy match on name/aliases)
5. Creates new Concept nodes for unknown terms
6. For every pair of concepts found in the same message: `hebbian_strengthen(a, b, 'CO_OCCURS')`
7. For sequential concepts (in the same sentence): `hebbian_strengthen(a, b, 'RELATES_TO')`

Integration point: modify `graph-populator.ts` to call the co-occurrence extractor after entity population.

---

## Task 4: Neural Graph API Routes

**Files:**
- Create: `personal-assistant/src/app/api/knowledge/neural/route.ts`

Endpoints:
- `GET /api/knowledge/neural?activate=<entityId>&depth=3` → spreading activation
- `GET /api/knowledge/neural?neighbors=<entityId>&minWeight=0.1` → direct connections
- `GET /api/knowledge/neural?path=<fromId>&to=<toId>` → find path
- `GET /api/knowledge/neural?clusters=true&minWeight=0.2` → topic clusters
- `GET /api/knowledge/neural?hot=true&limit=20` → hot topics
- `GET /api/knowledge/neural?search=<query>` → full-text search on nodes
- `POST /api/knowledge/neural` → manually link two concepts

---

## Task 5: Knowledge Tab — Neural Graph Visualizer

**Files:**
- Create: `personal-assistant/src/components/knowledge/neural-graph-viewer.tsx`
- Create: `personal-assistant/src/components/knowledge/activation-panel.tsx`
- Create: `personal-assistant/src/components/knowledge/concept-detail.tsx`
- Modify: `personal-assistant/src/components/dashboard/tabs/knowledge-tab.tsx`

The visualizer:
- Force-directed graph layout (custom canvas renderer, no heavy deps)
- Node size = activation level (bigger = more active)
- Edge thickness = synaptic weight (thicker = stronger connection)
- Edge opacity = temporal freshness (fading = hasn't fired recently)
- Node color by type: Person=blue, Concept=purple, Topic=green, Project=amber, Skill=cyan
- Click node → spreading activation radiates out visually (wave animation)
- Click node → side panel shows: connections, activation history, co-occurring concepts
- Search bar → type concept name, graph centers on it with activation glow
- Cluster view → toggle to show topic clusters as colored regions
- "What connects X to Y?" → highlights shortest path

---

## Task 6: Context Integration — Neural Recall

**Files:**
- Modify: `personal-assistant/src/lib/context/baseplate-snapshot.ts`
- Modify: `personal-assistant/src/lib/rag/retriever.ts`

When the AI responds to a message:
1. Extract concepts from the user's message
2. Run spreading activation on each concept
3. Include activated concepts in the context window as "Neural context"
4. Format: "Related concepts (by association strength): X (0.8), Y (0.6), Z (0.4)"
5. This gives the AI associative recall — mentioning "Steve West" activates "real estate", "SEO", "presale", etc.

---

## Task 7: Decay Cron Job

**Files:**
- Create: `personal-assistant/src/app/api/cron/neural-decay/route.ts`

Runs daily:
1. Apply temporal decay to all edge weights: `w = w * e^(-λ * days_since_fire)`
2. Remove edges with effective weight < 0.01 (pruning dead synapses)
3. Reset node activation_level to 0 (activations are transient per query)
4. Log stats: total nodes, edges, pruned count

---

## Dependency Map

```
Task 1 (migration) ──→ Task 2 (engine) ──→ Task 3 (co-occurrence)
                                        ──→ Task 4 (API routes)
                                        ──→ Task 6 (context integration)
                       Task 2 (engine) ──→ Task 5 (visualizer)
                                        ──→ Task 7 (decay cron)
```

Tasks 3-7 all depend on Task 2. Tasks 3, 4, 5, 6, 7 can be parallelized after Task 2.
