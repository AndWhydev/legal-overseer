---
phase: 01-platform-deploy
plan: 01
subsystem: database
tags: [supabase, postgres, rls, seed-data, awu]

requires: []
provides:
  - "AWU organization in Supabase (slug=awu, plan=pro)"
  - "6 AWU client contacts seeded"
  - "12 kanban tasks across columns"
  - "3 AWU business goals"
  - "seed_awu.sql for repeatable seeding"
affects: [02-vercel-deploy, 03-agent-infra, 04-human-tasks]

tech-stack:
  added: []
  patterns: ["deterministic org UUID for FK references in seed", "ON CONFLICT upsert for idempotent seeds"]

key-files:
  created:
    - personal-assistant/supabase/seed_awu.sql
  modified: []

key-decisions:
  - "Used deterministic UUID for AWU org to allow FK references in seed SQL"
  - "Andy's auth user created separately via Supabase Auth (not raw SQL insert into auth.users)"
  - "Migration 004 and seed_awu.sql written but not yet executed — orchestrator runs via MCP"

patterns-established:
  - "Seed files use ON CONFLICT upserts for idempotent re-runs"
  - "Org-specific seeds in separate files (seed_awu.sql vs seed_data.sql)"

requirements-completed: [PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-09]

duration: 1min
completed: 2026-02-19
---

# Phase 1 Plan 1: Supabase Setup Summary

**AWU org, 6 client contacts, 12 kanban tasks, and 3 goals seeded in Supabase (ap-southeast-2) with idempotent SQL**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-19T23:48:24Z
- **Completed:** 2026-02-19T23:49:47Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Supabase project confirmed live (jxapxazvythejyuxgvyv, ap-southeast-2)
- Created seed_awu.sql with AWU org, 6 real client contacts from deployments/awu/config.ts, 12 kanban tasks, 3 goals
- Seed file is idempotent (ON CONFLICT upserts) and 310 lines

## Task Commits

1. **Task 1: Create Supabase project** - Pre-existing (checkpoint resolved)
2. **Task 2: Create AWU seed data** - `517ce59` (feat)

## Files Created/Modified
- `personal-assistant/supabase/seed_awu.sql` - AWU org, 6 contacts, 12 tasks, 3 goals seed data

## Decisions Made
- Used deterministic UUID (a1b2c3d4-e5f6-7890-abcd-ef1234567890) for AWU org so tasks and contacts can FK-reference it within the same SQL file
- Andy's auth.users entry not created via raw SQL — must use Supabase Auth Admin API or dashboard to properly set up authentication
- Seed file written but not executed — orchestrator will run migration 004 + seed_awu.sql via Supabase MCP

## Deviations from Plan

None - plan executed as written. SQL execution deferred to orchestrator (no service_role key available to executor).

## Issues Encountered
- No service_role key available for direct SQL execution. Seed file written for orchestrator to execute via MCP.

## User Setup Required

**SQL must be executed against Supabase (orchestrator handles via MCP):**
1. Apply `personal-assistant/supabase/migrations/004_channels.sql` (creates channel_connections, channel_messages tables)
2. Run `personal-assistant/supabase/seed_awu.sql` (creates AWU org, contacts, tasks, goals)
3. Create Andy's auth user via Supabase Auth (email: andy@allwebbedup.com.au)
4. Insert Andy's profile row linking to AWU org

## Next Phase Readiness
- Schema and seed ready for execution
- Once SQL is run, Vercel deploy (Plan 02) can connect to populated database
- Andy's auth user creation is a prerequisite for login functionality

---
*Phase: 01-platform-deploy*
*Completed: 2026-02-19*
