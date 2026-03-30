---
phase: 30-onboarding-e2e
plan: 02
subsystem: ui
tags: [empty-state, shadcn, playwright, e2e, onboarding, dashboard]

requires:
  - phase: 30-onboarding-e2e
    provides: "Onboarding flow and first-run infrastructure"
provides:
  - "role=status and data-testid=empty-state on both Empty and EmptyState components"
  - "Contextual first-run empty states across all dashboard tabs"
  - "Playwright smoke test verifying empty state rendering"
affects: [onboarding, dashboard, first-run-experience]

tech-stack:
  added: []
  patterns:
    - "All empty states use data-testid=empty-state and role=status for testability"
    - "Tab empty states explain what the page does and offer a one-click action"
    - "Positive empty states (approvals, sentry) show encouraging messages"

key-files:
  created:
    - personal-assistant/e2e/empty-states.spec.ts
  modified:
    - personal-assistant/src/components/ui/empty.tsx
    - personal-assistant/src/components/ui/empty-state.tsx
    - personal-assistant/src/components/dashboard/tabs/command-center-tab.tsx
    - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx

key-decisions:
  - "Added role=status and data-testid to shadcn Empty component (used by most tabs) rather than requiring migration to old EmptyState component"
  - "Used :visible CSS pseudo-selector in Playwright tests to target active panel's empty state among multiple hidden panels"
  - "Added first-run inbox empty state as a separate code path from filtered 'All caught up' empty state"

patterns-established:
  - "Empty state testability: all empty states have role=status and data-testid=empty-state"
  - "Positive empty state pattern: approvals/sentry show encouraging messages, not missing-data messages"

requirements-completed: [ONBD-03]

duration: 13min
completed: 2026-03-27
---

# Phase 30 Plan 02: Empty States Summary

**Contextual empty states on all dashboard tabs with Playwright smoke test -- every tab shows guidance instead of blank screens for first-run users**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-27T06:35:55Z
- **Completed:** 2026-03-27T06:49:16Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `role="status"` and `data-testid="empty-state"` to both Empty (shadcn) and EmptyState (inline) components for Playwright targeting
- Upgraded command-center-tab empty states with first-run user guidance (agent activity, leads, channel activity sections)
- Added dedicated first-run empty state to inbox-tab for users with no connected channels
- Created 3-test Playwright smoke test verifying empty state rendering for approvals, jobs, and contacts tabs
- Audited all 14+ dashboard tabs -- confirmed contextual empty states exist everywhere

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance EmptyState component and add to tabs without empty states** - `330fed0d` (feat)
2. **Task 2: Verify existing empty states and add Playwright smoke test** - `4ef6e10c` (test)

## Files Created/Modified
- `personal-assistant/src/components/ui/empty.tsx` - Added role=status and data-testid=empty-state to shadcn Empty component
- `personal-assistant/src/components/ui/empty-state.tsx` - Added data-testid=empty-state to inline EmptyState component
- `personal-assistant/src/components/dashboard/tabs/command-center-tab.tsx` - Upgraded 3 empty states with first-run guidance
- `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx` - Added first-run empty state for no-messages scenario
- `personal-assistant/e2e/empty-states.spec.ts` - Playwright smoke test (3 test cases, all passing)

## Decisions Made
- Added `role="status"` and `data-testid="empty-state"` to the shadcn `Empty` component (used by majority of tabs) rather than requiring migration to the older `EmptyState` component -- both components now have consistent test hooks
- Used `:visible` CSS pseudo-selector in Playwright to target the active tab panel's empty state, since multiple hidden panels also contain empty states in the DOM
- Added inbox first-run empty state as a separate conditional before the main render, distinct from the filtered "All caught up" positive empty state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Most tabs already had contextual empty states**
- **Found during:** Task 1 (audit)
- **Issue:** Plan expected to add empty states to ~10 tabs, but audit revealed most already had them via child components (leads-page, invoice-list, approval-queue, watch-manager, swarm-dashboard, meeting-list, contacts-tab, jobs-tab, analytics-tab, inbox-tab)
- **Fix:** Focused on the actual gaps: adding test hooks (data-testid/role) to both empty state components, upgrading weak empty states in command-center-tab, and adding first-run empty state to inbox-tab
- **Verification:** TypeScript compilation passes, Playwright tests pass

---

**Total deviations:** 1 (scope adjustment based on audit findings)
**Impact on plan:** Reduced scope to actual gaps rather than re-implementing existing empty states. All objectives still met.

## Issues Encountered
- Playwright tests initially failed due to `:first()` selector matching hidden empty states in inactive tab panels -- resolved by using `:visible` pseudo-selector

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All dashboard tabs now have contextual empty states with test hooks
- Playwright smoke test provides ongoing regression protection
- Ready for phase 30 plan 03 or any further onboarding work

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 30-onboarding-e2e*
*Completed: 2026-03-27*
