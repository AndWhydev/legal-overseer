# Phase 43-03: Morning Briefing — Autonomous Action Aggregation

**Status:** COMPLETE + VERIFIED (10 tests passing)
**Completed:** 2026-04-14
**Branch:** `claude/review-forge-access-Aas4D`

## Goal

Surface overnight autonomous actions in the morning briefing so users have
visibility into what BitBit did under active delegation mandates.

## Implementation

### Task 1 — Aggregation helper

Added `aggregateDelegatedActionsByEntity()` to
`personal-assistant/src/lib/agent/delegation-mandate.ts` (new export).

Signature:
```ts
export async function aggregateDelegatedActionsByEntity(
  supabase: SupabaseClient,
  orgId: string,
  since: Date,
): Promise<DelegatedActionAggregate[]>
```

New exported interface:
```ts
export interface DelegatedActionAggregate {
  entityId: string
  entityName: string
  mandateLevel: MandateLevel | null
  actionCount: number
  totalFinancialImpact: number
  topActions: Array<{
    summary: string
    actionType: string
    createdAt: string
    amount: number | null
  }>
}
```

Behaviour:
- Queries `delegation_action_log` with `entity_nodes(name)` PostgREST join,
  filtered by `org_id` and `created_at >= since`, ordered `created_at DESC`.
- Groups rows by `entity_id`; first three rows per group become `topActions`.
- Aggregates `financial_impact.amount` when numeric; skips otherwise.
- Attaches `mandate_level` per entity via parallel `getEntityMandate()` calls.
- Sort order: `actionCount` descending (most active entities first).
- Fail-open: returns `[]` on any query error; logs at `warn`.

### Task 2 — Briefing integration

Modified `personal-assistant/src/lib/agent/briefing-generator.ts`:

- **Import** added: `import { aggregateDelegatedActionsByEntity } from './delegation-mandate'`.
- **New fetcher** `fetchDelegatedActions(supabase, orgId, since)` returns a
  `BriefingSection` with `key='delegated_actions'`, emoji `🤖`, items shaped as
  `{ label: "EntityName (mandate_level)", detail: "N actions -- $X impact -- {top summary truncated to 60 chars}" }`.
- **`generateMondayBriefing`** adds the fetcher to its `Promise.all` with a
  24-hour lookback window and places the result at the front of
  `sections[]` so users see autonomy activity before their own pending items.
- **`BriefingSummary` extended** with:
  - `autonomousActions: number` — count of entities with activity in window.
  - `autonomousImpact: number` — summed financial impact across those entities.

  These are **not** added to `totalActionItems` — delegated actions are
  informational (BitBit already did them), not pending work for the user.
- **`truncate(text, max)` helper** added for action-summary clipping.

### Task 3 — Tests

Created `personal-assistant/src/lib/agent/__tests__/briefing-delegation.test.ts` (10 tests, all passing):

- `aggregateDelegatedActionsByEntity` suite (5 tests):
  1. Groups by entity, caps topActions at 3, sums financial impact, sorts desc.
  2. Returns empty array when no actions in window.
  3. Fail-open on query error.
  4. Skips non-numeric financial_impact amounts.
  5. Handles missing/null `entity_nodes` join gracefully (`"Unknown entity"`).
- `generateMondayBriefing — delegated actions integration` suite (4 tests):
  6. Delegated_actions section appears at index 0 when rows exist; summary
     fields `autonomousActions` and `autonomousImpact` populated.
  7. Empty section renders when no rows; `totalActionItems` unchanged.
  8. WhatsApp formatter surfaces the block when items exist.
  9. WhatsApp formatter omits the block when empty.
- `DelegatedActionAggregate shape` sanity test (1 test, type-level).

Tests follow the mock-supabase pattern from `delegation-mandate.test.ts`
using `vi.fn().mockImplementation((table) => ...)` to differentiate
per-table chain behaviour.

## Files

**Modified:**
- `personal-assistant/src/lib/agent/delegation-mandate.ts` — added
  `aggregateDelegatedActionsByEntity` + `DelegatedActionAggregate`.
- `personal-assistant/src/lib/agent/briefing-generator.ts` — added
  `fetchDelegatedActions`, `truncate`; extended `BriefingSummary`;
  placed the new section first in the output.

**Created:**
- `personal-assistant/src/lib/agent/__tests__/briefing-delegation.test.ts` — 11 tests.
- `.forge/phases/43-03-morning-briefing-aggregation/PLAN.md`
- `.forge/phases/43-03-morning-briefing-aggregation/RESULT.md` (this file)

## Dependencies

- `38-03-fiduciary-priority-recall` (completed) — inherited.
- `42-04-tier-feedback-loop` (completed per 2026-04-14 audit) — inherited.
- Reuses `getEntityMandate` from 43-01, no new schema, no new migration.

## Caveats

- **Email HTML formatter not updated** for the new summary fields
  (`autonomousActions`, `autonomousImpact`). Existing `formatBriefingEmail`
  renders the section automatically via the generic section-iterator loop.
  Summary-card display of autonomy metrics can be layered in a follow-up.
- **Window is hardcoded to 24h.** Making it configurable per-briefing
  (daily vs Monday-weekly) is a post-v2.0 enhancement.

## Verification (2026-04-14)

```
 ✓ src/lib/agent/__tests__/briefing-delegation.test.ts (10 tests) 44ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Also verified as part of the full delegation suite (98 tests passing) and the
Phase 42 engine suite (74 tests passing). Zero TypeScript errors introduced.

## Related handoff

See `conductor/handoffs/2026-04-14-phase-43-audit.md` for the ground-truth
audit that identified 43-03 as the only genuinely unbuilt Phase 43 sub-phase.
