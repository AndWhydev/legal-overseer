---
phase: 36-mobile-experience
plan: 03
subsystem: notifications, api, database, mobile
tags: [expo-notifications, expo-push-api, push-tokens, react-native, supabase-rls, asyncstorage]

# Dependency graph
requires:
  - phase: 36-01
    provides: Expo mobile app scaffold with auth, apiClient, supabase client
provides:
  - push_tokens DB table with RLS for device token storage
  - Server-side Expo Push API dispatcher (sendPushNotification, sendPushToUser)
  - POST /api/push/register endpoint with Bearer + cookie auth
  - Push notification trigger in approval-queue createApproval
  - Push notification trigger in workflow-executor completeWorkflow
  - Mobile push token registration on login
  - NotificationProvider with foreground/tap handlers and AsyncStorage persistence
  - Activity tab with notification history, read/unread, badge count
affects: [36-04, mobile-offline, approvals, workflows]

# Tech tracking
tech-stack:
  added: [expo-notifications, expo-device, expo-constants, asyncstorage-persistence]
  patterns: [expo-push-service-dispatch, fire-and-forget-push, lazy-import-push-wiring, notification-provider-pattern]

key-files:
  created:
    - personal-assistant/supabase/migrations/20260328100000_push_tokens.sql
    - personal-assistant/src/lib/notifications/push-dispatcher.ts
    - personal-assistant/src/lib/notifications/push-dispatcher.test.ts
    - personal-assistant/src/app/api/push/register/route.ts
    - mobile/src/lib/push.ts
    - mobile/src/providers/NotificationProvider.tsx
    - mobile/src/hooks/useNotifications.ts
  modified:
    - personal-assistant/src/lib/agent/approval-queue.ts
    - personal-assistant/src/lib/roles/workflow-executor.ts
    - mobile/app/_layout.tsx
    - mobile/app/(tabs)/activity.tsx
    - mobile/app/(tabs)/_layout.tsx

key-decisions:
  - "Static import for getServiceClient in push-dispatcher (not dynamic) for testability with vi.mock"
  - "Lazy dynamic import for push-dispatcher in approval-queue and workflow-executor to avoid circular deps"
  - "Fire-and-forget push: all push calls wrapped in catch -- push failure never breaks calling code path"
  - "NotificationProvider only mounts when authenticated (conditional in AuthGuard)"
  - "Notifications persisted to AsyncStorage with 100-item cap for offline survival"
  - "Unread badge on Activity tab via useNotifications hook"

patterns-established:
  - "Fire-and-forget push wiring: import('@/lib/notifications/push-dispatcher').then(fn).catch(() => {})"
  - "NotificationProvider pattern: foreground listener + tap handler + AppState re-register + AsyncStorage persistence"

requirements-completed: [MOB-02]

# Metrics
duration: 22min
completed: 2026-03-28
---

# Phase 36 Plan 03: Push Notifications Summary

**End-to-end push notification pipeline: Expo Push API dispatcher, push_tokens DB with RLS, mobile token registration on login, approval/workflow triggers, and activity feed with badge count**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-27T17:01:44Z
- **Completed:** 2026-03-27T17:23:44Z
- **Tasks:** 2 (Task 1 TDD with 8 tests)
- **Files modified:** 12

## Accomplishments
- Push tokens DB table with RLS policies for user self-manage and service role read
- Server-side Expo Push API dispatcher with batch sending, invalid token cleanup, graceful error handling
- Registration endpoint accepting Bearer + cookie auth with token upsert
- Approval queue and workflow executor now fire push notifications on events
- Mobile push token registered automatically after login, refreshed on foreground
- Activity tab shows notification history with read/unread, tap navigation, pull-to-refresh
- Badge count on Activity tab shows unread notification count

## Task Commits

Each task was committed atomically:

1. **Task 1: Push tokens DB + server-side Expo Push dispatcher + registration endpoint** - `ad1beb04` (feat)
2. **Task 2: Mobile push token registration + notification handler + activity feed** - `f6eecf68` (feat)

## Files Created/Modified
- `personal-assistant/supabase/migrations/20260328100000_push_tokens.sql` - Push tokens table with user_id, token, platform, RLS
- `personal-assistant/src/lib/notifications/push-dispatcher.ts` - sendPushNotification, sendPushToUser, cleanupInvalidTokens
- `personal-assistant/src/lib/notifications/push-dispatcher.test.ts` - 8 tests for payload format, batch, cleanup, graceful errors
- `personal-assistant/src/app/api/push/register/route.ts` - POST endpoint for push token registration
- `personal-assistant/src/lib/agent/approval-queue.ts` - Added push notification trigger on createApproval
- `personal-assistant/src/lib/roles/workflow-executor.ts` - Added push notification trigger on workflow completion
- `mobile/src/lib/push.ts` - registerPushToken, setupNotificationHandler, handleNotificationResponse
- `mobile/src/providers/NotificationProvider.tsx` - Notification context with badge, persistence, listeners
- `mobile/src/hooks/useNotifications.ts` - Thin wrapper around NotificationProvider context
- `mobile/app/_layout.tsx` - Added NotificationProvider (conditional on auth)
- `mobile/app/(tabs)/activity.tsx` - Full notification history FlatList with navigation
- `mobile/app/(tabs)/_layout.tsx` - Badge count on Activity tab icon

## Decisions Made
- Used static import for getServiceClient in push-dispatcher instead of dynamic import, for reliable vi.mock interception in tests
- Lazy dynamic import pattern for push-dispatcher in approval-queue and workflow-executor to avoid circular dependencies and keep push optional
- All push notification calls are fire-and-forget with catch blocks -- push failure never crashes the calling code path
- NotificationProvider only mounts when user is authenticated (conditional render in AuthGuard)
- Notifications stored in AsyncStorage with 100-item cap for offline persistence
- Re-register push token on app foreground via AppState listener to handle token refresh

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 committed in concurrent 36-02 commit**
- **Found during:** Task 1 commit
- **Issue:** Task 1 files were staged when a concurrent agent's commit for 36-02 executed, pulling Task 1 files into that commit
- **Fix:** Task 1 code is correct and committed at ad1beb04 -- just under wrong commit message label
- **Impact:** No functional impact, all files present and verified

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor commit labelling overlap from concurrent execution. All code correct and verified.

## Issues Encountered
- Dynamic import in push-dispatcher caused vi.mock to fail in tests (Vitest ESM resolution difference) -- switched to static import pattern which works correctly with vi.mock
- Pre-existing test failure in dispatcher.test.ts (email defaults test) -- out of scope, not introduced by this plan

## User Setup Required
None - no external service configuration required. Push notifications use Expo Push Service which handles APNs/FCM credential routing automatically.

## Next Phase Readiness
- Push notification pipeline fully wired end-to-end
- Activity tab ready for additional notification types
- Plan 04 (offline queue + voice input) can proceed independently
- Apple Developer Account + FCM credentials needed for production push (EAS Build handles this)

## Self-Check: PASSED

All 7 created files verified on disk. Both commit hashes (ad1beb04, f6eecf68) verified in git log.

---
*Phase: 36-mobile-experience*
*Completed: 2026-03-28*
