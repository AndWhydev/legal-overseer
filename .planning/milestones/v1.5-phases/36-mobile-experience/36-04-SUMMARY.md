---
phase: 36-mobile-experience
plan: 04
subsystem: mobile
tags: [react-native, expo, offline-queue, tanstack-query, gesture-handler, haptics, swipeable, approvals]

requires:
  - phase: 36-01
    provides: "Expo app scaffold, QueryProvider with AsyncStorage persister, auth, api client"
  - phase: 36-02
    provides: "Chat hook (useChat), SSE streaming, voice input"
  - phase: 36-03
    provides: "Push notifications, NotificationProvider, activity feed"
provides:
  - "Offline mutation queue (offlineMutationDefaults, configurePersistentMutations)"
  - "Network status hook (useOffline) with reconnection detection"
  - "OfflineBanner component with animated slide-in/out"
  - "Approvals query + mutation hooks (useApprovals, useResolveApproval)"
  - "Swipeable ApprovalCard with approve/reject gestures and haptics"
  - "QuickAction reusable button with haptic feedback and scale animation"
  - "Approval detail screen with full context and action buttons"
  - "Approval badge count on tab bar"
affects: [mobile-testing, mobile-deployment]

tech-stack:
  added: []
  patterns:
    - "offlineFirst networkMode on all mutations for automatic queuing"
    - "configurePersistentMutations for mutation resume after app restart"
    - "Swipeable cards with react-native-gesture-handler for native-thread gestures"
    - "Haptic feedback on all quick actions via expo-haptics"
    - "Optimistic updates with rollback on error for approvals"

key-files:
  created:
    - mobile/src/lib/offline-queue.ts
    - mobile/src/hooks/useOffline.ts
    - mobile/src/hooks/useApprovals.ts
    - mobile/src/components/OfflineBanner.tsx
    - mobile/src/components/ApprovalCard.tsx
    - mobile/src/components/QuickAction.tsx
    - mobile/app/approval/[id].tsx
  modified:
    - mobile/src/providers/QueryProvider.tsx
    - mobile/src/hooks/useChat.ts
    - mobile/app/_layout.tsx
    - mobile/app/(tabs)/approvals.tsx
    - mobile/app/(tabs)/_layout.tsx

key-decisions:
  - "Offline chat uses useMutation with onlineManager check -- SSE streaming for online, mutation queue for offline"
  - "configurePersistentMutations registers default mutation fns at QueryClient level for app-restart resume"
  - "usePendingMutations via useMutationState for banner pending count"
  - "Swipeable left=approve right=reject mapping follows Swipeable onSwipeableOpen direction semantics"
  - "Approval badge uses useApprovals array length (not separate count endpoint) to avoid extra API call"

patterns-established:
  - "Offline mutation pattern: mutationKey + configurePersistentMutations + networkMode offlineFirst"
  - "Swipeable card pattern: Swipeable + haptic on open + ref.close() after action"
  - "QuickAction button: variant-colored pressable with scale animation and haptic"

requirements-completed: [MOB-04, MOB-05]

duration: 10min
completed: 2026-03-28
---

# Phase 36 Plan 04: Offline Queue & Swipeable Approvals Summary

**Offline mutation queue with AsyncStorage persistence + swipeable approval cards with haptic-feedback quick actions**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-27T17:27:56Z
- **Completed:** 2026-03-27T17:38:20Z
- **Tasks:** 2 completed (Task 3 is checkpoint:human-verify, pending user verification)
- **Files modified:** 12

## Accomplishments
- Offline mutation queue wired into TanStack Query with persistent mutation defaults for chat messages and approvals
- Network status hook (useOffline) combining NetInfo state with pending mutation count for offline/reconnecting/online detection
- OfflineBanner with animated slide-in/out showing contextual status (red=offline, yellow=syncing)
- Chat hook extended with offline path: useMutation queues when offline, SSE streams when online, pending indicator on messages
- Approvals screen with FlatList, pull-to-refresh, empty state, and pending count header
- Swipeable ApprovalCard with green approve/red reject action backgrounds and Medium haptic on swipe complete
- QuickAction reusable button with Light haptic, scale animation, and variant colors (approve/reject/reply/snooze)
- Approval detail screen showing full context with Approve/Reject quick action buttons
- Badge count on Approvals tab reflecting pending approval count

## Task Commits

Each task was committed atomically:

1. **Task 1: Offline mutation queue + network status hook + banner** - `6adef62e` (feat)
2. **Task 2: Approvals screen with swipe gestures + quick actions** - `74dce051` (feat)
3. **Task 3: End-to-end mobile app verification on device** - *pending user verification (checkpoint:human-verify)*

## Files Created/Modified
- `mobile/src/lib/offline-queue.ts` - Persistent mutation config (offlineMutationDefaults, configurePersistentMutations, usePendingMutations)
- `mobile/src/hooks/useOffline.ts` - Network status hook with reconnection detection
- `mobile/src/hooks/useApprovals.ts` - Approvals query + optimistic resolve mutation hooks
- `mobile/src/components/OfflineBanner.tsx` - Animated offline/syncing status banner
- `mobile/src/components/ApprovalCard.tsx` - Swipeable card with approve/reject gestures and haptic feedback
- `mobile/src/components/QuickAction.tsx` - Reusable action button with haptic + scale animation
- `mobile/app/approval/[id].tsx` - Full approval detail screen with quick action buttons
- `mobile/src/providers/QueryProvider.tsx` - Wired offlineMutationDefaults and configurePersistentMutations
- `mobile/src/hooks/useChat.ts` - Added offline mutation path with pending indicator
- `mobile/app/_layout.tsx` - Added OfflineBanner in auth guard
- `mobile/app/(tabs)/approvals.tsx` - Full approvals list with FlatList, pull-to-refresh, empty state
- `mobile/app/(tabs)/_layout.tsx` - Added approval badge count on tab bar

## Decisions Made
- Offline chat uses useMutation with onlineManager.isOnline() check: SSE streaming when online (token-by-token), mutation queue when offline (fire-and-forget with replay)
- configurePersistentMutations registers default mutationFn at QueryClient level so TanStack can resume mutations after app restart without the component being mounted
- usePendingMutations uses useMutationState with status='pending' filter for accurate banner count
- Swipeable direction mapping: onSwipeableOpen 'left' = user swiped right = approve, 'right' = user swiped left = reject
- Approval badge on tab bar reads from useApprovals array length rather than a separate count API endpoint

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 3 (checkpoint:human-verify) requires user to verify the complete mobile app on device/simulator
- All 4 plans in Phase 36 have code complete -- the mobile companion app is fully built
- After device verification, the mobile app is ready for EAS Build and TestFlight/internal distribution

## Self-Check: PASSED

- All 12 files verified present on disk
- Commit 6adef62e (Task 1) verified in git log
- Commit 74dce051 (Task 2) verified in git log
- TypeScript type check passes clean (no errors)

---
*Phase: 36-mobile-experience*
*Completed: 2026-03-28*
