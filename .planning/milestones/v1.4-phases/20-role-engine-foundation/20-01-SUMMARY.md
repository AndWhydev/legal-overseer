---
phase: 20-role-engine-foundation
plan: 01
subsystem: database
tags: [postgres, rls, typescript, role-engine, autonomy, workflow]

requires:
  - phase: 01-core-schema
    provides: organizations table, org_members, semantic_memories, update_updated_at function
provides:
  - role_configs table with org-scoped role definitions
  - role_states table for FSM working memory with optimistic concurrency
  - role_workflows table for multi-step workflow tracking
  - role_activity table for audit/insight logging
  - bi_snapshots table for cached business intelligence metrics
  - RoleConfig, RoleState, RoleWorkflow, RoleActivity, BISnapshot TypeScript interfaces
  - RoleType, AutonomyLevel, WorkflowStatus, ActivityType type unions
affects: [20-02-role-tick-engine, 20-03-finance-role, 20-04-autonomy-controls]

tech-stack:
  added: []
  patterns:
    - "Role engine tables use org_members RLS + service_role bypass"
    - "Optimistic concurrency via version column on role_states"
    - "Workflow steps stored as JSONB array with current_step pointer"
    - "BI snapshots use UNIQUE(org_id, metric_type) for upsert pattern"

key-files:
  created:
    - personal-assistant/supabase/migrations/092_role_engine_tables.sql
  modified:
    - personal-assistant/src/lib/bitbit-core/types.ts
    - personal-assistant/src/lib/bitbit-core/index.ts

key-decisions:
  - "RLS uses org_members subquery pattern (not current_setting) for consistency with codebase"
  - "Service role bypass uses auth.role() = 'service_role' matching existing migrations"
  - "Added ON DELETE CASCADE on all org_id FKs for clean org teardown"
  - "Added updated_at triggers on mutable tables (role_configs, role_states, role_workflows)"
  - "Added idx_role_states_next_tick for efficient tick scheduling queries"

patterns-established:
  - "Role engine tables: org_members RLS + service_role bypass for cron access"
  - "JSONB config columns for role-specific flexible settings"
  - "Tick scheduling via next_tick_at with partial index WHERE NOT NULL"

requirements-completed: [ROLE-01]

duration: 5min
completed: 2026-03-18
---

# Phase 20 Plan 01: Role Schema & Type System Summary

**5 role engine tables (role_configs, role_states, role_workflows, role_activity, bi_snapshots) with RLS, indexes, triggers, and 9 TypeScript types exported from bitbit-core**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T13:25:23Z
- **Completed:** 2026-03-18T13:30:11Z
- **Tasks:** 3 (migration, types, exports)
- **Files modified:** 3

## Accomplishments
- Created 5 database tables for the role engine foundation with proper FK relationships
- RLS with dual policy pattern: org_members user access + service_role bypass for cron/workers
- 9 TypeScript types/interfaces matching DB schema exactly, exported from bitbit-core barrel
- Added role_id FK to semantic_memories for role-specific knowledge association
- Zero TypeScript compilation errors after changes

## Task Commits

All tasks committed atomically in a single commit (tightly coupled schema + types):

1. **Task 1-3: Migration + Types + Exports** - `56a9e529` (feat)

## Files Created/Modified
- `personal-assistant/supabase/migrations/092_role_engine_tables.sql` - 5 tables, 2 enums, RLS, indexes, triggers, semantic_memories alter
- `personal-assistant/src/lib/bitbit-core/types.ts` - RoleConfig, RoleState, RoleWorkflow, RoleActivity, BISnapshot interfaces + type unions
- `personal-assistant/src/lib/bitbit-core/index.ts` - Re-exports all 9 new types

## Decisions Made
- Used org_members subquery for RLS instead of plan's current_setting pattern (codebase consistency -- current_setting not used anywhere else)
- Used auth.role() = 'service_role' for service bypass instead of TO service_role syntax (matches existing migrations 025, 065b)
- Added ON DELETE CASCADE on all org_id foreign keys (matches codebase convention for org teardown)
- Added update_updated_at() triggers on mutable tables (role_configs, role_states, role_workflows)
- Added idx_role_states_next_tick partial index beyond what plan specified (needed for efficient tick scheduling)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RLS policy pattern corrected to match codebase**
- **Found during:** Task 1 (Migration creation)
- **Issue:** Plan specified current_setting('app.current_org_id') for RLS, but this pattern is not used anywhere in the codebase and would require SET calls in application code
- **Fix:** Used org_members subquery pattern (matching migration 087) and auth.role() = 'service_role' for service bypass (matching migrations 025, 065b)
- **Files modified:** 092_role_engine_tables.sql
- **Verification:** Patterns match existing working migrations

**2. [Rule 2 - Missing Critical] Added ON DELETE CASCADE and updated_at triggers**
- **Found during:** Task 1 (Migration creation)
- **Issue:** Plan's organizations FK references lacked ON DELETE CASCADE (all existing tables use it), and no updated_at triggers were specified
- **Fix:** Added CASCADE on all org_id FKs and update_updated_at() triggers on mutable tables
- **Files modified:** 092_role_engine_tables.sql
- **Verification:** Matches patterns in migrations 060, 087

**3. [Rule 2 - Missing Critical] Added next_tick_at index on role_states**
- **Found during:** Task 1 (Migration creation)
- **Issue:** Plan had no index for querying which roles need ticking next -- the primary query pattern for the tick engine
- **Fix:** Added idx_role_states_next_tick partial index on next_tick_at WHERE NOT NULL
- **Files modified:** 092_role_engine_tables.sql
- **Verification:** Enables efficient "SELECT ... WHERE next_tick_at <= now()" queries

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical)
**Impact on plan:** All auto-fixes necessary for codebase consistency and correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation ready for Plan 20-02 (Role Tick Engine)
- Types available for import from @/lib/bitbit-core
- Migration ready to apply to remote when desired

---
*Phase: 20-role-engine-foundation*
*Completed: 2026-03-18*
