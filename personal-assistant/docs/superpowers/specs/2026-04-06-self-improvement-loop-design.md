# Sub-project D: Self-Improvement Loop — Design Spec

**Goal:** Close the feedback loop so BitBit gets measurably better each day. Per-turn evaluation feeds immediate memory corroboration. Nightly batch analysis identifies systemic patterns in tool usage, model routing, and consolidation accuracy — then adjusts thresholds automatically.

**Architecture:** Two feedback mechanisms operating at their natural timescales. Per-turn: lightweight Haiku evaluator (~50 tokens) scores each TAOR run and drives memory confidence. Nightly: new sleep consolidation stage analyzes the day's runs in aggregate and tunes system parameters. Both write to existing tables — no new external dependencies.

**Depends on:** Sub-project A (complexity gating), Sub-project B (memory corroboration, plan persistence), Sub-project C (community subgraph, graph traversal).

---

## 1. Per-Turn Quality Evaluator

### Current State

`logAgentRun()` in `run-logger.ts` records token usage, iteration count, tool calls, model used, latency, and success/failure status. It does not assess the *quality* of reasoning — whether the right tools were chosen, whether retrieved context was actually useful, or whether confidence calibration was accurate.

### New Behavior

After each successful TAOR run (not on errors or cost-blocked runs), spawn an async fire-and-forget Haiku evaluation. The evaluator receives a compressed run transcript and returns three scores.

### Quality Dimensions

| Dimension | What It Measures | Score Range | Signal Source |
|---|---|---|---|
| **Tool efficiency** | Did the agent use the minimum tools needed? Were there redundant calls, unnecessary searches, or tools called but results unused? | 0.0–1.0 | Tool call count vs plan stage count, unused tool results |
| **Context utilisation** | Were surfaced memories and entity context actually referenced in the final response? | 0.0–1.0 | `surfacedMemoryIds` from Sub-project B vs response content overlap |
| **Confidence calibration** | Was the response appropriately assertive? Did it hedge when it should have been definitive, or assert when uncertain? | 0.0–1.0 | Response hedging language vs tool result quality |

### Implementation

#### 1a. Evaluator function

New file: `src/lib/agent/engine/turn-evaluator.ts`

```typescript
interface TurnQualityScore {
  tool_efficiency: number      // 0-1
  context_utilisation: number  // 0-1
  confidence_calibration: number // 0-1
  overall: number              // weighted average
  notes?: string               // optional Haiku commentary (≤50 words)
}

interface EvaluatorInput {
  run_id: string
  message: string              // user's original message
  tool_calls: string[]         // tool names called (in order)
  plan_stages: number          // how many stages were planned
  surfaced_memory_ids: string[] // from Sub-project B
  response_excerpt: string     // first 500 chars of final response
  iteration_count: number
  model_used: string
  complexity: 'low' | 'medium' | 'high' // from Sub-project A
}
```

The Haiku prompt is ~200 tokens of instruction + ~300 tokens of compressed run data. Total cost: ~500 input tokens + ~100 output tokens per evaluation. At Haiku pricing this is negligible.

#### 1b. Scoring storage

Add columns to the existing `agent_runs` table (already used by `logAgentRun()`):

```sql
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS quality_tool_efficiency real,
  ADD COLUMN IF NOT EXISTS quality_context_utilisation real,
  ADD COLUMN IF NOT EXISTS quality_confidence_calibration real,
  ADD COLUMN IF NOT EXISTS quality_overall real,
  ADD COLUMN IF NOT EXISTS quality_notes text;
```

No new table needed — quality scores live alongside the run they evaluate.

#### 1c. Integration point in taor-loop.ts

After `logAgentRun()` is called (near the end of the TAOR loop), add:

```typescript
// Fire-and-forget quality evaluation (async, non-blocking)
if (runStatus === 'success' && complexity !== 'low') {
  evaluateTurnQuality({
    run_id: runId,
    message,
    tool_calls: allToolCalls.map(tc => tc.name),
    plan_stages: raceResult?.plan?.stages?.length ?? 0,
    surfaced_memory_ids: surfacedMemoryIds,  // from Sub-project B
    response_excerpt: finalResponse.slice(0, 500),
    iteration_count: iterationCount,
    model_used: model,
    complexity,
  }).catch(() => {})  // truly fire-and-forget
}
```

Note: only evaluated on `medium` and `high` complexity turns. `low` turns (greetings, acknowledgments) are not worth evaluating.

---

## 2. Nightly Batch Analysis (Sleep Stage 6)

### Current State

Sleep consolidation has 5 stages: Summarize, Resolve Conflicts, Discover Relationships, Prune, Morning Briefing. Sub-project C adds Stage 3.5 (Community Subgraph). None of the existing stages analyze agent run *quality* or tune system parameters.

### New Behavior

Add **Stage 6: System Learning** after Morning Briefing. This stage analyzes the day's `agent_runs` quality scores in aggregate and produces three outputs:

1. **Tool efficiency insights** — Which tools are consistently over/under-used? Feed adjustments into Tool RAG intent keywords.
2. **Consolidation precision tracking** — Were yesterday's Stage 3 relationship discoveries confirmed or contradicted today? Tune Stage 3 confidence thresholds.
3. **Model routing feedback** — Which complexity levels produced good/poor outcomes? Adjust complexity→model routing.

### Implementation

#### 2a. Stage 6 function

Added to `sleep-consolidation.ts`:

```typescript
async function stageSystemLearning(supabase: SupabaseClient, orgId: string): Promise<SleepStageResult> {
  const insights: string[] = []

  // 1. Aggregate today's quality scores
  const { data: todayRuns } = await supabase
    .from('agent_runs')
    .select('quality_tool_efficiency, quality_context_utilisation, quality_confidence_calibration, quality_overall, model_used, metadata')
    .eq('org_id', orgId)
    .gte('created_at', todayStart())
    .not('quality_overall', 'is', null)

  if (!todayRuns || todayRuns.length < 3) {
    return { stage: 'system_learning', skipped: true, reason: 'insufficient_data' }
  }

  // 2. Tool efficiency analysis
  const toolInsights = analyzeToolEfficiency(todayRuns)

  // 3. Consolidation precision
  const consolidationInsights = await analyzeConsolidationPrecision(supabase, orgId)

  // 4. Model routing feedback
  const routingInsights = analyzeModelRouting(todayRuns)

  // 5. Write insights as lesson_learned memories
  for (const insight of [...toolInsights, ...consolidationInsights, ...routingInsights]) {
    await createMemory(supabase, orgId, {
      type: 'lesson_learned',
      content: insight.content,
      confidence: insight.confidence,
      decay_rate: 'never',
      source_type: 'consolidation',
      source_agent: 'sleep_consolidation',
    })
  }

  return { stage: 'system_learning', insights_generated: insights.length }
}
```

#### 2b. Tool efficiency analysis

```typescript
function analyzeToolEfficiency(runs: AgentRun[]): SystemInsight[] {
  const insights: SystemInsight[] = []
  const avgEfficiency = mean(runs.map(r => r.quality_tool_efficiency))

  // If average tool efficiency is below 0.6, something systemic is wrong
  if (avgEfficiency < 0.6) {
    // Group by most-used tools and find the worst performers
    // This produces insights like: "web_search followed by web_read is
    // redundant 40% of the time — consider combining into a single search+read pattern"
    insights.push({
      content: `Tool efficiency averaged ${avgEfficiency.toFixed(2)} today. Review tool selection patterns.`,
      confidence: 0.7,
    })
  }

  return insights
}
```

#### 2c. Consolidation precision tracking

Measures whether Stage 3 (Discover Relationships) inferences were accurate:

```typescript
async function analyzeConsolidationPrecision(supabase: SupabaseClient, orgId: string): Promise<SystemInsight[]> {
  const insights: SystemInsight[] = []

  // Find edges created by sleep Stage 3 yesterday
  const { data: inferredEdges } = await supabase
    .from('entity_relationships')
    .select('id, confidence, relation_type, valid_until')
    .eq('org_id', orgId)
    .eq('source', 'sleep_consolidation')
    .gte('created_at', yesterdayStart())
    .lt('created_at', todayStart())

  if (!inferredEdges || inferredEdges.length === 0) return insights

  // Check how many were invalidated today (valid_until set to today)
  const invalidated = inferredEdges.filter(e => e.valid_until && new Date(e.valid_until) <= new Date())
  const precision = 1 - (invalidated.length / inferredEdges.length)

  // Store precision metric for threshold tuning
  await supabase.from('consolidation_metrics').upsert({
    org_id: orgId,
    date: todayDate(),
    stage: 'discover_relationships',
    precision,
    total_inferred: inferredEdges.length,
    total_invalidated: invalidated.length,
  })

  // If precision drops below 0.6, raise the confidence bar for Stage 3
  if (precision < 0.6) {
    insights.push({
      content: `Relationship discovery precision was ${(precision * 100).toFixed(0)}% yesterday (${invalidated.length}/${inferredEdges.length} invalidated). Consider raising inference confidence threshold.`,
      confidence: 0.8,
    })
  }

  return insights
}
```

#### 2d. Consolidation precision → threshold tuning

The consolidation precision metric feeds back into Stage 3's confidence threshold. In `sleep-consolidation.ts`, the relationship discovery stage currently uses a hardcoded confidence threshold for Haiku's "yes/no" relationship inference. Replace with an adaptive threshold:

```typescript
async function getRelationshipDiscoveryThreshold(supabase: SupabaseClient, orgId: string): Promise<number> {
  const DEFAULT_THRESHOLD = 0.7

  // Get last 7 days of precision metrics
  const { data: metrics } = await supabase
    .from('consolidation_metrics')
    .select('precision')
    .eq('org_id', orgId)
    .eq('stage', 'discover_relationships')
    .gte('date', sevenDaysAgo())
    .order('date', { ascending: false })

  if (!metrics || metrics.length < 3) return DEFAULT_THRESHOLD

  const avgPrecision = mean(metrics.map(m => m.precision))

  // Precision below 0.6 → raise threshold (be more conservative)
  // Precision above 0.8 → lower threshold (be more exploratory)
  if (avgPrecision < 0.6) return Math.min(DEFAULT_THRESHOLD + 0.1, 0.9)
  if (avgPrecision > 0.8) return Math.max(DEFAULT_THRESHOLD - 0.1, 0.5)
  return DEFAULT_THRESHOLD
}
```

#### 2e. Model routing feedback

```typescript
function analyzeModelRouting(runs: AgentRun[]): SystemInsight[] {
  const insights: SystemInsight[] = []

  // Group runs by complexity level
  const byComplexity = groupBy(runs, r => r.metadata?.complexity ?? 'medium')

  for (const [complexity, complexityRuns] of Object.entries(byComplexity)) {
    const avgQuality = mean(complexityRuns.map(r => r.quality_overall))

    // High-complexity turns with poor quality → model may need escalation
    if (complexity === 'high' && avgQuality < 0.5) {
      insights.push({
        content: `High-complexity turns averaged ${avgQuality.toFixed(2)} quality. Consider escalating high-complexity to Opus more aggressively.`,
        confidence: 0.7,
      })
    }

    // Medium turns with consistently high quality → could downgrade to save cost
    if (complexity === 'medium' && avgQuality > 0.85 && complexityRuns.length >= 5) {
      insights.push({
        content: `Medium-complexity turns averaged ${avgQuality.toFixed(2)} quality across ${complexityRuns.length} runs. Some may be safe to classify as low-complexity.`,
        confidence: 0.6,
      })
    }
  }

  return insights
}
```

---

## 3. Morning Briefing Enhancement

### Current State

Sleep Stage 5 (Morning Briefing) compiles: 48-hour deadline scan, blocked entity detection, project lifecycle evaluation. It does not surface learning insights from Stage 6.

### New Behavior

After Stage 6 completes, append system learning insights to the morning briefing context. These surface at conversation start as part of the proactive recall budget (existing 1500-token allocation).

Format:

```
## System Insights (overnight learning)
- Tool efficiency: 0.72 avg (3 runs had redundant web_read calls)
- Relationship discovery precision: 85% (6/7 inferred edges confirmed)
- High-complexity routing: performing well (0.81 avg quality)
```

This is added to the existing `lifecycleActions` output of Stage 5, not a separate stage. The context assembler already surfaces morning briefing results.

---

## 4. File Changes Summary

| File | Feature | Change | Est. Lines |
|---|---|---|---|
| `src/lib/agent/engine/turn-evaluator.ts` | Per-turn evaluator | **New file**: Haiku evaluation function, score types, compressed transcript builder | ~120 |
| `src/lib/agent/engine/taor-loop.ts` | Per-turn evaluator | Fire-and-forget evaluator call after logAgentRun | ~10 |
| `src/lib/memory-palace/sleep-consolidation.ts` | Nightly batch | Add Stage 6: stageSystemLearning with tool efficiency, consolidation precision, routing analysis | ~150 |
| `src/lib/memory-palace/sleep-consolidation.ts` | Threshold tuning | Replace hardcoded relationship discovery threshold with adaptive getRelationshipDiscoveryThreshold | ~25 |
| `src/lib/memory-palace/sleep-consolidation.ts` | Morning briefing | Append Stage 6 insights to morning briefing output | ~15 |
| `supabase/migrations/XXXXXX_quality_scores.sql` | Storage | Add quality columns to agent_runs, create consolidation_metrics table | ~20 |

**Total: ~340 lines (1 new file, 2 modified files, 1 migration). No new external dependencies.**

---

## 5. Data Flow

```
                    PER-TURN PATH (real-time)
                    =========================
TAOR loop completes successfully
  |
  |--- complexity !== 'low'?
  |       |
  |       v
  |    evaluateTurnQuality() [fire-and-forget]
  |       |
  |       |--- Haiku scores: tool_efficiency, context_utilisation, confidence_calibration
  |       |
  |       v
  |    UPDATE agent_runs SET quality_* columns
  |
  |--- Memory corroboration (Sub-project B, already designed)
  |       |
  |       v
  |    corroborateMemory() / contradictMemory() based on surfacedMemoryIds + outcome


                    NIGHTLY PATH (batch)
                    ====================
Sleep consolidation runs (3am UTC)
  |
  Stages 1-5 (existing + Sub-project C's Stage 3.5)
  |
  Stage 6: SYSTEM LEARNING                          [NEW]
  |
  |--- analyzeToolEfficiency()
  |       reads today's agent_runs.quality_tool_efficiency
  |       identifies systemic tool usage patterns
  |
  |--- analyzeConsolidationPrecision()
  |       reads yesterday's Stage 3 inferred edges
  |       checks which were invalidated today
  |       writes to consolidation_metrics table
  |       adjusts Stage 3 confidence threshold if precision < 0.6
  |
  |--- analyzeModelRouting()
  |       groups runs by complexity level
  |       identifies under/over-performing complexity bands
  |
  |--- Write insights as lesson_learned memories (source_agent: 'sleep_consolidation')
  |
  |--- Append insights to morning briefing context
  |
  v
Next morning: user opens chat
  → Context assembler loads morning briefing with system insights
  → BitBit surfaces: "Overnight I noticed X, adjusted Y"
```

---

## 6. Feedback Loop Closure Map

This diagram shows how all four sub-projects create closed loops:

```
Sub-project A: Reasoning Quality
  Complexity gating → thinking budget → better reasoning
                                            |
                                            v
Sub-project D: Per-turn evaluator scores reasoning quality
  |                                         ^
  v                                         |
Sub-project B: Memory corroboration     Sub-project C: Graph traversal
  Surfaced memories tracked →               Community summaries →
  Success → corroborate (+0.02)             Better entity context →
  Correction → contradict (-0.15)           Better reasoning
  |
  v
Sub-project D: Nightly batch
  Aggregates quality scores →
  Tunes: tool RAG, model routing, consolidation thresholds →
  Next day: better tool selection, better model choice, better relationship inference
  |
  v
Sleep consolidation precision tracking
  Measures own accuracy → adjusts own thresholds → self-tuning pipeline
```

Every arrow is a concrete data flow, not an aspiration. Each feeds the next day's performance.

---

## 7. Error Handling

### Per-Turn Evaluator
- **Haiku call fails**: Fire-and-forget — quality columns remain NULL. No effect on user experience.
- **Haiku returns malformed scores**: Validate each score is 0-1, default to NULL if invalid. Do not store partial scores.
- **Run has no tool calls**: Tool efficiency defaults to 1.0 (no tools needed = efficient). Context utilisation scored normally.
- **surfacedMemoryIds empty**: Context utilisation defaults to N/A (NULL). Only tool efficiency and confidence calibration scored.

### Nightly Batch
- **Insufficient data (< 3 evaluated runs)**: Stage 6 skips entirely. Returns `{ skipped: true, reason: 'insufficient_data' }`.
- **consolidation_metrics insert fails**: Logged, not fatal. Threshold tuning falls back to default (0.7).
- **Insight memory creation fails**: Individual failure, other insights still created. Logged for debugging.
- **No Stage 3 edges to evaluate**: Consolidation precision analysis skips. Returns empty insights array.

### Threshold Tuning
- **Threshold exceeds bounds**: Clamped to [0.5, 0.9] range. Cannot go below 0.5 (too permissive) or above 0.9 (too restrictive).
- **Metrics table empty or < 3 days of data**: Returns default threshold (0.7). Adaptive tuning only activates after 3+ days of data.

---

## 8. Non-Goals

- **Real-time threshold adjustment**: Thresholds are only adjusted nightly. Per-turn quality scores do not immediately change model routing or tool selection. This prevents oscillation from outlier turns.
- **User-facing quality dashboard**: Quality scores are internal operational metrics. Users see the *effect* (better answers) not the scores.
- **Automated model switching based on quality**: Insights suggest routing changes but do not auto-apply them. The `model-router.ts` calibration requires explicit threshold updates (via the autonomy gate or manual config). This is a safety boundary — we don't want the system autonomously escalating to Opus on every turn if one batch had poor scores.
- **Cross-org learning**: Quality patterns are per-org. One user's tool efficiency patterns don't affect another's thresholds.
- **Backfilling quality scores on historical runs**: Evaluation only applies to future runs. Historical runs retain NULL quality columns.
- **LLM-based tool efficiency analysis**: The nightly tool efficiency check uses simple aggregation (averages, grouping), not an LLM call. The per-turn evaluator already uses Haiku — the nightly batch should be pure computation to keep costs predictable.
