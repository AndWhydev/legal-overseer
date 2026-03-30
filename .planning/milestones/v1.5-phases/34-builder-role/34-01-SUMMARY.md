---
phase: 34-builder-role
plan: 01
subsystem: roles, database, billing
tags: [builder, role-engine, website-generation, templates, plan-gating, supabase]

# Dependency graph
requires:
  - phase: 29-growth-role
    provides: RoleImplementation pattern, registerRole(), role-registry
  - phase: 21-billing-infrastructure
    provides: plan-gates.ts, TOOL_PLAN_REQUIREMENTS
provides:
  - Builder role type in TypeScript union and Postgres enum
  - website_projects and website_revisions database tables with RLS
  - Builder role implementation (evaluate/hasChanges/defaultConfig)
  - Template library with 5 responsive starter HTML templates
  - Builder tools gated to growth/scale plans
  - Wave 0 test stubs for entire phase (15 todos across 4 files)
affects: [34-02 site-generator, 34-03 preview-sandbox, 34-04 deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: [builder-role-implementation, template-variable-substitution, website-project-schema]

key-files:
  created:
    - personal-assistant/supabase/migrations/150_role_type_builder.sql
    - personal-assistant/src/lib/builder/types.ts
    - personal-assistant/src/lib/builder/templates.ts
    - personal-assistant/src/lib/roles/builder/builder-role.ts
    - personal-assistant/src/lib/roles/builder/types.ts
    - personal-assistant/src/lib/roles/builder/index.ts
    - personal-assistant/src/lib/roles/builder/__tests__/builder-role.test.ts
    - personal-assistant/src/lib/roles/builder/__tests__/site-generator.test.ts
    - personal-assistant/src/lib/roles/builder/__tests__/preview-sandbox.test.ts
    - personal-assistant/src/lib/roles/builder/__tests__/deploy.test.ts
  modified:
    - personal-assistant/src/lib/bitbit-core/types.ts
    - personal-assistant/src/lib/billing/plan-gates.ts
    - personal-assistant/src/lib/roles/index.ts
    - personal-assistant/src/lib/roles/role-init.ts
    - personal-assistant/src/components/roles/role-activity-feed.tsx
    - personal-assistant/src/components/roles/role-detail-view.tsx
    - personal-assistant/src/components/roles/role-status-cards.tsx

key-decisions:
  - "Builder role uses copilot autonomy with $2/day budget (chat-driven, not tick-heavy)"
  - "Template variables use {{mustache}} syntax with CSS custom properties for color injection"
  - "website_projects.slug unique per org (not globally) allowing org-scoped namespacing"
  - "Website revisions tracked separately for full revision history with version sequencing"

patterns-established:
  - "Template library pattern: BUILT_IN_TEMPLATES array with getTemplate/listTemplates API"
  - "Builder role tick checks stale generating projects (>10min) and old previews (>7 days)"

requirements-completed: [BUILD-01]

# Metrics
duration: 20min
completed: 2026-03-27
---

# Phase 34 Plan 01: Builder Role Foundation Summary

**Builder role registered with DB schema (website_projects + revisions), 5 responsive HTML starter templates, growth+ plan gating, and Wave 0 test stubs**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-27T13:00:37Z
- **Completed:** 2026-03-27T13:21:28Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Builder role type added to TypeScript union and Postgres enum with full Record<RoleType> compatibility
- Migration 150 creates website_projects and website_revisions tables with RLS policies
- Builder role implements evaluate() with stale project detection and old preview monitoring
- 5 complete responsive HTML templates (agency, trades, professional, restaurant, portfolio) with variable substitution
- Builder tools gated to growth+ plans in TOOL_PLAN_REQUIREMENTS
- 15 Wave 0 test todos across 4 test files for Nyquist compliance

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 test stubs** - pre-existing (committed in d2fc4107)
2. **Task 1: DB schema, types, and plan gating** - `e23a4238` (feat)
3. **Task 2: Builder role implementation and template library** - `4182f7c6` (feat)

## Files Created/Modified
- `supabase/migrations/150_role_type_builder.sql` - Builder enum extension, website_projects + website_revisions tables with RLS
- `src/lib/builder/types.ts` - WebsiteProject, WebsiteTemplate, DeploymentTarget, GenerationRequest interfaces
- `src/lib/builder/templates.ts` - 5 starter templates with getTemplate/listTemplates API
- `src/lib/roles/builder/builder-role.ts` - RoleImplementation with evaluate, hasChanges, defaultConfig
- `src/lib/roles/builder/types.ts` - BuilderState and BuilderConfig interfaces
- `src/lib/roles/builder/index.ts` - Barrel exports
- `src/lib/bitbit-core/types.ts` - RoleType union extended with 'builder'
- `src/lib/billing/plan-gates.ts` - Builder tools and growthRoles entry added
- `src/lib/roles/index.ts` - Auto-register import for builder
- `src/lib/roles/role-init.ts` - ROLE_DEFAULTS builder entry
- `src/components/roles/role-activity-feed.tsx` - Builder label and badge color
- `src/components/roles/role-detail-view.tsx` - Builder meta (IconCode, violet)
- `src/components/roles/role-status-cards.tsx` - Builder card metadata

## Decisions Made
- Builder role uses copilot autonomy with $2/day budget -- builder is primarily chat-driven, tick evaluations only monitor for stale projects
- Template variables use `{{mustache}}` syntax with CSS custom properties for color injection -- simple, no build step needed
- website_projects.slug is unique per org (UNIQUE(org_id, slug)) allowing different orgs to use the same slug
- IconCode (violet) chosen for builder role in dashboard UI components

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added builder to ROLE_DEFAULTS in role-init.ts**
- **Found during:** Task 1 (DB schema and types)
- **Issue:** Adding 'builder' to RoleType union broke Record<RoleType, ...> in role-init.ts (TS2741: Property 'builder' is missing)
- **Fix:** Added builder entry to ROLE_DEFAULTS with matching defaults (copilot, $2/day, 3600s tick)
- **Files modified:** src/lib/roles/role-init.ts
- **Verification:** npx tsc --noEmit passes (no builder-related errors)
- **Committed in:** e23a4238

**2. [Rule 3 - Blocking] Added builder to role UI component Record<RoleType> maps**
- **Found during:** Task 1 (DB schema and types)
- **Issue:** Three role UI components (role-activity-feed.tsx, role-detail-view.tsx, role-status-cards.tsx) use Record<RoleType, ...> which broke when 'builder' was added to the union
- **Fix:** Added builder entries with IconCode icon (violet color scheme) to all three components
- **Files modified:** src/components/roles/role-activity-feed.tsx, role-detail-view.tsx, role-status-cards.tsx
- **Verification:** npx tsc --noEmit passes
- **Committed in:** e23a4238

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both fixes are direct consequences of extending the RoleType union. No scope creep -- all changes are d=1 dependents of the RoleType modification.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Builder role registered and operational -- subsequent plans (34-02 site-generator, 34-03 preview-sandbox, 34-04 deploy) can build on this foundation
- Template library ready for consumption by the site generator
- All test stubs in place for wave testing

---
*Phase: 34-builder-role*
*Completed: 2026-03-27*
