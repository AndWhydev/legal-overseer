---
phase: quick
plan: 2
subsystem: docs
tags: [architecture-decision-record, multi-agent, tool-orchestration, hybrid-architecture, manus-ai, google-mit-2026]

# Dependency graph
requires:
  - phase: quick-1
    provides: "Tool group metadata (ToolGroup, TOOL_GROUPS, TOOL_GROUP_MAP), JIT instructions, optimized descriptions"
provides:
  - "Updated research doc with 2026 SOTA findings (Manus AI, Google-MIT scaling laws, hybrid consensus)"
  - "ADR-001: Definitive architecture decision record for agent tool orchestration"
  - "Code-level implementation spec for planner tool group selection (Phase 1) and complexity routing (Phase 2)"
affects: [engine.ts, planner.ts, tools.ts, agent-architecture]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hybrid Pattern D: Pattern 2 (compiled tool groups) default + Pattern 3 (sub-agents) for complex queries"
    - "KV cache preservation: stable tool lists within conversations"
    - "Complexity routing: Haiku planner determines executionMode (single/specialist/orchestrator)"

key-files:
  created:
    - ".claude/docs/research/tool-architecture-decision.md"
  modified:
    - ".claude/docs/research/multi-agent-tool-orchestration-research.md"

key-decisions:
  - "Hybrid Pattern D adopted: Pattern 2 default (70-80%), Pattern 3 selective (20-30%)"
  - "KV cache stability is #1 cost lever — no per-query dynamic tool loading"
  - "Phase 1 (1-2 days): extend planner to output toolGroups, filter tools by group"
  - "Phase 2 (2-3 weeks): add executionMode routing, spawn sub-agents for complex queries"
  - "Phase 3 (deferred): multi-orchestrator only when tool count exceeds 100"
  - "Anti-patterns documented: no pgvector for tools, no LangGraph/CrewAI, no per-turn tool changes"

patterns-established:
  - "ADR format: Architecture Decision Record for major technical decisions"
  - "Phased implementation: immediate/6-month/12-month with explicit review triggers"

requirements-completed: [QUICK-2]

# Metrics
duration: 9min
completed: 2026-03-11
---

# Quick Task 2: SOTA Agent Tool Architecture Decision Record

**Hybrid architecture decision (Pattern D) with production-validated cost/latency tables from Manus AI and Google-MIT 2026, plus code-level implementation spec for engine.ts, planner.ts, and tools.ts**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-11T09:25:07Z
- **Completed:** 2026-03-11T09:34:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Updated research doc with 5 new sections: Google-MIT 2026 scaling laws (Section 3.8), Manus AI production metrics (Section 4.8), Hybrid Consensus (Section 6.5), updated cost table with hybrid row, appendix table entry
- Created ADR-001 with concrete implementation spec covering three phases: immediate (planner tool group selection), 6-month (complexity routing + sub-agents), 12-month (multi-orchestrator)
- ADR is standalone and immediately actionable -- a developer can implement Phase 1 without reading the research doc

## Task Commits

Each task was committed atomically:

1. **Task 1: Update research doc with new 2026 findings** - `8e575960` (docs)
2. **Task 2: Create Architecture Decision Record (ADR)** - `fdfa637f` (docs)

## Files Created/Modified

- `.claude/docs/research/multi-agent-tool-orchestration-research.md` - Added 5 new sections with 2026 SOTA findings (105 lines added)
- `.claude/docs/research/tool-architecture-decision.md` - New ADR-001 with hybrid architecture decision and implementation spec (308 lines)

## What Was Added to Research Doc

| Section | Content |
|---------|---------|
| 3.8 | Google-MIT 2026 Multi-Agent Scaling Laws: predictive architecture selection (87% accuracy), capability saturation curve, centralized coordination (23% fewer cascades), tool count thresholds |
| 4.8 | Manus AI production metrics: 80 tools/12 groups, logit masking via state machine, 90-95% KV cache hit rate, $0.0173/session, 92-97% accuracy |
| 6.5 | Hybrid Consensus (Pattern D): quantified 70/30 routing split, Google-MIT architecture framework, complexity routing rules, production cost comparison table |
| 7 (cost table) | Updated with production-validated numbers: P2 $0.0173, P3 $0.0576, Hybrid $0.032 |
| Appendix | Added Google-MIT 2026 paper entry |

## Key ADR Decisions

1. **Hybrid Pattern D adopted** -- Pattern 2 default (70-80% of queries), Pattern 3 selective (20-30%)
2. **KV cache stability is the #1 cost lever** -- Manus's 90-95% hit rate = 81% cost reduction
3. **Phase 1 implementation is 1-2 days** -- extend `generatePlan()` to return `toolGroups`, add `getAgentTools(groups)` filter
4. **Phase 2 adds `executionMode`** -- `single | specialist | orchestrator` determined by Haiku planner
5. **Five explicit anti-patterns** -- no pgvector for tools, no LangGraph/CrewAI, no per-query tool loading, no fine-tuning, no permanent sub-agents

## Implementation Spec Highlights

The 4 most important code changes from the ADR:

1. **`planner.ts`**: Extend `generatePlan()` return type to include `toolGroups: ToolGroup[]` -- Haiku selects 1-3 groups per conversation
2. **`tools.ts`**: Add `getAgentTools(groups?: ToolGroup[])` -- filters tools by group, always includes core
3. **`engine.ts`**: Read `plan.toolGroups`, pass to `getAgentTools()`, log selection for observability
4. **`engine.ts` (Phase 2)**: Switch on `plan.executionMode` to route between `runSingleAgent`, `runSpecialistAgent`, `runOrchestrator`

## Phase Timeline

| Phase | Timeframe | Trigger | Key Deliverable |
|-------|-----------|---------|-----------------|
| Phase 1 | Immediate | Tool count > 30 | Planner tool group selection |
| Phase 2 | 6-month | Quality issues on complex queries | Complexity routing + sub-agents |
| Phase 3 | 12-month | Tool count > 100 | Multi-orchestrator topology |

## Decisions Made

- All research findings used verbatim from orchestrator's deep research output -- no fabrication or extrapolation
- ADR follows standard Architecture Decision Record format for long-term reference
- Existing research doc content preserved entirely -- only additions, no removals or restructuring

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Steps

- When tool count reaches 30+: implement Phase 1 (planner tool group selection, estimated 1-2 days)
- The ADR at `.claude/docs/research/tool-architecture-decision.md` contains the complete implementation spec

---
*Quick Task: 2*
*Completed: 2026-03-11*
