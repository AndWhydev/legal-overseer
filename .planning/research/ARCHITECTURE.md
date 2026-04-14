# Architecture: Cognitive Omniscience Integration

**Domain:** Cognitive intelligence layers for BitBit's agentic AI assistant
**Researched:** 2026-04-14
**Confidence:** HIGH (grounded in full codebase audit of existing modules)

## Recommended Architecture

Seven cognitive features integrate at three touchpoints in the existing pipeline: (1) the **brain consolidation pipeline** (background extraction), (2) the **context assembler** (query-time injection), and (3) the **TAOR loop** (runtime decision-making). No new services or infrastructure needed.

```
                     WRITE PATH (Background)                    READ PATH (Query-Time)
                     ========================                   =====================

  knowledge_log WAL                                           User message
        |                                                          |
        v                                                          v
  +-----------------+                                    +------------------+
  |  Intake Clerk   | <-- EXTEND prompts for:            |   Query Gate     | <-- ADD: cognitive
  |  (Gemini Flash) |     - causal edge extraction       |  (System 1/2)    |     signal detection
  |                 |     - goal statement detection      +--------+---------+
  |                 |     - temporal commitment extraction         |
  +--------+--------+                                             v
           |                                             +------------------+
           v                                             | Context Assembler| <-- ADD: 3 new
  +-----------------+                                    |                  |     context blocks
  |Section Librarian| <-- EXTEND for:                    |  Tier 3 Entity:  |
  |   (Sonnet)      |     - belief state compilation     |  + belief_delta  |
  |                 |     - domain confidence scoring     |  + anomaly_alert |
  |                 |     - anomaly baseline update       |  + metacog_note  |
  +--------+--------+                                    +--------+---------+
           |                                                      |
           v                                                      v
  +-----------------+                                    +------------------+
  | NEW: Cognitive   |                                    |   TAOR Loop      | <-- MODIFY:
  | Extraction Hooks |                                    |                  |     - active learning
  |                  |                                    |  THINK: check    |       question gate
  | - theory-of-mind |                                    |    metacog score |     - goal-aware
  | - causal-graph   |                                    |  ACT: use causal |       planning
  | - anomaly-detect |                                    |    chain context |     - anomaly
  | - goal-decompose |                                    |  OBSERVE: update |       notification
  | - temporal-solve |                                    |    belief states |
  | - metacognition  |                                    +------------------+
  +--------+--------+
           |
           v
  +-----------------+
  |   Postgres       |
  |                  |
  | belief_states    | (new)
  | anomaly_events   | (new)
  | clarification_q  | (new)
  | goal_nodes       | (new)
  | temporal_constr  | (new)
  | metacog_scores   | (new)
  | entity_edges     | (extend: CAUSES, ENABLES, BLOCKS)
  | entity_dossiers  | (extend: confidence_by_domain)
  +-----------------+
```

## New Modules to Create

All modules live under `src/lib/brain/cognitive/`. Each module is a pure function that takes Supabase + orgId + input data and returns structured output. No classes, no singletons.

### Module 1: `src/lib/brain/cognitive/theory-of-mind.ts`

**Responsibility:** Extract and maintain per-entity belief states. Track what each entity knows vs ground truth. Detect information asymmetries.

**Inputs:** Entity dossier, recent messages involving entity, knowledge_log entries
**Outputs:** `BeliefState[]` persisted to `belief_states` table
**LLM:** Sonnet via `generateObject()` with `BeliefStateSchema`
**Integration:**
- Called by section librarian after dossier update (write path)
- Queried by context assembler to inject belief delta block (read path)

```typescript
// Core functions
export async function extractBeliefState(supabase, orgId, entityId, recentMessages, dossier): Promise<BeliefState>
export async function detectInformationGaps(supabase, orgId, entityIds): Promise<InformationGap[]>
export async function formatBeliefDeltaBlock(gaps: InformationGap[]): string  // for context assembler
```

### Module 2: `src/lib/brain/cognitive/causal-graph.ts`

**Responsibility:** Extract causal relationships from events, build causal subgraphs, trace causal chains, support counterfactual queries.

**Inputs:** Knowledge_log entries, existing entity_edges
**Outputs:** New entity_edges with `relation_type IN ('CAUSES', 'LEADS_TO', 'ENABLES', 'BLOCKS')`
**LLM:** Sonnet for extraction, none for graph algorithms
**Libraries:** Graphology for topological sort, shortest path, cycle detection

```typescript
export async function extractCausalEdges(supabase, orgId, walEntries): Promise<CausalEdge[]>
export async function traceCausalChain(supabase, orgId, effectEntityId): Promise<CausalChain>
export async function buildCausalSubgraph(supabase, orgId, entityIds): Promise<Graph>  // Graphology
export async function answerCounterfactual(supabase, orgId, question, causalChain): Promise<string>
```

**Integration:**
- `extractCausalEdges` called by intake clerk during fact extraction (write path)
- `traceCausalChain` called during TAOR loop when user asks "why" questions (read path)
- Causal edges leverage existing Hebbian learning + decay automatically

### Module 3: `src/lib/brain/cognitive/anomaly-detector.ts`

**Responsibility:** Detect statistical anomalies in entity behavior patterns. Surface high-severity anomalies proactively.

**Inputs:** Entity schema_json baselines, current metric values from knowledge_log
**Outputs:** `AnomalyEvent[]` persisted to `anomaly_events` table
**Libraries:** simple-statistics for z-score, regression, IQR
**LLM:** Haiku for natural language explanation only

```typescript
export async function detectAnomalies(supabase, orgId, entityId, metrics): Promise<AnomalyEvent[]>
export async function getActiveAnomalies(supabase, orgId, entityIds): Promise<AnomalyEvent[]>
export async function formatAnomalyBlock(anomalies: AnomalyEvent[]): string  // for context assembler
```

**Integration:**
- `detectAnomalies` called at end of brain consolidation pipeline, after dossier update (write path)
- `getActiveAnomalies` called by context assembler for mentioned entities (read path)
- Connects to existing predictive coding engine (surprise scores feed severity)

### Module 4: `src/lib/brain/cognitive/active-learner.ts`

**Responsibility:** Generate targeted clarifying questions when confidence is low. Manage question budget per conversation.

**Inputs:** Confidence scores from TAOR loop, entity resolution candidates, domain confidence map
**Outputs:** `ClarifyingQuestion` injected into TAOR response, persisted to `clarification_queue`
**LLM:** Sonnet for question generation

```typescript
export async function generateClarification(context: TaorContext, ambiguities): Promise<ClarifyingQuestion | null>
export async function shouldAskQuestion(turnQuestionCount: number, confidence: number): boolean
export async function recordAnswer(supabase, questionId, answer): Promise<void>
```

**Integration:**
- Called inside TAOR loop during THINK phase when confidence < ask_threshold (runtime)
- Replaces current generic "ask for approval" with targeted disambiguation
- Question budget tracked per conversation turn (max 2)

### Module 5: `src/lib/brain/cognitive/goal-decomposer.ts`

**Responsibility:** Extract goals from conversation, maintain goal hierarchy, compute critical paths.

**Inputs:** Messages with goal-like statements, existing goal_nodes
**Outputs:** `GoalNode[]` persisted to `goal_nodes` table
**LLM:** Sonnet for goal extraction and decomposition
**Libraries:** Graphology for critical path, topological sort, cycle detection

```typescript
export async function extractGoals(supabase, orgId, messages): Promise<GoalNode[]>
export async function decomposeGoal(supabase, orgId, goalId): Promise<GoalNode[]>
export async function computeCriticalPath(supabase, orgId, rootGoalId): Promise<CriticalPath>
export async function updateGoalProgress(supabase, orgId, goalId, signal): Promise<void>
```

**Integration:**
- `extractGoals` called by intake clerk when goal statements detected (write path)
- `computeCriticalPath` uses Graphology DAG algorithms
- Goal context injected into TAOR system prompt when user discusses plans

### Module 6: `src/lib/brain/cognitive/temporal-solver.ts`

**Responsibility:** Extract temporal commitments, detect deadline conflicts, propagate constraint changes.

**Inputs:** Knowledge_log entries with temporal signals, goal_nodes with deadlines
**Outputs:** `TemporalConstraint[]` persisted to `temporal_constraints` table
**LLM:** Haiku for deadline extraction from natural language

```typescript
export async function extractDeadlines(supabase, orgId, walEntries): Promise<TemporalCommitment[]>
export async function detectConflicts(supabase, orgId): Promise<TemporalConflict[]>
export async function propagateDeadlineChange(supabase, orgId, goalId, newDeadline): Promise<PropagationResult>
export async function getOverdueItems(supabase, orgId): Promise<OverdueItem[]>
```

**Integration:**
- `extractDeadlines` called by intake clerk (write path)
- `detectConflicts` called during sleep consolidation (nightly)
- `getOverdueItems` called by context assembler for morning briefing and proactive surfacing

### Module 7: `src/lib/brain/cognitive/metacognition.ts`

**Responsibility:** Track per-entity, per-domain confidence. Identify knowledge gaps. Suggest knowledge acquisition actions.

**Inputs:** Entity dossiers, domain_profiles, signal density per domain
**Outputs:** `MetacognitiveScore[]` persisted to `metacognitive_scores` table
**LLM:** Haiku for assessment

```typescript
export async function computeDomainConfidence(supabase, orgId, entityId): Promise<DomainConfidence>
export async function identifyKnowledgeGaps(supabase, orgId, entityIds): Promise<KnowledgeGap[]>
export async function formatMetacogBlock(gaps: KnowledgeGap[]): string  // for context assembler
export async function decayConfidence(supabase, orgId): Promise<number>  // returns count decayed
```

**Integration:**
- `computeDomainConfidence` called by section librarian after dossier update (write path)
- `decayConfidence` called during sleep consolidation (nightly)
- `formatMetacogBlock` called by context assembler when confidence < 0.3 for relevant domain

### Shared Types: `src/lib/brain/cognitive/types.ts`

All Zod schemas and TypeScript types for the 7 modules. Shared to ensure consistency across extraction, persistence, and context assembly.

---

## Existing Modules to Modify

### 1. `src/lib/brain/intake-clerk.ts` -- EXTEND

**Changes:**
- Add 3 new signal types to `SIGNAL_DOMAIN_MAP`: `causal`, `goal`, `temporal_commitment`
- Extend `EXTRACTION_SYSTEM_PROMPT` to also extract: causal relationships ("X caused Y"), goal statements ("I want to..."), and temporal commitments ("by Friday", "due next week")
- Route extracted causal edges to `causal-graph.ts`, goals to `goal-decomposer.ts`, deadlines to `temporal-solver.ts`

**Scope:** ~50 lines of prompt changes + ~30 lines of routing logic

### 2. `src/lib/brain/section-librarian.ts` -- EXTEND

**Changes:**
- After compiling dossier, call `theory-of-mind.extractBeliefState()` to update belief ledger
- After dossier update, call `metacognition.computeDomainConfidence()` to score confidence
- Add `confidence_by_domain` field to dossier output schema

**Scope:** ~40 lines of new hook calls after existing dossier compilation

### 3. `src/lib/brain/brain-consolidation.ts` -- EXTEND

**Changes:**
- After step 5 (dossier compilation), add step 5b: cognitive extraction hooks
- Call `anomaly-detector.detectAnomalies()` on updated entities
- Call `temporal-solver.detectConflicts()` for deadline conflict check
- Add cognitive extraction stats to `BrainConsolidationReport`

**Scope:** ~30 lines adding cognitive hooks to the pipeline

### 4. `src/lib/context-assembly/context-assembler.ts` -- EXTEND

**Changes:**
- Add 3 new optional context blocks to Tier 3 (entity context):
  - **Belief delta block:** "Note: [entity] does not know [fact]" from theory-of-mind
  - **Anomaly alert block:** "Unusual: [entity] [deviation description]" from anomaly-detector
  - **Metacognition block:** "Low confidence: [domain] for [entity]" from metacognition
- Register 3 new memory modules in Global Workspace (`global-workspace.ts`):
  - `belief_delta` module (priority: high, triggers on entity mentions)
  - `anomaly_alert` module (priority: high, triggers on active anomalies)
  - `metacog_note` module (priority: medium, triggers on low-confidence domains)
- Total new budget: ~500 tokens across all 3 blocks (fits within existing 48K budget)

**Scope:** ~80 lines for new context block assembly + ~40 lines for Global Workspace modules

### 5. `src/lib/brain/global-workspace.ts` -- EXTEND

**Changes:**
- Add cognitive signal detection regexes (causal, temporal, goal-related queries)
- Register new memory modules for cognitive features
- Add `hasCausalSignals`, `hasGoalSignals` to `ModuleContext`

**Scope:** ~30 lines

### 6. `src/lib/agent/engine/taor-loop.ts` -- MODIFY

**Changes:**
- In THINK phase: check metacognitive scores for relevant entities before model selection
- In THINK phase: when confidence < ask_threshold, call `active-learner.generateClarification()` instead of generic approval request
- Add question budget counter (per-turn, max 2)
- In OBSERVE phase: after tool execution, check if result resolves any active clarification_queue items

**Scope:** ~60 lines of conditional logic in the existing loop

### 7. `src/lib/brain/query-gate.ts` -- EXTEND

**Changes:**
- Add System 2 escalation patterns for causal queries ("why did", "what caused", "because of")
- Add System 2 escalation patterns for goal queries ("goal", "objective", "progress on")
- Add System 2 escalation patterns for temporal queries ("deadline", "overdue", "when is X due")

**Scope:** ~15 lines of new regex patterns

### 8. `src/lib/memory-palace/sleep-consolidation.ts` -- EXTEND

**Changes:**
- Add stage 8: `metacognition.decayConfidence()` -- decay domain confidence for stale entities
- Add stage 9: `temporal-solver.detectConflicts()` -- flag deadline conflicts for morning briefing
- Add stage 10: `anomaly-detector.detectAnomalies()` -- batch anomaly check on all active entities

**Scope:** ~40 lines adding 3 new stages

---

## New Database Tables

### Migration: `cognitive_omniscience_tables.sql`

```sql
-- 1. belief_states: Theory of Mind belief tracking
CREATE TABLE belief_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  entity_id uuid NOT NULL,
  topic text NOT NULL,
  belief_text text NOT NULL,
  ground_truth_text text,
  divergence text CHECK (divergence IN ('aligned','outdated','contradicted','unknown')) DEFAULT 'unknown',
  confidence numeric(3,2) DEFAULT 0.5,
  evidence_ids uuid[] DEFAULT '{}',
  last_evidence_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, entity_id, topic)
);

-- 2. anomaly_events: Detected statistical anomalies
CREATE TABLE anomaly_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  entity_id uuid NOT NULL,
  metric_name text NOT NULL,
  current_value numeric NOT NULL,
  baseline_mean numeric NOT NULL,
  baseline_stddev numeric NOT NULL,
  z_score numeric NOT NULL,
  severity text CHECK (severity IN ('warning','critical')) NOT NULL,
  explanation text,
  surfaced_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. clarification_queue: Active learning questions
CREATE TABLE clarification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  entity_id uuid,
  question text NOT NULL,
  knowledge_gap text NOT NULL,
  information_gain numeric(3,2) DEFAULT 0.5,
  urgency text CHECK (urgency IN ('low','medium','high')) DEFAULT 'medium',
  status text CHECK (status IN ('pending','asked','answered','expired')) DEFAULT 'pending',
  answer text,
  asked_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. goal_nodes: Goal hierarchy
CREATE TABLE goal_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  parent_id uuid REFERENCES goal_nodes(id),
  title text NOT NULL,
  description text,
  status text CHECK (status IN ('not_started','in_progress','blocked','completed','abandoned')) DEFAULT 'not_started',
  dependencies uuid[] DEFAULT '{}',
  deadline timestamptz,
  estimated_hours numeric,
  critical_path boolean DEFAULT false,
  progress numeric(3,2) DEFAULT 0,
  source_message_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. temporal_constraints: Deadline propagation
CREATE TABLE temporal_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  goal_id uuid REFERENCES goal_nodes(id),
  entity_id uuid,
  constraint_type text CHECK (constraint_type IN ('deadline','duration','dependency','commitment')) NOT NULL,
  description text NOT NULL,
  earliest_start timestamptz,
  latest_finish timestamptz,
  slack interval,
  source_message_id uuid,
  created_at timestamptz DEFAULT now()
);

-- 6. metacognitive_scores: Per-entity per-domain confidence
CREATE TABLE metacognitive_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  entity_id uuid NOT NULL,
  domain text NOT NULL,
  confidence numeric(3,2) DEFAULT 0.5,
  evidence_count integer DEFAULT 0,
  known_gaps text[] DEFAULT '{}',
  stale_areas text[] DEFAULT '{}',
  last_signal_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, entity_id, domain)
);

-- Indexes
CREATE INDEX idx_belief_states_entity ON belief_states(org_id, entity_id);
CREATE INDEX idx_anomaly_events_active ON anomaly_events(org_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_clarification_pending ON clarification_queue(org_id, status) WHERE status = 'pending';
CREATE INDEX idx_goal_nodes_parent ON goal_nodes(org_id, parent_id);
CREATE INDEX idx_goal_nodes_status ON goal_nodes(org_id, status) WHERE status NOT IN ('completed','abandoned');
CREATE INDEX idx_temporal_constraints_goal ON temporal_constraints(org_id, goal_id);
CREATE INDEX idx_metacog_entity ON metacognitive_scores(org_id, entity_id);

-- RLS (all tables org-scoped)
ALTER TABLE belief_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE metacognitive_scores ENABLE ROW LEVEL SECURITY;
```

### Column additions to existing tables

```sql
-- entity_dossiers: add domain confidence cache
ALTER TABLE entity_dossiers ADD COLUMN confidence_by_domain jsonb DEFAULT '{}';

-- entity_edges: extend relation_type CHECK to include causal types
-- (Verify current CHECK constraint, then ALTER to add CAUSES, ENABLES, BLOCKS, LEADS_TO)
```

---

## Data Flow Summary

### Write Path (Background, every 5 min via cron)

```
WAL entries (knowledge_log)
  -> intake-clerk: extract facts + causal edges + goals + deadlines
  -> section-librarian: compile dossiers + belief states + domain confidence
  -> brain-consolidation step 5b:
      -> anomaly-detector: z-score check on updated metrics
      -> temporal-solver: deadline conflict detection
  -> persist to 6 new tables + entity_edges (causal)
```

### Read Path (Query-time, <200ms target)

```
User message
  -> query-gate: classify system1/system2 (extended with cognitive patterns)
  -> context-assembler:
      -> existing tiers (system prompt, history, entity context)
      -> NEW: belief_delta block (if entity has info gaps)
      -> NEW: anomaly_alert block (if active anomalies for mentioned entities)
      -> NEW: metacog_note block (if low confidence in relevant domain)
  -> TAOR loop:
      -> THINK: check metacog scores, decide if clarification needed
      -> active-learner: generate question if confidence < threshold
      -> causal-graph: trace chain if "why" query detected
      -> ACT: execute with full cognitive context
      -> OBSERVE: update clarification_queue if answer received
```

### Nightly Path (Sleep consolidation, 3am UTC)

```
Existing 7 stages
  -> NEW stage 8: metacognition.decayConfidence()
  -> NEW stage 9: temporal-solver.detectConflicts() -> morning briefing
  -> NEW stage 10: anomaly-detector batch scan -> proactive alerts
```

---

## Build Order

### Level 1: Wire Existing Dead Code (Phases 1-2)

No new cognitive modules yet. Make existing infrastructure work.

1. **Wire entity dossiers into context assembly** (replace entity_profiles)
2. **Wire spreading activation into proactive recall** (replace pure vector similarity)
3. **Wire neural decay into recall scoring** (low-confidence = lower rank)
4. **Wire predictive coding surprises to proactive surfacing** (route high-surprise to user)
5. **Wire query gate into TAOR loop** (System 1/2 routing live)
6. **Enable Global Workspace** (competitive module allocation)

**Why first:** These are existing modules with tests. No new code, just integration. Provides the foundation data (populated dossiers, active graph, surprise scores) that all cognitive features consume.

### Level 2: Statistical + Low-LLM Features (Phases 3-4)

Features that are primarily algorithmic with minimal LLM cost.

7. **Anomaly detector** (simple-statistics z-scores on entity metrics)
8. **Metacognition** (domain confidence from signal density/recency)
9. **Active learner** (extend existing confidence routing with question generation)
10. **Temporal solver: deadline extraction + overdue detection** (Haiku extraction + time comparison)

**Why second:** Low LLM cost, high user-visible value. Anomaly alerts and "I don't know X" metacognition are immediately differentiated. Active learning improves every conversation.

### Level 3: LLM-Heavy Cognitive Features (Phases 5-7)

Features requiring Sonnet-level reasoning.

11. **Theory of Mind: belief state extraction** (Sonnet on dossier + messages)
12. **Causal graph: edge extraction + chain tracing** (Sonnet + Graphology)
13. **Goal decomposition: extraction + hierarchy** (Sonnet + Graphology DAG)
14. **Temporal solver: deadline propagation + conflict detection** (Graphology critical path)
15. **Causal counterfactual reasoning** (Sonnet over causal chains)

**Why third:** These are the moat features but cost more tokens and need mature data (populated dossiers, enough entity_edges) to be useful. Building them on top of Level 2's statistical foundation ensures they have data to reason over.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `brain/cognitive/theory-of-mind.ts` | Belief state extraction + gap detection | section-librarian (write), context-assembler (read) |
| `brain/cognitive/causal-graph.ts` | Causal edge extraction + chain tracing | intake-clerk (write), TAOR loop (read) |
| `brain/cognitive/anomaly-detector.ts` | Statistical anomaly detection | brain-consolidation (write), context-assembler (read) |
| `brain/cognitive/active-learner.ts` | Clarifying question generation | TAOR loop (runtime) |
| `brain/cognitive/goal-decomposer.ts` | Goal extraction + hierarchy + critical path | intake-clerk (write), TAOR loop (read) |
| `brain/cognitive/temporal-solver.ts` | Deadline extraction + propagation + conflicts | intake-clerk (write), sleep-consolidation (nightly), context-assembler (read) |
| `brain/cognitive/metacognition.ts` | Domain confidence + gap identification | section-librarian (write), sleep-consolidation (decay), context-assembler (read) |

**Boundary rule:** Cognitive modules never call each other directly. They share data through Postgres tables. This keeps them independently testable and deployable.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Cognitive Module Cross-Calling
**What:** Module A imports and calls Module B directly.
**Why bad:** Creates tight coupling, makes testing hard, creates circular dependency risk.
**Instead:** Share data through Postgres. Theory-of-mind writes belief_states; anomaly-detector reads them if needed via SQL.

### Anti-Pattern 2: Synchronous Cognitive Processing on Query Path
**What:** Running Sonnet extraction during context assembly (blocking user response).
**Why bad:** Adds 2-5s latency to every response. Context assembly target is <200ms.
**Instead:** All LLM-heavy extraction runs in background (consolidation pipeline). Query path only reads pre-computed results from Postgres.

### Anti-Pattern 3: Unbounded Cognitive Context Injection
**What:** Injecting all belief states + all anomalies + all metacog notes into every response.
**Why bad:** Blows token budget, dilutes relevant context, confuses the model.
**Instead:** Cap cognitive context at ~500 tokens total. Only inject for mentioned entities. Use Global Workspace competitive allocation.

---

## Scalability Considerations

| Concern | At 1 org (now) | At 100 orgs | At 1K orgs |
|---------|---------------|-------------|------------|
| Cognitive extraction (consolidation) | 5-min cron, serial | 5-min cron, parallel per org | Queue-based with concurrency limit |
| Anomaly baseline computation | In-line during consolidation | Pre-computed, materialized view | Materialized view + incremental refresh |
| Goal graph size | <100 nodes | <1K nodes per org | Graphology handles 100K+ in-memory |
| Causal edge count | <500 | <5K per org | Subgraph loading (not full graph) |
| Context assembly latency | <200ms | <200ms (per-org isolation) | <200ms (indexed queries) |

---

## Sources

- Codebase audit: `taor-loop.ts`, `context-assembler.ts`, `brain-consolidation.ts`, `global-workspace.ts`, `query-gate.ts`, `intake-clerk.ts`, `sleep-consolidation.ts`
- STACK.md research (Graphology, simple-statistics)
- FEATURES.md research (feature dependencies, complexity assessment)
