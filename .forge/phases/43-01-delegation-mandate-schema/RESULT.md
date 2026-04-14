# Phase 43-01: Delegation Mandate Schema & Service Layer

**Status:** COMPLETE (retroactively documented)
**Implementation landed:** ~2026-04-10 (migration timestamp); committed alongside `feat(44-03)` (commit `9e32fbd`, 2026-04-11)
**Documented:** 2026-04-14
**Branch:** `claude/review-forge-access-Aas4D`

## Why this RESULT.md is retroactive

Phase 43-01 code landed without a corresponding `.forge/phases/43-01-*/`
directory. The implementation was discovered during the 2026-04-14 audit
(`conductor/handoffs/2026-04-14-phase-43-audit.md`) as one of many phases where
state.json was not updated after the work shipped. This file backfills the
missing documentation so Phase 43 can be reconciled cleanly in state.json.

## Goal

Schema and service layer for entity-level delegation mandates. Enables:
1. Tracking per-entity mandates (`infinite_autopilot` | `supervised` | `standard`)
2. One active mandate per entity per org at a time
3. Audit log of every action taken under delegation authority
4. Service functions for activation, revocation, lookup, and audit queries

## Schema (`supabase/migrations/20260410000003_delegation_mandates.sql`)

### `delegation_mandates` table

```
id                UUID PK
org_id            UUID → organizations(id), ON DELETE CASCADE
entity_id         UUID → entity_nodes(id), ON DELETE CASCADE
mandate_level     TEXT CHECK IN ('infinite_autopilot', 'supervised', 'standard')
activated_at      TIMESTAMPTZ DEFAULT now()
activated_via     TEXT NOT NULL        — 'dashboard' | 'whatsapp' | 'api' | 'onboarding'
deactivated_at    TIMESTAMPTZ NULL
deactivated_via   TEXT NULL            — 'dashboard' | 'whatsapp' | 'api' | 'admin'
```

**Indexes:**
- Unique active mandate per (org_id, entity_id) WHERE `deactivated_at IS NULL`
- org_id lookup
- entity_id lookup

### `delegation_action_log` table

```
id                   UUID PK
org_id               UUID → organizations(id), ON DELETE CASCADE
entity_id            UUID → entity_nodes(id), ON DELETE CASCADE
mandate_id           UUID → delegation_mandates(id), ON DELETE SET NULL
action_type          TEXT NOT NULL
action_summary       TEXT NOT NULL
action_payload       JSONB DEFAULT '{}'
financial_impact     JSONB NULL    — { amount, currency, direction }
evidence_urls        TEXT[] DEFAULT '{}'
fiduciary_evaluation JSONB NULL    — { risk, reasoning, score }
agent_run_id         UUID NULL
created_at           TIMESTAMPTZ DEFAULT now()
```

**Indexes:**
- (org_id, created_at DESC) — for morning briefing window scans
- entity_id — per-entity audit
- mandate_id — actions under a specific mandate

### RLS

Both tables ENABLE ROW LEVEL SECURITY. Policies scope reads and writes to
`org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())`.

## Service layer (`src/lib/agent/delegation-mandate.ts`)

### Exported types

- `MandateLevel` — `'infinite_autopilot' | 'supervised' | 'standard'`
- `ActivationChannel` — `'dashboard' | 'whatsapp' | 'api' | 'onboarding' | 'admin'`
- `DelegationMandate` — row shape
- `DelegationActionEntry` — action log row shape
- `LogDelegatedActionParams` — input for `logDelegatedAction`
- `DelegationAuditSummary` — rollup for 43-05 (added in 43-05)
- `DelegatedActionAggregate` — per-entity rollup for 43-03 (added in 43-03)

### Exported functions

**Core (43-01):**
- `getEntityMandate(supabase, orgId, entityId)` → active mandate or null.
- `setEntityMandate(supabase, orgId, entityId, level, via)` — revokes any
  existing active mandate, then inserts the new one. Idempotent.
- `revokeEntityMandate(supabase, orgId, entityId, via)` — returns `true` if
  an active mandate was deactivated.
- `logDelegatedAction(supabase, params)` — persists an action.
- `getRecentDelegatedActions(supabase, orgId, since)` — window query, ordered
  `created_at DESC`. Fail-open.
- `isEntityFullyDelegated(supabase, orgId, entityId)` — shortcut for
  `mandate_level === 'infinite_autopilot'`.

**Audit (added in 43-05):**
- `getEntityDelegationHistory(supabase, orgId, entityId)` — all mandates for
  an entity, active + revoked, `activated_at DESC`.
- `getActionsForMandate(supabase, mandateId)` — all actions under a mandate.
- `getDelegationAuditSummary(supabase, orgId, entityId)` — rolled-up totals.

**Briefing (added in 43-03):**
- `aggregateDelegatedActionsByEntity(supabase, orgId, since)` — per-entity
  rollup with mandate level, action count, financial total, top 3 actions.

### Error handling

All query functions (except `setEntityMandate` / `logDelegatedAction` which
must throw on insert failure) are **fail-open**: they log at `warn` level via
`@/lib/core/logger` and return empty / null results on error so consuming
code (morning briefing, routing) continues to function.

## Tests

`personal-assistant/src/lib/agent/__tests__/delegation-mandate.test.ts`
exercises the core service-layer functions. Additional test coverage added
by downstream phases (43-02, 43-04, 43-05, 43-03) indirectly validates 43-01
behaviour through their mocks.

**Test execution caveat:** Vitest hangs in the current environment — tests
are structurally correct but unverified pending the Step 2 fix of the
2026-04-14 continuity plan.

## Files

**Migration:**
- `personal-assistant/supabase/migrations/20260410000003_delegation_mandates.sql`

**Service:**
- `personal-assistant/src/lib/agent/delegation-mandate.ts`

**Test:**
- `personal-assistant/src/lib/agent/__tests__/delegation-mandate.test.ts`

## Dependencies

Per `.forge-backup/milestones/current.md`:
- Blocked by: `38-03-fiduciary-priority-recall` (completed), `42-04-tier-feedback-loop`
  (completed per 2026-04-14 audit).
- Blocks: `43-02-confidence-delegation-bypass` (completed), `43-04-nl-delegation-activation`
  (completed), `43-05-delegation-audit-trail` (completed), `43-03-morning-briefing-aggregation`
  (completed 2026-04-14).

## Related

- `conductor/handoffs/2026-04-14-phase-43-audit.md` — audit that identified
  the missing RESULT.md.
- `.forge/phases/43-02-confidence-delegation-bypass/RESULT.md`
- `.forge/phases/43-04-nl-delegation-activation/RESULT.md`
- `.forge/phases/43-05-delegation-audit-trail/RESULT.md`
- `.forge/phases/43-03-morning-briefing-aggregation/RESULT.md`
