# Phase 38: Fiduciary Memory - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Memory Palace proactively generates and enforces fiduciary constraints -- BitBit defends user margins and optimizes for user benefit via game theory LTV evaluation. The fiduciary layer is entirely under-the-hood: no dedicated UI, no settings page, no manual constraint management. Intelligence is expressed through smarter agent decisions and natural conversation.

</domain>

<decisions>
## Implementation Decisions

### Game Theory LTV Model
- **D-01:** LTV evaluation approach is Claude's discretion. Raw signals (invoice totals, message frequency, project count, relationship age) are stored as entity metadata. The model reasons about LTV from these signals at decision time -- no hardcoded formula or numeric LTV score required.
- **D-02:** Full business intelligence scope -- fiduciary constraints cover financial protection (revenue leakage, unpaid work, undercharging), relationship health (responsiveness, payment patterns), and strategic resource allocation (time spent vs value returned, opportunity cost, churn risk).
- **D-03:** Evaluation timing is Claude's discretion -- sleep consolidation can generate baseline constraints, and the model can validate at decision time when context is available. The key insight: Opus 4.6 can carry the reasoning weight at runtime if it has sufficient context in the prompt.

### Constraint Generation
- **D-04:** Constraint format is Claude's discretion. Should fit naturally into the existing Memory Palace schema (adding `fiduciary_constraint` as a new MemoryCategory). The model reads constraints as context during decision-making.
- **D-05:** No manual creation, no user-facing management. Constraints are auto-generated entirely under the hood -- by sleep consolidation and/or real-time extraction. The user never sees "fiduciary constraints" as a concept. They just experience BitBit being smart.
- **D-06:** FIDUC-05 from requirements ("visible and editable by user in dashboard") is superseded by this decision. No dashboard UI for constraints. The intelligence surfaces through conversation, not through settings.

### Enforcement Behavior
- **D-07:** Fiduciary reasoning surfaces through natural conversation only. When a constraint is relevant, BitBit weaves it into chat: "Before I do more work for Steve, heads up -- the last two projects had scope creep that wasn't invoiced. Want me to send an invoice first?" No special UI widgets, no separate briefing section.
- **D-08:** ContextAssembler injects fiduciary constraints with priority over standard memories so the model has them available during reasoning. The model decides what's worth surfacing vs what's background context.

### Claude's Discretion
- LTV model structure (signals vs scores vs hybrid) -- pick what fits the entity model
- Constraint storage format (natural language vs structured fields vs hybrid) -- fit the Memory Palace schema
- Evaluation timing split between sleep consolidation and real-time -- optimize for cost and quality
- Sleep consolidation stage ordering and integration with existing 6-stage pipeline
- Priority weighting of fiduciary constraints in ContextAssembler token budget

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Memory Palace
- `personal-assistant/src/lib/memory-palace/types.ts` -- MemoryCategory type, MemoryPalaceEntry schema, DecisionLogEntry types
- `personal-assistant/src/lib/memory-palace/memory-writer.ts` -- MemoryWriter class, dedup, decay rates by category, corroboration
- `personal-assistant/src/lib/memory-palace/sleep-consolidation.ts` -- 6-stage nightly pipeline, MorningBriefing type, SleepConsolidationReport
- `personal-assistant/src/lib/memory-palace/service.ts` -- MemoryPalaceService class
- `personal-assistant/src/lib/memory-palace/index.ts` -- Public exports, proactiveRecall

### Context Assembly
- `personal-assistant/src/lib/context-assembly/context-assembler.ts` -- 4-tier assembly pipeline, TokenBudgetManager integration, proactiveRecall usage
- `personal-assistant/src/lib/context-assembly/token-budget-manager.ts` -- Tier allocation, budget management

### Agent Engine
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` -- TAOR decision loop where fiduciary reasoning must influence decisions
- `personal-assistant/src/lib/agent/engine/types.ts` -- Engine types including ContextAssembler integration

### Dashboard Hook
- `personal-assistant/src/hooks/use-memory-palace.ts` -- React hook (NOT needed for this phase since no dashboard UI, but documents the existing interface)

### Requirements
- `.planning/REQUIREMENTS.md` -- FIDUC-01 through FIDUC-05 (note: FIDUC-05 superseded per D-06)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MemoryCategory` type: Currently 7 categories -- add `fiduciary_constraint` as 8th
- `MemoryWriter`: Already handles category-specific decay rates, dedup, corroboration -- extend for fiduciary constraints (decay_rate: `never` or `slow`)
- `SleepConsolidation`: 6-stage pipeline with clear stage pattern -- add Game Theory LTV as stage 7 (or insert before Morning Briefing)
- `ContextAssembler.proactiveRecall`: Already recalls memories by entity -- can filter/prioritize fiduciary constraints
- `CATEGORY_DECAY_RATES` map in memory-writer.ts: Add `fiduciary_constraint: 'never'` or `'slow'`

### Established Patterns
- Memory categories map to DB CHECK constraints in migrations 100-104 -- new migration needed to add `fiduciary_constraint` to the enum
- Sleep consolidation stages follow a clear sequential pattern with per-stage reporting
- ContextAssembler uses token budget tiers -- fiduciary constraints need priority allocation within existing budget

### Integration Points
- `sleep-consolidation.ts` stage pipeline: Insert LTV evaluation stage
- `context-assembler.ts` tier assembly: Add fiduciary constraint priority injection
- `memory-writer.ts` CATEGORY_DECAY_RATES: Add new category
- `types.ts` MemoryCategory union: Add `fiduciary_constraint`
- DB migration: ALTER CHECK constraint on memories table to include new category

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants this to feel like "pure stinking intelligence" -- no UI that reveals the fiduciary system exists. BitBit just makes smarter decisions.
- The model (Opus 4.6 level) can carry reasoning weight at runtime if given sufficient context -- don't over-engineer rigid scoring matrices when the model can reason from raw signals.
- Example constraint in action: "Before I do more work for Steve, heads up -- the last two projects had scope creep that wasn't invoiced. Want me to send an invoice first?"
- Example strategic insight: "You're spending 40% of time on your lowest-paying client."

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 38-fiduciary-memory*
*Context gathered: 2026-04-08*
