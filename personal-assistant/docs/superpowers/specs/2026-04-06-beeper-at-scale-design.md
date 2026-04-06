# Beeper-at-Scale — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Managed Beeper bridge infrastructure for multi-tenant messaging — iMessage, WhatsApp, Android Messages — with per-user Fly Machines, shared Matrix homeserver, tiered lifecycle, and Baileys deprecation.

---

## 1. Problem

BitBit's intelligence engine needs read/write access to users' personal messages (iMessage, WhatsApp, SMS/RCS) to deliver on its core value proposition — unified inbox, AI triage, proactive intelligence. Currently, messaging integrations are fragile (Baileys for WhatsApp, local SQLite for iMessage) and don't scale beyond a single user.

## 2. Goal

A managed messaging infrastructure where:
- Users connect iMessage, WhatsApp, and Android Messages from the BitBit dashboard with zero technical knowledge
- Beeper/Matrix bridges run as invisible infrastructure — users never see Matrix, Beeper, or bridge terminology
- Each user gets isolated bridge compute on Fly.io, automatically provisioned and managed
- Messages flow in real-time via webhook (not polling) through the existing connection pipeline
- The system scales to 500+ users with tiered lifecycle management to control costs
- WhatsApp migrates from Baileys to Beeper, consolidating all messaging through one transport layer

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BitBit Dashboard                      │
│  "Connect iMessage"  "Connect WhatsApp"  "Connect SMS"  │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   BitBit API (Vercel)    │
│                          │
│  POST /api/bridges       │  ← provisions new bridge
│  DELETE /api/bridges/:id │  ← tears down bridge
│  POST /api/bridges/wake  │  ← wakes suspended bridge
│                          │
│  POST /api/connections/  │  ← existing webhook ingest
│       {id}/webhook       │
└──────────┬───────────────┘
           │ Fly Machines API
           ▼
┌──────────────────────────────────────────────┐
│              Fly.io Infrastructure            │
│                                              │
│  ┌────────────┐  ┌────────────┐             │
│  │ User A     │  │ User B     │   ...       │
│  │ Machine    │  │ Machine    │             │
│  │            │  │            │             │
│  │ mautrix-   │  │ mautrix-   │             │
│  │ imessage   │  │ whatsapp   │             │
│  │ mautrix-   │  │ mautrix-   │             │
│  │ whatsapp   │  │ gmessages  │             │
│  └─────┬──────┘  └─────┬──────┘             │
│        │               │                     │
│        ▼               ▼                     │
│  ┌─────────────────────────────┐             │
│  │  Shared Matrix Homeserver   │             │
│  │  (Conduit on Fly)           │             │
│  │                             │             │
│  │  Webhook → BitBit on every  │             │
│  │  m.room.message event       │             │
│  └─────────────┬───────────────┘             │
│                │                             │
│  ┌─────────────────────────────┐             │
│  │  iMessage Registration      │             │
│  │  Server (shared, 1 inst)    │             │
│  └─────────────────────────────┘             │
└────────────────┼─────────────────────────────┘
                 │ HTTPS webhook
                 ▼
        BitBit webhook endpoint
        (existing /api/connections/{id}/webhook)
```

### 3.1 Key Decisions

- **One Fly Machine per user** — runs all their bridges in a single container with s6-overlay supervisor. Only connected bridges are started.
- **One shared Matrix homeserver** — Conduit (lightweight Rust implementation). All bridges connect here over Fly's private network (6PN).
- **Webhook-driven** — homeserver pushes events to BitBit in real-time. No polling.
- **Beeper is invisible** — users see "Connect iMessage", never Matrix or Beeper.
- **Registration server for iMessage** — shared service that creates virtual Apple devices. No user hardware required.
- **Providers named by protocol** — `provider: 'imessage'`, not `'beeper-imessage'`. Beeper is an implementation detail.

### 3.2 Supported Protocols

| Protocol | Bridge | Linking Method | Complexity |
|----------|--------|---------------|------------|
| iMessage | mautrix-imessage | Apple ID credentials + 2FA via registration server | High |
| WhatsApp | mautrix-whatsapp | QR code scan from phone | Low |
| Android Messages | mautrix-gmessages | QR code scan from phone | Low |

## 4. User Connection Flow

### 4.1 Provisioning

When a user clicks "Connect iMessage" in the BitBit dashboard:

1. **BitBit creates a connection record** — `org_connections` row with `provider: 'imessage'`, `status: 'provisioning'`, `transport: 'webhook'`
2. **BitBit provisions a Fly Machine** — calls Fly Machines API with the bridge image, passes config as env vars (homeserver URL, bridge protocol, webhook callback URL)
3. **Bridge requests account linking:**
   - **iMessage**: Credential form in dashboard (Apple ID + password + 2FA)
   - **WhatsApp**: QR code rendered in dashboard modal
   - **Android Messages**: QR code rendered in dashboard modal
4. **Bridge confirms link** — sends confirmation event through Matrix → webhook → BitBit. Status updates to `'connected'`.
5. **Messages flow** — every incoming message hits Matrix homeserver → webhook → existing BitBit dedup → classify → enrich → route pipeline.

### 4.2 Disconnection

User clicks "Disconnect" → BitBit calls Fly Machines API to destroy the machine → sets `org_connections.status` to `'disabled'`. Clean removal.

### 4.3 iMessage Specifics

iMessage uses a shared registration server (not per-user hardware). This creates a virtual Apple device server-side. Apple has attempted to block this approach before (Beeper Mini, Dec 2023), but the open-source mautrix-imessage project has continued to evolve.

**Mitigation**: iMessage is treated as a "best-effort" bridge. If Apple blocks registration, the bridge degrades gracefully — user gets notified, other bridges keep working. No single bridge failure takes down the system.

## 5. Bridge Infrastructure on Fly.io

### 5.1 Container Image

One base Docker image containing all three mautrix bridges:
- `mautrix-imessage`
- `mautrix-whatsapp`
- `mautrix-gmessages`

Each bridge is a separate process managed by s6-overlay. Only bridges the user has connected are started.

### 5.2 Machine Specs Per User

| Resource | Value |
|----------|-------|
| CPU | shared-cpu-1x |
| RAM | 256MB |
| Disk | 1GB persistent Fly Volume (bridge state, crypto keys, session data) |
| Cost (active) | ~$1.90/mo |
| Cost (suspended) | ~$0.15/mo (storage only) |

### 5.3 Shared Services

| Service | Purpose | Spec |
|---------|---------|------|
| Conduit homeserver | Matrix message routing + storage | shared-cpu-2x, 1GB RAM, 10GB volume |
| iMessage registration server | Virtual Apple device registration | shared-cpu-1x, 512MB RAM |

### 5.4 Networking

- Bridge machines connect to Conduit via Fly's private network (6PN) — no public internet hop
- Conduit pushes webhooks to BitBit's public Vercel URL over HTTPS
- Registration server is internal-only (never exposed publicly)

### 5.5 Tiered Lifecycle

| State | Trigger | Machine Status | Cost |
|-------|---------|---------------|------|
| Active | User messaged in last 7 days | Running | ~$1.90/mo |
| Suspended | 7 days idle | Stopped (volume preserved) | ~$0.15/mo |
| Waking | BitBit needs to send/check | Starting (5-10s cold start) | Returns to active |
| Destroyed | User disconnects | Deleted | $0 |

### 5.6 Cost Projection (500 users, 40% active)

| Component | Cost |
|-----------|------|
| 200 active bridge machines | ~$380/mo |
| 300 suspended (storage only) | ~$45/mo |
| Conduit homeserver | ~$15/mo |
| Registration server | ~$5/mo |
| **Total** | **~$445/mo** |

At $199-599 AUD/mo per user subscription, this is well under 1% of revenue per user.

## 6. Data Model

No new tables. Beeper bridge state extends the existing `org_connections` and `connection_sync_logs` system.

### 6.1 org_connections Changes

Add two new status values:

```sql
ALTER TABLE org_connections DROP CONSTRAINT org_connections_status_check;
ALTER TABLE org_connections ADD CONSTRAINT org_connections_status_check
  CHECK (status IN ('pending', 'provisioning', 'connected', 'suspended', 'error', 'disabled'));
```

Bridge-specific fields stored in `config` jsonb:

```jsonb
{
  "fly_machine_id": "d8901234abc",
  "fly_app_name": "bitbit-bridges",
  "matrix_user_id": "@bridge-abc:bitbit.chat",
  "protocol": "imessage",
  "linked_at": "2026-04-06T...",
  "last_message_at": "2026-04-06T...",
  "suspended": false
}
```

### 6.2 connection_sync_logs

Bridge lifecycle events are sync log entries:

| event | status | error_message |
|-------|--------|---------------|
| Bridge provisioned | success | "Fly Machine d890... created" |
| Account linked | success | "iMessage linked via registration server" |
| Bridge suspended | success | "Suspended after 7 days idle" |
| Bridge woken | success | "Woken for send operation" |
| Bridge error | error | "Apple registration revoked" |

### 6.3 Provider Naming

Connections use protocol names directly:

| provider | transport | description |
|----------|-----------|-------------|
| `imessage` | webhook | iMessage via Beeper bridge |
| `whatsapp` | webhook | WhatsApp via Beeper bridge |
| `android-messages` | webhook | Android Messages/RCS via Beeper bridge |

Beeper is an implementation detail in `config`, not in `provider`.

## 7. API Routes

### 7.1 Bridge Management

```
POST   /api/bridges/provision       — Create Fly Machine, start bridge, return linking info
POST   /api/bridges/link-status     — Poll for account linking completion
POST   /api/bridges/wake            — Wake a suspended bridge
POST   /api/bridges/suspend         — Suspend an idle bridge
DELETE /api/bridges/:connectionId   — Destroy machine, clean up
GET    /api/bridges/status          — List user's bridges with machine state
```

### 7.2 Provision Flow

```
POST /api/bridges/provision
Body: { protocol: 'imessage' | 'whatsapp' | 'android-messages' }

1. Verify user auth, get org_id
2. Check if connection already exists for this protocol
3. Create/update org_connections row (status: 'provisioning')
4. Call Fly Machines API:
   - Create machine from bitbit-bridges image
   - Pass env: MATRIX_HOMESERVER, BRIDGE_PROTOCOL, WEBHOOK_URL, REGISTRATION_SERVER
   - Attach 1GB volume
5. Machine boots → bridge starts → returns linking info
6. Return { connection_id, link_type: 'qr' | 'credentials', link_data: '...' }
```

### 7.3 Link Status (Dashboard Polling)

```
POST /api/bridges/link-status
Body: { connection_id }

1. Check bridge machine health via Fly API
2. Query Matrix homeserver for bridge bot status
3. Return { status: 'waiting' | 'linked' | 'error', protocol, error? }
4. If linked → update org_connections.status to 'connected'
```

Dashboard polls every 2-3 seconds during the linking flow.

### 7.4 Auth Model

Same Supabase session auth as all BitBit API routes. Fly Machines API key is a server-side secret in Vercel env vars.

## 8. Dashboard UX

### 8.1 Connection Cards

Three cards in the existing channel grid get the new provisioning flow:

| Card | Linking Method |
|------|---------------|
| iMessage | Apple ID credential form + 2FA in modal |
| WhatsApp | QR code scan in modal |
| Android Messages | QR code scan in modal |

### 8.2 Linking Modal

1. Modal opens — protocol icon, "Connecting..." spinner
2. BitBit provisions bridge — 5-10 seconds
3. QR code or credential form appears with platform-specific instructions
4. Waiting state — polls link-status every 2s
5. Connected — green checkmark, confirmation message
6. Modal closes — card shows "Connected" badge

### 8.3 Connection Detail Drawer

Existing `ConnectionDetailDrawer` works as-is. Additions:
- "Suspended" badge variant
- Note: "This bridge is sleeping to save resources. It will wake automatically when needed."
- "Sync Now" wakes the bridge if suspended

### 8.4 No New Pages

Everything within the existing Connections tab and detail drawer.

## 9. Baileys Migration

WhatsApp migrates from Baileys to the Beeper bridge after the system is proven working.

### 9.1 Sequence

1. Stand up Beeper WhatsApp bridge for the user (new QR scan)
2. Verify messages flowing through webhook pipeline
3. Update `org_connections` row — change `transport` to `'webhook'`, add Fly machine config
4. Decommission Baileys — destroy old Fly machine
5. Remove dead code — `src/lib/whatsapp/`, `src/lib/channels/baileys-bridge.ts`, `whatsapp.ts`, `whatsapp_sessions` table

### 9.2 User Impact

User re-scans a WhatsApp QR code once. Brief gap during switchover (minutes). All historical messages stay in `channel_messages`.

### 9.3 Timing

Not part of initial build. Separate task after Beeper bridge system is proven with at least one protocol.

## 10. Monitoring and Failure Handling

### 10.1 Health Cron (`/api/cron/bridge-health`, every 5 min)

1. Query `org_connections` where `config->>'fly_machine_id'` is not null and `status = 'connected'`
2. Check Fly Machine state via API
3. If crashed → attempt restart (Fly auto-restart handles most cases), log to `connection_sync_logs`
4. If restart fails 3 times → set status to `'error'`, notify user

### 10.2 Lifecycle Cron (`/api/cron/bridge-lifecycle`, daily)

1. Query connections where `config->>'last_message_at'` older than 7 days and status is `'connected'`
2. Stop Fly Machine via API
3. Update status to `'suspended'`
4. Log to `connection_sync_logs`

### 10.3 Wake-on-Demand

When BitBit needs a suspended bridge (send, sync, user opens dashboard):

1. Check `status === 'suspended'`
2. Call `/api/bridges/wake` → Fly Machines API starts machine
3. Wait 5-10 seconds for bridge reconnection
4. Proceed with operation
5. Update status to `'connected'`

### 10.4 Failure Scenarios

| Failure | Detection | Response |
|---------|-----------|----------|
| Fly Machine crashes | Health cron / Fly auto-restart | Auto-restart, log, notify after 3 failures |
| Matrix homeserver down | Webhook delivery fails | Messages queue in Conduit, deliver on recovery |
| Apple revokes iMessage | Bridge auth error | Status → error, notify user, other bridges unaffected |
| WhatsApp QR expires | Bridge disconnected | Notify user to re-scan, status → error |
| Fly API outage | Provision/wake calls fail | Return error to user, retry with backoff |
| BitBit webhook down | Conduit retries | Matrix homeserver retries with exponential backoff |

## 11. Security

### 11.1 Credentials

- **Apple ID** (iMessage): Passed to registration server over Fly 6PN. Never stored in BitBit's database, never touches Vercel. Registration server holds in memory during handshake only, then discards. Resulting device token stored encrypted on bridge's Fly Volume.
- **WhatsApp/Android session keys**: Generated during QR scan, stored on bridge Fly Volume (encrypted at rest). Never sent to BitBit.
- **Matrix access tokens**: Per-bridge bot tokens in `org_connections.config`. Used by BitBit for health checks and send operations only.
- **Fly API token**: Single server-side secret in Vercel env vars.

### 11.2 Data Flow

Messages flow: Bridge → Matrix homeserver (Conduit on Fly) → webhook → BitBit. No third-party service outside your infrastructure sees message content. The Matrix homeserver is yours, not Beeper's cloud.

### 11.3 Per-User Isolation

Each user's bridges run in a separate Fly Machine with its own filesystem. One user's bridge crash or compromise cannot access another user's data. Conduit enforces room-level access control — each bridge bot only sees its own rooms.

## 12. Out of Scope

- Beeper as a user-facing brand (it's invisible infrastructure)
- Additional protocols beyond iMessage, WhatsApp, Android Messages (can be added later with same pattern)
- End-to-end encryption passthrough (messages are decrypted at the bridge, as with any bridge-based approach)
- Baileys migration (separate task after system is proven)
- Usage-based billing (current flat-rate tiers are sufficient)

## 13. Implementation Order

1. **Docker image** — Build base image with mautrix-imessage, mautrix-whatsapp, mautrix-gmessages, s6-overlay
2. **Conduit homeserver** — Deploy shared Matrix homeserver on Fly with webhook configuration
3. **iMessage registration server** — Deploy shared instance on Fly
4. **Bridge management API** — `/api/bridges/*` routes (provision, link-status, wake, suspend, destroy, status)
5. **Database migration** — Add `provisioning` and `suspended` status values to `org_connections`
6. **Dashboard linking modal** — QR/credential flow component
7. **Connection card updates** — Wire iMessage, WhatsApp, Android Messages cards to provisioning flow
8. **Health + lifecycle crons** — `/api/cron/bridge-health`, `/api/cron/bridge-lifecycle`
9. **Wake-on-demand** — Wire into send operations and dashboard access
10. **E2E verification** — Connect all three protocols, verify message flow end-to-end
11. **Baileys migration** — Separate phase after verification
