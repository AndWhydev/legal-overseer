# iMessage Mac VPS Setup — LightNode + Vercel

Step-by-step HITL instructions. You do the console bits; paste credentials back; I wire the Vercel env vars + test the cron.

**Heads-up before you start:**

LightNode's public REST API is instance-lifecycle only (Create/Delete/Start/Stop/List/Reinstall instance, plus read-only List for images/SSH keys). It's **not** 1:1 with what `imessage-vps-client.ts` currently calls (`POST /instances`, `DELETE /instances/:id`). We may need a tiny adapter shim if their paths/field names differ from the code's assumptions. I'll verify that once you hand over the API token and adjust the client (or add a shim) before the cron goes live. For now, follow these steps — they're needed no matter what.

Also worth confirming: **LightNode lists macOS VPS as "Coming Soon"** on their marketing page ($7.71/mo). If Mac plans aren't actually purchasable yet, we pause here and either pick a different provider (AWS EC2 Mac, MacStadium, Scaleway) or wait for GA.

---

## Step 1 — Confirm Mac VPS is available (2 min)

1. Log into `console.lightnode.com`.
2. Click **Create Instance** → region picker → see if any **macOS** / **Mac OS Sequoia** images appear in the image catalog.
3. If yes → proceed. If no → stop, tell me, we pick a different provider.

---

## Step 2 — Request an API TOKEN from LightNode support (10 min active + waiting)

LightNode does not self-serve API tokens — you have to ask customer support.

1. In `console.lightnode.com`, open the **Help / Contact Support** chat (bottom right).
2. Send:
   > Hi — I'm integrating LightNode with my platform via the REST API (`https://apidoc.lightnode.com/en/7444774m0`). Can you please issue an API TOKEN for my account? I need it to programmatically create/delete macOS instances for a production workload.
3. Wait for reply (usually same-day). They'll return a bearer token.
4. **Save immediately to 1Password** as a new item: title `LightNode API Token`, field `token` = the bearer string.

---

## Step 3 — Generate the SSH keypair (2 min)

Do this on your local machine:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/bitbit-imessage-vps -N "" -C "bitbit-imessage-vps"
```

Produces:
- `~/.ssh/bitbit-imessage-vps` (private — keep secret, will go to Vercel as `IMESSAGE_SSH_PRIVATE_KEY`)
- `~/.ssh/bitbit-imessage-vps.pub` (public — uploaded to LightNode next step)

Save both halves to 1Password under `BitBit iMessage VPS SSH Key`.

---

## Step 4 — Upload the public key to LightNode (3 min)

1. `console.lightnode.com` → **SSH Keys** (sidebar) → **Add SSH Key**
2. Name: `bitbit-imessage-vps`
3. Paste the contents of `~/.ssh/bitbit-imessage-vps.pub`.
4. Save. Note the **SSH Key ID / UUID** shown in the list — that's `IMESSAGE_VPS_SSH_KEY_ID`.

---

## Step 5 — Bake the macOS image (20–30 min, the most involved step)

The cron provisioner SSHes into a freshly booted VPS and runs `bash <IMESSAGE_VPS_SETUP_SCRIPT_PATH> <bb_password> 1234`. That script (`personal-assistant/infra/imessage/setup.sh`) must already be on the image at `/usr/local/bin/bitbit-imessage-setup.sh`.

### 5a. Boot a one-off macOS instance to bake

1. Console → **Create Instance** → macOS Sequoia image → smallest available plan → region of your choice (pick one near your users — `us-west` or `ap-east` if you have Australia traffic).
2. Attach the SSH key you just uploaded.
3. Name it `bitbit-baker`.
4. Wait for "running" status, note the public IP.

### 5b. SSH in and install the setup script

From your local machine:

```bash
# Copy the BitBit setup script onto the VPS
scp -i ~/.ssh/bitbit-imessage-vps \
  /home/claude/bitbit/personal-assistant/infra/imessage/setup.sh \
  admin@<BAKER_IP>:/tmp/setup.sh

scp -i ~/.ssh/bitbit-imessage-vps \
  /home/claude/bitbit/personal-assistant/infra/imessage/kiosk-watcher.sh \
  admin@<BAKER_IP>:/tmp/kiosk-watcher.sh

# SSH in and install to the canonical path
ssh -i ~/.ssh/bitbit-imessage-vps admin@<BAKER_IP>
sudo mkdir -p /usr/local/bin
sudo cp /tmp/setup.sh /usr/local/bin/bitbit-imessage-setup.sh
sudo cp /tmp/kiosk-watcher.sh /usr/local/bin/bitbit-imessage-kiosk-watcher.sh
sudo chmod +x /usr/local/bin/bitbit-imessage-setup.sh
sudo chmod +x /usr/local/bin/bitbit-imessage-kiosk-watcher.sh

# Also pre-install dependencies the setup script uses (curl is built-in, but
# verify BlueBubbles DMG URL is still valid — warms DNS/TLS caches too):
curl -I "https://github.com/BlueBubblesApp/bluebubbles-server/releases/latest/download/BlueBubbles.dmg"

exit
```

### 5c. Snapshot the instance into a reusable image

1. Console → **Instances** → find `bitbit-baker` → **More** / **⋯** → **Create Image** (or equivalent "Save as custom image" option).
2. Name: `bitbit-imessage-v1`.
3. Wait for the image build to finish (5–15 min).
4. Once listed under **My Images**, **note the image ID / UUID** — that's `IMESSAGE_VPS_IMAGE_ID`.

### 5d. Destroy the baker instance

1. Console → **Instances** → `bitbit-baker` → **Delete**. (Don't keep it running; warm pool will create fresh ones from the image.)

---

## Step 6 — Note region and plan slugs (5 min)

From the same Create Instance flow:
- **Region slug** (the string in the URL or shown on the region card — e.g. `us-west-1`, `jp-tokyo`). → `IMESSAGE_VPS_REGION`
- **Plan ID / SKU** (the plan you'll use for pool instances — pick the cheapest macOS plan that's at least 4GB RAM). → `IMESSAGE_VPS_PLAN_ID`

If these aren't obvious in the UI, open browser DevTools → Network tab while you click through Create Instance. The XHR payload will show the slug strings.

---

## Step 7 — Mint a Vercel Personal Access Token (2 min)

1. Go to `vercel.com/account/tokens`.
2. **Create Token** → name `bitbit-env-writer` → scope: `awu-team` (Full Account) → expiration: no expiration (or 1 year).
3. Copy the token once — Vercel won't show it again.
4. Save to 1Password as `Vercel PAT (bitbit-env-writer)`.

---

## Step 8 — Hand everything back to me

Paste the following into chat (redact in shared logs if you like — I'll store in env/Vercel only):

```
LIGHTNODE_API_TOKEN=<from step 2>
LIGHTNODE_API_BASE_URL=<base URL from https://apidoc.lightnode.com/en/7444774m0 — probably https://go.lightnode.com/...>
IMESSAGE_VPS_REGION=<from step 6>
IMESSAGE_VPS_IMAGE_ID=<from step 5c>
IMESSAGE_VPS_PLAN_ID=<from step 6>
IMESSAGE_VPS_SSH_KEY_ID=<from step 4>
IMESSAGE_SSH_PRIVATE_KEY=<contents of ~/.ssh/bitbit-imessage-vps — whole file, one block>
VERCEL_PAT=<from step 7>
```

## What I'll do once you paste them

1. Verify the LightNode API responds to the token and the paths match what `imessage-vps-client.ts` expects. If they don't, write a minimal adapter shim (`IMESSAGE_VPS_API_BASE_URL` points at a Vercel Function that translates calls to LightNode's real paths). Maybe 30 min of work.
2. Push all 8 env vars to Vercel production via `POST /v10/projects/.../env` with the PAT.
3. Redeploy so the new envs are live.
4. Hit `/api/admin/bridge-pool/seed` to kick one provisioning attempt. Watch logs for the full path: VPS boot → IP assigned → SSH ready → setup.sh runs → BlueBubbles `/api/v1/ping` responds → row flipped to `warm`.
5. If any step fails, iterate on the image (re-do step 5b-5c) or the adapter.

## Rollback if it goes sideways

- Delete the 8 Vercel env vars (one REST call per var or via `vercel env rm`).
- Cron goes back to reporting deficit without provisioning. Zero live instances, zero cost.
- Baked image + SSH key stay on LightNode account for the next attempt.
