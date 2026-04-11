# Memory Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform BitBit's memory from a passive store into a self-improving knowledge system by adding semantic search, automatic pattern promotion, usage-based feedback loops, and plan persistence.

**Architecture:** Targeted modifications to 7 existing files plus 1 new SQL migration. Memory entries are embedded at write time via Voyage and searched with parallel tsvector + pgvector queries blended by Reciprocal Rank Fusion. A nightly sleep stage promotes recurring patterns into durable conventions. The TAOR loop tracks which memories were surfaced and applies positive/negative confidence adjustments based on outcome. Plans are persisted as memories and promoted to lessons on success.

**Tech Stack:** Supabase (pgvector, IVFFlat index, RPC functions), Voyage AI embeddings (1024d), TypeScript, existing MemoryPalaceService/MemoryWriter/MemorySearch classes.

---

## Task 1: Database Migration (content_embedding column + vector RPC)

**Files:**
- **Create:** `supabase/migrations/20260406000001_memory_content_embedding.sql`

### Steps

- [ ] **1.1** Create the migration file at `supabase/migrations/20260406000001_memory_content_embedding.sql` with the following content:

```sql
-- Migration: add content_embedding vector column to memory_palace_entries
-- Supports hybrid search (tsvector + vector) via Reciprocal Rank Fusion
-- Depends on pgvector extension (already enabled for entity_nodes.text_embedding)

-- Add vector column
ALTER TABLE memory_palace_entries
  ADD COLUMN IF NOT EXISTS content_embedding vector(1024);

-- IVFFlat index for cosine similarity search (partial: active memories only)
CREATE INDEX IF NOT EXISTS idx_memory_palace_embedding
  ON memory_palace_entries
  USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE is_active = true;

-- RPC: vector similarity search on memory_palace_entries
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

- [ ] **1.2** Verify the migration file exists and has valid SQL syntax:

```bash
cat supabase/migrations/20260406000001_memory_content_embedding.sql
# Check for syntax: should contain ALTER TABLE, CREATE INDEX, CREATE OR REPLACE FUNCTION
grep -c 'CREATE' supabase/migrations/20260406000001_memory_content_embedding.sql
# Expected: 3 (INDEX, FUNCTION, implicit from OR REPLACE)
```

- [ ] **1.3** Commit:

```bash
git add supabase/migrations/20260406000001_memory_content_embedding.sql
git commit -m "feat(memory): add content_embedding vector column + search RPC migration"
```

---

## Task 2: Hybrid Memory Search (embed at write + RRF search)

**Files:**
- **Modify:** `src/lib/memory-palace/memory-writer.ts`
- **Modify:** `src/lib/memory-palace/memory-search.ts`

### Steps

- [ ] **2.1** Add the `embedMemory()` method to `MemoryWriter` in `memory-writer.ts`. Add the import at the top of the file after the existing imports:

```typescript
// memory-writer.ts — add import after line 8 (after existing imports)
import { embedDocuments } from '@/lib/rag/voyage-client'
```

Then add the private method to the `MemoryWriter` class, after the existing `corroborate()` method (after line 299):

```typescript
  /**
   * Embed memory content using Voyage and store the vector.
   * Fire-and-forget — failure does not affect memory storage.
   */
  private async embedMemory(memoryId: string, content: string): Promise<void> {
    const vectors = await embedDocuments([content])
    if (!vectors || vectors.length === 0 || vectors[0].length !== 1024) return

    await this.supabase
      .from('memory_palace_entries')
      .update({ content_embedding: `[${vectors[0].join(',')}]` })
      .eq('id', memoryId)
  }
```

- [ ] **2.2** Add the fire-and-forget embedding call in `storeMemory()`, after the successful insert. Insert after the `logger.info` call at line 94 (before `return data as MemoryPalaceEntry`):

```typescript
      // Fire-and-forget embedding (non-blocking)
      this.embedMemory(data.id, input.content).catch(() => {})
```

- [ ] **2.3** Verify `memory-writer.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/memory-palace/memory-writer.ts 2>&1 | head -20
```

- [ ] **2.4** Extract the existing tsvector search from `MemorySearch.search()` into a `tsvectorSearch()` private method in `memory-search.ts`. Add after the `fallbackSearch()` method (after line 268):

```typescript
  /**
   * Tsvector full-text search via RPC (extracted from search() for parallel execution).
   */
  private async tsvectorSearch(
    options: MemorySearchOptions,
  ): Promise<(MemoryPalaceEntry & { rank: number })[]> {
    const { query, orgId, category, entityId, limit = 20 } = options

    const { data, error } = await this.supabase
      .rpc('search_memory_palace', {
        p_org_id: orgId,
        p_query: query,
        p_category: category ?? null,
        p_entity_id: entityId ?? null,
        p_limit: limit,
      })

    if (error) {
      logger.warn('[memory-search] tsvector RPC failed, falling back to ilike', {
        error: error.message,
      })
      return this.fallbackSearch(orgId, query, category, entityId, limit)
    }

    return (data ?? []) as (MemoryPalaceEntry & { rank: number })[]
  }
```

- [ ] **2.5** Add the `vectorSearch()` private method to `MemorySearch` in `memory-search.ts`. Add the import at the top of the file:

```typescript
// memory-search.ts — add import after line 8 (after existing imports)
import { embedDocuments } from '@/lib/rag/voyage-client'
```

Then add the method after `tsvectorSearch()`:

```typescript
  /**
   * Vector similarity search: embed the query via Voyage, then call the
   * search_memories_vector RPC. Returns empty array on any failure
   * (Voyage unavailable, no embeddings in DB, pgvector missing).
   */
  private async vectorSearch(
    options: MemorySearchOptions,
  ): Promise<(MemoryPalaceEntry & { rank: number })[]> {
    const { query, orgId, category, entityId, limit = 20, minConfidence = 0 } = options

    try {
      const vectors = await embedDocuments([query])
      if (!vectors || vectors.length === 0 || vectors[0].length !== 1024) return []

      const { data, error } = await this.supabase
        .rpc('search_memories_vector', {
          p_org_id: orgId,
          p_embedding: `[${vectors[0].join(',')}]`,
          p_category: category ?? null,
          p_entity_id: entityId ?? null,
          p_min_confidence: minConfidence,
          p_limit: limit,
        })

      if (error) {
        logger.warn('[memory-search] vector search RPC failed', { error: error.message })
        return []
      }

      // Map similarity score to rank field for RRF compatibility
      return ((data ?? []) as (MemoryPalaceEntry & { similarity: number })[]).map(
        (m, i) => ({ ...m, rank: m.similarity ?? (1 - i * 0.05) }),
      )
    } catch (err) {
      logger.warn('[memory-search] vectorSearch failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }
```

- [ ] **2.6** Add the `reciprocalRankFusion()` private method to `MemorySearch` in `memory-search.ts`, after `vectorSearch()`:

```typescript
  /**
   * Reciprocal Rank Fusion — merge two ranked result sets.
   * For each document, score = sum(1 / (k + rank_in_list)) across lists.
   * Standard fusion method (used by Elasticsearch, Pinecone) — rank-based,
   * robust to different scoring scales between tsvector and cosine.
   */
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

- [ ] **2.7** Modify the `search()` method in `MemorySearch` to use parallel tsvector + vector search with RRF blending. Replace the memory search section (lines 60-80) of the `search()` method:

**Replace** the block from `// 1. Full-text search on memory_palace_entries via RPC` through the closing of the `} else if (memoryResults)` block with:

```typescript
      // 1. Parallel: tsvector + vector search with RRF blending
      const [tsvectorResults, vectorResults] = await Promise.all([
        this.tsvectorSearch(options),
        this.vectorSearch(options),
      ])

      // RRF blend (k=60 is standard)
      result.memories = this.reciprocalRankFusion(tsvectorResults, vectorResults, 60)
        .filter(m => m.confidence >= minConfidence)
        .slice(0, limit)
```

- [ ] **2.8** Verify `memory-search.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/memory-palace/memory-search.ts 2>&1 | head -20
```

- [ ] **2.9** Commit:

```bash
git add src/lib/memory-palace/memory-writer.ts src/lib/memory-palace/memory-search.ts
git commit -m "feat(memory): hybrid search with Voyage embedding at write + RRF blending at search"
```

---

## Task 3: Episodic-to-Semantic Auto-Promotion (Sleep Stage 1.5)

**Files:**
- **Modify:** `src/lib/memory-palace/sleep-consolidation.ts`

### Steps

- [ ] **3.1** Add the `patternsPromoted` field to the `SleepConsolidationReport` interface in `sleep-consolidation.ts`. Add after line 27 (`briefingGenerated: boolean`):

```typescript
  patternsPromoted: number
```

- [ ] **3.2** Initialize `patternsPromoted: 0` in the report object inside `runSleepConsolidation()`. Add after line 56 (`briefingGenerated: false,`):

```typescript
    patternsPromoted: 0,
```

- [ ] **3.3** Add the `MemoryPattern` type import. Add to the existing imports at the top of the file (after line 7):

```typescript
import type { MemoryPattern } from './types'
```

- [ ] **3.4** Add the `stagePromotePatterns()` function. Insert before the `// --- Stage 1: SUMMARIZE` comment (before line 139):

```typescript
// ─── Stage 1.5: PROMOTE PATTERNS ────────────────────────────────────────────

async function stagePromotePatterns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // Find patterns eligible for promotion:
  // - status = 'active' (not already promoted)
  // - confidence >= 0.7 (base threshold)
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

- [ ] **3.5** Insert the Stage 1.5 call in `runSleepConsolidation()`, after the Stage 1 SUMMARIZE block and before the Stage 2 RESOLVE CONFLICTS block. Insert after the closing `}` of the Stage 1 catch block (after line 75):

```typescript

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

- [ ] **3.6** Verify `sleep-consolidation.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/memory-palace/sleep-consolidation.ts 2>&1 | head -20
```

- [ ] **3.7** Commit:

```bash
git add src/lib/memory-palace/sleep-consolidation.ts
git commit -m "feat(memory): add Stage 1.5 episodic-to-semantic pattern promotion in sleep consolidation"
```

---

## Task 4: Memory Corroboration Feedback Loop

**Files:**
- **Modify:** `src/lib/context-assembly/context-assembler.ts`
- **Modify:** `src/lib/memory-palace/service.ts`
- **Modify:** `src/lib/agent/engine/taor-loop.ts`

### Steps

- [ ] **4.1** Add `surfacedMemoryIds` to the `AssembledContext` metadata type in `context-assembler.ts`. In the `AssembledContext` interface (around line 72), add to the metadata object after `pendingActionCount: number`:

```typescript
    surfacedMemoryIds: string[]
```

- [ ] **4.2** Populate `surfacedMemoryIds` from proactive recall results in `context-assembler.ts`. After the proactive recall section (after the `recallResults.length > 0` block that appends to `finalSystemPrompt`, around line 666), add:

```typescript
    // Track surfaced memory IDs for corroboration feedback loop
    const surfacedMemoryIds: string[] = []
    for (const r of recallResults) {
      for (const mem of r.memories) {
        surfacedMemoryIds.push(mem.id)
      }
    }
```

- [ ] **4.3** Include `surfacedMemoryIds` in the returned metadata. In the `return` statement at the end of `assemble()` (around line 791), add `surfacedMemoryIds` to the metadata object. After the `pendingActionCount: approvals.length,` line, add:

```typescript
        surfacedMemoryIds,
```

Note: The `surfacedMemoryIds` variable is declared inside the try/catch for proactive recall. Move the declaration before the try block, or initialize in the return as `surfacedMemoryIds: surfacedMemoryIds ?? []`. The cleanest approach is to declare `let surfacedMemoryIds: string[] = []` before the proactive recall try/catch block (around line 643), then populate it inside the try.

- [ ] **4.4** Verify `context-assembler.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/context-assembly/context-assembler.ts 2>&1 | head -20
```

- [ ] **4.5** Add `contradictMemory()` to `MemoryPalaceService` in `service.ts`. Insert after the `corroborateMemory()` method (after line 436):

```typescript

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

- [ ] **4.6** Verify `service.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/memory-palace/service.ts 2>&1 | head -20
```

- [ ] **4.7** Add correction detection constants and helper to `taor-loop.ts`. Add after the existing imports (after line 33, before the complexity estimator):

```typescript
import { MemoryPalaceService } from '@/lib/memory-palace/service'

// ---------------------------------------------------------------------------
// Correction detection for memory feedback loop
// ---------------------------------------------------------------------------

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

- [ ] **4.8** Add state tracking variables in the TAOR loop. Inside `runTAORLoop()`, after `let activeRole: string | undefined` (line 79), add:

```typescript
  let previousSurfacedMemoryIds: string[] = []
  let ctx: { metadata: { surfacedMemoryIds?: string[] } } | null = null
```

- [ ] **4.9** Add negative feedback (correction detection) before context assembly. Inside the TAOR loop, before the context assembly section (before `// -- 3. Context assembly`, around line 104), add:

```typescript
  // ── Memory feedback: correction detection ───────────────────────────
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

- [ ] **4.10** Capture surfaced memory IDs from context assembly. In the context assembly section where the assembler result is used (around line 115, after `config.history = ctx.messageHistory`), store the ctx reference. Replace:

```typescript
      config.history = ctx.messageHistory
```

with:

```typescript
      config.history = ctx.messageHistory
      previousSurfacedMemoryIds = ctx.metadata.surfacedMemoryIds ?? []
```

Note: The variable `ctx` is already declared inside the try block as a `const`. To make it accessible outside, we use the `previousSurfacedMemoryIds` variable directly. The `ctx` declared at step 4.8 is a separate tracking variable. Simply capture `surfacedMemoryIds` from the assembler result into `previousSurfacedMemoryIds`.

- [ ] **4.11** Add positive feedback (corroboration) after successful completion. After the TAOR loop emits the final message (`yield { type: 'message', data: humanizedText }` around line 474), before the run logging block, add:

```typescript
      // Positive memory feedback: corroborate surfaced memories on successful completion
      if (previousSurfacedMemoryIds.length > 0) {
        const palace = new MemoryPalaceService(config.supabase, config.orgId)
        for (const memoryId of previousSurfacedMemoryIds) {
          palace.corroborateMemory(memoryId, 0.02).catch(() => {})  // +0.02 per successful use
        }
      }
```

- [ ] **4.12** Verify `taor-loop.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/agent/engine/taor-loop.ts 2>&1 | head -20
```

- [ ] **4.13** Commit:

```bash
git add src/lib/context-assembly/context-assembler.ts src/lib/memory-palace/service.ts src/lib/agent/engine/taor-loop.ts
git commit -m "feat(memory): add corroboration feedback loop — positive on success, negative on correction"
```

---

## Task 5: Plan Persistence as Memory

**Files:**
- **Modify:** `src/lib/agent/engine/taor-loop.ts`
- **Modify:** `src/lib/memory-palace/proactive-recall.ts`

### Steps

- [ ] **5.1** Add plan memory storage in `taor-loop.ts`. After the plan is received and yielded to the UI (after the `yield { type: 'plan', data: { stages: planStages } }` block, around line 183), add:

```typescript
      // Persist plan as a pattern memory (fast decay — unproven until completed)
      let planMemoryId: string | null = null
      if (planStages.length > 0 && config.threadId) {
        try {
          const palace = new MemoryPalaceService(config.supabase, config.orgId)
          planMemoryId = await palace.createMemory({
            memoryType: 'pattern',
            title: `Plan: ${planStages.map(s => s.label).join(' -> ')}`,
            content: JSON.stringify({
              stages: planStages,
              userMessage: message.slice(0, 200),
              toolGroups: raceResult.plan.toolGroups ?? [],
            }),
            typeMetadata: {
              plan_type: 'taor_execution',
              stage_count: planStages.length,
              status: 'active',
            },
            confidence: 0.4,
            decayRate: 'fast',
            sourceType: 'agent_reflection',
            sourceThreadId: config.threadId,
          })
        } catch {
          // Plan memory creation is non-critical
        }
      }
```

Note: `planMemoryId` must be declared in the outer scope (before the `while` loop) so it is accessible at completion time. Declare `let planMemoryId: string | null = null` alongside the other state variables (after line 79), then assign it inside the plan block.

- [ ] **5.2** Add plan completion update and promotion in `taor-loop.ts`. After the positive memory feedback block added in step 4.11 (inside the `response.stop_reason !== 'tool_use'` block, before run logging), add:

```typescript
      // Plan persistence: update plan memory with execution results
      if (planMemoryId) {
        const completedStages = planStages.filter(s => activatedStages.has(s.id))
        const allCompleted = completedStages.length === planStages.length
        const allToolNames = [...new Set(
          (response.content
            .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
            .map(b => b.name))
        )]

        // Update plan memory with actual execution data (fire-and-forget)
        config.supabase
          .from('memory_palace_entries')
          .update({
            metadata: {
              plan_type: 'taor_execution',
              status: allCompleted ? 'completed' : 'partial',
              stages_completed: completedStages.length,
              stages_total: planStages.length,
              tools_used: allToolNames,
              tool_call_count: toolCallCount,
              iterations: iterationCount,
              duration_ms: Date.now() - startTime,
              completed_at: new Date().toISOString(),
            },
          })
          .eq('id', planMemoryId)
          .eq('org_id', config.orgId)
          .then(() => {})
          .catch(() => {})

        // Promote successful multi-stage plans to lesson_learned
        if (allCompleted && planStages.length >= 2) {
          const palace = new MemoryPalaceService(config.supabase, config.orgId)
          palace.createMemory({
            memoryType: 'lesson_learned',
            title: `Successful approach: ${planStages[0].label}`,
            content: `For "${message.slice(0, 100)}", the approach ${planStages.map(s => s.label).join(' -> ')} worked. Tools used: ${allToolNames.join(', ')}. Completed in ${iterationCount} iterations.`,
            typeMetadata: {
              plan_stages: planStages.map(s => s.label),
              tools_used: allToolNames,
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
      }
```

- [ ] **5.3** Verify `taor-loop.ts` compiles:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/agent/engine/taor-loop.ts 2>&1 | head -20
```

- [ ] **5.4** Add optional `threadId` parameter to `proactiveRecall()` in `proactive-recall.ts`. Modify the function signature (line 329):

**Replace:**
```typescript
export async function proactiveRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
): Promise<ProactiveRecallResult[]> {
```

**With:**
```typescript
export async function proactiveRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
  threadId?: string,
): Promise<ProactiveRecallResult[]> {
```

- [ ] **5.5** Add the active plan surfacing logic to `proactiveRecall()` in `proactive-recall.ts`. Before the final `return` statement in `proactiveRecall()` (currently around line 358, `return legacyProactiveRecall(...)`), wrap the return in a helper that appends active plans. Replace the entire function body of `proactiveRecall()`:

```typescript
export async function proactiveRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
  threadId?: string,
): Promise<ProactiveRecallResult[]> {
  if (entityIds.length === 0 && !threadId) return []

  let results: ProactiveRecallResult[] = []

  if (entityIds.length > 0) {
    try {
      const graphResults = await graphAwareRecall(supabase, orgId, entityIds)
      if (graphResults.length > 0) {
        results = graphResults.map(r => ({
          entityId: r.entityId,
          entityName: r.entityName,
          memories: [],
          decisions: [],
          patterns: [],
          formattedText: r.formattedText,
          tokenEstimate: r.tokenEstimate,
          scoredItems: r.scoredItems,
        }))
      }
    } catch (err) {
      logger.warn('[proactive-recall] Graph recall failed, falling back to legacy', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Fallback to legacy if graph returned nothing
    if (results.length === 0) {
      results = await legacyProactiveRecall(supabase, orgId, entityIds)
    }
  }

  // Surface any active plans for this thread
  if (threadId) {
    try {
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
        let stageLabels = ''
        try {
          const planContent = JSON.parse(plan.content)
          stageLabels = planContent.stages
            .map((s: { label: string }) => s.label)
            .join(' -> ')
        } catch {
          stageLabels = plan.title ?? 'Unknown plan'
        }

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
    } catch (err) {
      logger.warn('[proactive-recall] Active plan query failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
```

- [ ] **5.6** Update the `proactiveRecall` call in `context-assembler.ts` to pass `threadId`. Find the call around line 657:

**Replace:**
```typescript
      const recallResults = await recallForContext(supabase, orgId, entityNodeIds)
```

**With:**
```typescript
      const recallResults = await recallForContext(supabase, orgId, entityNodeIds, threadId)
```

- [ ] **5.7** Verify both files compile:

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/memory-palace/proactive-recall.ts 2>&1 | head -20
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit src/lib/context-assembly/context-assembler.ts 2>&1 | head -20
```

- [ ] **5.8** Commit:

```bash
git add src/lib/agent/engine/taor-loop.ts src/lib/memory-palace/proactive-recall.ts src/lib/context-assembly/context-assembler.ts
git commit -m "feat(memory): persist plans as memories, surface active plans, promote successful approaches"
```

---

## Verification Checklist

After all 5 tasks are complete, run a final verification:

```bash
cd /tmp/bitbit-push/personal-assistant

# 1. TypeScript compilation (all modified files)
npx tsc --noEmit \
  src/lib/memory-palace/memory-writer.ts \
  src/lib/memory-palace/memory-search.ts \
  src/lib/memory-palace/sleep-consolidation.ts \
  src/lib/memory-palace/service.ts \
  src/lib/memory-palace/proactive-recall.ts \
  src/lib/context-assembly/context-assembler.ts \
  src/lib/agent/engine/taor-loop.ts

# 2. Migration file exists
ls -la supabase/migrations/20260406000001_memory_content_embedding.sql

# 3. Key patterns present in modified files
grep -l 'embedMemory' src/lib/memory-palace/memory-writer.ts
grep -l 'reciprocalRankFusion' src/lib/memory-palace/memory-search.ts
grep -l 'stagePromotePatterns' src/lib/memory-palace/sleep-consolidation.ts
grep -l 'contradictMemory' src/lib/memory-palace/service.ts
grep -l 'surfacedMemoryIds' src/lib/context-assembly/context-assembler.ts
grep -l 'isUserCorrection' src/lib/agent/engine/taor-loop.ts
grep -l 'planMemoryId' src/lib/agent/engine/taor-loop.ts
grep -l 'Active Plan' src/lib/memory-palace/proactive-recall.ts

# 4. Git log shows all commits
git log --oneline -5
```
