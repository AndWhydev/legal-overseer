---
phase: 01-platform-deploy
plan: 02
subsystem: infra
tags: [vercel, nextjs, dns, deployment, ssl]

requires:
  - phase: 01-platform-deploy/01-01
    provides: Supabase project with AWU seed data and env vars
provides:
  - Live deployment at bitbit.com.au with SSL
  - Vercel project configuration for personal-assistant
  - Domain routing (apex + www redirect)
affects: [02-schema-expansion, 03-semantic-context]

tech-stack:
  added: [vercel]
  patterns: [vercel.json project config, env vars via Vercel dashboard]

key-files:
  created:
    - personal-assistant/vercel.json
  modified: []

key-decisions:
  - "Deployed via Vercel dashboard import (not CLI) due to monorepo root directory configuration"
  - "www.bitbit.com.au configured as 308 redirect to apex domain"

patterns-established:
  - "Env vars managed via Vercel dashboard, not committed to repo"

requirements-completed: [PLAT-06, PLAT-07, PLAT-08]

duration: 2min
completed: 2026-02-20
---

# Phase 1 Plan 02: Vercel Deploy + Domain Summary

**Next.js dashboard deployed to Vercel at bitbit.com.au with SSL, Supabase env vars, and domain routing (www 308 redirect to apex)**

## Performance

- **Duration:** ~2 min (executor tasks; domain/DNS handled by orchestrator)
- **Started:** 2026-02-20
- **Completed:** 2026-02-20
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Vercel project created with personal-assistant/ as root directory, env vars configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY)
- bitbit.com.au pointed to Vercel with valid SSL; www.bitbit.com.au returns 308 redirect
- Smoke test passed: bitbit.com.au returns HTTP 200, Supabase API reachable (RLS correctly blocks unauthenticated reads)

## Task Commits

1. **Task 1: Configure Vercel project and deploy** - `c441886` (feat)
2. **Task 2: Configure bitbit.com.au domain and DNS** - orchestrator-handled (human-action checkpoint)
3. **Task 3: Smoke test** - verification only (no code changes)

## Files Created/Modified
- `personal-assistant/vercel.json` - Vercel project configuration (buildCommand, outputDirectory, framework)

## Decisions Made
- Deployed via Vercel dashboard import rather than CLI to handle monorepo root directory setting
- www subdomain configured as 308 permanent redirect to apex domain

## Deviations from Plan
None - plan executed as written.

## Issues Encountered
- Supabase table names use American spelling ("organizations" not "organisations") - discovered during smoke test API queries. Not a bug, just schema naming convention.

## Follow-up Items
- Supabase auth redirect URLs (site_url, redirect_urls) still need dashboard configuration to point to https://bitbit.com.au. Without this, auth redirects after login/signup may not work correctly. This should be configured in Supabase Dashboard > Authentication > URL Configuration.

## Next Phase Readiness
- Deployment infrastructure complete — bitbit.com.au is live
- Browser-based smoke test (login, kanban, chat, contacts) deferred to user
- Ready for Phase 2 (Schema Expansion) once Phase 1 remaining plans complete

---
*Phase: 01-platform-deploy*
*Completed: 2026-02-20*

## Self-Check: PASSED
- SUMMARY.md: exists
- Commit c441886: exists
