# Phase 03: Replace Baseplate Source — RESULT

## Status: COMPLETE

## Summary

Replaced the old `entity_profiles` table as the primary context source with the richer, LLM-compiled `entity_dossiers` produced by the Living Brain pipeline. The system now queries dossiers first and falls back to profiles when no dossier exists.

## Changes

### baseplate-snapshot.ts (core logic)
- Added optional `entityName` parameter to `getBaseplateSnapshot()`
- New `tryDossierSource()` queries `entity_dossiers` by `org_id` + `entity_name` (case-insensitive via `ilike`)
- Existing profile logic extracted to `tryProfileSource()` as fallback
- `BaseplateSnapshot` interface gains `dossierMarkdown?: string` and `source: 'dossier' | 'profile'`
- Empty `dossier_markdown` treated as missing (triggers fallback)

### prompt-builder.ts (consumption)
- `buildEntityAwarePrompt` now passes `m.contactName` to `getBaseplateSnapshot` for dossier lookup
- `formatSnapshotContext` renders dossier markdown directly as `### Name\n{markdown}` when available
- Profile-based formatting preserved as fallback path

### Tests
- 5 tests covering: dossier hit, profile fallback (no dossier), profile fallback (no entityName), neither found (null), empty dossier_markdown fallback
- Supabase chain mocking pattern consistent with existing test conventions

### Adjacent fix
- `draft-context-assembler.test.ts`: added `source: 'profile'` to mock to satisfy new required field

## Quality Gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` | PASS (only pre-existing infra-load-cycles errors) |
| `vitest run baseplate-snapshot` | 5/5 PASS |
| TDD followed | Yes — tests written first, all failed, then implementation made them pass |

## Decisions

1. **Lookup by entity_name (ilike)** rather than entity_id — the entity_dossiers table uses entity_nodes UUIDs while getBaseplateSnapshot receives contacts UUIDs; name matching bridges this gap
2. **Empty dossier_markdown triggers fallback** — consistent with how dossier-compiler treats empty/null markdown as "new dossier needed"
3. **Dossiers skip graph enrichment** — the dossier markdown already incorporates relationship context from the Living Brain pipeline

## Files Changed

- `personal-assistant/src/lib/context/baseplate-snapshot.ts`
- `personal-assistant/src/lib/context/__tests__/baseplate-snapshot.test.ts` (new)
- `personal-assistant/src/lib/agent/prompt-builder.ts`
- `personal-assistant/src/lib/agent/__tests__/draft-context-assembler.test.ts`

## Commits

1. `72cbbd87` — feat(baseplate): query entity_dossiers as primary source with profile fallback
2. `860c4ab0` — feat(prompt-builder): prefer dossier markdown in entity context formatting
