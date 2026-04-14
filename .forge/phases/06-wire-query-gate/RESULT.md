# Phase 06: Wire Query Gate — RESULT

## Status: COMPLETE

## Summary

Activated the System 1/2 query gate to control ContextAssembler configuration in the TAOR loop. Simple queries (greetings, confirmations, short actions) now take the fast path with dossier-only context, while complex queries (reasoning, temporal, multi-entity, aggregation) get full spreading activation via global workspace.

## Tasks Completed

### Task 1: Verify query gate classification wired in TAOR loop
- `classifyQueryComplexity` was already imported (line 36) and called (line 287) in taor-loop.ts
- Called with the current message and entityMentionCount from delegation intent
- No changes needed — already correctly wired from prior work

### Task 2: Route System 1 to cache-only path
- Added explicit `useGlobalWorkspace: false` to the system1 assembler overrides
- Full system1 config: `{ useGlobalWorkspace: false, maxEntities: 3, includeCompressedHistory: false }`
- `usePromptCache: true` flows through via the ContextAssembler constructor spread (line 310)
- Added clarifying comments documenting System 1 vs System 2 intent

### Task 3: Route System 2 to full retrieval path
- Verified system2 config: `{ useGlobalWorkspace: true }` — enables competitive allocation
- `usePromptCache: true` also flows through for system2 (same constructor spread)
- Defaults from `DEFAULT_ASSEMBLER_CONFIG` apply: maxEntities=5, includeCompressedHistory=true

### Task 4: Add integration tests
- Created `query-gate-integration.test.ts` with 13 tests across two describe blocks:
  - **Classification routing** (8 tests): system1 for "hey"/"thanks"/"ok"/"send it", system2 for invoice queries, multi-entity, reasoning, temporal
  - **Assembler config derivation** (5 tests): system1 excludes global workspace, limits entities, skips compressed history; system2 enables global workspace without restrictions; multi-entity always gets system2

## Quality Gates

| Gate | Result |
|------|--------|
| TypeScript build (no new errors) | PASS — `tsc --noEmit` shows zero errors in changed files |
| Unit tests | PASS — 55/55 query-gate.test.ts |
| Integration tests | PASS — 13/13 query-gate-integration.test.ts |
| All query gate tests combined | PASS — 68/68 |

## Decisions

1. **Explicit `useGlobalWorkspace: false` for System 1**: Previously omitted (relied on undefined being falsy). Made explicit for clarity and safety — prevents accidental global workspace activation if defaults change.
2. **`usePromptCache: true` stays in constructor call**: Both paths need prompt caching. Keeping it in the spread at line 310 avoids duplication.
3. **Test uses `deriveAssemblerOverrides` helper**: Mirrors the TAOR loop logic to verify the mapping contract between classification and config. If the TAOR loop logic changes, the test helper must be updated to match.

## Files Changed

- `personal-assistant/src/lib/agent/engine/taor-loop.ts` — added `useGlobalWorkspace: false` to system1 overrides + comments
- `personal-assistant/src/lib/brain/__tests__/query-gate-integration.test.ts` — new (13 tests)

## Commits

1. `d56f4775` — feat(query-gate): wire System 1/2 routing with explicit assembler overrides
2. `f3ff5c00` — test(query-gate): add integration tests for System 1/2 assembler routing
