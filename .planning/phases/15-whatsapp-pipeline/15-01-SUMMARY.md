---
phase: 15-whatsapp-pipeline
plan: 01
subsystem: channels
tags: [whatsapp, baileys, whisper, voice, transcription, websocket]

# Dependency graph
requires:
  - phase: 14-channel-relay-oauth
    provides: "channel_messages table, whatsapp_sessions table, whatsapp-monitor, whatsapp-parser, webhook route"
provides:
  - "BaileysBridge class with QR auth, message receive/send, reconnection"
  - "Bridge management API (POST start, GET status/QR)"
  - "Voice note transcription via OpenAI Whisper"
  - "Audio message handling in webhook route"
  - "WHATS-05 Baileys vs Cloud API trade-off documentation"
affects: [15-whatsapp-pipeline, 16-confidence-routing]

# Tech tracking
tech-stack:
  added: ["@whiskeysockets/baileys (optional)", "OpenAI Whisper API"]
  patterns: ["Dynamic import for optional dependencies", "Voice note transcription pipeline", "Outbox drain polling pattern"]

key-files:
  created:
    - personal-assistant/src/lib/channels/baileys-bridge.ts
    - personal-assistant/src/app/api/channels/whatsapp/bridge/route.ts
    - personal-assistant/src/lib/channels/whatsapp-voice.ts
  modified:
    - personal-assistant/src/app/api/channels/whatsapp/route.ts
    - personal-assistant/src/lib/channels/whatsapp-parser.ts

key-decisions:
  - "Dynamic import for Baileys — module loads without library installed, isBaileysAvailable() check"
  - "Uint8Array wrapper for Buffer-to-Blob conversion — fixes Node.js type compatibility"
  - "Voice note prefix [Voice note] prepended in parser for lenient speech-origin parsing"

patterns-established:
  - "Optional dependency pattern: dynamic import + availability check function"
  - "Voice transcription pipeline: download -> Whisper API -> text -> conversation manager"
  - "Outbox drain: poll whatsapp_outbox every 5s, send via Baileys, update status"

requirements-completed: [WHATS-01, WHATS-05, CHAN-03]

# Metrics
duration: 11min
completed: 2026-03-02
---

# Phase 15 Plan 01: Baileys Bridge & Voice Transcription Summary

**Baileys WhatsApp bridge with QR auth, message receive/send loop, and Whisper voice note transcription for both bridge and Cloud API webhook paths**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-01T15:59:51Z
- **Completed:** 2026-03-01T16:10:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- BaileysBridge class with full lifecycle: QR pairing, auth persistence to Supabase, message receive, outbox drain, reconnection with exponential backoff
- Bridge management API at /api/channels/whatsapp/bridge with POST (start) and GET (status/QR) endpoints
- Voice note transcription service using OpenAI Whisper API, reusing same pattern as existing /api/ai/voice/route.ts
- Webhook route extended to handle both text and audio message types from Meta Cloud API
- whatsapp-parser.ts adds [Voice note] prefix for speech-origin messages to aid lenient parsing
- WHATS-05 Baileys vs Cloud API trade-off documentation with migration path in JSDoc header

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Baileys bridge module and management API** - `3e5a901e` (feat)
2. **Task 2: Add voice note transcription and update webhook for audio messages** - `bbb3420c` (feat)

## Files Created/Modified
- `personal-assistant/src/lib/channels/baileys-bridge.ts` - Baileys connection manager with QR, auth persistence, message loop, outbox drain, reconnection
- `personal-assistant/src/app/api/channels/whatsapp/bridge/route.ts` - HTTP endpoint for bridge lifecycle management
- `personal-assistant/src/lib/channels/whatsapp-voice.ts` - Voice note download (Cloud API) and Whisper transcription
- `personal-assistant/src/app/api/channels/whatsapp/route.ts` - Extended webhook to handle audio messages alongside text
- `personal-assistant/src/lib/channels/whatsapp-parser.ts` - Added voice note awareness with [Voice note] prefix

## Decisions Made
- Dynamic import for @whiskeysockets/baileys so the module loads cleanly without the library installed -- isBaileysAvailable() check gates all bridge operations
- Used Uint8Array wrapper for Buffer-to-Blob conversion to fix Node.js type compatibility in whatsapp-voice.ts
- Voice note prefix [Voice note] prepended in parser so conversation manager and command parser can apply more lenient matching for speech-origin input

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Buffer-to-Blob type incompatibility**
- **Found during:** Task 2 (whatsapp-voice.ts)
- **Issue:** `new Blob([audioBuffer])` fails TypeScript check because Node.js Buffer is not assignable to BlobPart
- **Fix:** Wrapped with `new Uint8Array(audioBuffer)` before passing to Blob constructor
- **Files modified:** personal-assistant/src/lib/channels/whatsapp-voice.ts
- **Verification:** TypeScript compiles cleanly for whatsapp-voice.ts
- **Committed in:** bbb3420c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the Buffer type fix documented above.

## User Setup Required
- Install `@whiskeysockets/baileys` when ready to use bridge: `npm i @whiskeysockets/baileys`
- Ensure `OPENAI_API_KEY` is set for voice transcription
- Baileys bridge requires a persistent process (not serverless) -- suitable for VPS/Fly.io worker

## Next Phase Readiness
- Bridge module ready for integration with QR connect modal (Phase 15 subsequent plans)
- Voice pipeline ready end-to-end for both Baileys and Cloud API paths
- Both paths converge at processWhatsAppMessage -> conversation-manager -> agent dispatch

---
## Self-Check: PASSED

All 5 files verified present. Both task commits (3e5a901e, bbb3420c) verified in git log.

---
*Phase: 15-whatsapp-pipeline*
*Completed: 2026-03-02*
