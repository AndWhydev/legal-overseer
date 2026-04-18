# Phase 51 — iMessage Gateway Polish — SHIPPED

**Date shipped:** 2026-04-17
**PRs:** #64 (main), #73 (D1 schema fix), #75 (signup tz capture)
**Plan:** [PLAN.md](./PLAN.md)
**Investigation:** [A1-INVESTIGATION.md](./A1-INVESTIGATION.md)

## Outcome vs. plan

All 12 tasks completed. Acceptance criteria met:

| Criterion | Status |
|---|---|
| No markdown artifacts (`**`, `-`, `#`) on iMessage | ✅ B1 renderer |
| First typing indicator within 1.5s | ✅ C1 (T+900ms) |
| Bubbles stream as LLM thinks (gated `BITBIT_IMESSAGE_STREAMING=true`) | ✅ C2 (Option B) |
| Dates render in user's zone (Brisbane → AEST) | ✅ D1 |
| Agent can disconnect Outlook on request | ✅ E1 |
| No "based on the system context" phrases | ✅ B3 directive |
| No test traces / fixtures reach the phone | ✅ A2 outbound guard |

## Production state

- **Migrations applied** via Supabase Management API:
  - `20260417151034_add_user_timezone.sql` → `public.profiles.timezone`
  - `20260417151035_connector_last_activity.sql` → view `connector_last_activity`
- **Backfilled:** Tor + Andy → `Australia/Brisbane`
- **Vercel prod env:** `BITBIT_IMESSAGE_STREAMING=true`
- **Latest prod deploy:** `bitbit-4x88ldywh` (2026-04-17 19:42 UTC)

## Schema gotcha (caught in PR #73)

The plan said "ALTER TABLE users" — but `public.users` doesn't exist. BitBit uses:
- `auth.users` — Supabase Auth managed
- `public.profiles` — app-side user data, PK = `auth.users.id`

Migration + identity-resolver + chat route were all corrected to target `profiles`.

## What's NOT in this phase (deferred)

1. **C2 Option A — true first-byte streaming.** Drains raw LLM deltas before humanization. Risks leaking ungoverned TAOR text. Not pursued; revisit only if C1 typing indicator UX feels insufficient on real traffic.
2. **Integration test for `handleGatewayMessage` under streaming flag.** Unit tests for `BubbleAccumulator` + `TypingKeepalive` exist; end-to-end wiring is untested. Low risk — gated by env flag.
3. **C3 delay tuning.** `clamp(length * 35ms, 400, 2500)` may want adjustment after observing real Sendblue traffic feel.
4. **A1 prod-side verification (Tor's job).** See [A1-INVESTIGATION.md](./A1-INVESTIGATION.md):
   - Prod Supabase query: `WHERE body ILIKE '%sendblue trace%' OR body ILIKE '%autonomous test%'`
   - `fly logs -a bitbit-workers | grep -iE "sendblue|trace [A-Z]{3}"`
   - Cloudflare edge cron logs

## Files of interest

| File | Purpose |
|---|---|
| `src/lib/channels/guards.ts` | Outbound chokepoint, throws `OutboundBlockedError` for non-allowlisted in dev |
| `src/lib/channels/gateway-handler.ts` | `splitIntoBubbles()` (B2), `BITBIT_IMESSAGE_STREAMING` flag fork |
| `src/lib/channels/bubble-accumulator.ts` | Paragraph-boundary drain logic, 3-bubble cap enforcement |
| `src/lib/channels/typing-keepalive.ts` | `TypingKeepalive` class (start/stop/reassert) |
| `src/lib/channels/renderers/imessage.ts` | Markdown stripping rules |
| `src/lib/channels/renderers/whatsapp.ts` | Markdown → WhatsApp native formatting |
| `src/lib/agent/connector-freshness.ts` | `formatConnectorFreshness()` |
| `src/lib/agent/tools/disconnect-connector.ts` | Org-scoped, confirm-required revocation |
| `src/lib/conversation/identity-resolver.ts` | Loads `profiles.timezone` on identity hit |
| `src/app/(auth)/signup/page.tsx` | Captures browser tz at signup, writes to `profiles.timezone` |
