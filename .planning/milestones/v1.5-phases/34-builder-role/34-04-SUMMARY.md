---
phase: 34-builder-role
plan: 04
subsystem: ui, api, agent
tags: [nextjs, supabase, iframe, preview, wordpress, deployment, dashboard]

# Dependency graph
requires:
  - phase: 34-02
    provides: Website generation engine (generateWebsite, reviseWebsite, getProjectHtml)
  - phase: 34-03
    provides: WordPress deployment pipeline (deployToWordPress, checkDeploymentStatus)
provides:
  - Preview API route serving generated HTML at shareable URLs
  - deploy_website and preview_website chat tools with JIT instructions
  - Builder dashboard page at /dashboard/builder with project grid
  - ProjectCard and ProjectList components with status filtering
affects: [builder-role, dashboard, agent-tools]

# Tech tracking
tech-stack:
  added: []
  patterns: [iframe-thumbnail-preview, public-preview-route, chat-redirect-deploy]

key-files:
  created:
    - src/app/api/builder/preview/[projectId]/route.ts
    - src/app/dashboard/builder/page.tsx
    - src/components/builder/project-list.tsx
    - src/components/builder/project-card.tsx
  modified:
    - src/lib/agent/tools/builder-tools.ts
    - src/lib/agent/tools.ts
    - src/lib/intelligence/autonomy-levels.ts

key-decisions:
  - "deploy_website set to L2_propose (requires confirmation) since it pushes to external WordPress"
  - "preview_website set to L4_silent (read-only URL construction, no side effects)"
  - "Deploy action redirects to chat with suggested message rather than calling API directly"
  - "Public preview URLs for projects in preview/deployed status, auth-gated for draft/generating"

patterns-established:
  - "iframe thumbnail: 400% scale with scale-25 transform and pointer-events-none for miniature preview"
  - "Public preview route: status-gated access (preview/deployed = public, draft = org-only)"

requirements-completed: [BUILD-02, BUILD-03]

# Metrics
duration: 12min
completed: 2026-03-27
---

# Phase 34 Plan 04: Preview Route, Deploy Tools & Builder Dashboard Summary

**Shareable preview URLs, WordPress deploy tool via chat, and /dashboard/builder project management page with thumbnail grid and status filters**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-27T13:47:44Z
- **Completed:** 2026-03-27T13:59:45Z
- **Tasks:** 2 completed, 1 pending user verification
- **Files modified:** 7

## Accomplishments
- Preview API route at /api/builder/preview/[id] serves generated HTML as standalone page with proper security headers
- deploy_website and preview_website tools wired into agent chat with JIT instructions and autonomy levels
- Builder dashboard page at /dashboard/builder with responsive project grid, iframe thumbnails, status badges, and filter tabs
- Builder tool group now has 5 tools total: generate, list_templates, revise, deploy, preview

## Task Commits

Each task was committed atomically:

1. **Task 1: Preview route and deployment chat tools** - `d01b9702` (feat)
2. **Task 2: Builder dashboard page with project list** - `8c2c64ed` (feat)
3. **Task 3: Verify complete builder flow end-to-end** - Pending user verification

## Files Created/Modified
- `src/app/api/builder/preview/[projectId]/route.ts` - Public preview endpoint serving generated HTML with auth gating
- `src/app/dashboard/builder/page.tsx` - Dashboard page wrapper for builder project management
- `src/components/builder/project-list.tsx` - Client component fetching and displaying projects with status filter tabs
- `src/components/builder/project-card.tsx` - Individual project card with iframe thumbnail, status badge, action buttons
- `src/lib/agent/tools/builder-tools.ts` - Added deploy_website and preview_website tool definitions and handlers
- `src/lib/agent/tools.ts` - Added 2 tools to builder group, added JIT instructions for deploy and preview
- `src/lib/intelligence/autonomy-levels.ts` - Added autonomy levels for all 5 builder tools

## Decisions Made
- deploy_website uses L2_propose autonomy (consequential external action) while generate/revise use L3_notify (internal DB writes)
- Preview route allows unauthenticated access for preview/deployed status projects (shareable client links)
- Deploy action on dashboard cards redirects to chat with suggested command rather than direct API call (simpler v1 flow)
- iframe thumbnail uses 400% oversize with scale-25 CSS transform for miniature responsive preview rendering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added autonomy levels for all builder tools**
- **Found during:** Task 1
- **Issue:** Plan specified tool registration but not autonomy level configuration. Without this, all builder tools would default to L2_propose (propose and wait), making generate/revise/list unnecessarily slow.
- **Fix:** Added all 5 builder tools to TOOL_AUTONOMY_MAP with appropriate levels
- **Files modified:** src/lib/intelligence/autonomy-levels.ts
- **Verification:** TypeScript compiles clean, levels follow existing patterns
- **Committed in:** d01b9702 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correct tool behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full builder feature chain complete: generate -> preview -> revise -> deploy
- Task 3 (human verification of end-to-end flow) pending user walkthrough
- Ready for v1.5 beta testing with real users

## Self-Check: PASSED

All 7 created/modified files verified on disk. Both task commits (d01b9702, 8c2c64ed) confirmed in git log. SUMMARY.md exists at expected path.

---
*Phase: 34-builder-role*
*Completed: 2026-03-27*
