# Phase 38: Fiduciary Memory — Research

**Researched:** 2026-04-08
**Question:** What do I need to know to PLAN this phase well?

## Executive Summary

Phase 38 adds a `fiduciary_constraint` memory category to the Memory Palace, a Game Theory LTV evaluation stage to sleep consolidation, priority injection in ContextAssembler, and natural-language surfacing through conversation. No dedicated UI -- intelligence surfaces through smarter agent decisions only (FIDUC-05 superseded per D-06).

## Codebase Analysis

### 1. Memory Palace Types (`types.ts`)

**Current MemoryCategory union (7 values):**
```typescript
export type MemoryCategory =
  | 'conversation' | 'decision' | 'pattern' | 'fact'
  | 'relationship' | 'pricing' | 'convention'
```

Adding `fiduciary_constraint` as the 8th value. The `MemoryPalaceEntry` interface already supports:
- `entity_ids: string[]` and `entity_names: string[]` -- needed for per-entity constraints
- `metadata: Record<string, unknown>` -- can store LTV signal data (invoice totals, message frequency, etc.)
- `confidence: number` -- constraint confidence from LTV evaluation
- `tags: string[]` -- can tag with constraint subcategory (financial, relationship, strategic)
- `decay_rate: DecayRate` -- should be `'never'` or `'slow'` for fiduciary constraints

**No new types needed** -- the existing schema handles fiduciary constraints as regular memories with a new category.

### 2. Memory Writer (`memory-writer.ts`)

**Current decay rate map:**
```typescript
const CATEGORY_DECAY_RATES: Record<MemoryCategory, DecayRate> = {
  conversation: 'fast',
  decision: 'slow',
  pattern: 'slow',
  fact: 'normal',
  relationship: 'slow',
  pricing: 'normal',
  convention: 'never',
}
```

Add `fiduciary_constraint: 'never'` -- these constraints should persist until explicitly superseded.

The `storeMemory()` method handles dedup via `checkDuplicate()` and corroboration via `corroborate()`. Fiduciary constraints should use these existing mechanisms -- if the same constraint is generated twice, it corroborates rather than duplicates.

### 3. Sleep Consolidation Pipeline (`sleep-consolidation.ts`)

**Current 6-stage pipeline:**
1. SUMMARIZE -- per-entity daily digest
1.5. PROMOTE PATTERNS -- promote high-confidence patterns to conventions
2. RESOLVE CONFLICTS -- temporal precedence for duplicates
3. DISCOVER RELATIONSHIPS -- latent edges from co-occurring events
3.5. DETECT COMMUNITIES -- community cluster detection
4. PRUNE -- archive low-confidence entityless memories
5. MORNING BRIEFING -- compile actionable intel
6. SYSTEM LEARNING -- quality scores, precision tracking

**Insert point:** New stage between SYSTEM LEARNING (6) and completion, or as stage 6.5 / 7. The LTV evaluation needs entity data from stages 1-3 (summarized, relationships discovered) and should run before Morning Briefing would ideally reference its output -- but Morning Briefing (stage 5) runs earlier. Two options:

- **Option A: Stage 4.5 (before Morning Briefing)** -- LTV evaluation runs after entity data is fresh, constraints available for Morning Briefing. But this changes existing stage numbering expectations.
- **Option B: Stage 7 (after System Learning)** -- Clean append, no interference with existing stages. Morning Briefing won't reference new constraints until next cycle. Simpler, safer.

**Recommendation: Stage 7** -- clean append. The Morning Briefing already runs at 3am; constraints generated in the same cycle will be available for the next day's real-time decisions. Per D-03, Opus 4.6 can reason at runtime from entity context.

**Implementation pattern:** Each stage follows the same try/catch pattern with logging. The new stage needs:
- Query entities with sufficient signal data (invoices, messages, project history)
- Pass entity signals to Claude for LTV reasoning
- Store resulting constraints as `fiduciary_constraint` memories via MemoryWriter

**Report type extension:** `SleepConsolidationReport` needs a `fiduciaryConstraintsGenerated: number` field.

### 4. Context Assembler (`context-assembler.ts`)

**Current 4-tier pipeline:**
- Tier 1: Working (system prompt) -- priority 1
- Tier 2: Session history -- priority 2
- Tier 3: Compiled memory -- priority 3
- Tier 4: Action state -- priority 4

**Proactive recall integration:** `proactiveRecall()` in `proactive-recall.ts` is called during context assembly. It retrieves memories for mentioned entities via graph-aware recall (edges, events, vectors) or legacy recall (memory_palace_entries by entity_id).

**Priority injection approach (D-08):** Fiduciary constraints need higher priority than standard memories. Two approaches:

- **Approach A: Filter in proactiveRecall** -- When recalling for an entity, query `fiduciary_constraint` memories separately and prepend them before other recall results. This keeps the change localized to `proactive-recall.ts`.
- **Approach B: Separate tier in ContextAssembler** -- Add a dedicated fiduciary tier between Tier 1 (system) and Tier 2 (history). More visible but more invasive.

**Recommendation: Approach A** -- inject within proactiveRecall. The constraint memories are already entity-scoped, so querying them alongside other entity context is natural. Format them with a distinct prefix (e.g., `[!]` or `⚠`) so the model recognizes their priority.

The `formatProactiveRecall()` function wraps results in `<memory-context>` tags -- fiduciary constraints should appear first within this block.

### 5. Database Migration

**Current CHECK constraint** (migration `100_memory_palace_entries.sql`):
```sql
category TEXT NOT NULL CHECK (category IN (
  'conversation', 'decision', 'pattern', 'fact',
  'relationship', 'pricing', 'convention'
))
```

**New migration needed:** ALTER the CHECK constraint to include `fiduciary_constraint`. Pattern:
```sql
ALTER TABLE memory_palace_entries DROP CONSTRAINT memory_palace_entries_category_check;
ALTER TABLE memory_palace_entries ADD CONSTRAINT memory_palace_entries_category_check
  CHECK (category IN (
    'conversation', 'decision', 'pattern', 'fact',
    'relationship', 'pricing', 'convention', 'fiduciary_constraint'
  ));
```

Note: The constraint name needs to be verified -- Supabase/Postgres auto-generates constraint names. Use `pg_constraint` to find the exact name, or use the unnamed inline syntax.

### 6. TAOR Loop Integration

The TAOR loop (`taor-loop.ts`) doesn't need direct modification. Fiduciary reasoning enters through the ContextAssembler's system prompt injection. The model receives fiduciary constraints as context and incorporates them into its Triage/Assess/Orient/Respond decisions naturally.

Per D-07: "Fiduciary reasoning surfaces through natural conversation only." The model decides what's worth surfacing vs background context.

## LTV Signal Design (D-01, D-02)

Per context decisions, no hardcoded LTV score. Store raw signals as entity metadata:

**Financial signals:**
- Invoice totals (sum, count, average)
- Payment patterns (avg days to pay, on-time rate)
- Revenue trend (growing/stable/declining)
- Unpaid/overdue amounts

**Relationship signals:**
- Message frequency (daily/weekly/monthly)
- Relationship age (days since first interaction)
- Responsiveness (avg reply time)
- Project count and active status

**Strategic signals:**
- Time investment (estimated hours via message volume)
- Scope creep incidents (from patterns)
- Churn risk indicators

These signals are already partially available via existing Memory Palace entries (pricing memories, patterns like `scope_creep`, `payment_timing`). The LTV evaluation stage aggregates them at consolidation time.

## Constraint Examples

Natural language constraints stored as `fiduciary_constraint` memories:
- "Steve West: Last 2 projects had uninvoiced scope creep. Require invoice before starting new work."
- "Sezer: Consistently pays within 7 days. Reliable client -- prioritize responsiveness."
- "Client X: 40% of time spent, 15% of revenue. Consider rate increase or reduced priority."
- "Project Y: Payment 45 days overdue. Escalate before additional work."

## Validation Architecture

### Unit Tests
- MemoryCategory type includes `fiduciary_constraint`
- CATEGORY_DECAY_RATES maps `fiduciary_constraint` to `'never'`
- MemoryWriter stores/retrieves fiduciary constraints
- Sleep consolidation stage 7 generates constraints from entity signals

### Integration Tests
- proactiveRecall returns fiduciary constraints with priority over standard memories
- ContextAssembler includes fiduciary constraints in assembled context
- End-to-end: entity with signals -> consolidation -> constraint -> recall -> context

### Migration Tests
- New CHECK constraint accepts `fiduciary_constraint` category
- Existing categories still work after migration

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LTV stage adds latency to sleep consolidation | Low -- runs at 3am, not time-critical | Batch entities, use Haiku for signal aggregation |
| Constraint quality depends on available signals | Medium -- new users have no history | Only generate constraints when sufficient signal data exists (min thresholds) |
| Priority injection bloats context | Low -- constraints are short natural language | Cap at ~200 tokens per entity for fiduciary section |
| DB migration breaks existing data | Low -- additive change only | ALTER adds to CHECK constraint, no data modification |

## RESEARCH COMPLETE
