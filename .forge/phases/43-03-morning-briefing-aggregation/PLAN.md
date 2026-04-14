# Phase 43-03: Morning Briefing — Autonomous Action Aggregation

## Context

Phases 43-02 (delegation bypass) and 43-04 (NL activation) make BitBit capable of
executing work autonomously under an `infinite_autopilot` or `supervised`
mandate, and 43-05 provides the audit APIs. The missing piece: the user needs
to see, in their morning briefing, what BitBit did overnight on their behalf.

Otherwise delegation is a black box.

## Goal

Add an "Autonomous Actions Overnight" section to the existing morning briefing
(`briefing-generator.ts`) that groups delegated actions by entity, shows
mandate level, action count, financial impact, and a sample of what was done.

## Non-goals

- Separate daily vs weekly cadences (keep existing `generateMondayBriefing`
  contract; the 24h window is hardcoded for now).
- Role-based filtering of which delegated actions surface (all do, per org).
- Rich media in the section (links, charts); plain text + HTML parity with
  existing sections.

## Tasks

1. **Aggregation helper** — add `aggregateDelegatedActionsByEntity(supabase, orgId, since)`
   to `src/lib/agent/delegation-mandate.ts`. Query `delegation_action_log`
   with a PostgREST join on `entity_nodes(name)`, group in-memory by
   `entity_id`, cap `topActions` at 3, sum `financial_impact.amount` when
   numeric, attach current `mandate_level` per entity via parallel
   `getEntityMandate()` calls. Fail-open on error (return `[]`).

2. **Briefing integration** — in `src/lib/agent/briefing-generator.ts`:
   - Add `fetchDelegatedActions(supabase, orgId, since)` returning a
     `BriefingSection` with `key='delegated_actions'`.
   - Invoke it in the `Promise.all` inside `generateMondayBriefing` with
     a 24h window.
   - Place it FIRST in the rendered `sections` array so users see autonomous
     activity before the standard action items.
   - Extend `BriefingSummary` with `autonomousActions` (count) and
     `autonomousImpact` (sum of financial impact). Do NOT add delegated
     actions to `totalActionItems` — they are status, not pending work.

3. **Tests** — `src/lib/agent/__tests__/briefing-delegation.test.ts`:
   - Aggregation: grouping, top-3 cap, non-numeric amount skip, missing join,
     fail-open on error, empty window.
   - Generator integration: section present at top when rows exist; empty
     section when no rows; summary fields populated; WhatsApp formatter
     includes/omits the block appropriately.

4. **Dependencies** — none new; reuses existing infra:
   - `getEntityMandate` from `delegation-mandate.ts` (43-01)
   - `DelegationAuditSummary` interface from `delegation-mandate.ts` (43-05)
   - `BriefingSection`, `BriefingItem`, `formatBriefingWhatsApp` already in
     `briefing-generator.ts`
   - `entity_nodes(name)` join — verified schema at
     `supabase/migrations/20260404000001_entity_graph.sql`

## Acceptance

- A test user with an `infinite_autopilot` mandate on Entity X and ≥1 action
  logged in the last 24h sees a formatted block in the generated briefing
  summarising those actions.
- `briefing.summary.autonomousActions` reflects the per-entity row count.
- `formatBriefingWhatsApp(briefing)` includes the section text when items exist
  and omits it when they don't.
- All tests in `briefing-delegation.test.ts` pass (subject to Step 2 vitest
  environment fix).

## Files modified

- `personal-assistant/src/lib/agent/delegation-mandate.ts` — new
  `aggregateDelegatedActionsByEntity` + `DelegatedActionAggregate` export.
- `personal-assistant/src/lib/agent/briefing-generator.ts` — new section
  fetcher, `autonomousActions`/`autonomousImpact` summary fields, 24h window.

## Files created

- `personal-assistant/src/lib/agent/__tests__/briefing-delegation.test.ts` — 11 tests.

## Dependency position in DAG

Per `.forge-backup/milestones/current.md`:
- Blocked by: `38-03-fiduciary-priority-recall` (completed), `42-04-tier-feedback-loop` (completed per audit).
- Blocks: `43-05-delegation-audit-trail` lifecycle-test coverage (already built in parallel).

See `conductor/handoffs/2026-04-14-phase-43-audit.md` for the full milestone
drift finding.
