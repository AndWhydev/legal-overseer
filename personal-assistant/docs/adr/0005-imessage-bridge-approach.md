# ADR 0005: iMessage Bridge Approach

**Date:** 2026-04-06
**Status:** Decided
**Decision:** Self-hosted BlueBubbles on LightNode Mac VPS, with HostMyApple as reliability fallback

## Context

BitBit needs iMessage read/write access for its intelligence engine. Unlike WhatsApp and Android Messages (which have working open-source Matrix bridges), iMessage has no official API and every server-side approach that bypasses Apple hardware has been shut down or abandoned:

- **Beeper barcelona**: Archived Apr 2025. macOS-only, unmaintained.
- **pypush**: In rewrite, not production-stable. No ETA for v3.
- **Beeper registration providers**: Both archived Apr 2026.
- **Beeper Mini**: Dead since Apple crackdown Dec 2023.

### Important Clarification: Claw and Linq

Claw Messenger and Linq do **not** bridge a user's existing Apple ID / personal iMessage account. They provision **agent phone numbers** — new numbers enrolled in iMessage via their own Mac fleet. This is a different product (bot numbers, not personal accounts) and unsuitable for BitBit's use case, where users need to connect their own iMessage identity.

## Options Considered

| Approach | Cost/mo | Works Today | Risk |
|----------|---------|-------------|------|
| LightNode Mac VPS + BlueBubbles | ~$30-50/VPS | Yes | Ops overhead, Apple ToS |
| HostMyApple (managed Mac hosting) | ~$40-80 | Yes | Vendor dependency, higher cost |
| Claw / Linq API | $5-25 | Yes (agent numbers only) | Wrong product — provisions new numbers, not user accounts |
| Mac Mini colo | $30-120/number | Yes | High setup cost, physical hardware |
| pypush v3 | Free (eventually) | No | Not stable, no ETA |

## Decision

**Use LightNode Mac VPS + BlueBubbles** as the primary iMessage transport.

- LightNode provides affordable macOS VPS instances (Apple Silicon, macOS Sequoia)
- BlueBubbles runs headless, exposes a REST + webhook API, and handles the Messages.app integration
- Each user gets their own VPS provisioned on-demand; they sign into Messages via an embedded noVNC session in the BitBit dashboard
- VNC is used only during setup (sign-in + 2FA approval); daily operation is headless via the BlueBubbles API

**HostMyApple** is the reliability fallback if LightNode has stability issues or if a fully managed option is preferred. Same BlueBubbles setup, different hosting provider.

## Architecture Differences from WhatsApp / Android Messages

iMessage uses a fundamentally different architecture than the other protocols:

| Aspect | WhatsApp / Android Messages | iMessage |
|--------|-----------------------------|---------|
| Bridge software | mautrix (open source, Matrix) | BlueBubbles |
| Hosting | Fly.io Machines (ephemeral) | LightNode Mac VPS (persistent) |
| User auth | QR code scan (no credentials stored) | Apple ID sign-in via noVNC |
| Relay | Matrix homeserver (Conduit) | BlueBubbles REST API directly |
| Webhook delivery | Matrix → Conduit appservice | BlueBubbles → BitBit webhook |
| Pool model | Machines destroyed after use | VPS persists per user |

The `org_connections` row still uses `provider: 'imessage'`. The `config` JSONB column stores `bb_password` (used for both BlueBubbles auth and webhook token verification) and `bb_port`.

## Kiosk Mode

To ensure Messages.app stays in focus for reliable iMessage delivery, the VPS runs in kiosk mode:

- Dock hidden, desktop icons hidden
- `kiosk-watcher.sh` LaunchAgent keeps Messages.app frontmost at all times
- VNC available for debugging; not exposed during normal operation

## Webhook Authentication

BlueBubbles does not support HMAC webhook signatures. Authentication uses a token in the query string:

```
POST /api/connections/{id}/webhook?token={bb_password}
```

The webhook route verifies `token === conn.config.bb_password` for iMessage connections.

## Consequences

- iMessage users require a dedicated Mac VPS (~$30-50/mo), making it the most expensive protocol
- Apple can disrupt any iMessage bridge at any time — this is inherent to the problem space
- noVNC in the dashboard introduces a dependency on `@novnc/novnc` (dynamic import, no SSR impact)
- The provisioning flow is more complex than WhatsApp (VPS spin-up + kiosk setup + noVNC sign-in)
- BlueBubbles is actively maintained and has a strong community; risk is lower than abandonware alternatives
