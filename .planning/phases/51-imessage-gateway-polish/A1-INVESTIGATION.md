# A1 — Leaked Test Traces: Investigation Finding

**Date:** 2026-04-17
**Investigator:** Claude (phase 51 execution)

## Strings under investigation

From transcript:
- `ping test from claude`
- `autonomous test 200157`
- `sendblue trace XYZ555`
- `live trace MNO222`
- `pipeline trace PQR333`

## Code-side search (exhaustive)

Searched monorepo for each exact phrase, the numeric token, and the 3-letter trace codes:

| Search root | Pattern | Result |
|---|---|---|
| `personal-assistant/**` | `sendblue trace`, `autonomous test`, `pipeline trace`, `live trace` | **no matches** |
| `scripts/**` | same | **no matches** |
| `deployments/**` | `sendblue` / `imessage` | only `torkay/config.ts` (unrelated) |
| `.forge/**`, `conductor/**` | `ping test`, `trace [A-Z]{3}[0-9]{3}` | **no matches** |
| Whole repo | `XYZ555`, `MNO222`, `PQR333`, `200157` | **no matches** |

`sendSendblueMessage` is called from exactly these sites (all legitimate):
- `src/lib/channels/gateway-handler.ts` — the agent's outbound path
- `src/lib/channels/sendblue-contact-card.ts` — contact card send
- `src/lib/channels/sendblue-media.ts` — media send
- `src/app/api/webhooks/sendblue/route.ts` — the webhook's ack path
- `src/app/api/auth/verify-phone/route.ts` — OTP for phone verification
- `src/lib/channels/__tests__/sendblue.test.ts` — vitest, mocked fetch

None of them embed the leaked trace strings as literals.

## What this means

The traces did not originate from checked-in code. Candidate sources (not verifiable from inside the worktree):

1. **Manual curl/HTTP calls** against `https://api.sendblue.co/api/send-message` from a dev machine — the most likely source given the ad-hoc nature of the strings.
2. **A deleted/uncommitted script** in Tor's local working directory.
3. **A Fly.io worker or Cloudflare cron** with its own deploy artifact that we can't see from the repo. `bitbit-workers.fly.dev` and `bitbit-edge-cron` would need log inspection.
4. **Direct Supabase inserts** into `channel_messages` that then got fed back to the agent as "inbound" history (would also explain A3).

## Required out-of-worktree checks (for Tor)

1. **Prod Supabase query:**
   ```sql
   SELECT direction, sender, body, created_at
   FROM channel_messages
   WHERE body ILIKE '%sendblue trace%'
      OR body ILIKE '%autonomous test%'
      OR body ILIKE '%ping test from claude%'
      OR body ILIKE '%pipeline trace%'
      OR body ILIKE '%live trace%'
   ORDER BY created_at DESC LIMIT 200;
   ```
   Direction tells us whether we *sent* them (outbound — someone has Sendblue creds and a script) or *received* them (inbound — a bridge/webhook is echoing).

2. **Fly logs (last 7d):**
   ```
   fly logs -a bitbit-workers   | grep -iE "sendblue|trace [A-Z]{3}"
   fly logs -a bitbit-wa-bridge | grep -iE "sendblue|trace"
   ```

3. **Cloudflare edge cron logs** — `bitbit-edge-cron.bitbit-edge.workers.dev` — look for any job posting to `/api/webhooks/sendblue` or Sendblue's API.

4. **Local `~/.bash_history` / shell history** on Tor's machines for any `curl` containing `sendblue.co`.

## Gating decision

We cannot wait on the answer. **A2 (outbound guard)** is the insurance policy — it refuses to send anything from a non-prod env to a non-allowlisted recipient, regardless of where the caller originated. That ships now.

If the prod query (step 1 above) shows these strings as `direction='inbound'`, then A3 also has a direct fix target: whatever pipeline is ingesting them as if they were user messages.

## Status

- ☒ Code-side search complete — no matches
- ☐ Prod DB query (requires Tor)
- ☐ Fly + Cloudflare log inspection (requires Tor)
- ☒ Gating: A2 will prevent recurrence regardless of source
