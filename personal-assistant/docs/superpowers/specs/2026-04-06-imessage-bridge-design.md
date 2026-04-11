# iMessage Bridge via LightNode Mac VPS + BlueBubbles

**Date:** 2026-04-06
**Status:** Approved
**Supersedes:** ADR 0005 (Claw Messenger approach — incorrect, Claw/Linq don't bridge user accounts)

## Problem

BitBit needs to read and send iMessages from a user's existing Apple ID account. Unlike WhatsApp/Android Messages (which have working Matrix bridges on Linux), iMessage requires macOS. Every approach that bypasses Apple hardware is dead or archived (Beeper registration server, pypush, Beeper Mini). Claw Messenger and Linq provide agent-owned phone numbers, not bridges to the user's existing iMessage account.

## Decision

Use **LightNode Mac VPS** ($7.7/mo, macOS Sequoia, hourly billing) running **BlueBubbles** (open-source iMessage bridge with REST API + webhooks). Users sign in to their Apple ID via a **noVNC session** embedded in BitBit's dashboard, locked down to feel like a native Apple sign-in widget.

## Architecture

```
User clicks "Connect iMessage" in BitBit dashboard
    ↓
BitBit claims a pre-provisioned Mac VPS from the warm pool (~5s)
    ↓
SSH automation: register webhook, inject Apple ID email, enable VNC kiosk
    ↓
Dashboard shows embedded noVNC — user sees only Apple sign-in dialog
    → Types password, approves 2FA on iPhone
    → BitBit auto-detects activation, closes VNC
    ↓
Messages flow:
  Inbound:  BlueBubbles webhook POST → /api/connections/[id]/webhook → Envelope → pipeline
  Outbound: BitBit → BlueBubbles REST API → iMessage sent from user's account
```

### Key Differences from WhatsApp/Android Bridge

| Aspect | WhatsApp/Android | iMessage |
|--------|-----------------|----------|
| Compute | Fly.io Machine (Linux container) | LightNode Mac VPS (macOS Sequoia) |
| Bridge software | mautrix-whatsapp/gmessages → Matrix | BlueBubbles → REST API + webhooks |
| Homeserver | Conduit (self-hosted Matrix) | Not involved |
| Linking UX | QR code scan | noVNC Apple ID sign-in |
| Lifecycle | Active → Suspended → Destroyed | Active → Destroyed (no suspension) |
| Cost | ~$1.90/mo active | ~$7.70/mo active |

## Warm Instance Pool

To achieve instant provisioning (<5s), BitBit maintains a pool of pre-provisioned Mac VPS instances.

**Pool specification:**
- Target size: 2 warm instances at all times
- Each instance has: macOS Sequoia booted, BlueBubbles installed + configured (random password, Cloudflare tunnel, headless mode), SSH key authorized, kiosk scripts ready
- Cost: 2 × $0.012/hr = ~$17/mo idle overhead
- Replenishment: `/api/cron/bridge-pool` runs every 15 min, creates replacements when pool < 2

**On provision request:**
1. Claim an instance from the pool (mark as assigned in a `bridge_pool` tracking mechanism)
2. Personalize it: register webhook with user's connection ID, inject Apple ID email, enable VNC
3. Background job: replenish pool

**Pool storage:** Track pool state in `org_connections` with a sentinel org_id (e.g., `pool`) and status `pending`. When claimed, update to the user's org_id and status `provisioning`. This reuses existing infrastructure without a new table.

## Provisioning Sequence

### Phase 1 — Claim Instance (~5s)
1. `POST /api/bridges/provision {protocol: "imessage"}` 
2. Create `org_connections` row with status `provisioning`
3. `MacVpsProvisioner.provision()` claims a warm instance from the pool
4. Dashboard shows: "Setting up your secure environment..."

### Phase 2 — Personalize (~10s)
1. SSH into claimed VPS:
   - Update BlueBubbles webhook URL → `https://app.bitbit.chat/api/connections/[id]/webhook`
   - Register webhook events: `new-message`, `updated-message`, `typing-indicator`
2. Run kiosk setup:
   - Kill Dock, hide desktop icons, hide menu bar
   - Disable Cmd+Tab, Cmd+Space, Cmd+Q, Cmd+W, Mission Control, Spotlight
   - Set display resolution to 800×600
   - Open Messages.app, inject Apple ID email via AppleScript
   - Start focus-lock watcher daemon (LaunchAgent, 500ms interval)
   - Enable VNC server (port 5900) with session-specific password
3. Store VPS details in `org_connections.config`
4. Update status to `linking`

### Phase 3 — User Sign-In (~30-120s, user-driven)
1. Dashboard renders noVNC viewer connected to `vps_ip:5900`
2. User sees Messages.app sign-in with email pre-filled
3. User enters password, taps Allow on iPhone for 2FA
4. BitBit polls every 2s via `/api/bridges/link-status`:
   - SSH check: is Messages.app signed in?
   - HTTP check: `GET /api/v1/ping` + `GET /api/v1/chat/query` on BlueBubbles

### Phase 4 — Activation (~5s)
1. BlueBubbles detects iMessage activation
2. Disable VNC server (no longer needed after sign-in)
3. Remove kiosk lockdown
4. Run `caffeinate -s &` to prevent sleep
5. Update `org_connections`: status → `connected`, `linked_at` → now
6. Dashboard auto-closes VNC modal → green "iMessage connected!"

**Total user-facing time: ~2-2.5 minutes** (mostly Apple sign-in + 2FA)

## Bulletproof Sign-In Experience

### Mac VPS Kiosk Lockdown

Before VNC is exposed to the user, the Mac is locked into a kiosk state:

1. **Desktop hidden** — Dock killed, desktop icons hidden, menu bar hidden via AppleScript. User sees nothing but the Messages sign-in dialog on a blank background.
2. **Single-app focus lock** — LaunchAgent watches every 500ms: if Messages.app loses focus or closes, immediately reopens and refocuses. User cannot navigate away.
3. **Keyboard lockdown** — Cmd+Tab, Cmd+Space, Cmd+Q, Cmd+W, Mission Control, Spotlight disabled via `defaults write` and accessibility permissions. Only typing keys, Tab, and Enter work.
4. **Resolution lock** — Display set to 800×600 so the Messages sign-in dialog fills the viewport cleanly. noVNC scales this to fit the modal.
5. **Auto-recovery** — If Messages crashes or the sign-in dialog disappears, watcher script re-launches it within 1 second.

### Dashboard Modal UX

The noVNC viewer is wrapped in BitBit's UI to feel native:

1. **Styled container** — VNC canvas inside a BitBit-branded modal with step indicator ("Step 2 of 3: Sign in to iMessage"), BitBit color scheme framing, instruction text below.
2. **No VNC chrome** — No toolbar, clipboard button, or scaling controls. Just the raw video feed looking like an embedded Apple widget.
3. **State-aware instructions** — Text updates based on sign-in state (polled from backend):
   - `waiting_for_password` → "Enter your Apple ID password above"
   - `waiting_for_2fa` → "Check your iPhone — tap Allow to verify"
   - `verifying` → "Verifying your account..."
   - `connected` → auto-close
   - `error` → surface friendly error message with retry
4. **Error detection** — AppleScript checks for error dialogs on the Mac. Wrong password, locked account, etc. surfaced as friendly messages in BitBit's modal, not raw macOS errors.
5. **Timeout handling** — After 5 minutes with no successful sign-in:
   - "Taking longer than expected?" with Retry, Get Help, and Advanced (full desktop) options
   - "Show full desktop" is hidden behind Advanced — escape hatch for edge cases

### What the User Sees

```
┌─────────────────────────────────────────┐
│  💬 Connect iMessage          Step 2/3  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │    ┌───────────────────────┐    │    │
│  │    │  🍎 Sign in with your │    │    │
│  │    │     Apple ID          │    │    │
│  │    │                       │    │    │
│  │    │  user@icloud.com      │    │    │
│  │    │  ┌─────────────────┐  │    │    │
│  │    │  │ ••••••••••••    │  │    │    │
│  │    │  └─────────────────┘  │    │    │
│  │    │        [Sign In]      │    │    │
│  │    └───────────────────────┘    │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Enter your Apple ID password above.    │
│  Your credentials go directly to Apple  │
│  — BitBit never sees your password.     │
│                                         │
└─────────────────────────────────────────┘
```

## Data Flow

### Inbound (iMessage → BitBit)

```
Someone texts user → Messages.app receives → BlueBubbles detects via chat.db
    → POST https://app.bitbit.chat/api/connections/[id]/webhook
    {
      "type": "new-message",
      "data": {
        "guid": "ABC123-...",
        "text": "Hey, are we still meeting tomorrow?",
        "isFromMe": false,
        "dateCreated": 1772642539012,
        "handle": {"address": "+61400000000", "service": "iMessage"},
        "chats": [{"guid": "iMessage;-;+61400000000", "displayName": "John Smith"}],
        "attachments": []
      }
    }
    → webhookParse() normalizes to Envelope → pipeline
```

### Outbound (BitBit → iMessage)

```
BitBit agent decides to send → send() called with Envelope
    → POST https://{bb_server}/api/v1/message/text?password={bb_password}
    {
      "chatGuid": "iMessage;-;+61400000000",
      "tempGuid": "bitbit-1712438400-abc123",
      "message": "Yes, confirmed for 2pm tomorrow!"
    }
    → BlueBubbles sends via Messages.app → delivered as iMessage from user's account
```

### Health Check

```
Cron (every 5 min):
    GET https://{bb_server}/api/v1/ping?password={bb_password}
    → 200 "pong" = healthy
    → Timeout/error = alert user via notification dispatcher
```

### BlueBubbles Provider Plugin

`src/lib/connections/providers/bluebubbles.ts`:
- `webhookParse(req)` — transforms BlueBubbles webhook payload → Envelope[]
- `send(connection, envelope)` — calls BlueBubbles REST API
- `healthCheck(connection)` — pings BlueBubbles server
- `pull(connection, since)` — backfill via `GET /api/v1/message` (used on first connect)

### Connection Config (`org_connections.config`)

```json
{
  "bb_server_url": "https://xyz.trycloudflare.com",
  "bb_password": "generated-32-char-secret",
  "vps_ip": "103.x.x.x",
  "vps_id": "lightnode-instance-id",
  "ssh_key_fingerprint": "SHA256:...",
  "vnc_port": 5900,
  "vnc_password": "session-specific-password",
  "apple_id_email": "user@icloud.com",
  "protocol": "imessage",
  "linked_at": null,
  "last_message_at": null
}
```

## Lifecycle

**No suspension** — Mac VPS runs continuously while connected. macOS cold boot is slow (~60-90s), BlueBubbles may need to re-authenticate iMessage after stop, and $7.7/mo is cheap enough that suspension complexity isn't worth it.

**Lifecycle states:** `provisioning` → `linking` → `connected` → `destroyed`

**Destroy on disconnect:**
1. User clicks "Disconnect iMessage" in config drawer
2. `MacVpsProvisioner.destroy()`:
   - SSH: stop BlueBubbles, clean up user data
   - Destroy LightNode VPS instance (or return to pool if cleanable)
   - Update `org_connections`: status → `disabled`

**Health monitoring:**
- Existing `/api/cron/bridge-health` extended to handle iMessage connections
- Instead of checking Fly machine state, pings BlueBubbles `GET /api/v1/ping`
- On failure: attempt SSH restart of BlueBubbles, notify user if unrecoverable
- Skip suspension logic for iMessage connections in `bridge-lifecycle.ts`

## File Map

### New Files
| File | Purpose |
|------|---------|
| `src/lib/bridges/mac-vps-provisioner.ts` | MacVpsProvisioner class — claim from pool, SSH setup, kiosk, VNC, destroy |
| `src/lib/connections/providers/bluebubbles.ts` | Provider plugin — webhookParse, send, healthCheck, pull |
| `src/lib/bridges/vps-pool.ts` | Warm pool management — claim, replenish, list available |
| `src/app/api/cron/bridge-pool/route.ts` | Cron to maintain warm pool at ≥2 instances |
| `infra/imessage/setup.sh` | SSH setup script — install BlueBubbles, configure, kiosk lockdown |
| `infra/imessage/kiosk-watcher.sh` | LaunchAgent — keeps Messages.app focused, auto-recovery |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/bridges/types.ts` | Add `MacVpsInstance` interface, VPS-specific fields |
| `src/lib/bridges/index.ts` | Export MacVpsProvisioner, add factory |
| `src/lib/connections/built-in-providers.ts` | Replace iMessage stub with BlueBubbles provider |
| `src/lib/connections/templates.ts` | Add iMessage config fields (Apple ID email) |
| `src/components/channels/bridge-link-modal.tsx` | Replace iMessage credentials form with noVNC viewer |
| `src/app/api/bridges/provision/route.ts` | Route iMessage to MacVpsProvisioner |
| `src/app/api/bridges/link-status/route.ts` | Add BlueBubbles health polling for iMessage |
| `src/app/api/cron/bridge-health/route.ts` | Add BlueBubbles ping path |
| `src/lib/bridges/bridge-lifecycle.ts` | Skip suspension for iMessage connections |
| `vercel.json` | Add bridge-pool cron entry |
| `docs/adr/0005-imessage-bridge-approach.md` | Update with corrected approach |

### Dependencies
| Package | Purpose |
|---------|---------|
| `@novnc/novnc` | WebSocket VNC client for dashboard modal |
| `ssh2` | Node.js SSH client for provisioner (or shell out to `ssh` CLI) |

## Security

- **Apple ID credentials**: Never touch BitBit's servers. The user types them directly into the VNC session — the keystrokes go from browser → noVNC WebSocket → Mac VPS VNC server → Messages.app. BitBit cannot intercept them.
- **VNC session**: Password-protected, disabled immediately after sign-in completes. Only exposed during the ~2 min sign-in window.
- **BlueBubbles password**: Random 32-char secret, stored encrypted in `org_connections.config`. Used for webhook auth and REST API calls.
- **SSH keys**: BitBit holds a single SSH keypair for VPS management. Private key stored as Vercel env var, never exposed to clients.
- **Webhook verification**: BlueBubbles webhooks don't support HMAC signing. Since webhooks arrive via Cloudflare tunnel (proxied IP), we verify by checking the `bb_password` is included as a query param or header in the webhook URL we register (e.g., `https://app.bitbit.chat/api/connections/[id]/webhook?token={bb_password}`), and the connection_id in the URL path matches a valid connection.

## Cost Model

| Component | Cost | Notes |
|-----------|------|-------|
| Active iMessage user | $7.70/mo | LightNode hourly billing |
| Warm pool (2 instances) | $17/mo | Always-on idle instances |
| BlueBubbles | Free | Open source |
| noVNC | Free | MIT licensed |
| Cloudflare tunnel | Free | Built into BlueBubbles |

**Per-user cost: $7.70/mo** (vs ~$1.90/mo for WhatsApp on Fly).

## Risks

1. **Apple serial number blacklisting** — Virtual macOS instances carry activation risk. Mitigations: use macOS Sequoia (confirmed working), monitor for sign-in failures, have HostMyApple (real hardware) as Tier 1 fallback.
2. **BlueBubbles macOS Tahoe issues** — Private API helper fails on Tahoe. Mitigation: pin to macOS Sequoia, do not upgrade VPS images.
3. **Cloudflare tunnel URL changes** — BlueBubbles' Cloudflare tunnel URL changes on server restart. Mitigation: on BlueBubbles restart (detected by health cron), SSH in, read the new tunnel URL, update `org_connections.config.bb_server_url`, and re-register the webhook. Alternatively, switch to zrok for stable URLs in a future iteration.
4. **LightNode reliability** — Smaller provider, less proven than AWS/Fly. Mitigation: health monitoring + alerting, provider abstraction allows migration.
5. **Apple ToS** — All programmatic iMessage access violates Apple's ToS. This is inherent to the problem and shared by every iMessage bridge (Beeper, BlueBubbles, AirMessage).
