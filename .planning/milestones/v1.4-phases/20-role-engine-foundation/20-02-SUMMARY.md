---
phase: "20"
plan: "02"
subsystem: role-engine
tags: [runtime, concurrency, scheduler, advisory-locks, optimistic-concurrency]
dependency_graph:
  requires: [20-01]
  provides: [role-runtime, role-registry, role-scheduler, role-init, role-tick-cron]
  affects: [agent-scheduler, cron-system, bitbit-core-barrel]
tech_stack:
  added: []
  patterns: [advisory-locks, optimistic-concurrency, pre-screen-stub, barrel-re-export]
key_files:
  created:
    - personal-assistant/src/lib/roles/role-runtime.ts
    - personal-assistant/src/lib/roles/role-registry.ts
    - personal-assistant/src/lib/roles/role-scheduler.ts
    - personal-assistant/src/lib/roles/role-init.ts
    - personal-assistant/src/lib/roles/index.ts
    - personal-assistant/src/app/api/cron/role-tick/route.ts
    - personal-assistant/src/app/api/roles/[roleType]/enable/route.ts
    - personal-assistant/src/app/api/roles/[roleType]/disable/route.ts
  modified:
    - personal-assistant/src/lib/bitbit-core.ts
    - personal-assistant/vercel.json
decisions:
  - "Advisory lock fallback: if pg_try_advisory_lock RPC unavailable, proceed with optimistic concurrency only (version check is safety net)"
  - "Barrel fix: bitbit-core.ts file takes precedence over bitbit-core/index.ts in bundler resolution; Role types exported from bitbit-core/types.ts via separate import block"
  - "Lock key derivation: first 8 hex chars of UUID parsed as int32 for pg_advisory_lock"
  - "Pre-screen skips still update last_tick_at/next_tick_at to avoid re-checking too soon"
metrics:
  duration: 12min
  completed: 2026-03-18
  tasks: 5
  files: 10
---

# Phase 20 Plan 02: Role Runtime -- State, Ticks, Events, Concurrency Summary

Role engine runtime with advisory-lock concurrency, optimistic state versioning, Haiku pre-screen stub, cost guard integration, and scheduled tick execution via cron.

## What Was Built

### role-runtime.ts (Core)
- `acquireRoleLock` / `releaseRoleLock` -- Postgres advisory locks via UUID-derived int32 key
- `loadRoleState` / `saveRoleState` -- Persistent state with optimistic concurrency (version column check)
- `executeRoleTick` -- Full lifecycle: lock -> load state -> cost guard -> pre-screen -> evaluate -> save -> log -> release
- try/finally ensures lock release on errors
- Activity logging to `role_activity` table for actions, insights, and errors

### role-registry.ts
- `RoleImplementation` interface: evaluate(), hasChanges(), defaultConfig()
- `RoleEvaluation` type: actions, insights, stateUpdates, workflowsToStart
- Registry: registerRole(), getRole(), listRoles(), getRegisteredRoleTypes()

### role-scheduler.ts
- `runScheduledRoles()` -- analogous to agent scheduler's `runScheduledAgents()`
- Queries enabled role_configs, checks next_tick_at/last_tick_at timing
- Delegates to executeRoleTick which handles locking and cost guard internally

### role-init.ts
- `initializeRole()` -- Creates role_configs + role_states rows with defaults
- `disableRole()` -- Soft disable (keeps config and state for re-enable)
- Hardcoded defaults per role type with linked agent types mapping

### API Routes
- `POST /api/roles/[roleType]/enable` -- Auth via cookie-based Supabase client, org scoped
- `POST /api/roles/[roleType]/disable` -- Same auth pattern
- `GET /api/cron/role-tick` -- Cron endpoint using withCronGuard, every 5 minutes

### Barrel Export Fix
- Discovered `src/lib/bitbit-core.ts` (file) takes precedence over `src/lib/bitbit-core/index.ts` (directory) in TypeScript bundler resolution
- Added Role types to barrel via separate import from `./bitbit-core/types`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed bitbit-core.ts barrel missing Role type exports**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** `src/lib/bitbit-core.ts` (a file) shadows `src/lib/bitbit-core/index.ts` (directory) in TypeScript bundler module resolution. The file barrel re-exported from `./core/types` which is an older types file without Role types.
- **Fix:** Added second import block in bitbit-core.ts importing Role types from `./bitbit-core/types`
- **Files modified:** personal-assistant/src/lib/bitbit-core.ts
- **Commit:** 57cd82ac

## Commits

| Hash | Message |
|------|---------|
| 57cd82ac | feat(20-02): role runtime -- state, ticks, concurrency, scheduler |

## Self-Check: PASSED

All 8 created files verified on disk. Commit 57cd82ac verified in git log.
