# Bridge Pairing Runbook

Diagnostics + recovery for onboarding bridge pairing failures across iMessage, WhatsApp, Android Messages, and Telegram.

Scope: user reports of "QR never appeared," "connect page hung," "Apple ID sign-in didn't work," etc. after clicking a chat surface in `/onboard` and landing on `/onboard/connect/[surface]`.

---

## 0. Triage: which surface?

Ask or check `org_connections.provider` for the user's org. Each surface has its own failure modes and infra.

```sql
SELECT id, provider, status, last_error, created_at, updated_at, config
FROM org_connections
WHERE org_id = '<user_org_id>'
  AND provider IN ('imessage', 'whatsapp', 'android-messages', 'telegram')
ORDER BY created_at DESC
LIMIT 5;
```

Sentry breadcrumbs (filter by `category:pairing`) give the client-side state machine trace. Look for:
- `[<surface>] provisioning_started` — user clicked Connect
- `[<surface>] provisioning_succeeded` — API returned connection_id
- `[<surface>] linked` — pairing completed end-to-end
- `[<surface>] link_status_error` / `provisioning_failed` — where it broke

---

## 1. Telegram — `/start <code>` never detected

**Symptom:** user says "I tapped Start in Telegram but the page is still spinning."

**Check in order:**

1. **Bot username set?** `TELEGRAM_BOT_USERNAME` must be set in Vercel prod (see `vercel env ls production`). Without it, `/api/bridges/telegram/pair` returns 503 and no code is ever minted.

2. **Code expired?** Codes live 10 minutes. Query:
   ```sql
   SELECT config->>'pairing_code' AS code,
          config->>'pairing_code_expires_at' AS expires_at,
          status, last_error
   FROM org_connections
   WHERE provider = 'telegram' AND org_id = '<user_org>';
   ```
   If `expires_at < now()` and status is `error`, user needs to refresh the connect page to mint a new code.

3. **Webhook not hitting?** Test the Telegram webhook URL manually:
   ```bash
   curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo | jq
   ```
   Expected: `"url": "https://app.bitbit.chat/api/channels/telegram"` and `pending_update_count: 0`. If URL is wrong, reset via `setWebhook`.

4. **Webhook secret mismatch?** If `TELEGRAM_WEBHOOK_SECRET` is set, the webhook validates `x-telegram-bot-api-secret-token`. Mismatch → 403, user gets no response. Check Sentry for `[webhook/telegram] secret mismatch`.

5. **`channel_identities` insert failed?** The CHECK constraint on `channel_identities.channel_type` must include `'telegram'`. Verified 2026-04-17; if someone altered the constraint this would silently break pairing.

**Manual recovery:** If webhook + bot are healthy but the code somehow wasn't consumed, manually flip the connection:

```sql
UPDATE org_connections
SET status = 'connected',
    config = config || jsonb_build_object('chat_id', '<telegram_chat_id>', 'linked_at', now())
WHERE id = '<connection_id>';
```

Then insert into `channel_identities`:

```sql
INSERT INTO channel_identities (user_id, org_id, channel_type, channel_identifier, display_name, verified)
VALUES ('<user_id>', '<org_id>', 'telegram', '<chat_id>', '<name>', true);
```

---

## 2. WhatsApp / Android Messages — QR code never renders

**Symptom:** user sees "Generating QR..." spinner indefinitely (never transitions to QR image).

**Check in order:**

1. **Fly Machine created?** Look up `org_connections.config.fly_machine_id` for the connection, then:
   ```bash
   fly machines list -a bitbit-bridges | grep <machine_id>
   ```
   Expected state: `started`. If `created` for >2 minutes or `failed`, the bridge container never launched.

2. **Machine container logs:**
   ```bash
   fly logs -a bitbit-bridges -i <machine_id>
   ```
   Look for mautrix bridge startup errors (bridge port 29318 for whatsapp, 29336 for android-messages). Common: Conduit homeserver unreachable, provisioning_secret missing, env var typo.

3. **QR callback hit?** `/api/bridges/qr-callback` is what the bridge POSTs QR data to. Check Vercel logs for POST to that URL; if nothing arrived, the bridge never got past its own init.

4. **Status polling returning qr?** Hit manually:
   ```bash
   curl -X POST https://app.bitbit.chat/api/bridges/link-status \
     -H "Cookie: <session>" \
     -H "Content-Type: application/json" \
     -d '{"connection_id":"<id>"}'
   ```
   Expected: `{ "status": "waiting", "qr": "data:image/png;base64,..." }`. If `qr` is null, either bridge hasn't posted one or storage lookup is failing.

5. **User's phone scanned the old QR?** Mautrix QRs expire in ~2 minutes from the phone's perspective too. If user took too long, the code is dead even if we're still polling.

**Manual recovery:** Destroy the bridge and have user restart the flow:

```bash
curl -X DELETE https://app.bitbit.chat/api/bridges/<connection_id> \
  -H "Cookie: <user_session>"
```

This tears down the Fly Machine via `ConnectorManager.disconnect(hard: true)` and frees the slot.

---

## 3. iMessage — noVNC won't connect or Apple ID sign-in fails

**Symptom A:** user sees "Setting up your iMessage bridge…" forever — Mac VPS never claims.

**Symptom B:** noVNC iframe renders but screen is black / "Connection failed" — WSS handshake broken.

**Symptom C:** Messages.app login screen shows but 2FA prompt never arrives on user's device — Apple ID or provisioning issue.

**Check in order:**

1. **Pool has warm instances?**
   ```sql
   SELECT COUNT(*) FROM org_connections
   WHERE org_id = '__bitbit_pool__' AND provider = 'imessage' AND status = 'pending';
   ```
   Target pool size: 2 (per `VpsPool.TARGET_POOL_SIZE`). If zero, all VPS are claimed → no new user can pair until the warm-pool cron (`/api/cron/bridge-pool`) replenishes. Force-run it manually if urgent.

2. **WSS cert valid on VPS?** noVNC connects via `wss://<vps_ip>:<port>`. If the Mac VPS uses a self-signed cert, browsers will reject the WSS handshake. Check with:
   ```bash
   openssl s_client -connect <vps_ip>:<port> -showcerts | grep "subject"
   ```
   Fix: VPS should have Let's Encrypt via Caddy (see `infra/imessage/` for kiosk setup).

3. **SSH reachable?**
   ```bash
   ssh -i <private_key> admin@<vps_ip> 'curl -s localhost:1234/api/v1/server/ping?password=<bb_password>'
   ```
   Expected: BlueBubbles `{ "status": 200, "message": "pong" }`. If SSH fails, VPS is likely terminated; clean up the pool entry.

4. **Apple ID throttled?** If the user's Apple ID has been used to sign into too many new devices in a short window, Apple will silently refuse the 2FA prompt. Remedy is on Apple's side — user needs to wait or use a different Apple ID.

5. **2FA arriving but user has no Apple device?** iMessage requires at least one trusted device per Apple ID. If user only has a PC, iMessage activation won't complete. Document this limit in UX copy (TODO).

**Manual recovery:** Same DELETE pattern as WhatsApp. Releases the Mac VPS back to pool (status → `pending`).

---

## 4. Generic: "I clicked Let's go but landed on /dashboard without pairing"

**Symptom:** user skipped mid-flow and now their dashboard shows no chat surface connected.

**Check:**
```sql
SELECT preferences->'primary_chat_surface', preferences->'onboarding_stage', preferences->'onboarding_completed'
FROM profiles WHERE id = '<user_id>';
```

Expected states after skip:
- `primary_chat_surface`: `'imessage'` / etc. (whatever they picked)
- `onboarding_stage`: `'complete'`
- `onboarding_completed`: `true`

If those are correct, the user is in the valid "skipped" state. To re-engage, point them to `Settings → Connections → Connect <surface>` (the Settings-surface entry point re-uses the same pairing panels from onboarding).

---

## 5. Orphan bridges (cost leak)

If Fly machine count or claimed Mac VPS count drifts above active-connection count, the daily cron at `/api/cron/bridge-cost-leak` fires a Sentry warning with candidate IDs.

Manual sweep:
```bash
# List Fly machines with no matching provisioning/connected org_connection
curl https://app.bitbit.chat/api/admin/bridge-audit \
  -H "Authorization: Bearer <SERVICE_ROLE_JWT>"

# Destroy a specific orphan
curl -X DELETE https://app.bitbit.chat/api/bridges/<connection_id> \
  -H "Cookie: <admin_session>"
```

---

## Related files

- `src/app/(auth)/onboard/connect/[surface]/page.tsx` — pairing page entrypoint
- `src/components/onboarding/bridge-pairing-panel.tsx` — iMessage/WhatsApp/Android UI
- `src/components/onboarding/telegram-pairing-panel.tsx` — Telegram UI
- `src/app/api/bridges/provision/route.ts` — POST: provision Fly machine / claim Mac VPS
- `src/app/api/bridges/link-status/route.ts` — POST: poll linking state
- `src/app/api/bridges/telegram/pair/route.ts` — POST: mint Telegram pairing code
- `src/app/api/bridges/telegram/status/route.ts` — POST: poll Telegram pairing state
- `src/app/api/channels/telegram/route.ts` — webhook that consumes `/start <code>`
- `src/app/api/bridges/[connectionId]/route.ts` — DELETE: hard teardown
- `src/app/api/cron/bridge-cost-leak/route.ts` — daily orphan detector
- `src/lib/bridges/` — FlyMachinesClient, BridgeProvisioner, MacVpsProvisioner, VpsPool
