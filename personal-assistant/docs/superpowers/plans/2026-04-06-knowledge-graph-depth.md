# Knowledge Graph Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen BitBit's relational reasoning by adding community detection to nightly consolidation, exposing a multi-hop graph traversal tool to the TAOR loop, and augmenting memory search with temporal-first episodic retrieval.

**Architecture:** Three features built on the existing knowledge graph (`entity_nodes`, `entity_edges`, `event_tuples`) and memory palace infrastructure. One new sleep consolidation stage (3.5) for community detection, one new tool file (`graph-traversal.ts`) registered in the memory tool group, and one extension to the `MemorySearch` class for dual-index episodic retrieval with automatic temporal signal routing.

**Tech Stack:** Supabase (entity_nodes, entity_edges, event_tuples tables), TypeScript, Vercel AI SDK (`generateText` with `models.fast`), existing graph-queries.ts functions, MemorySearch class, Anthropic tool definitions.

---

## Task 1: Type Updates (entity_type union + ENTITY_TYPES array)

**Files:**
- `src/lib/knowledge-graph/types.ts`
- `src/lib/knowledge-graph/entity-extractor.ts`

### Steps

- [ ] **1.1** In `types.ts`, extend the `entity_type` union on the `EntityNode` interface to include `'community'`:
  ```typescript
  entity_type: 'person' | 'project' | 'company' | 'invoice' | 'channel' | 'community'
  ```

- [ ] **1.2** In `entity-extractor.ts`, append `'community'` to the `ENTITY_TYPES` array:
  ```typescript
  const ENTITY_TYPES = ['person', 'project', 'company', 'invoice', 'channel', 'community'] as const
  ```

- [ ] **1.3** Verify no TypeScript errors are introduced by the union change (the `findOrCreateEntity` function in `graph-queries.ts` accepts `EntityNode['entity_type']` which will automatically include the new value).

---

## Task 2: Community Detection (Sleep Stage 3.5)

**Files:**
- `src/lib/memory-palace/sleep-consolidation.ts`
- `src/lib/context-assembly/context-assembler.ts`

### Steps

- [ ] **2.1** Add `communitiesDetected: number` to the `SleepConsolidationReport` interface in `sleep-consolidation.ts`.

- [ ] **2.2** Add the `CommunityCluster` interface:
  ```typescript
  interface CommunityCluster {
    memberIds: string[]
    mutualEdgeCount: number
    sharedEventCount: number
  }
  ```

- [ ] **2.3** Implement `stageCommunityDetection(supabase, orgId)` function (~120 lines) with 5 sub-steps:
  1. **Build adjacency data** — Query all active edges (`valid_until IS NULL`) for the org, capped at 1000 most recent. Build `Map<string, Set<string>>` adjacency map.
  2. **Find dense clusters** — For each edge pair (A,B), compute neighbor intersection. Form candidate clusters where `|intersection| >= 1`. Filter to clusters with >= 3 mutual edges and >= 5 shared event tuples in the past 30 days. Greedy merge overlapping clusters (>= 2 shared members). Cap cluster size at 10.
  3. **Generate community summaries** — For each cluster, fetch member entity names and recent event verbs. Call `generateText` with `models.fast` to produce a 1-sentence summary.
  4. **Persist community nodes** — Upsert `community` entity nodes in `entity_nodes` with `onConflict: 'org_id,name'`. Create `member_of` edges from each member to the community node.
  5. **Expire stale communities** — Set `is_active = false` on `community` entity nodes whose `detected_at` property is older than 7 days and were NOT refreshed in this run.

- [ ] **2.4** Integrate Stage 3.5 into `runSleepConsolidation()` — insert between Stage 3 (DISCOVER RELATIONSHIPS) and Stage 4 (PRUNE) with try/catch and logging.

- [ ] **2.5** In `context-assembler.ts`, extend the proactive recall section (~line 644) to fetch community summaries for resolved entity nodes via `member_of` edges. Append under `## Active Communities` heading within the 1500-token proactive recall budget.

---

## Task 3: Graph Traversal Tool (new file + registration)

**Files:**
- **Create:** `src/lib/agent/tools/graph-traversal.ts`
- `src/lib/agent/tools.ts`

### Steps

- [ ] **3.1** Create `src/lib/agent/tools/graph-traversal.ts` with:
  - `TraverseGraphResult` interface (entity, directRelationships, secondOrderConnections, activeCommunities, recentEvents)
  - `traverseGraphToolDefinition` — Anthropic.Tool with `entity_name` (required string) and `depth` (optional number 1-3)
  - `handleTraverseGraph` handler function that:
    1. Calls `getEntityByAlias()` to resolve entity name
    2. Calls `getMultiHopNeighborhood()` with resolved ID and depth
    3. Queries `member_of` edges to fetch community nodes + summaries
    4. Calls `getEntityEvents()` for past 30 days
    5. Formats into `TraverseGraphResult` structure
    6. Returns error message if entity not found
  - Export `graphTraversalToolDefinitions` array and `graphTraversalToolHandlers` record following the pattern of `web-tools.ts`.

- [ ] **3.2** In `tools.ts`, import `graphTraversalToolDefinitions` and `graphTraversalToolHandlers` from `./tools/graph-traversal`.

- [ ] **3.3** Add `'traverse_graph'` to the `memory` tool group in `TOOL_GROUPS`:
  ```typescript
  tools: ['search_memory', 'add_memory', 'create_procedure', 'traverse_graph'],
  ```

- [ ] **3.4** Add `traverse_graph` JIT instruction to `JIT_INSTRUCTIONS`.

- [ ] **3.5** Spread `...graphTraversalToolDefinitions` into `getAgentTools()` allTools array and `...graphTraversalToolHandlers` into `allHandlers`.

---

## Task 4: Dual-Index Episodic Retrieval

**Files:**
- `src/lib/memory-palace/memory-search.ts`
- `src/lib/agent/tools.ts`

### Steps

- [ ] **4.1** Add `TEMPORAL_PATTERNS` regex array and `hasTemporalSignal()` export function to `memory-search.ts`:
  ```typescript
  const TEMPORAL_PATTERNS = [
    /\blast time\b/i, /\bwhen did (we|I|you)\b/i, /\bpreviously\b/i,
    /\bbefore\b/i, /\bhistory\b/i, /\bremember when\b/i,
    /\bhow long ago\b/i, /\blast (week|month|time|conversation)\b/i,
    /\b(first|earliest|originally)\b/i, /\bback (in|when)\b/i,
  ]
  export function hasTemporalSignal(message: string): boolean {
    return TEMPORAL_PATTERNS.some(p => p.test(message))
  }
  ```

- [ ] **4.2** Add `episodicSearch()` method to the `MemorySearch` class (~80 lines):
  1. Timestamp-range query on `memory_palace_entries` ordered by `created_at DESC` (over-fetch 2x for re-ranking)
  2. Semantic query via `search_memory_palace` RPC
  3. Merge with temporal-weighted scoring: 0.6 * temporal + 0.2 * confidence + 0.2 * semantic, with +0.1 dual-index bonus
  4. Include temporally-ordered decisions
  5. Return `MemorySearchResult`

- [ ] **4.3** In `tools.ts`, modify the `search_memory` handler to detect temporal signals and route to `episodicSearch()`:
  - Import `hasTemporalSignal` and `MemorySearch` from `memory-search.ts`
  - Before the existing search logic, check `hasTemporalSignal(query)`
  - If true, use `memorySearch.episodicSearch()` and return results
  - If false, fall through to existing search logic unchanged
