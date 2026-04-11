# Sub-project B: Memory Intelligence — Design Spec

**Goal:** Close four structural gaps in BitBit's memory system: (1) keyword search misses semantically similar memories, (2) episodic observations never automatically become durable knowledge, (3) memory quality has no feedback loop from actual usage, and (4) plans are ephemeral and never inform future planning. These four features transform memory from a passive store into a self-improving knowledge system.

**Architecture:** Targeted modifications to 8 existing files plus 1 new utility module. No new UI components. One Supabase migration to add a vector column. Leverages existing Voyage embedding infrastructure (`embed-entity.ts`, `voyage-client.ts`) and Pinecone integration (`pinecone-client.ts`). All features degrade gracefully — a failure in any one does not block the others or the core TAOR loop.

---

## 1. Hybrid Memory Search

### Current State

`MemorySearch.search()` in `memory-search.ts` calls the `search_memory_palace` Postgres RPC for tsvector full-text search. On failure, it falls back to `ilike` against `content`. Both approaches are keyword-based — a query for "how much did we charge Steve" will miss a memory stored as "Steve West: quoted $150/hr for Phase 2 SEO" because the terms don't overlap.

`MemoryPalaceService.searchMemories()` in `service.ts` has the same limitation via its `search_memories` RPC.

The RAG retriever (`src/lib/rag/retriever.ts`) already implements hybrid dense+sparse vector search against Pinecone for message chunks, and `embed-entity.ts` already embeds entity nodes using dual Google (768d) + Voyage (1024d) models. The embedding infrastructure exists but is not wired to memory entries.

### New Behavior

Memory entries are embedded at write time. Search performs parallel tsvector + vector queries, then blends results using Reciprocal Rank Fusion (RRF).

### Implementation Details

#### 1a. Embed at write time

In `memory-writer.ts`, after the successful `insert` into `memory_palace_entries`, embed the memory content using the existing Voyage client and store the vector.

```typescript
// memory-writer.ts — after successful insert (line ~86)
import { embedDocuments } from '@/lib/rag/voyage-client'

// Fire-and-forget embedding (non-blocking)
this.embedMemory(data.id, input.content).catch(() => {})

private async embedMemory(memoryId: string, content: string): Promise<void> {
  const vectors = await embedDocuments([content])
  if (!vectors || vectors.length === 0 || vectors[0].length !== 1024) return

  await this.supabase
    .from('memory_palace_entries')
    .update({ content_embedding: `[${vectors[0].join(',')}]` })
    .eq('id', memoryId)
}
```

#### 1b. Database migration

Add a `vector(1024)` column to `memory_palace_entries`:

```sql
-- Migration: add_memory_content_embedding
ALTER TABLE memory_palace_entries
  ADD COLUMN content_embedding vector(1024);

CREATE INDEX idx_memory_palace_embedding
  ON memory_palace_entries
  USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE is_active = true;
```

This uses pgvector (already enabled for `entity_nodes.text_embedding`). The IVFFlat index is appropriate for the expected memory count (<100k rows). The partial index on `is_active = true` keeps the index small.

#### 1c. Vector search RPC

```sql
-- RPC: search_memories_vector
CREATE OR REPLACE FUNCTION search_memories_vector(
  p_org_id UUID,
  p_embedding vector(1024),
  p_category TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_min_confidence FLOAT DEFAULT 0.1,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  confidence FLOAT,
  entity_ids TEXT[],
  entity_names TEXT[],
  created_at TIMESTAMPTZ,
  source TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.title, m.content, m.category, m.confidence,
    m.entity_ids, m.entity_names, m.created_at, m.source, m.metadata,
    1 - (m.content_embedding <=> p_embedding) AS similarity
  FROM memory_palace_entries m
  WHERE m.org_id = p_org_id
    AND m.is_active = true
    AND m.content_embedding IS NOT NULL
    AND m.confidence >= p_min_confidence
    AND (p_category IS NULL OR m.category = p_category)
    AND (p_entity_id IS NULL OR p_entity_id = ANY(m.entity_ids))
  ORDER BY m.content_embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

#### 1d. Hybrid search in MemorySearch

Modify `MemorySearch.search()` to run tsvector and vector searches in parallel, then merge via RRF:

```typescript
// memory-search.ts — inside search() method

async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
  // ... existing setup ...

  // Parallel: tsvector + vector search
  const [tsvectorResults, vectorResults] = await Promise.all([
    this.tsvectorSearch(options),      // existing RPC call, extracted to method
    this.vectorSearch(options),         // new: embed query, call search_memories_vector
  ])

  // RRF blend (k=60 is standard)
  result.memories = this.reciprocalRankFusion(tsvectorResults, vectorResults, 60)
    .filter(m => m.confidence >= minConfidence)
    .slice(0, limit)

  // ... rest unchanged ...
}
```

**RRF formula:** For each document appearing in either result set, compute `score = sum(1 / (k + rank_in_list))` across all lists where it appears. Sort by descending RRF score. This is the standard fusion method used by Elasticsearch and Pinecone because it is rank-based (not score-based), making it robust to different scoring scales between tsvector ranks and cosine similarities.

```typescript
private reciprocalRankFusion(
  tsvectorResults: (MemoryPalaceEntry & { rank: number })[],
  vectorResults: (MemoryPalaceEntry & { rank: number })[],
  k: number = 60,
): (MemoryPalaceEntry & { rank: number })[] {
  const scoreMap = new Map<string, { entry: MemoryPalaceEntry; rrfScore: number }>()

  for (let i = 0; i < tsvectorResults.length; i++) {
    const entry = tsvectorResults[i]
    const existing = scoreMap.get(entry.id)
    const rrfContribution = 1 / (k + i + 1)
    scoreMap.set(entry.id, {
      entry,
      rrfScore: (existing?.rrfScore ?? 0) + rrfContribution,
    })
  }

  for (let i = 0; i < vectorResults.length; i++) {
    const entry = vectorResults[i]
    const existing = scoreMap.get(entry.id)
    const rrfContribution = 1 / (k + i + 1)
    scoreMap.set(entry.id, {
      entry: existing?.entry ?? entry,
      rrfScore: (existing?.rrfScore ?? 0) + rrfContribution,
    })
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ entry, rrfScore }) => ({ ...entry, rank: rrfScore }))
}
```

#### 1e. Fallback behavior

If `content_embedding` is null for all memories (pre-migration data) or if the Voyage API is unavailable, `vectorSearch()` returns an empty array. RRF with one empty list degenerates to the tsvector results alone — no degradation.

A background backfill job (not part of this spec) can embed existing memories post-migration.

### Files Modified

| File | Change |
|---|---|
| `src/lib/memory-palace/memory-writer.ts` | Add `embedMemory()` method, call after insert |
| `src/lib/memory-palace/memory-search.ts` | Add `vectorSearch()`, `reciprocalRankFusion()`, modify `search()` to run parallel + blend |
| New migration SQL | Add `content_embedding vector(1024)` column + IVFFlat index + `search_memories_vector` RPC |

---

## 2. Episodic-to-Semantic Auto-Promotion

### Current State

Sleep consolidation (`sleep-consolidation.ts`) runs 5 stages nightly:
1. SUMMARIZE: Per-entity daily digests
2. RESOLVE CONFLICTS: Temporal precedence for duplicate edges
3. DISCOVER RELATIONSHIPS: Latent edges from co-occurring events
4. PRUNE: Archive low-confidence entityless memories
5. MORNING BRIEFING: Compile actionable intel

The `memory_patterns` table tracks recurring observations (payment timing, scope creep, communication style, etc.) with `confidence`, `sample_count`, and `status` fields. Patterns accumulate evidence over time via the consolidator, but they never graduate into durable `lesson_learned` / `convention` memories. A pattern like "Steve always pays within 3 days" with confidence 0.85 and 5 corroborations stays as an ephemeral pattern instead of becoming institutional knowledge.

The `MemoryPattern` type already has a `promoted_to_memory_id` field and a `promotion_threshold` field (default 0.7), plus a `status` that can be `'promoted'`. The data model anticipates this feature — it was just never implemented.

### New Behavior

A new Stage 1.5 runs after SUMMARIZE and before RESOLVE CONFLICTS. It queries for promotion-eligible patterns and creates `convention`-category memories from them.

### Implementation Details

Add `stagePromotePatterns()` between Stage 1 and Stage 2 in `runSleepConsolidation()`:

```typescript
// sleep-consolidation.ts — new stage between Stage 1 and Stage 2

async function stagePromotePatterns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // Find patterns eligible for promotion:
  // - status = 'active' (not already promoted)
  // - confidence >= promotion_threshold (defaults to 0.7)
  // - sample_count >= 3 (at least 3 observations)
  const { data: candidates, error } = await supabase
    .from('memory_patterns')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .gte('confidence', 0.7)
    .gte('sample_count', 3)

  if (error || !candidates || candidates.length === 0) return 0

  // Filter: only promote patterns where confidence >= their own promotion_threshold
  const eligible = (candidates as MemoryPattern[]).filter(
    p => p.confidence >= p.promotion_threshold
  )

  let promoted = 0

  for (const pattern of eligible) {
    // Create a convention memory from the pattern
    const { data: newMemory, error: insertErr } = await supabase
      .from('memory_palace_entries')
      .insert({
        org_id: orgId,
        category: 'convention',
        title: `Learned: ${pattern.pattern_type.replace(/_/g, ' ')}`,
        content: pattern.description,
        confidence: pattern.confidence,
        decay_rate: 'never',
        corroboration_count: pattern.sample_count,
        entity_ids: pattern.entity_ids,
        entity_names: pattern.entity_names,
        source: 'consolidation',
        is_active: true,
        tags: ['auto-promoted', pattern.pattern_type],
        metadata: {
          promoted_from_pattern_id: pattern.id,
          promotion_date: new Date().toISOString(),
          evidence_count: pattern.sample_count,
          pattern_data: pattern.pattern_data,
          first_observed: pattern.first_observed_at,
          last_observed: pattern.last_observed_at,
        },
      })
      .select('id')
      .single()

    if (insertErr || !newMemory) continue

    // Mark pattern as promoted
    await supabase
      .from('memory_patterns')
      .update({
        status: 'promoted',
        promoted_to_memory_id: newMemory.id,
      })
      .eq('id', pattern.id)
      .eq('org_id', orgId)

    promoted++
  }

  return promoted
}
```

In `runSleepConsolidation()`, insert the new stage call:

```typescript
// After Stage 1 SUMMARIZE block, before Stage 2 RESOLVE CONFLICTS:

// Stage 1.5: PROMOTE PATTERNS
try {
  report.patternsPromoted = await stagePromotePatterns(supabase, orgId)
  logger.info('[sleep-consolidation] Stage 1.5 PROMOTE PATTERNS complete', {
    orgId,
    patternsPromoted: report.patternsPromoted,
  })
} catch (err) {
  logger.error('[sleep-consolidation] Stage 1.5 PROMOTE PATTERNS failed', {
    orgId,
    error: err instanceof Error ? err.message : String(err),
  })
}
```

Add `patternsPromoted: number` to `SleepConsolidationReport`.

### Files Modified

| File | Change |
|---|---|
| `src/lib/memory-palace/sleep-consolidation.ts` | Add `stagePromotePatterns()` function, insert Stage 1.5 call in pipeline, update report type |

---

## 3. Memory Corroboration Feedback Loop

### Current State

`MemoryPalaceService.corroborateMemory()` in `service.ts` exists and works — it bumps confidence by a capped boost and increments `corroboration_count`. However, nothing ever calls it automatically based on memory usage.

The context assembler (`context-assembler.ts`) loads memories via `proactiveRecall()` and injects them into the system prompt, but does not track which specific memory IDs were surfaced. The TAOR loop (`taor-loop.ts`) has no post-run memory feedback step.

There is no mechanism for negative feedback. When a user corrects the agent ("no, that's wrong", "actually it's $200 not $150"), the contradicting memory retains its confidence.

### New Behavior

Three additions create a closed feedback loop:

1. **Track surfaced memory IDs**: The context assembler records which memory IDs were included in the system prompt.
2. **Positive feedback**: When a TAOR run completes successfully (stop_reason is not tool_use, i.e., the model produced a final answer), corroborate each surfaced memory.
3. **Negative feedback**: When the user's next message matches correction patterns, apply confidence decay to the surfaced memories from the previous turn.

### Implementation Details

#### 3a. Track surfaced memory IDs in context assembler

`proactiveRecall()` already returns `ProactiveRecallResult[]` which contains `memories: MemoryPalaceEntry[]` (legacy path) or `scoredItems` (graph path). In both cases, memory IDs are available.

Add a `surfacedMemoryIds` field to `AssembledContext.metadata`:

```typescript
// context-assembler.ts — in AssembledContext metadata
export interface AssembledContext {
  // ... existing fields ...
  metadata: {
    // ... existing fields ...
    surfacedMemoryIds: string[]  // NEW: memory IDs included in this context window
  }
}
```

Populate it from the recall results:

```typescript
// After proactive recall section (~line 660):
const surfacedMemoryIds: string[] = []
for (const r of recallResults) {
  // Graph path: memories array is empty but scoredItems has data
  // Legacy path: memories have IDs
  for (const mem of r.memories) {
    surfacedMemoryIds.push(mem.id)
  }
}
```

#### 3b. Positive feedback in TAOR loop

After the TAOR loop emits the final message (stop_reason !== 'tool_use'), corroborate surfaced memories. This runs fire-and-forget to avoid blocking the response.

```typescript
// taor-loop.ts — after final message yield, before run logging (~line 455)
// Positive memory feedback: corroborate surfaced memories on successful completion
if (ctx?.metadata?.surfacedMemoryIds?.length) {
  const palace = new MemoryPalaceService(config.supabase, config.orgId)
  for (const memoryId of ctx.metadata.surfacedMemoryIds) {
    palace.corroborateMemory(memoryId, 0.02).catch(() => {})  // +0.02 per successful use
  }
}
```

The boost is intentionally small (0.02) because successful completion is weak positive signal — the memory was present but may not have been the reason for success. Over many turns, frequently useful memories accumulate meaningful confidence gains.

#### 3c. Negative feedback: contradictMemory()

Add a new method to `MemoryPalaceService`:

```typescript
// service.ts — new method alongside corroborateMemory()

/**
 * Apply confidence decay when a memory is contradicted by user correction.
 * Minimum confidence floor of 0.05 (never fully zeroes out — requires explicit deletion).
 */
async contradictMemory(memoryId: string, penalty: number = 0.15): Promise<void> {
  const { data: current } = await this.supabase
    .from('memory_palace_entries')
    .select('confidence, corroboration_count')
    .eq('id', memoryId)
    .eq('org_id', this.orgId)
    .maybeSingle()

  if (!current) return

  const newConfidence = Math.max(0.05, (current.confidence as number) - penalty)

  await this.supabase
    .from('memory_palace_entries')
    .update({
      confidence: newConfidence,
      metadata: {
        last_contradiction_at: new Date().toISOString(),
      },
    })
    .eq('id', memoryId)
    .eq('org_id', this.orgId)

  logger.info('[memory-palace] Memory contradicted', {
    memoryId,
    oldConfidence: current.confidence,
    newConfidence,
    penalty,
  })
}
```

#### 3d. Correction detection in TAOR loop

At the start of each TAOR iteration (when processing a new user message), check if the message matches correction patterns. If so, apply negative feedback to the previous turn's surfaced memories.

```typescript
// taor-loop.ts — correction detection constants
const CORRECTION_PATTERNS = [
  /^no[,.]?\s/i,
  /that'?s (?:not |in)?correct/i,
  /that'?s wrong/i,
  /actually[,.]?\s/i,
  /you(?:'re| are) (?:wrong|mistaken|incorrect)/i,
  /(?:wrong|incorrect) (?:amount|price|date|name|number)/i,
]

function isUserCorrection(message: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(message.trim()))
}
```

Store `surfacedMemoryIds` from the previous turn's context assembly. When a correction is detected on the next user message, apply decay:

```typescript
// In the TAOR loop, before context assembly:
if (isUserCorrection(message) && previousSurfacedMemoryIds.length > 0) {
  const palace = new MemoryPalaceService(config.supabase, config.orgId)
  for (const memoryId of previousSurfacedMemoryIds) {
    palace.contradictMemory(memoryId, 0.15).catch(() => {})
  }
  logger.info('[taor] Correction detected, decayed surfaced memories', {
    count: previousSurfacedMemoryIds.length,
  })
}
```

Note: This is a heuristic. False positives (user says "no" for an unrelated reason) cause a small 0.15 decay to memories that were already in context — acceptable because corroboration from future successful uses will recover confidence. False negatives (user corrects without matching patterns) mean no decay — the memory retains its existing confidence.

### Files Modified

| File | Change |
|---|---|
| `src/lib/context-assembly/context-assembler.ts` | Add `surfacedMemoryIds` to metadata, populate from recall results |
| `src/lib/memory-palace/service.ts` | Add `contradictMemory()` method |
| `src/lib/agent/engine/taor-loop.ts` | Add correction detection, positive feedback on completion, negative feedback on correction |

---

## 4. Plan Persistence as Memory

### Current State

`generatePlan()` in `planner.ts` produces `PlanStage[]` (1-4 stages with labels, icons, tool hints). The plan is consumed by the TAOR loop for UI rendering and tool group selection, then discarded. No record of what was planned, what actually happened, or whether the plan succeeded.

The `pattern` memory category in `memory_palace_entries` has `decay_rate: 'slow'` by default and is designed for operational observations. Plan-as-memory fits naturally here.

### New Behavior

1. **Store plan at generation**: After `generatePlan()` returns, persist the plan as a `pattern`-category memory with `decay_rate: 'fast'` (plans are ephemeral until proven useful).
2. **Update on completion**: When the TAOR run completes, update the stored plan memory with actual execution data (tools called, stages completed, outcome status).
3. **Surface active plans**: In proactive recall, query for active plan memories on the same thread to provide "current objectives" context.
4. **Promote on success**: When all plan stages complete successfully, create a `convention`-category memory recording the successful execution path.

### Implementation Details

#### 4a. Store plan at generation

In the TAOR loop, after the plan is received and yielded to the UI:

```typescript
// taor-loop.ts — after plan is received (~line 159)
let planMemoryId: string | null = null

if (planStages.length > 0 && config.threadId) {
  const palace = new MemoryPalaceService(config.supabase, config.orgId)
  planMemoryId = await palace.createMemory({
    memoryType: 'pattern',
    title: `Plan: ${planStages.map(s => s.label).join(' -> ')}`,
    content: JSON.stringify({
      stages: planStages,
      userMessage: message.slice(0, 200),
      toolGroups: raceResult?.plan?.toolGroups ?? [],
    }),
    typeMetadata: {
      plan_type: 'taor_execution',
      stage_count: planStages.length,
      status: 'active',
    },
    confidence: 0.4,  // Low initial confidence — unproven plan
    decayRate: 'fast',
    sourceType: 'agent_reflection',
    sourceThreadId: config.threadId,
  }).catch(() => null)
}
```

#### 4b. Update plan on completion

When the TAOR loop completes (final message emitted), update the plan memory with execution results:

```typescript
// taor-loop.ts — after final message, alongside run logging (~line 460)
if (planMemoryId) {
  const completedStages = planStages.filter(s => activatedStages.has(s.id))
  const allCompleted = completedStages.length === planStages.length
  const toolsUsed = [...new Set(toolBlocks?.map(t => t.name) ?? [])]

  config.supabase
    .from('memory_palace_entries')
    .update({
      metadata: {
        plan_type: 'taor_execution',
        status: allCompleted ? 'completed' : 'partial',
        stages_completed: completedStages.length,
        stages_total: planStages.length,
        tools_used: toolsUsed,
        tool_call_count: toolCallCount,
        iterations: iterationCount,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      },
    })
    .eq('id', planMemoryId)
    .eq('org_id', config.orgId)
    .then(() => {})  // fire-and-forget
    .catch(() => {})
}
```

#### 4c. Surface active plans in proactive recall

In `proactive-recall.ts`, add a thread-scoped plan query within `proactiveRecall()`:

```typescript
// proactive-recall.ts — inside proactiveRecall(), before returning results

// Surface any active plans for this thread
if (threadId) {
  const { data: activePlans } = await supabase
    .from('memory_palace_entries')
    .select('id, title, content, metadata')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('source_thread_id', threadId)
    .eq('category', 'pattern')
    .eq('metadata->>plan_type', 'taor_execution')
    .eq('metadata->>status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  if (activePlans && activePlans.length > 0) {
    const plan = activePlans[0]
    const planContent = JSON.parse(plan.content)
    const stageLabels = planContent.stages.map((s: PlanStage) => s.label).join(' -> ')

    results.push({
      entityId: 'plan',
      entityName: 'Current Objectives',
      memories: [],
      decisions: [],
      patterns: [],
      formattedText: `## Active Plan\n${plan.title}\nStages: ${stageLabels}`,
      tokenEstimate: Math.ceil(stageLabels.length / 3.5) + 20,
    })
  }
}
```

Note: This requires threading `threadId` through to `proactiveRecall()`. Currently the function signature is `proactiveRecall(supabase, orgId, entityIds)`. Add an optional `threadId` parameter.

#### 4d. Promote successful plans to convention

When the plan update (4b) determines `allCompleted === true`, promote to a convention memory:

```typescript
// taor-loop.ts — inside the plan completion block, when allCompleted is true
if (allCompleted && planStages.length >= 2) {
  const palace = new MemoryPalaceService(config.supabase, config.orgId)
  palace.createMemory({
    memoryType: 'lesson_learned',
    title: `Successful approach: ${planStages[0].label}`,
    content: `For "${message.slice(0, 100)}", the approach ${planStages.map(s => s.label).join(' -> ')} worked. Tools used: ${[...new Set(toolBlocks?.map(t => t.name) ?? [])].join(', ')}. Completed in ${iterationCount} iterations.`,
    typeMetadata: {
      plan_stages: planStages.map(s => s.label),
      tools_used: [...new Set(toolBlocks?.map(t => t.name) ?? [])],
      iterations: iterationCount,
      duration_ms: Date.now() - startTime,
      original_plan_id: planMemoryId,
    },
    confidence: 0.7,
    decayRate: 'slow',
    sourceType: 'agent_reflection',
    sourceThreadId: config.threadId,
  }).catch(() => {})

  // Mark the plan memory as inactive (superseded by the lesson)
  config.supabase
    .from('memory_palace_entries')
    .update({ is_active: false })
    .eq('id', planMemoryId)
    .eq('org_id', config.orgId)
    .then(() => {})
    .catch(() => {})
}
```

### Files Modified

| File | Change |
|---|---|
| `src/lib/agent/engine/taor-loop.ts` | Store plan as memory, update on completion, promote on success |
| `src/lib/memory-palace/proactive-recall.ts` | Add optional `threadId` param, query for active plans, surface as context |

---

## 5. File Changes Summary

| File | Feature | Change Description | Est. Lines |
|---|---|---|---|
| `src/lib/memory-palace/memory-writer.ts` | Hybrid Search | Add `embedMemory()` method, call after insert | ~25 |
| `src/lib/memory-palace/memory-search.ts` | Hybrid Search | Add `vectorSearch()`, `reciprocalRankFusion()`, modify `search()` | ~80 |
| `src/lib/memory-palace/sleep-consolidation.ts` | Episodic Promotion | Add `stagePromotePatterns()`, insert Stage 1.5, update report type | ~60 |
| `src/lib/memory-palace/service.ts` | Corroboration Loop | Add `contradictMemory()` method | ~30 |
| `src/lib/context-assembly/context-assembler.ts` | Corroboration Loop | Track `surfacedMemoryIds` in metadata | ~15 |
| `src/lib/agent/engine/taor-loop.ts` | Corroboration + Plans | Correction detection, positive/negative feedback, plan storage/update/promote | ~90 |
| `src/lib/memory-palace/proactive-recall.ts` | Plan Persistence | Add `threadId` param, active plan query, format as context | ~35 |
| New migration SQL | Hybrid Search | `content_embedding` column, IVFFlat index, `search_memories_vector` RPC | ~30 |

**Total: ~365 lines changed/added.** One migration. No new npm dependencies (Voyage client and pgvector already in use). No UI changes.

---

## 6. Data Flow

```
                    WRITE PATH
                    ==========
User message arrives
  |
  v
MemoryConsolidator.processNewTurn()          [existing]
  | extracts facts via Haiku
  v
MemoryWriter.storeMemory()                   [existing]
  | inserts into memory_palace_entries
  |--- embedMemory() fire-and-forget ------> Voyage API -> content_embedding column  [NEW: Feature 1]
  v
Memory admission gate                        [existing]

                    SEARCH PATH
                    ===========
Context assembler calls searchMemories()
  |
  v
MemorySearch.search()                        [modified]
  |--- tsvector search (existing RPC)
  |--- vector search (embed query -> pgvector cosine)    [NEW: Feature 1]
  v
Reciprocal Rank Fusion                       [NEW: Feature 1]
  | blends keyword + semantic results
  v
Context window (system prompt)
  |--- surfacedMemoryIds tracked             [NEW: Feature 3]

                    FEEDBACK PATH
                    =============
TAOR loop completes
  |
  |--- Success? corroborateMemory(+0.02) for each surfaced memory   [NEW: Feature 3]
  |
  v
Next user message arrives
  |--- Correction detected? contradictMemory(-0.15)                 [NEW: Feature 3]

                    PLAN PATH
                    =========
generatePlan() returns stages
  |--- Store as pattern memory (fast decay)                         [NEW: Feature 4]
  v
TAOR loop executes tools
  |--- Update plan memory with actual tools/outcome                 [NEW: Feature 4]
  v
All stages complete?
  |--- Yes: Promote to lesson_learned (slow decay)                  [NEW: Feature 4]
  |--- No: Plan memory decays naturally via existing decay system

                    NIGHTLY PATH
                    ============
Sleep consolidation runs (3am UTC)
  |
  Stage 1: SUMMARIZE (existing)
  |
  Stage 1.5: PROMOTE PATTERNS                                      [NEW: Feature 2]
  |  query memory_patterns where confidence >= 0.7, sample_count >= 3
  |  create convention memories from qualifying patterns
  |  mark patterns as status = 'promoted'
  |
  Stage 2-5: (existing, unchanged)
```

---

## 7. Error Handling

### Feature 1: Hybrid Search
- **Voyage API unavailable at write time**: `embedMemory()` is fire-and-forget — memory is still stored, just without embedding. Future searches degrade to tsvector-only.
- **Voyage API unavailable at search time**: `vectorSearch()` returns empty array. RRF with one empty list equals tsvector results alone.
- **pgvector extension missing**: `search_memories_vector` RPC fails. Caught by existing try/catch in `search()`, falls through to `fallbackSearch()` (ilike).
- **Embedding dimension mismatch**: `embedDocuments` returns wrong dimension. Guarded by `vectors[0].length !== 1024` check — memory proceeds without embedding.

### Feature 2: Episodic Promotion
- **No qualifying patterns**: Function returns 0, pipeline continues.
- **Insert fails for promoted memory**: Pattern is not marked as promoted, will be retried next night.
- **Pattern already promoted (race condition)**: The `status = 'active'` filter prevents double promotion.

### Feature 3: Corroboration Feedback
- **Missing memory ID in corroborate/contradict**: Both methods do `maybeSingle()` — returns null, no-op.
- **False positive correction detection**: Small 0.15 penalty is recoverable through future corroboration (+0.02 per successful use, ~8 uses to recover).
- **surfacedMemoryIds empty**: No feedback applied, no error.

### Feature 4: Plan Persistence
- **Plan memory creation fails**: `planMemoryId` is null, all downstream plan updates are skipped via null check.
- **Plan update fails**: Fire-and-forget, no effect on response quality.
- **Plan promotion fails**: Lesson learned is not created, but plan memory still exists with completion metadata.
- **Plan content too large**: `message.slice(0, 200)` caps the user message stored. Plan stages are small by design (1-4 stages).

---

## 8. Non-Goals

- **Full Pinecone integration for memories**: This spec uses pgvector (already available via entity_nodes) rather than Pinecone for memory vectors. Pinecone is overkill for the expected memory count (<100k) and adds an external dependency to the write path. The `pinecone_id` column on `memory_palace_entries` is preserved for future migration if needed.
- **Real-time embedding updates**: When a memory is corroborated or contradicted, its content does not change — only confidence changes. Re-embedding is unnecessary. If content changes (via `supersede()`), the new memory gets a fresh embedding.
- **Correction intent classification via LLM**: Using regex patterns for correction detection is intentionally cheap (~0ms). An LLM call would add 200-500ms latency to every user message. The heuristic has acceptable precision for the penalty magnitude (0.15 is recoverable).
- **User-facing memory feedback UI**: No "was this memory helpful?" prompt. The feedback loop is fully automatic and invisible to the user.
- **Cross-thread plan linking**: Plans are scoped to a single thread. Cross-thread plan coordination (e.g., "continue the plan from yesterday") requires thread resolution, which is a separate concern.
- **Backfill job for existing memories**: Embedding pre-existing memories is a one-time operational task, not a code feature. Can be done via a Supabase Edge Function or a manual script post-migration.
- **Memory importance weighting in RRF**: The current RRF implementation treats both search modalities equally. Weighting (e.g., 0.6 * vector_rrf + 0.4 * tsvector_rrf) is a tuning parameter that should be informed by usage data, not pre-specified.

---

## 9. Cross-Agent Memory Access — Shared Brain Architecture

### Architectural Constraint

BitBit has **four agent systems** that all present as "BitBit" to the user:

1. **TAOR Loop** — interactive conversational agent (chat interface)
2. **Swarm System** (`src/lib/swarm/`) — multi-agent DAGs with typed roles (sales, finance, comms, operations, research, coordinator), each with distinct personas and risk tolerances
3. **Roles System** (`src/lib/roles/`) — tick-based autonomous background agents (sales, finance, comms, growth, builder) that periodically evaluate state and propose actions
4. **Proactive Layer** (`src/lib/proactive/`) — signal→action engine that decides when BitBit should act without being asked

**The Memory Palace and Knowledge Graph must be the single source of truth that ALL four systems read from AND write to.** A swarm's finance agent discovering a client is overdue must write that to the shared memory so the TAOR loop knows about it when the user asks. A proactive signal about a missed deadline must be enrichable from memory context.

### Design Principle: Source Agent Provenance

Every memory write should track which agent system generated it via a `source_agent` field:

```typescript
// Extension to existing source_type provenance
interface MemoryProvenance {
  source_type: 'extraction' | 'user_explicit' | 'agent_reflection' | 'consolidation'
  source_agent?: 'taor_loop' | 'swarm_sales' | 'swarm_finance' | 'swarm_comms' | 'swarm_operations' | 'swarm_research' | 'role_sales' | 'role_finance' | 'role_comms' | 'proactive' | 'sleep_consolidation'
}
```

This enables **trust-weighted retrieval** — a financial fact from the finance swarm agent (conservative, high-priority weight) carries more weight than a casual extraction from the research agent.

### Implementation: Unified Memory Interface

All four agent systems should access memory through the same interface — `MemoryPalaceService` (already exists in `service.ts`). The changes needed:

1. **`createMemory()`** — Add optional `source_agent` parameter. Default to `'taor_loop'` for backward compatibility.
2. **`searchMemories()`** — No change needed. All systems query the same store.
3. **`corroborateMemory()` / `contradictMemory()`** — Add `source_agent` to the corroboration log for audit trail.
4. **Hybrid search (Feature 1)** — Available to all callers automatically since it's implemented in `MemorySearch`.

### Where Each System Connects

| System | Reads Memory | Writes Memory | Current State |
|---|---|---|---|
| TAOR Loop | via Context Assembler + proactive recall | via MemoryConsolidator + reflection | **Active** |
| Swarm Participants | unknown — needs audit | unknown — needs audit | **Needs wiring** |
| Roles System | `RoleContext` likely loads some context | `RoleEvaluation.stateUpdates` may write | **Needs audit** |
| Proactive Layer | `ProactiveSignal.data` enrichment | Likely writes via action execution | **Needs audit** |
| Sleep Consolidation | Reads all memories for processing | Writes summaries, promotions, prunes | **Active** |

### Migration Path

This spec focuses on the TAOR loop path (Features 1-4) because it's the most heavily used and well-understood. The multi-agent wiring is a **follow-on task** after the core memory upgrades are proven:

1. **Phase 1** (this spec): Implement hybrid search, auto-promotion, feedback loop, plan persistence — all through the TAOR loop path
2. **Phase 2** (follow-on): Audit swarm/roles/proactive for memory access patterns, wire them through the same `MemoryPalaceService` with `source_agent` provenance
3. **Phase 3** (Sub-project D): Trust-weighted retrieval using `source_agent` and agent persona risk tolerances to rank memory results

The `source_agent` field should be added to the DB schema in Phase 1 (migration is cheap) even though it's only populated by the TAOR loop initially. This avoids a second migration later.
