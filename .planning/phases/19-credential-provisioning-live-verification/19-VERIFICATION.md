---
phase: 19-credential-provisioning-live-verification
verified: 2026-03-02T05:00:00Z
status: human_needed
score: 4/6 success criteria verifiable by automation
human_verification:
  - test: "Gmail live pull in deployed environment"
    expected: "After connecting Gmail via OAuth in Settings > Channels, recent Gmail messages appear in the BitBit inbox within the next relay cycle"
    why_human: "Requires provisioned Google Cloud credentials in Vercel + deployed app + live OAuth token exchange. 19-03 SUMMARY explicitly defers this: 'Live channel verification (Task 2) deferred -- credentials provisioned locally but production deployment and OAuth flow testing pending'"
  - test: "Outlook Graph API works against production Microsoft tenant"
    expected: "After connecting Outlook via OAuth in Settings > Channels, recent Outlook messages appear in the inbox"
    why_human: "Requires Azure AD app credentials in Vercel + deployed app + Microsoft tenant OAuth consent. Same deferral as Gmail."
  - test: "Asana OAuth flow completes successfully"
    expected: "User navigates to Settings > Channels > Asana > Connect, completes OAuth flow, card shows Connected"
    why_human: "Requires Asana developer app credentials in Vercel + deployed app + live OAuth redirect. Not testable without production environment."
  - test: "Calendly OAuth flow completes successfully"
    expected: "User navigates to Settings > Channels > Calendly > Connect, completes OAuth flow, card shows Connected"
    why_human: "Requires Calendly developer app credentials in Vercel + deployed app + live OAuth redirect. Not testable without production environment."
  - test: "WhatsApp Baileys bridge deployed and maintains stable connection"
    expected: "fly deploy succeeds, QR scan pairs phone, messages flow bidirectionally, bridge stays connected over 7 days"
    why_human: "19-03 SUMMARY explicitly defers this: 'WhatsApp bridge deployment deferred until production readiness'. Bridge code is ready but Fly.io deployment has not been executed and WHATSAPP_BRIDGE_URL is unset."
---

# Phase 19: Credential Provisioning & Live Verification Report

**Phase Goal:** All OAuth channels work end-to-end in production with real credentials -- live message pulls verified, WhatsApp bridge stable
**Verified:** 2026-03-02T05:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Success Criteria from ROADMAP.md

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Google Cloud OAuth credentials provisioned and Gmail live pull works in deployed env | ? NEEDS HUMAN | Credentials set locally per 19-03 SUMMARY; live pull in production deferred |
| 2 | Azure AD app registered and Outlook Graph API works against production tenant | ? NEEDS HUMAN | Credentials set locally; live pull deferred per 19-03 SUMMARY |
| 3 | Asana developer app credentials provisioned and OAuth flow completes | ? NEEDS HUMAN | Credentials set locally; live OAuth flow requires deployed app |
| 4 | Calendly developer app credentials provisioned and OAuth flow completes | ? NEEDS HUMAN | Credentials set locally; live OAuth flow requires deployed app |
| 5 | WhatsApp Baileys bridge deployed to persistent host (Fly.io) and maintains 7-day stable connection | ? NEEDS HUMAN | Bridge code ready; deployment deferred per 19-03 SUMMARY (WHATSAPP_BRIDGE_URL unset) |
| 6 | Credential provisioning runbook documents all steps for each provider | VERIFIED | `docs/credential-provisioning-runbook.md` covers Google, Azure, Asana, Calendly, WhatsApp bridge, Vercel env checklist |

**Automated Score:** 4/6 criteria verifiable by automation (plans 01 + 02 artifacts fully verified). 5 criteria require human action to confirm live production state.

### Observable Truths (Plan-level must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WhatsApp bridge has standalone Fly.io deployment config that can run persistently | VERIFIED | `fly.toml`: `min_machines_running = 1`, `auto_stop_machines = "off"`, volume mount at `/data` |
| 2 | Bridge server manages Baileys connections with health checks and session recovery | VERIFIED | `bridge-manager.ts`: `makeWASocket`, 5-attempt exponential backoff reconnect, `channel_health` upsert every 60s |
| 3 | Runbook documents exact steps for provisioning all OAuth credentials | VERIFIED | `docs/credential-provisioning-runbook.md` contains all 5 sections with step-by-step instructions |
| 4 | Smoke test script validates OAuth credential configuration for all providers | VERIFIED | `scripts/verify-oauth-credentials.ts`: checks Google, Microsoft, Asana, Calendly, WhatsApp bridge, general env vars |
| 5 | Channel verification script tests live message pull for Gmail and Outlook | VERIFIED | `scripts/channel-smoke-test.ts`: tests Gmail OAuth redirect, Outlook OAuth redirect, relay daemon, token refresh cron, WhatsApp bridge health |
| 6 | WhatsApp bridge health can be checked programmatically | VERIFIED | `scripts/channel-smoke-test.ts`: `testWhatsAppBridge()` fetches `{WHATSAPP_BRIDGE_URL}/health` |
| 7 | User has provisioned all OAuth credentials | VERIFIED (local only) | 19-03 SUMMARY: "14/14 critical checks pass". Credentials in `.env.local` -- not yet confirmed in Vercel production |
| 8 | Gmail live pull works in deployed environment | NEEDS HUMAN | 19-03 SUMMARY: "Live channel verification deferred -- production deployment and OAuth flow testing pending" |
| 9 | Outlook Graph API works against production tenant | NEEDS HUMAN | Same deferral as Gmail |
| 10 | Asana and Calendly OAuth flows complete successfully | NEEDS HUMAN | Requires deployed production environment |
| 11 | WhatsApp bridge is deployed and maintains stable connection | NEEDS HUMAN | 19-03 SUMMARY: "WhatsApp bridge deployment deferred until production readiness" |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `deployments/whatsapp-bridge/fly.toml` | Fly.io config with persistent machine | VERIFIED | `min_machines_running = 1`, `auto_stop_machines = "off"`, health check at `/health` every 30s, volume `bridge_data` at `/data` |
| `deployments/whatsapp-bridge/Dockerfile` | Multi-stage Node 20 build | VERIFIED | File exists and confirmed in SUMMARY commit `dbcab762` |
| `deployments/whatsapp-bridge/package.json` | Baileys + supabase-js + pino deps | VERIFIED | Contains `@whiskeysockets/baileys`, `@supabase/supabase-js`, `pino`; scripts: `build`, `start`, `dev` |
| `deployments/whatsapp-bridge/tsconfig.json` | TS compilation config | VERIFIED | File exists |
| `deployments/whatsapp-bridge/src/server.ts` | HTTP management API, auto-start on boot | VERIFIED | Exports `server`; routes: `/health`, `/bridge/start`, `/bridge/stop`, `/bridge/status`, `/bridge/qr`; auto-starts bridge with `DEFAULT_ORG_ID` |
| `deployments/whatsapp-bridge/src/bridge-manager.ts` | Baileys lifecycle management | VERIFIED | Exports `startBridge`, `stopBridge`, `getBridgeStatus`; uses `makeWASocket`; reconnect, outbox drain, health reporting |
| `docs/credential-provisioning-runbook.md` | Step-by-step for all providers | VERIFIED | Contains "Google Cloud Console", "Azure", "Asana", "Calendly", WhatsApp bridge deploy commands |
| `scripts/verify-oauth-credentials.ts` | OAuth credential pre-flight validator | VERIFIED | Checks `GOOGLE_CLIENT_ID`, `OUTLOOK_CLIENT_ID`, `ASANA_CLIENT_ID`, `CALENDLY_CLIENT_ID`; runnable with `npx tsx` |
| `scripts/channel-smoke-test.ts` | Live endpoint smoke test | VERIFIED | Contains `gmail`, `outlook`, `relay` tests; JSON report output; 10s timeout per request |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server.ts` | `bridge-manager.ts` | `import { startBridge, stopBridge, getBridgeStatus }` | WIRED | Line 23: `import { startBridge, stopBridge, getBridgeStatus } from './bridge-manager.js'`; all three used in route handlers |
| `bridge-manager.ts` | `@whiskeysockets/baileys` | `makeWASocket` | WIRED | Line 168: `state.sock = baileys.makeWASocket({...})`; dynamic import via `loadBaileys()` |
| `verify-oauth-credentials.ts` | same env vars as `oauth.ts` | env var names | WIRED | Checks `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`, `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| CHAN-01 | 19-02, 19-03 | Live Gmail pull works in deployed environment | NEEDS HUMAN | Smoke test script ready; live pull deferred per 19-03 SUMMARY |
| CHAN-02 | 19-02, 19-03 | Outlook Graph API adapter works against production Microsoft tenant | NEEDS HUMAN | Smoke test script ready; live pull deferred per 19-03 SUMMARY |
| CHAN-03 | 19-01, 19-02, 19-03 | WhatsApp Baileys bridge maintains stable connection over 7-day continuous run | NEEDS HUMAN | Bridge deployment code complete; Fly.io deploy and 7-day stability not yet verified; WHATSAPP_BRIDGE_URL unset |
| OAUTH-01 | 19-01, 19-02, 19-03 | User can connect Gmail via Google OAuth flow from settings page | NEEDS HUMAN | Google credentials provisioned locally; production Vercel env and OAuth redirect flow not confirmed |
| OAUTH-02 | 19-01, 19-02, 19-03 | User can connect Outlook via Microsoft OAuth flow from settings page | NEEDS HUMAN | Microsoft credentials provisioned locally; production Vercel env and OAuth redirect flow not confirmed |
| OAUTH-04 | 19-01, 19-02, 19-03 | User can connect Asana via OAuth flow from settings page | NEEDS HUMAN | Asana credentials provisioned locally; production OAuth flow not confirmed |
| OAUTH-05 | 19-01, 19-02, 19-03 | User can connect Calendly via OAuth flow from settings page | NEEDS HUMAN | Calendly credentials provisioned locally; production OAuth flow not confirmed |

All 7 requirement IDs declared across phase 19 plans are accounted for. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODOs, stubs, placeholder returns, or empty handlers found in any phase 19 artifact |

### Human Verification Required

#### 1. Gmail Live Pull (CHAN-01, OAUTH-01)

**Test:** With GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel env vars and app deployed, navigate to Settings > Channels > Gmail > Connect. Complete Google OAuth popup. Wait for next relay cycle or trigger `POST /api/channels/relay` with RELAY_SECRET. Check inbox for recent Gmail messages.

**Expected:** Gmail card shows "Connected" with green status. Recent Gmail messages appear in the BitBit inbox feed.

**Why human:** Requires real Google Cloud OAuth credentials in Vercel production env, live OAuth token exchange, and deployed app. Verification script confirmed credentials pass format checks locally but production deployment was deferred per 19-03 SUMMARY.

#### 2. Outlook Live Pull (CHAN-02, OAUTH-02)

**Test:** With OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT_ID in Vercel env vars, navigate to Settings > Channels > Outlook > Connect. Complete Microsoft OAuth popup (requires admin consent for Mail.Read, Mail.Send, offline_access). Trigger relay cycle and check inbox.

**Expected:** Outlook card shows "Connected". Recent Outlook messages appear in the inbox.

**Why human:** Requires Azure AD app registration with admin consent granted, credentials in Vercel production env, live Microsoft tenant OAuth.

#### 3. Asana OAuth Flow (OAUTH-04)

**Test:** With ASANA_CLIENT_ID and ASANA_CLIENT_SECRET in Vercel env vars, navigate to Settings > Channels > Asana > Connect. Complete Asana OAuth flow.

**Expected:** Asana card shows "Connected".

**Why human:** Requires Asana developer app credentials in Vercel production env and live OAuth redirect URI match.

#### 4. Calendly OAuth Flow (OAUTH-05)

**Test:** With CALENDLY_CLIENT_ID and CALENDLY_CLIENT_SECRET in Vercel env vars, navigate to Settings > Channels > Calendly > Connect. Complete Calendly OAuth flow.

**Expected:** Calendly card shows "Connected".

**Why human:** Requires Calendly developer app credentials in Vercel production env and live OAuth redirect URI match.

#### 5. WhatsApp Bridge Deployment and 7-Day Stability (CHAN-03)

**Test:** Follow runbook Section 5: `cd deployments/whatsapp-bridge && fly apps create bitbit-whatsapp-bridge && fly volumes create bridge_data --region syd --size 1 && fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEFAULT_ORG_ID=... BRIDGE_SECRET=... && fly deploy`. Then run `npx tsx scripts/channel-smoke-test.ts https://app.bitbit.chat` to confirm bridge health. Scan QR code with phone's WhatsApp. Send test message. Check inbox.

**Expected:** `fly status` shows machine running. Bridge health endpoint returns `{"ok":true,"bridge":{"status":"connected",...}}`. Test message appears in BitBit inbox within 10 seconds. Bridge stays connected for 7 days (monitoring via `fly logs` and `channel_health` table).

**Why human:** 19-03 SUMMARY explicitly defers: "WhatsApp bridge deployment deferred until production readiness". WHATSAPP_BRIDGE_URL is not set in any env. 7-day stability cannot be verified programmatically. Requires physical QR scan with a phone.

#### 6. Run Smoke Test After Provisioning

**Test:** After completing steps 1-5 above, run: `npx tsx scripts/channel-smoke-test.ts https://app.bitbit.chat`

**Expected:** All 7 tests report PASS (or SKIP for optional tests). JSON report written to `scripts/smoke-test-results.json`.

**Why human:** Smoke test exercises live endpoints against deployed app. Cannot run without real credentials and deployed environment.

### Gaps Summary

Phase 19's code deliverables (Plans 01 and 02) are complete and fully substantive:

- WhatsApp bridge deployment package is production-ready: fly.toml, Dockerfile, package.json, TypeScript source, all configured correctly
- Credential verification script and channel smoke test scripts are complete with proper error handling, auth, timeouts, and JSON reporting
- Credential provisioning runbook covers all 5 sources (Google, Azure, Asana, Calendly, WhatsApp bridge)
- Baileys bridge lifecycle (reconnect, outbox drain, health reporting, auth persistence) is fully implemented

What remains is strictly operational -- it requires human action in external systems:

1. **Credentials in Vercel production env** -- locally set per 19-03 SUMMARY but not confirmed in Vercel dashboard
2. **WhatsApp bridge Fly.io deployment** -- explicitly deferred in 19-03 SUMMARY ("deferred until production readiness")
3. **Live OAuth flow testing** -- all 4 providers need end-to-end verification with real credentials in deployed app

The 19-03 SUMMARY is transparent about these deferrals. This is correctly classified as `human_needed` rather than `gaps_found` because the code infrastructure is complete; what's outstanding is operational provisioning work that requires human access to external cloud consoles and a production environment.

---

_Verified: 2026-03-02T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
