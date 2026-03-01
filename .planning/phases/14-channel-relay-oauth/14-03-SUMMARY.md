---
phase: 14-channel-relay-oauth
plan: 03
subsystem: ui
tags: [react, channels, oauth, sheet, dialog, tailwind]

# Dependency graph
requires:
  - phase: 14-01
    provides: OAuth provider registration and channel DB schema
  - phase: 14-02
    provides: Channel connect/disconnect APIs and token refresh
provides:
  - Channel cards grid with 6 channels (Gmail, Outlook, WhatsApp, Asana, Calendly, Stripe)
  - OAuth popup connect flow for 4 channels
  - API key modal for Stripe, WhatsApp QR pairing shell
  - Channel config drawer with channel-specific settings
  - Connect/disconnect UI with status indicators and toasts
affects: [14-04, 14-05, 15-whatsapp-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [popup-oauth-flow, channel-connect-modal, sheet-config-drawer]

key-files:
  created:
    - personal-assistant/src/components/channels/connect-modal.tsx
    - personal-assistant/src/components/channels/channel-config-drawer.tsx
  modified:
    - personal-assistant/src/components/channels/channel-card.tsx
    - personal-assistant/src/components/channels/channel-grid.tsx
    - personal-assistant/src/components/channels/index.ts

key-decisions:
  - "OAuth popup (600x700) stays on settings page per user decision"
  - "Static 6-channel list always rendered regardless of adapter availability"
  - "WhatsApp QR is a UI shell only -- actual QR generation deferred to Phase 15"

patterns-established:
  - "ConnectFlow type: 'oauth' | 'api_key' | 'whatsapp_qr' determines connect UX"
  - "Config drawer uses channel-type switch for field rendering"

requirements-completed: [OAUTH-07, OAUTH-03, OAUTH-06]

# Metrics
duration: 13min
completed: 2026-03-01
---

# Phase 14 Plan 03: Channel Settings UI Summary

**6-channel card grid with OAuth popup, API key modal, WhatsApp QR shell, and slide-out config drawer**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-01T13:18:33Z
- **Completed:** 2026-03-01T13:31:34Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Rebuilt channel cards with connect/disconnect flows, green status dots, amber error badges, and message counts
- Created ConnectModal with two modes: Stripe API key input and WhatsApp QR pairing placeholder
- Updated channel grid to always show all 6 target channels with OAuth popup, query param toast handling
- Built ChannelConfigDrawer with sync frequency, relay toggle, and per-channel fields (folder filters, workspace selectors, event type checkboxes, session status)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebuild channel cards with connection management** - `53f442ad` (feat)
2. **Task 2: Create channel config drawer** - `a2794c87` (feat)

## Files Created/Modified
- `personal-assistant/src/components/channels/channel-card.tsx` - Rewritten with connect/disconnect, status dots, error badges, 3 connect flow types
- `personal-assistant/src/components/channels/channel-grid.tsx` - Static 6-channel list, OAuth popup, ConnectModal/Drawer integration, query param handling
- `personal-assistant/src/components/channels/connect-modal.tsx` - Dialog modal with API key and WhatsApp QR modes
- `personal-assistant/src/components/channels/channel-config-drawer.tsx` - Sheet drawer with sync freq, relay toggle, channel-specific config fields
- `personal-assistant/src/components/channels/index.ts` - Updated exports

## Decisions Made
- OAuth popup window (600x700) with polling for close -- keeps user on settings page per user decision
- Static 6-channel list always rendered regardless of backend adapter availability
- WhatsApp QR modal is a UI shell only -- actual Baileys bridge QR generation deferred to Phase 15
- Config drawer uses shadcn Sheet (side=right) with channel-type switch for rendering appropriate fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all pre-existing TS errors are monorepo SupabaseClient type mismatches, not related to this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Channel UI complete, ready for end-to-end testing in 14-05
- Config drawer endpoints (GET/PATCH /api/channels/{channel}/config) expected from API layer
- WhatsApp QR generation requires Phase 15 Baileys bridge

## Self-Check: PASSED

- All 5 files verified present on disk
- Commit 53f442ad found (Task 1)
- Commit a2794c87 found (Task 2)
- channel-card.tsx: 241 lines (min 60)
- channel-config-drawer.tsx: 390 lines (min 40)
- connect-modal.tsx: 240 lines (min 30)

---
*Phase: 14-channel-relay-oauth*
*Completed: 2026-03-01*
