---
phase: 35-proactive-workflows
plan: 01
subsystem: workflows
tags: [zod, anthropic-haiku, supabase, vitest, workflow-automation, nlp]

requires:
  - phase: 34-builder-role
    provides: role system with workflowsToStart, tool group registry
provides:
  - WorkflowRule type system with zod schemas for LLM output validation
  - NL-to-structured workflow rule parser using Claude Haiku
  - Event and schedule trigger evaluation engine with condition matching
  - Loop prevention via triggered_by_workflow flag
  - 3 starter workflow templates (new_lead, overdue_invoice, daily_digest)
  - workflow_rules DB table with RLS and role_workflows extension
affects: [35-02-PLAN, 35-03-PLAN, channel-triage, role-runtime]

tech-stack:
  added: []
  patterns: [zod-validated-llm-output, event-trigger-evaluation, cron-pattern-matching, supabase-chainable-mock]

key-files:
  created:
    - personal-assistant/src/lib/workflows/workflow-rule-types.ts
    - personal-assistant/src/lib/workflows/workflow-rule-parser.ts
    - personal-assistant/src/lib/workflows/workflow-rule-engine.ts
    - personal-assistant/src/lib/workflows/workflow-templates.ts
    - personal-assistant/supabase/migrations/20260328000001_workflow_rules.sql
    - personal-assistant/src/lib/workflows/__tests__/rule-parser.test.ts
    - personal-assistant/src/lib/workflows/__tests__/trigger-engine.test.ts
  modified: []

key-decisions:
  - "Zod v4 z.record requires (key, value) pair -- used z.record(z.string(), z.unknown()) for parameter maps"
  - "Migration filename uses timestamp format (20260328000001) matching existing convention instead of plan-specified 151_ prefix"
  - "vi.hoisted() required for Anthropic SDK mock in Vitest ESM mode -- standard vi.mock factory cannot reference outer variables"
  - "Supabase mock uses thenable pattern (q.then) for await compatibility with chainable query builder"

patterns-established:
  - "LLM output validation: parse with JSON.parse -> validate with WorkflowRuleSchema.safeParse -> return confidence + needsReview flag"
  - "Event trigger evaluation: fetch rules by trigger_type -> filter by event match -> evaluate conditions -> update trigger stats"
  - "Supabase chainable mock: object with self-referencing methods + .then for await resolution"

requirements-completed: [WRKF-01, WRKF-02]

duration: 27min
completed: 2026-03-28
---

# Phase 35 Plan 01: Workflow Rules Foundation Summary

**NL rule parser via Haiku + zod validation, event/schedule trigger engine with loop prevention, workflow_rules DB table with RLS**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-27T15:20:18Z
- **Completed:** 2026-03-27T15:47:17Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- WorkflowRule type system with zod schemas that validates LLM-parsed output and rejects malformed structures
- NL rule parser using Claude Haiku that decomposes natural language into trigger+conditions+actions with confidence scoring
- Trigger engine that evaluates event-based and schedule-based rules with AND-logic condition matching
- Loop prevention blocking events originating from workflow execution (triggered_by_workflow flag)
- 3 starter workflow templates for common automations (new lead research, overdue invoice, daily digest)
- 25 tests passing (7 parser + 18 engine) covering parsing, validation, event matching, scheduling, conditions, and cron patterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, DB migration, and Wave 0 test scaffolds** - `2ec5b5a1` (test)
2. **Task 2: NL rule parser and trigger engine implementation** - `559469c8` (feat)

## Files Created/Modified
- `personal-assistant/src/lib/workflows/workflow-rule-types.ts` - WorkflowRule/Trigger/Condition/Action interfaces + zod schemas
- `personal-assistant/src/lib/workflows/workflow-rule-parser.ts` - NL-to-structured rule parsing via Haiku with zod validation
- `personal-assistant/src/lib/workflows/workflow-rule-engine.ts` - Event/schedule trigger evaluation with condition matching
- `personal-assistant/src/lib/workflows/workflow-templates.ts` - 3 starter workflow templates
- `personal-assistant/supabase/migrations/20260328000001_workflow_rules.sql` - workflow_rules table with RLS + role_workflows extension
- `personal-assistant/src/lib/workflows/__tests__/rule-parser.test.ts` - 7 parser tests
- `personal-assistant/src/lib/workflows/__tests__/trigger-engine.test.ts` - 18 engine tests

## Decisions Made
- Used zod v4 `z.record(z.string(), z.unknown())` for parameter maps (zod v4 requires key+value pair unlike v3)
- Migration filename uses timestamp format `20260328000001` matching existing project convention instead of plan-specified `151_` prefix
- Used `vi.hoisted()` for Anthropic SDK mock -- required in Vitest ESM mode since `vi.mock` factories are hoisted before variable declarations
- Supabase mock uses thenable pattern (`q.then`) for await compatibility with chainable query builder
- `matchesCronPattern` uses 5-minute tolerance window matching role tick interval for daily HH:MM patterns
- `updateTriggerStats` uses RPC fallback pattern for atomic counter increment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod v4 API difference for z.record()**
- **Found during:** Task 1 (type definitions)
- **Issue:** `z.record(z.unknown())` fails TypeScript compilation in zod v4 (expects 2-3 args)
- **Fix:** Changed to `z.record(z.string(), z.unknown())` per zod v4 API
- **Files modified:** workflow-rule-types.ts
- **Committed in:** 2ec5b5a1

**2. [Rule 3 - Blocking] Vitest ESM mock hoisting incompatibility**
- **Found during:** Task 2 (parser tests)
- **Issue:** `vi.mock` factory couldn't reference `createMock` variable declared above -- factory is hoisted before variable declarations in ESM mode
- **Fix:** Used `vi.hoisted()` to declare the mock function so it's available during factory execution
- **Files modified:** __tests__/rule-parser.test.ts
- **Committed in:** 559469c8

**3. [Rule 3 - Blocking] Supabase chainable mock self-reference in const initializer**
- **Found during:** Task 2 (engine tests)
- **Issue:** `const q = { select: vi.fn().mockReturnValue(q) }` -- cannot reference `q` during its own initialization
- **Fix:** Declared `q` as empty object first, then assigned methods imperatively
- **Files modified:** __tests__/trigger-engine.test.ts
- **Committed in:** 559469c8

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes were necessary to unblock compilation and test execution. No scope creep.

## Issues Encountered
- Pre-existing test failures (10 files, 18 tests) in unrelated areas (surface-hardening, etc.) -- not caused by our changes, not addressed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types and schemas ready for Plan 02 (WorkflowToolBridge + integration wiring)
- Trigger engine ready to be wired into channel-triage.ts and role-runtime.ts
- Templates ready for Plan 03 (dashboard UI)
- workflow_rules migration ready for deployment

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (2ec5b5a1, 559469c8) found in git history.

---
*Phase: 35-proactive-workflows*
*Completed: 2026-03-28*
