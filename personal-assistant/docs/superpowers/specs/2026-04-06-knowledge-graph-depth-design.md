# Sub-project C: Knowledge Graph Depth — Design Spec

**Goal:** Deepen BitBit's relational reasoning by adding community detection to nightly consolidation, exposing a multi-hop graph traversal tool to the TAOR loop, and augmenting memory search with a temporal-first episodic retrieval mode. Together these close the gap between what the knowledge graph knows and what the agent can access at inference time.

**Architecture:** Three features that build on the existing knowledge graph (`entity_nodes`, `entity_edges`, `event_tuples`) and memory palace infrastructure. One new sleep consolidation stage (3.5), one new tool definition, and one extension to the existing `MemorySearch` class. Based on Zep/Graphiti's 3-tier community hierarchy which achieves 18.5% accuracy improvement on temporal reasoning in LOCOMO benchmarks.

---

## 1. Community Subgraph Layer (Sleep Stage 3.5)

### Current State

`sleep-consolidation.ts` runs a 5-stage nightly pipeline:

1. **SUMMARIZE** — Per-entity daily digest via Haiku (`stageSummarize`)
2. **RESOLVE CONFLICTS** — Temporal precedence for duplicate edges (`stageResolveConflicts`)
3. **DISCOVER RELATIONSHIPS** — Latent edges from co-occurring events (`stageDiscoverRelationships`)
4. **PRUNE** — Archive low-confidence entityless memories (`stagePrune`)
5. **MORNING BRIEFING** — Compile actionable intel (`stageMorningBriefing`)

There is no concept of entity clusters or community summaries. The knowledge graph stores individual entities and pairwise edges but has no higher-order grouping. Proactive recall in `context-assembler.ts` operates on individual entity neighborhoods — it cannot surface "this cluster of entities is collectively engaged in X."

### New Behavior

Insert **Stage 3.5: DETECT COMMUNITIES** between Stage 3 (Discover Relationships) and Stage 4 (Prune). This stage:

1. Queries for entity clusters where entities share >= 3 mutual active edges AND >= 5 shared event tuples in the past 30 days
2. Generates a 1-sentence community summary for each cluster via Haiku
3. Stores summaries as `community` entity nodes in `entity_nodes` with edges linking member entities

Community summaries are surfaced to `proactiveRecall` in `context-assembler.ts` alongside individual entity context.

### Implementation Details

#### New Entity Type

Extend the `entity_type` union in `types.ts`:

```typescript
export interface EntityNode {
  // ...existing fields
  entity_type: 'person' | 'project' | 'company' | 'invoice' | 'channel' | 'community'  // NEW
}
```

This aligns with the existing `ENTITY_TYPES` array in `entity-extractor.ts` (which also needs the new value appended).

#### Community Detection Algorithm

```typescript
interface CommunityCluster {
  memberIds: string[]       // entity IDs in the cluster
  mutualEdgeCount: number   // edges between members
  sharedEventCount: number  // event tuples involving members in past 30 days
}

async function stageCommunityDetection(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number>
```

**Step 1 — Build adjacency data:**

Query all active edges (`valid_until IS NULL`) for the org. Build an adjacency map: `Map<string, Set<string>>` mapping each entity ID to its set of connected entity IDs.

**Step 2 — Find dense clusters:**

For each entity pair (A, B) that share an edge, compute the intersection of their neighbor sets. If `|neighbors(A) ∩ neighbors(B)| >= 1` (meaning there exists at least one third entity C connected to both A and B), form a candidate cluster `{A, B, C, ...}`.

Filter candidates to clusters where:
- At least 3 mutual edges exist between cluster members
- At least 5 event tuples with `subject_id` in the cluster occurred in the past 30 days

Use a greedy merge: if two candidate clusters share >= 2 members, merge them. Cap cluster size at 10 entities to prevent mega-clusters.

**Step 3 — Generate community summaries:**

For each qualifying cluster, fetch member entity names and their recent event verbs. Call Haiku:

```typescript
const { text: summary } = await generateText({
  model: models.fast,
  prompt: `Summarize this entity cluster in 1 sentence. Be specific about what connects them.

Entities: ${memberNames.join(', ')}
Recent activity: ${recentVerbs.join(', ')}
Relationship types: ${edgeTypes.join(', ')}`,
  maxOutputTokens: 100,
})
```

**Step 4 — Persist community nodes:**

For each cluster, upsert a `community` entity node:

```typescript
const communityNode = await supabase
  .from('entity_nodes')
  .upsert({
    org_id: orgId,
    entity_type: 'community',
    name: `Community: ${topMemberNames.slice(0, 3).join(', ')}`,
    aliases: [],
    properties: {
      summary: summary.trim(),
      member_ids: cluster.memberIds,
      member_count: cluster.memberIds.length,
      mutual_edge_count: cluster.mutualEdgeCount,
      shared_event_count: cluster.sharedEventCount,
      detected_at: new Date().toISOString(),
    },
    is_active: true,
  }, {
    onConflict: 'org_id,name',  // re-use existing community node if name matches
  })
  .select('id')
  .single()
```

Create `member_of` edges from each member entity to the community node (skipping if already exists).

**Step 5 — Expire stale communities:**

Any `community` entity node whose `detected_at` is older than 7 days and was NOT refreshed in this run gets `is_active = false`.

#### Integration into Sleep Pipeline

In `runSleepConsolidation()`, add between Stage 3 and Stage 4:

```typescript
// Stage 3.5: DETECT COMMUNITIES
try {
  report.communitiesDetected = await stageCommunityDetection(supabase, orgId)
  logger.info('[sleep-consolidation] Stage 3.5 DETECT COMMUNITIES complete', {
    orgId,
    communitiesDetected: report.communitiesDetected,
  })
} catch (err) {
  logger.error('[sleep-consolidation] Stage 3.5 DETECT COMMUNITIES failed', {
    orgId,
    error: err instanceof Error ? err.message : String(err),
  })
}
```

Add `communitiesDetected: number` to `SleepConsolidationReport`.

#### Integration into Context Assembly

In `context-assembler.ts`, the proactive recall section (Phase 5, ~line 644) already resolves entity mentions to `entity_node` IDs and calls `recallForContext()`. Extend this to also fetch community nodes:

```typescript
// After resolving entityNodeIds from mentions...
// Also fetch communities these entities belong to
for (const nodeId of entityNodeIds) {
  const { data: communityEdges } = await supabase
    .from('entity_edges')
    .select('target_id')
    .eq('org_id', orgId)
    .eq('source_id', nodeId)
    .eq('relation_type', 'member_of')
    .is('valid_until', null)

  if (communityEdges) {
    for (const edge of communityEdges) {
      const { data: community } = await supabase
        .from('entity_nodes')
        .select('properties')
        .eq('id', edge.target_id)
        .eq('entity_type', 'community')
        .eq('is_active', true)
        .single()

      if (community?.properties?.summary) {
        communitySummaries.push(community.properties.summary as string)
      }
    }
  }
}
```

Append community summaries to `finalSystemPrompt` under a `## Active Communities` heading, budgeted within the existing 1500-token proactive recall budget.

---

## 2. Multi-Hop Graph Reasoning Tool

### Current State

The knowledge graph has a working `getMultiHopNeighborhood()` function in `graph-queries.ts` (line 144) that performs iterative BFS up to depth 3. However, this function is only used internally — it is NOT exposed as a tool the TAOR loop can invoke.

The `memory` tool group in `tools.ts` (line 59) currently contains: `search_memory`, `add_memory`, `create_procedure`. There is no tool that gives the agent direct access to graph traversal.

The existing `graphSearch()` function in `memory-search.ts` (line 389) does 2-hop traversal, but it is embedded in the memory search pipeline and not independently callable as a tool. It also lacks community awareness and structured output formatting.

### New Behavior

Add a `traverse_graph` tool to the `memory` tool group. This gives the TAOR loop access to relational reasoning that vector search cannot provide — specifically, the ability to ask "who is connected to X, and what do they have in common?"

### Tool Definition

```typescript
const traverseGraphTool: Anthropic.Tool = {
  name: 'traverse_graph',
  description: 'Traverse the knowledge graph from a named entity to discover relationships, second-order connections, active communities, and recent events. Use this when the user asks about relationships between people/projects/companies, or when you need relational context that memory search cannot provide.',
  input_schema: {
    type: 'object' as const,
    properties: {
      entity_name: {
        type: 'string',
        description: 'Name of the entity to start traversal from. Supports fuzzy matching via aliases.',
      },
      depth: {
        type: 'number',
        description: 'How many hops to traverse (1-3). Default 1. Use 2+ for second-order connections.',
        minimum: 1,
        maximum: 3,
      },
    },
    required: ['entity_name'],
  },
}
```

### Tool Handler

New file: `src/lib/agent/tools/graph-traversal.ts`

```typescript
export interface TraverseGraphResult {
  entity: {
    id: string
    name: string
    type: string
    properties: Record<string, unknown>
  }
  directRelationships: Array<{
    targetName: string
    targetType: string
    relationType: string
    since: string
    confidence: number
  }>
  secondOrderConnections: Array<{
    name: string
    type: string
    connectedVia: string  // name of the intermediary entity
    relationType: string
  }>
  activeCommunities: Array<{
    name: string
    summary: string
    memberCount: number
  }>
  recentEvents: Array<{
    verb: string
    objectText: string | null
    occurredAt: string
  }>
}
```

The handler:

1. Calls `getEntityByAlias()` from `graph-queries.ts` to resolve the entity name (fuzzy matching via the existing alias/name `ilike` query)
2. Calls `getMultiHopNeighborhood()` with the resolved entity ID and requested depth
3. Queries community nodes the entity belongs to (via `member_of` edges)
4. Calls `getEntityEvents()` for the past 30 days
5. Formats results into the `TraverseGraphResult` structure

If the entity name cannot be resolved, returns an error message suggesting the user check the spelling or try aliases.

### Registration in tools.ts

Add `traverse_graph` to the `memory` tool group:

```typescript
memory: {
  id: 'memory',
  label: 'Memory & Knowledge',
  description: 'Store and recall learned preferences, patterns, context, and entity relationships',
  tools: ['search_memory', 'add_memory', 'create_procedure', 'traverse_graph'],  // NEW
},
```

Add the tool definition to `getToolDefinitions()` and the handler to `handleToolCall()` following the existing pattern (similar to how `create_procedure` is registered).

---

## 3. Dual-Index Episodic Retrieval

### Current State

`MemorySearch.search()` in `memory-search.ts` performs hybrid full-text + semantic search. It queries `search_memory_palace` RPC (tsvector), optionally adds decisions and patterns, and returns results sorted by confidence or rank.

There is no temporal-first retrieval mode. When a user asks "when did we last discuss the invoice?" the search treats it like any keyword query — matching on "invoice" semantically but not prioritizing temporal ordering. This is the gap identified in LOCOMO benchmarks where single-index retrieval fails temporal reasoning.

### New Behavior

Extend `MemorySearch` with an episodic retrieval mode that activates when the incoming message contains temporal signals. This mode combines timestamp-range queries with vector similarity, returning results ordered by temporal relevance.

### Temporal Signal Detection

```typescript
const TEMPORAL_PATTERNS = [
  /\blast time\b/i,
  /\bwhen did (we|I|you)\b/i,
  /\bpreviously\b/i,
  /\bbefore\b/i,
  /\bhistory\b/i,
  /\bremember when\b/i,
  /\bhow long ago\b/i,
  /\blast (week|month|time|conversation)\b/i,
  /\b(first|earliest|originally)\b/i,
  /\bback (in|when)\b/i,
]

export function hasTemporalSignal(message: string): boolean {
  return TEMPORAL_PATTERNS.some(p => p.test(message))
}
```

### New Method: episodicSearch

Add to the `MemorySearch` class:

```typescript
async episodicSearch(options: MemorySearchOptions & {
  timeRange?: { from?: string; to?: string }
}): Promise<MemorySearchResult> {
  const {
    query,
    orgId,
    entityId,
    limit = 20,
    timeRange,
    includeDecisions = true,
    includePatterns = false,  // patterns less relevant for episodic queries
    minConfidence = 0,
  } = options

  const result: MemorySearchResult = {
    memories: [],
    decisions: [],
    patterns: [],
    totalCount: 0,
  }

  // 1. Timestamp-range query: fetch memories ordered by created_at DESC
  let temporalQuery = this.supabase
    .from('memory_palace_entries')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .gte('confidence', minConfidence)
    .order('created_at', { ascending: false })
    .limit(limit * 2)  // over-fetch for re-ranking

  if (entityId) {
    temporalQuery = temporalQuery.contains('entity_ids', [entityId])
  }
  if (timeRange?.from) {
    temporalQuery = temporalQuery.gte('created_at', timeRange.from)
  }
  if (timeRange?.to) {
    temporalQuery = temporalQuery.lte('created_at', timeRange.to)
  }

  const { data: temporalResults } = await temporalQuery
  const temporalMemories = (temporalResults ?? []) as MemoryPalaceEntry[]

  // 2. Semantic query: standard full-text search
  const { data: semanticResults } = await this.supabase
    .rpc('search_memory_palace', {
      p_org_id: orgId,
      p_query: query,
      p_category: null,
      p_entity_id: entityId ?? null,
      p_limit: limit,
    })
  const semanticMemories = (semanticResults ?? []) as (MemoryPalaceEntry & { rank: number })[]

  // 3. Merge and re-rank: temporal relevance weighted higher
  const scored = new Map<string, { memory: MemoryPalaceEntry; score: number }>()

  for (const mem of temporalMemories) {
    const recencyDays = (Date.now() - new Date(mem.created_at).getTime()) / 86_400_000
    const temporalScore = Math.exp(-0.05 * recencyDays)  // exponential decay
    scored.set(mem.id, {
      memory: mem,
      score: 0.6 * temporalScore + 0.2 * mem.confidence,  // temporal-weighted
    })
  }

  for (const mem of semanticMemories) {
    const existing = scored.get(mem.id)
    const semanticScore = mem.rank ?? 0.5
    if (existing) {
      // Boost items that appear in both indices
      existing.score += 0.2 * semanticScore + 0.1  // dual-index bonus
    } else {
      const recencyDays = (Date.now() - new Date(mem.created_at).getTime()) / 86_400_000
      const temporalScore = Math.exp(-0.05 * recencyDays)
      scored.set(mem.id, {
        memory: mem,
        score: 0.3 * temporalScore + 0.2 * mem.confidence + 0.2 * semanticScore,
      })
    }
  }

  // Sort by combined score, take top N
  result.memories = Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.memory)

  // 4. Decisions (temporal-ordered)
  if (includeDecisions) {
    let decisionQuery = this.supabase
      .from('decision_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('decided_at', { ascending: false })
      .limit(Math.ceil(limit / 3))

    if (entityId) {
      decisionQuery = decisionQuery.contains('entity_ids', [entityId])
    }

    const { data: decisions } = await decisionQuery
    result.decisions = (decisions ?? []) as DecisionLogEntry[]
  }

  result.totalCount = result.memories.length + result.decisions.length + result.patterns.length
  return result
}
```

### Integration Point

The `search_memory` tool handler in `tools.ts` needs to detect temporal signals and route to `episodicSearch`:

```typescript
// In the search_memory handler:
const memorySearch = new MemorySearch(supabase)
const hasTemporal = hasTemporalSignal(input.query)

const searchResult = hasTemporal
  ? await memorySearch.episodicSearch({
      query: input.query,
      orgId,
      entityId: input.entity_id,
      limit: input.limit ?? 20,
    })
  : await memorySearch.search({
      query: input.query,
      orgId,
      entityId: input.entity_id,
      limit: input.limit ?? 20,
    })
```

This is transparent to the agent — the `search_memory` tool automatically uses the right retrieval strategy.

---

## 4. File Changes Summary

| File | Change | Estimated Lines |
|---|---|---|
| `src/lib/knowledge-graph/types.ts` | Add `'community'` to `entity_type` union | ~2 |
| `src/lib/knowledge-graph/entity-extractor.ts` | Add `'community'` to `ENTITY_TYPES` array | ~1 |
| `src/lib/memory-palace/sleep-consolidation.ts` | Add `stageCommunityDetection()` function + integrate as Stage 3.5 + add `communitiesDetected` to report type | ~120 |
| `src/lib/context-assembly/context-assembler.ts` | Fetch community summaries in proactive recall section (~Phase 5, line 644) and append to system prompt | ~30 |
| `src/lib/agent/tools/graph-traversal.ts` | **NEW FILE** — `TraverseGraphResult` type + `handleTraverseGraph()` handler | ~90 |
| `src/lib/agent/tools.ts` | Add `traverse_graph` tool definition, register handler, add to `memory` group | ~35 |
| `src/lib/memory-palace/memory-search.ts` | Add `hasTemporalSignal()` function + `episodicSearch()` method to `MemorySearch` class | ~80 |

**Total: ~358 lines changed/added.** One new file (`graph-traversal.ts`). No new dependencies. No DB migrations (uses existing `entity_nodes` table with `community` type stored in the existing `entity_type` text column). No UI changes.

---

## 5. Data Flow

### Community Detection (Nightly)

```
3am UTC cron → runSleepConsolidation()
  ↓
Stage 1: SUMMARIZE (per-entity daily digest)
Stage 2: RESOLVE CONFLICTS (deduplicate edges)
Stage 3: DISCOVER RELATIONSHIPS (latent edges)
  ↓
Stage 3.5: DETECT COMMUNITIES  ← NEW
  → Query all active edges for org
  → Build adjacency map, find dense clusters (≥3 mutual edges, ≥5 shared events in 30d)
  → For each cluster: Haiku generates 1-sentence summary
  → Upsert community entity_node + member_of edges
  → Expire stale communities (>7 days without refresh)
  ↓
Stage 4: PRUNE (archive low-confidence memories)
Stage 5: MORNING BRIEFING (compile actionable intel)
```

### Graph Traversal Tool (Runtime)

```
User: "What's Steve connected to?"
  ↓
TAOR loop selects traverse_graph tool
  ↓
handleTraverseGraph("Steve", depth=2)
  → getEntityByAlias("steve") → resolves to entity node
  → getMultiHopNeighborhood(entityId, depth=2) → nodes + edges
  → Query member_of edges → fetch community nodes + summaries
  → getEntityEvents(entityId, last 30 days) → recent activity
  ↓
Returns structured TraverseGraphResult:
  {
    entity: { name: "Steve West", type: "person", ... },
    directRelationships: [
      { targetName: "Pre Sale Services", relationType: "client_of", ... }
    ],
    secondOrderConnections: [
      { name: "Ranal Charan", connectedVia: "Steve West", ... }
    ],
    activeCommunities: [
      { summary: "SEO client cluster: active Phase 2 proposal with...", ... }
    ],
    recentEvents: [
      { verb: "paid_invoice", objectText: "$200 citations", ... }
    ]
  }
  ↓
TAOR loop uses structured context to reason about Steve's network
```

### Episodic Retrieval (Runtime)

```
User: "When did we last discuss the invoice for Steve?"
  ↓
search_memory tool invoked with query
  ↓
hasTemporalSignal("When did we last discuss the invoice for Steve?")
  → matches /\bwhen did (we|I|you)\b/i → true
  ↓
episodicSearch() activated instead of standard search():
  → Index 1: timestamp-range query (created_at DESC, entity filtered)
  → Index 2: full-text search via search_memory_palace RPC
  → Merge: temporal score (0.6 weight) + confidence (0.2) + semantic (0.2)
  → Dual-index items get +0.1 bonus
  ↓
Returns memories ordered by temporal relevance:
  Most recent invoice-related memory first, even if older memories
  have higher semantic similarity to "invoice"
```

---

## 6. Error Handling

### Community Detection

- **No qualifying clusters found**: Stage 3.5 returns 0, pipeline continues. This is expected for orgs with sparse graphs.
- **Haiku summary generation fails for a cluster**: Skip that cluster, log warning, continue with remaining clusters. Community detection is best-effort.
- **Adjacency map too large (>1000 edges)**: Cap at 1000 most recent edges (by `ingested_at`). Log warning about graph density.
- **Stale community expiry fails**: Non-fatal. Stale communities remain active until next successful run.
- **Upsert conflict on community name**: The `onConflict` clause handles this — existing community nodes get updated with fresh summary and membership.

### Graph Traversal Tool

- **Entity name not found**: Return a structured error: `{ error: "Entity not found", suggestion: "Try a different name or alias" }`. The agent can relay this to the user.
- **getMultiHopNeighborhood returns empty**: Return the entity info with empty relationship arrays. The agent sees "this entity exists but has no known connections."
- **Depth exceeds 3**: Clamped to 3 by `getMultiHopNeighborhood()` (existing behavior at line 152).
- **Database timeout on large graph**: The existing `getNeighborhood()` uses `.limit()` on edge queries (line 90). For depth > 1, the BFS iterates sequentially — worst case is 3 rounds of edge queries, acceptable for typical graph sizes.

### Episodic Retrieval

- **Temporal signal false positive** (e.g., "remember when" in a casual context): The episodic mode still performs semantic search — it just weights temporal order higher. A false positive degrades to slightly different result ordering, not incorrect results.
- **search_memory_palace RPC unavailable**: Falls through to the existing `fallbackSearch()` ilike path. Episodic mode still works via the timestamp-range query; it just loses the semantic component.
- **No results in time range**: The temporal query has no time range constraint by default (it uses `created_at DESC` ordering). If explicitly provided time range yields nothing, the semantic results still populate the output.
- **Scoring produces ties**: Stable sort by `created_at DESC` as tiebreaker (most recent wins).

---

## 7. Non-Goals

- **Real-time community detection**: Communities are detected nightly during sleep consolidation. We do not detect communities at inference time — the cost of adjacency traversal + Haiku summarization is too high for the 200ms context assembly target.
- **Hierarchical community tiers**: Zep/Graphiti uses a 3-tier hierarchy (micro, meso, macro communities). This spec implements only the first tier (micro-communities of 3-10 entities). Meso and macro tiers can be added in a future iteration once micro-community data validates the approach.
- **Community visualization in UI**: No frontend changes. Community nodes appear in the entity explorer like any other entity type. A dedicated community graph visualization is out of scope.
- **Embedding community summaries**: Community nodes do not get dual-embedded (Google 768d + Voyage 1024d) in this iteration. Vector search over communities can be added later via `embedEntityNode()` which already handles all entity types.
- **Graph traversal with filtering**: The `traverse_graph` tool accepts entity name and depth only. Filtering by relation type, time range, or entity type is deferred to a future iteration to keep the tool interface simple.
- **Migration from text entity_type to enum**: The `entity_type` column in `entity_nodes` is a text column with CHECK constraints. Adding `'community'` requires updating the CHECK constraint, but no column type change. If the CHECK exists as a DB constraint (rather than application-level), a migration will be needed — but the spec assumes application-level validation consistent with the existing `ENTITY_TYPES` array.
- **Episodic retrieval for graph events**: The dual-index episodic mode operates on `memory_palace_entries` and `decision_log`. It does not query `event_tuples` directly. Graph events are accessible via the `traverse_graph` tool instead.
