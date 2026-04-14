# Technology Stack: v3.0 Cognitive Omniscience Features

**Project:** BitBit v3.0 Omniscience Activation
**Researched:** 2026-04-14
**Overall confidence:** HIGH (builds on validated existing infrastructure, minimal new dependencies)

## Executive Summary

The v3.0 cognitive features (Theory of Mind, Causal Graphs, Anomaly Detection, Active Learning, Temporal Constraint Solving, Goal Decomposition, Metacognition) require only **2 new npm packages** on top of the existing stack. The core insight: these are fundamentally LLM reasoning tasks with structured output, not traditional algorithmic problems. Claude extracts beliefs, identifies causes, generates questions. Graphology handles in-memory graph algorithms (topological sort, critical path). simple-statistics provides the statistical math (z-scores, regression). Postgres stores everything.

**New production dependencies: 2** (`graphology` ecosystem, `simple-statistics`)
**New infrastructure: 0** (no new databases, no new services, no new cloud vendors)
**Estimated additional cost: $0/month** (only LLM token cost increase from new extraction prompts)

---

## Existing Stack (DO NOT CHANGE)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2+ | App framework |
| React | 19.2+ | UI |
| TypeScript | 5.x | Language |
| Supabase (Postgres + pgvector) | 2.95.3 client | DB, auth, realtime, vector search |
| Anthropic Claude (via AI SDK) | 3.0.69+ | Agent engine, structured extraction |
| AI SDK (`ai`) | 6.0.158+ | LLM orchestration, `generateObject()` |
| Zod | 4.3.6 | Schema validation, structured output schemas |
| Vitest | 4.0+ | Testing |

## Existing Brain Infrastructure (Foundation for New Features)

| Subsystem | Location | Relevance to v3.0 |
|-----------|----------|-------------------|
| entity_nodes / entity_edges | `20260404000001`, `20260409000002` | Neural graph with activation_level, weight, decay_rate. Causal edges + goal edges go here. |
| Hebbian learning RPC | `hebbian_strengthen()` | Strengthens causal edges on repeated co-occurrence |
| Spreading activation RPC | `spreading_activation()` | Finds related entities for Theory of Mind context gathering |
| Neural decay batch | `neural_decay_batch()` | Decays stale causal edges and goal priorities |
| knowledge_log WAL | `20260411000001` | Write-ahead log feeds anomaly detection baseline |
| Entity dossiers + schema_json | same migration | Stores belief models per entity (Theory of Mind) |
| Predictive coding engine | `brain/predictive-coding.ts` | Surprise scoring IS anomaly detection at the fact level |
| 3-tier consolidation | `brain/brain-consolidation.ts` | Pipeline where cognitive extraction hooks in |
| Global workspace | `brain/global-workspace.ts` | Competitive allocation for new cognitive modules |
| Query gate (System 1/2) | `brain/query-gate.ts` | Routes queries to appropriate cognitive feature |
| Memory Palace patterns | `memory-palace/pattern-detector.ts` | Existing pattern detection feeds anomaly baselines |
| Bitemporal edges | `087_bitemporal_edges.sql` | valid_from/valid_until enables "what did X know at time T?" |
| Strategy memories | same migration | Reflexion loop for active learning feedback |
| event_tuples | `20260404000001` | Subject-verb-object facts feed causal extraction |

---

## Recommended Stack Additions

### 1. Graphology (In-Memory Graph Engine)

| Property | Value |
|----------|-------|
| **Package** | `graphology` + standard library modules |
| **Version** | `0.26.0` |
| **Confidence** | **HIGH** -- 264+ npm dependents, TypeScript types included, actively maintained (Jan 2025 update) |
| **Purpose** | In-memory graph algorithms for causal reasoning, goal decomposition, and temporal constraint solving |

**Why:** The entity_edges table with recursive CTEs handles persistence and simple traversal, but the cognitive features need fast in-memory graph algorithms that are awkward or impossible in SQL:

- **Topological sort** for causal chains ("A causes B causes C" -- what's the root cause?)
- **Cycle detection** for circular dependencies in goals
- **Shortest path** for causal distance ("how directly does X affect Y?")
- **Connected components** for goal clustering and dependency islands
- **Critical path analysis** for temporal constraint propagation through goal hierarchy
- **DAG generation grouping** for layered causal visualization

Graphology is the only serious JS/TS graph library with a comprehensive algorithm standard library. It handles directed, undirected, and mixed graphs under a unified interface.

**Why not alternatives:**

| Alternative | Why Not |
|-------------|---------|
| `graph-data-structure` (npm) | Too minimal, limited algorithms, no TypeScript types |
| `typescript-graph` | Unmaintained, limited API |
| Neo4j / external graph DB | Overkill operational complexity + $30+/mo cost for <100K edges per org |
| Pure Postgres recursive CTEs | Too slow for iterative multi-pass algorithms; no in-memory caching; topological sort requires multiple passes |
| `d3-force` (already installed) | Force-directed layout only, no graph algorithms |
| NetworkX (Python) | Wrong language, adds sidecar deployment complexity |

**Supporting packages:**

| Package | Version | Purpose | Used By |
|---------|---------|---------|---------|
| `graphology-dag` | `0.4.1` | `topologicalSort()`, `topologicalGenerations()` | Causal chains, Goal hierarchy |
| `graphology-shortest-path` | `2.1.0` | Dijkstra, BFS shortest path | Causal distance, impact propagation |
| `graphology-components` | `1.6.0` | Connected/strongly-connected components | Goal clustering, dependency islands |
| `graphology-traversal` | `0.3.1` | DFS/BFS traversal | Chain tracing, counterfactual paths |
| `graphology-types` | `0.24.7` | TypeScript type definitions | All modules |

**Integration pattern:** Load subgraphs from entity_edges into Graphology for computation, persist derived insights back to Postgres. The graph is ephemeral (per-request or per-consolidation-cycle), not a long-lived in-memory store.

```typescript
import Graph from 'graphology';
import { topologicalGenerations } from 'graphology-dag';
import { dijkstra } from 'graphology-shortest-path';

// Hydrate causal subgraph from entity_edges
async function buildCausalGraph(supabase, orgId: string): Promise<Graph> {
  const graph = new Graph({ type: 'directed', allowSelfLoops: false });
  const { data: edges } = await supabase
    .from('entity_edges')
    .select('source_id, target_id, relation_type, weight, properties')
    .eq('org_id', orgId)
    .in('relation_type', ['CAUSES', 'LEADS_TO', 'BLOCKS', 'ENABLES'])
    .is('expired_at', null);

  // Add nodes and edges, run algorithms, return insights
  return graph;
}
```

### 2. simple-statistics (Statistical Primitives)

| Property | Value |
|----------|-------|
| **Package** | `simple-statistics` |
| **Version** | `7.8.8` |
| **Confidence** | **HIGH** -- zero dependencies, 3M+ weekly downloads, TypeScript types included, battle-tested |
| **Purpose** | Z-score anomaly detection, statistical baselines, trend analysis, confidence scoring |

**Why:** Anomaly detection and metacognition need statistical primitives that are awkward to express in SQL and don't exist in the current codebase. The existing `PatternDetector` calculates mean/stddev manually -- simple-statistics provides validated, tested implementations.

**Functions we will use:**

| Function | Feature | Usage |
|----------|---------|-------|
| `zScore(value, mean, stddev)` | Anomaly Detection | Flag values >2 sigma from baseline |
| `standardDeviation(data)` | Anomaly Detection, Metacognition | Calculate variability baselines |
| `linearRegression(data)` | Anomaly Detection | Detect trend changes |
| `linearRegressionLine(mb)` | Anomaly Detection | Predict expected values for comparison |
| `quantile(data, p)` | Anomaly Detection | Dynamic threshold calculation |
| `median(data)` | Metacognition | Robust central tendency |
| `mean(data)` | Metacognition | Average confidence per domain |
| `interquartileRange(data)` | Anomaly Detection | Robust variability measure |

**Why not alternatives:**

| Alternative | Why Not |
|-------------|---------|
| TensorFlow.js | >100MB bundle, massive overkill for z-scores and regression |
| Python sidecar (scikit-learn) | Deployment complexity, cold start latency, language boundary |
| Custom implementation | Reinventing well-tested statistical functions |
| `mathjs` | 4x larger bundle, includes symbolic math/matrix ops we don't need |
| Postgres `pg_stat` | SQL aggregates work for simple queries but not for multi-step statistical analysis pipelines |

**Integration pattern:** Run during consolidation pipeline on time-series data from entity patterns (payment timing, response latency, communication frequency). Compare current values against baseline z-score.

```typescript
import { zScore, standardDeviation, linearRegression, mean } from 'simple-statistics';

function detectAnomaly(currentValue: number, history: number[]): AnomalyResult | null {
  const mu = mean(history);
  const sigma = standardDeviation(history);
  if (sigma === 0) return null;
  const z = zScore(currentValue, mu, sigma);
  if (Math.abs(z) < 2.0) return null; // Within normal range
  return { z_score: z, severity: Math.abs(z) > 3 ? 'critical' : 'warning', baseline_mean: mu };
}
```

### 3. AI SDK Structured Output + Zod Schemas (ALREADY INSTALLED)

| Property | Value |
|----------|-------|
| **Package** | `ai` (6.0.158+) + `zod` (4.3.6) |
| **Confidence** | **HIGH** -- already the core LLM interface, proven pattern in codebase |
| **Purpose** | Structured extraction for all cognitive feature outputs |

**Why this is the core technology:** These cognitive features are fundamentally LLM reasoning tasks, not algorithmic computation:

| Feature | What Claude Does | Why LLM, Not Algorithm |
|---------|-----------------|----------------------|
| Theory of Mind | "Given what entity X has observed, what do they believe vs ground truth?" | Requires natural language understanding of conversation context |
| Causal Graph | "Given these events, identify causal relationships" | Requires domain reasoning about mechanisms |
| Active Learning | "Given current confidence gaps, generate clarifying questions" | Requires judgment about information value |
| Goal Decomposition | "Break this goal into subtasks with dependencies" | Requires planning and domain knowledge |
| Metacognition | "Assess confidence per knowledge domain" | Requires self-reflection on knowledge quality |

**Anomaly Detection** is the exception -- it's primarily statistical (simple-statistics) with LLM used only for natural language explanation of detected anomalies.

**Key Zod schemas to define:**

```typescript
// Theory of Mind -- belief state per entity
const BeliefStateSchema = z.object({
  entity_id: z.string().uuid(),
  entity_name: z.string(),
  beliefs: z.array(z.object({
    topic: z.string(),
    belief: z.string(),
    ground_truth: z.string().nullable(),
    divergence: z.enum(['aligned', 'outdated', 'contradicted', 'unknown']),
    last_evidence_at: z.string().datetime(),
    confidence: z.number().min(0).max(1),
  })),
  information_asymmetries: z.array(z.object({
    fact: z.string(),
    known_by: z.array(z.string()),
    unknown_to: z.array(z.string()),
  })),
});

// Causal Graph -- extracted causal edge
const CausalEdgeSchema = z.object({
  cause_entity_id: z.string().uuid(),
  effect_entity_id: z.string().uuid(),
  mechanism: z.string(),
  strength: z.number().min(0).max(1),
  temporal_lag: z.string().nullable(), // e.g., "2-3 days"
  evidence_ids: z.array(z.string()),
  counterfactual: z.string().nullable(), // "If X hadn't happened, Y wouldn't have"
});

// Goal Decomposition -- goal tree node
const GoalNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  parent_id: z.string().nullable(),
  status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'abandoned']),
  dependencies: z.array(z.string()),
  estimated_hours: z.number().nullable(),
  deadline: z.string().datetime().nullable(),
  critical_path: z.boolean(),
  blockers: z.array(z.string()),
});

// Active Learning -- clarifying question
const ClarifyingQuestionSchema = z.object({
  question: z.string(),
  target_entity_id: z.string().uuid().nullable(),
  knowledge_gap: z.string(),
  expected_information_gain: z.number().min(0).max(1),
  urgency: z.enum(['low', 'medium', 'high']),
  suggested_channel: z.enum(['chat', 'email', 'proactive_surface']),
});

// Metacognition -- domain confidence
const DomainConfidenceSchema = z.object({
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  evidence_count: z.number(),
  last_updated: z.string().datetime(),
  known_gaps: z.array(z.string()),
  stale_areas: z.array(z.string()),
});
```

**Model routing per feature:**

| Feature | Model | Why |
|---------|-------|-----|
| Theory of Mind extraction | Sonnet | Needs reasoning about multiple perspectives |
| Causal edge identification | Sonnet | Needs domain reasoning about mechanisms |
| Anomaly explanation | Haiku | Fast, formatting only (stats already computed) |
| Clarifying question generation | Sonnet | Needs judgment about information value |
| Goal decomposition | Sonnet | Needs planning and dependency reasoning |
| Metacognitive assessment | Haiku | Fast self-assessment from structured data |
| Temporal constraint extraction | Haiku | Pattern matching on dates/deadlines |

### 4. Postgres Extensions and RPCs (ALREADY AVAILABLE)

| Property | Value |
|----------|-------|
| **Technology** | PostgreSQL 15+ via Supabase |
| **Confidence** | **HIGH** -- existing infrastructure, no new extensions needed |
| **Purpose** | Persistence, temporal queries, recursive traversal, new tables |

**No new Postgres extensions required.** Everything uses standard SQL + existing pgvector + existing plpgsql functions.

**New SQL constructs to create:**

| Construct | Feature | Purpose |
|-----------|---------|---------|
| Recursive CTE with `CYCLE` (PG14+) | Causal Graph | Trace causal chains with loop detection |
| Temporal range queries | Theory of Mind | "What did we know about X at time T?" using bitemporal edges |
| Interval arithmetic | Temporal Constraints | Deadline propagation: `deadline_a - duration_a = latest_start_a` |
| Trigger functions | Anomaly Detection | Fire on pattern_data changes that exceed z-score threshold |
| Materialized views | Metacognition | Pre-computed confidence per domain per org |

**New tables:**

| Table | Features Served | Key Columns |
|-------|----------------|-------------|
| `belief_states` | Theory of Mind | entity_id, topic, belief_text, ground_truth_text, divergence, confidence, evidence_ids |
| `anomaly_events` | Anomaly Detection | entity_id, metric_name, current_value, baseline_mean, z_score, severity, explanation, resolved_at |
| `clarification_queue` | Active Learning | entity_id, question, knowledge_gap, information_gain, status, asked_at, answered_at |
| `goal_nodes` | Goal Decomposition, Temporal Constraints | parent_id (self-ref), title, status, dependencies (uuid[]), deadline, estimated_hours, critical_path |
| `temporal_constraints` | Temporal Constraints | goal_id, constraint_type (deadline/duration/dependency), earliest_start, latest_finish, slack |
| `metacognitive_scores` | Metacognition | domain, confidence, evidence_count, known_gaps (text[]), stale_areas (text[]) |

**Note:** Causal edges do NOT get a separate table. They are entity_edges rows with `relation_type IN ('CAUSES', 'LEADS_TO', 'BLOCKS', 'ENABLES')`. This leverages the existing Hebbian learning, spreading activation, and decay infrastructure.

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **Neo4j / JanusGraph / external graph DB** | Adds $30+/mo cost, operational complexity, network latency. Entity graph is <100K edges per org. Postgres + Graphology handles this trivially. |
| **TensorFlow.js / ONNX Runtime** | >100MB bundle. Overkill for z-scores and linear regression. |
| **Python sidecar (NetworkX, scikit-learn)** | Adds deployment complexity, cold start latency, language boundary. Every algorithm exists in TypeScript. |
| **Redis / BullMQ** | Already installed but unused. Cron-based pipeline is simpler. No new infra dependency. |
| **Bayesian network libraries (bnjs, etc.)** | Poorly maintained in JS ecosystem, academic-oriented. LLM structured output is more flexible for causal reasoning. |
| **Temporal.io** | Enterprise-grade orchestration overkill. Simple interval arithmetic in TypeScript handles deadline propagation. |
| **kiwi.js / @lume/kiwi (Cassowary solver)** | Designed for UI layout constraints (linear equality/inequality). Temporal scheduling needs different constraint types (precedence, deadline propagation). Custom TypeScript is simpler. |
| **RxJS / reactive streams** | Adds conceptual complexity. Async/await in consolidation pipeline is clearer and sufficient. |
| **Separate anomaly detection service** | statistical z-score + LLM explanation covers 95% of cases without a dedicated ML service. |
| **Apache AGE (Postgres graph extension)** | Not available on Supabase. Even if it were, recursive CTEs + Graphology in-memory cover all needed graph ops. |

---

## Installation

```bash
cd personal-assistant

# New dependencies (only 2 new package groups)
npm install graphology graphology-types graphology-dag graphology-shortest-path graphology-components graphology-traversal simple-statistics
```

**Bundle impact:** ~45KB gzipped total (graphology ~30KB + simple-statistics ~15KB). Negligible compared to existing Next.js bundle. All graph operations are server-side only.

**No version bumps needed** on existing packages.

---

## Architecture Integration

```
                    ┌──────────────────────────────────┐
                    │      Claude (Sonnet / Haiku)      │
                    │   generateObject() + Zod schemas  │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │     Cognitive Feature Modules      │
                    │  ┌─────────────┐ ┌─────────────┐ │
                    │  │ theory-of-  │ │   causal-    │ │
                    │  │  mind.ts    │ │  graph.ts    │ │
                    │  ├─────────────┤ ├─────────────┤ │
                    │  │  anomaly-   │ │   active-    │ │
                    │  │ detector.ts │ │  learner.ts  │ │
                    │  ├─────────────┤ ├─────────────┤ │
                    │  │  goal-      │ │  temporal-   │ │
                    │  │ decompose.ts│ │  solver.ts   │ │
                    │  ├─────────────┤ └─────────────┘ │
                    │  │metacognition│                  │
                    │  │    .ts      │                  │
                    │  └─────────────┘                  │
                    └─────┬────────────┬──────────┬────┘
                          │            │          │
               ┌──────────▼──┐  ┌──────▼────┐  ┌─▼──────────┐
               │  Graphology  │  │  simple-  │  │  Postgres  │
               │  (in-memory) │  │ statistics│  │ (persist)  │
               │              │  │           │  │            │
               │ topo sort    │  │ z-score   │  │ entity_    │
               │ shortest path│  │ regression│  │  edges     │
               │ components   │  │ quantile  │  │ belief_    │
               │ DFS/BFS      │  │ stddev    │  │  states    │
               │ cycle detect │  │ mean      │  │ anomaly_   │
               └──────────────┘  └───────────┘  │  events    │
                                                │ goal_nodes │
                                                │ clarify_q  │
                                                │ metacog    │
                                                └────────────┘
```

**Data flow:** Consolidation pipeline (existing cron) --> new cognitive extraction hooks --> LLM structured output --> Graphology algorithms (where needed) --> Postgres persistence --> Global Workspace serves to context assembler.

---

## Feature-to-Stack Mapping

| Cognitive Feature | LLM (Claude) | Graphology | simple-statistics | New Postgres | Existing Infra Leveraged |
|-------------------|:---:|:---:|:---:|:---:|---|
| Theory of Mind | Sonnet | -- | -- | belief_states | Entity dossiers, knowledge_log, bitemporal edges, spreading activation |
| Causal Graph | Sonnet | topo sort, shortest path, DFS | -- | entity_edges (new relation types) | Hebbian learning, spreading activation, decay |
| Anomaly Detection | Haiku (explain) | -- | z-score, regression, IQR | anomaly_events | Pattern detector, predictive coding |
| Active Learning | Sonnet | -- | -- | clarification_queue | Confidence scores, strategy memories, query gate |
| Temporal Constraints | Haiku (extract) | DAG critical path | -- | temporal_constraints, goal_nodes | Bitemporal edges, event_tuples |
| Goal Decomposition | Sonnet | topo sort, critical path, components | -- | goal_nodes | Event tuples |
| Metacognition | Haiku | -- | mean, stddev per domain | metacognitive_scores | Domain profiles, surprise scores, consolidation pipeline |

---

## Confidence Assessment

| Recommendation | Confidence | Reasoning |
|---------------|------------|-----------|
| Graphology for in-memory graph ops | **HIGH** | v0.26.0, 264+ dependents, TypeScript types, comprehensive algo library, last updated Jan 2025 |
| simple-statistics for anomaly math | **HIGH** | v7.8.8, zero deps, 3M+ weekly downloads, TypeScript types, battle-tested |
| Claude structured output as primary extraction | **HIGH** | Already the core codebase pattern, AI SDK + Zod proven, matches cognitive task nature |
| Postgres-only persistence (no external graph DB) | **HIGH** | <100K edges/org, recursive CTEs + Graphology sufficient, avoids operational complexity |
| No Python sidecar | **HIGH** | All algorithms available in TS, avoids deployment burden |
| entity_edges for causal edges (no separate table) | **HIGH** | Reuses Hebbian learning + decay + spreading activation automatically |
| New relation types on entity_edges | **HIGH** | Existing CHECK constraint on relation_type needs ALTER, but pattern is proven |

---

## Sources

### Official Documentation (HIGH confidence)
- [Graphology docs](https://graphology.github.io/) -- API reference, standard library
- [Graphology GitHub](https://github.com/graphology/graphology) -- TypeScript support, v0.26.0
- [graphology-dag docs](https://graphology.github.io/standard-library/dag.html) -- topologicalSort, topologicalGenerations
- [graphology-shortest-path docs](https://graphology.github.io/standard-library/shortest-path.html) -- Dijkstra, BFS
- [simple-statistics docs](https://simple-statistics.github.io/) -- API reference
- [simple-statistics GitHub](https://github.com/simple-statistics/simple-statistics) -- v7.8.8, TypeScript types
- [PostgreSQL recursive CTE](https://neon.com/postgresql/postgresql-tutorial/postgresql-recursive-query) -- CYCLE clause (PG14+)

### npm Registry (HIGH confidence)
- [graphology npm](https://www.npmjs.com/package/graphology) -- v0.26.0, published Jan 2025
- [graphology-dag npm](https://www.npmjs.com/package/graphology-dag) -- v0.4.1
- [graphology-shortest-path npm](https://www.npmjs.com/package/graphology-shortest-path) -- v2.1.0
- [simple-statistics npm](https://www.npmjs.com/package/simple-statistics) -- v7.8.8

### Research (MEDIUM confidence)
- [Postgres graph algorithms with recursive CTEs](https://www.fusionbox.com/blog/detail/graph-algorithms-in-a-database-recursive-ctes-and-topological-sort-with-postgres/620/)
- [Theory of Mind in LLMs -- ACL 2025](https://aclanthology.org/2025.acl-long.1522.pdf)
- [ToM-agent: LLMs as ToM-Aware Agents](https://arxiv.org/html/2501.15355v1)
- [Z-score anomaly detection in JavaScript](https://everythingtech.dev/2022/10/the-simplest-anomaly-detection-algorithm-in-javascript-zscore/)
- [Hierarchical Task Network planning](https://en.wikipedia.org/wiki/Hierarchical_task_network)
- [kiwi.js Cassowary solver](https://github.com/IjzerenHein/kiwi.js/) -- evaluated, not recommended (layout constraints, not scheduling)
