---
phase: 19-credential-provisioning-live-verification
plan: 01
subsystem: infra
tags: [whatsapp, baileys, fly-io, oauth, deployment, runbook]

requires:
  - phase: 14-channel-relay-oauth
    provides: "OAuth flow infrastructure and channel adapters"
  - phase: 15-whatsapp-pipeline
    provides: "Baileys bridge class and WhatsApp message processing"
provides:
  - "Standalone WhatsApp bridge Fly.io deployment (deployments/whatsapp-bridge/)"
  - "Credential provisioning runbook for all OAuth providers"
  - "Bridge management HTTP API (health, start, stop, status, QR)"
affects: [19-02, 19-03, whatsapp-production, oauth-provisioning]

tech-stack:
  added: ["@whiskeysockets/baileys (bridge deployment)", "pino (bridge logging)"]
  patterns: ["Standalone Fly.io worker with volume mount for persistent state", "Bearer token auth on management endpoints"]

key-files:
  created:
    - "deployments/whatsapp-bridge/fly.toml"
    - "deployments/whatsapp-bridge/Dockerfile"
    - "deployments/whatsapp-bridge/package.json"
    - "deployments/whatsapp-bridge/tsconfig.json"
    - "deployments/whatsapp-bridge/src/server.ts"
    - "deployments/whatsapp-bridge/src/bridge-manager.ts"
    - "docs/credential-provisioning-runbook.md"
  modified: []

key-decisions:
  - "Separate Fly.io app (bitbit-whatsapp-bridge) from agent worker (bitbit-workers) due to persistent connection requirement"
  - "Volume mount at /data for auth state persistence across deploys"
  - "5 reconnect attempts with 3x exponential backoff (5s to 405s) then notification alert"
  - "Health reporting every 60s to channel_health table via upsert"
  - "Bridge management API uses Bearer token auth (BRIDGE_SECRET) on all POST routes, health endpoint public"

patterns-established:
  - "Standalone Fly.io deployment: fly.toml + Dockerfile + package.json + tsconfig.json in deployments/ subdirectory"
  - "Management API pattern: public health + authenticated management endpoints"

requirements-completed: [CHAN-03, OAUTH-01, OAUTH-02, OAUTH-04, OAUTH-05]

duration: 12min
completed: 2026-03-02
---

# Phase 19 Plan 01: WhatsApp Bridge Deployment & Credential Provisioning Summary

**Standalone Fly.io WhatsApp bridge with Baileys lifecycle management and comprehensive OAuth credential provisioning runbook for Google, Azure, Asana, and Calendly**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-02T04:14:27Z
- **Completed:** 2026-03-02T04:26:27Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Complete Fly.io deployment for WhatsApp Baileys bridge with persistent volume, never-stop machine, and health monitoring
- Bridge manager with reconnect logic (5 attempts, exponential backoff), outbox drain, auth state persistence to filesystem and Supabase
- HTTP management API with health check, bridge start/stop/status/QR endpoints
- Comprehensive credential provisioning runbook covering all 4 OAuth providers plus WhatsApp bridge deployment

## Task Commits

Each task was committed atomically:

1. **Task 1: Create standalone WhatsApp bridge Fly.io deployment** - `dbcab762` (feat)
2. **Task 2: Create credential provisioning runbook** - `26eb8034` (docs)

## Files Created/Modified

- `deployments/whatsapp-bridge/fly.toml` - Fly.io config with persistent machine, volume mount, health check
- `deployments/whatsapp-bridge/Dockerfile` - Multi-stage Node 20 slim build
- `deployments/whatsapp-bridge/package.json` - Dependencies: baileys, supabase-js, pino
- `deployments/whatsapp-bridge/tsconfig.json` - TypeScript compilation config
- `deployments/whatsapp-bridge/src/server.ts` - HTTP server with management API routes and auto-start
- `deployments/whatsapp-bridge/src/bridge-manager.ts` - Baileys bridge lifecycle, reconnect, outbox drain, health reporting
- `docs/credential-provisioning-runbook.md` - Step-by-step provisioning for Google, Azure, Asana, Calendly, WhatsApp

## Decisions Made

- Separate Fly.io app from agent worker due to persistent WebSocket connection requirement
- Volume mount at /data for auth state survival across deploys
- 5 reconnect attempts with 3x exponential backoff (5s, 15s, 45s, 135s, 405s) then notification alert
- Health reporting every 60s via channel_health table upsert
- Public health endpoint for Fly.io monitoring, Bearer token auth on management routes
- Bridge auto-starts on server boot using DEFAULT_ORG_ID environment variable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. The credential provisioning runbook documents the steps users need to take when ready to connect real providers.

## Next Phase Readiness

- WhatsApp bridge deployment is ready for `fly deploy` once Fly.io secrets are set
- Runbook provides step-by-step guide for provisioning all OAuth credentials
- Plan 19-02 can proceed with live OAuth flow verification
- Plan 19-03 can proceed with smoke test scripts

---
*Phase: 19-credential-provisioning-live-verification*
*Completed: 2026-03-02*
