---
phase: 38-fiduciary-memory
plan: 03
subsystem: ai
tags: [memory-palace, proactive-recall, context-assembly, fiduciary]

requires:
  - phase: 38-fiduciary-memory
    provides: fiduciary_constraint memory category (38-01)
provides:
  - Fiduciary constraint priority recall in proactiveRecall
  - Conditional fiduciary-guidance instruction in system prompt
  - 200-token dedicated budget for fiduciary constraints
affects: [39-async-tasks, 40-cua-browser]

tech-stack:
  added: []
  patterns: [priority-recall-pattern, conditional-system-prompt-injection]

key-files:
  created: []
  modified:
    - personal-assistant/src/lib/memory-palace/proactive-recall.ts
    - personal-assistant/src/lib/context-assembly/context-assembler.ts

key-decisions:
  - "200-token dedicated budget for fiduciary constraints separate from standard recall budget"
  - "[!] prefix marker for fiduciary constraints enables conditional guidance injection"
  - "Fiduciary recall runs BEFORE graph-aware recall to ensure priority positioning"
  - "FIDUC-05 (dashboard UI) addressed via context injection per D-06 (no dashboard UI)"

patterns-established:
  - "Priority recall pattern: category-specific retrieval with dedicated token budget, positioned first in results"
  - "Conditional system prompt injection: guidance added only when relevant markers present"

requirements-completed: [FIDUC-04, FIDUC-05]

duration: 5min
completed: 2026-04-08
---

# Phase 38-03: Fiduciary Constraint Priority Injection

**Fiduciary constraints recalled first with 200-token dedicated budget and conditional system prompt guidance for conversational surfacing**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- recallFiduciaryConstraints function queries fiduciary_constraint memories per entity
- Fiduciary recall runs before graphAwareRecall in the proactiveRecall pipeline
- [!] prefix markers distinguish fiduciary constraints in formatted output
- ContextAssembler conditionally injects fiduciary-guidance when [!] markers detected
- Guidance instructs model to surface constraints conversationally, not as system announcements

## Files Created/Modified
- `personal-assistant/src/lib/memory-palace/proactive-recall.ts` - Added recallFiduciaryConstraints and priority recall flow
- `personal-assistant/src/lib/context-assembly/context-assembler.ts` - Added conditional fiduciary-guidance system prompt section

## Decisions Made
- FIDUC-05 (dashboard UI) superseded per D-06 — addressed through context injection instead

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- Fiduciary memory system complete end-to-end: generation (38-02) -> storage (38-01) -> recall (38-03)

---
*Phase: 38-fiduciary-memory*
*Completed: 2026-04-08*
