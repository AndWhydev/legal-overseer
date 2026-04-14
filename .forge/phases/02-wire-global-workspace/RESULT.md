# Phase 02: Wire Global Workspace — RESULT

## Summary

Enabled Global Workspace competitive context allocation for System 2 queries. Context modules (memories, dossiers, events, relationships) now compete for token budget based on query relevance instead of receiving fixed allocations.

## Changes

| File | Change |
|------|--------|
| `personal-assistant/src/lib/agent/engine/taor-loop.ts` | Added `useGlobalWorkspace: true` to System 2 assembler overrides |
| `personal-assistant/src/lib/brain/__tests__/global-workspace-integration.test.ts` | New: 9 tests covering allocation, signal detection, budget constraints |

## Quality Gates

- [x] TypeScript compiles (no new errors in changed files)
- [x] 9/9 tests pass
- [x] Allocation logging already present in context-assembler.ts (lines 639-646)
- [x] System 1 queries skip Global Workspace (fast path preserved)

## Decisions

- **System 1 excluded**: `useGlobalWorkspace` only activates for System 2 queries. System 1 uses fixed minimal allocation for speed (<50ms target).
- **Logging already existed**: context-assembler.ts already had `logger.info` at line 639 logging module count, names, token budgets, and relevance scores. No additional logging needed.

## Commits

1. `d683b2c1` — test: add global workspace competitive allocation tests
2. `03b5d50e` — feat(brain): enable Global Workspace for System 2 queries
