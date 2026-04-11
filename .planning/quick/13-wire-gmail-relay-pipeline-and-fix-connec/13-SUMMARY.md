# Quick Task 13: Wire Gmail Relay Pipeline — Summary

**Completed:** 2026-03-14

## Changes

### Task 1: Add relay_enabled to OAuth callback upsert
- **File:** `personal-assistant/src/app/callback/[provider]/route.ts` (line 164)
- **Change:** Added `relay_enabled: true` to the `channel_connections` upsert object
- **Why:** The cron job filters `WHERE relay_enabled=true`, but the OAuth callback never set this field. Result: OAuth-connected channels (Gmail, Outlook, etc.) were silently skipped during polling.

### Task 2: Wire connections page to render ConnectionsGrid
- **File:** `personal-assistant/src/app/dashboard/connections/page.tsx`
- **Change:** Replaced `return null` with Suspense-wrapped ConnectionsGrid component
- **Why:** Users had no UI to initiate Gmail OAuth connection — the page was a dead end.

## Impact
- **Pipeline unblocked:** User connects Gmail via UI → OAuth callback → `channel_connections` row with `relay_enabled=true` → cron polls every 5 min → relay daemon pulls messages → inserted into `channel_messages` → appears in inbox
- **All OAuth channels benefit:** Outlook, Google Calendar, Asana, Calendly, GA4 all use the same callback and will now have relay_enabled=true
- **Zero breaking changes:** Non-OAuth channels (Stripe, WhatsApp) already set relay_enabled correctly in their own connect route

## Verification
- `grep relay_enabled callback/[provider]/route.ts` → line 164: `relay_enabled: true`
- `grep ConnectionsGrid connections/page.tsx` → imported and rendered
- TypeScript check: clean (only pre-existing e2e test errors)
