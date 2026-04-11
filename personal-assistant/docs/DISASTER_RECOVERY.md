# BitBit Disaster Recovery Runbook

**Team**: 2-person (Tor + Andy)
**Last Updated**: 2026-03-15
**RTO Target**: 1 hour
**RPO Target**: 5 minutes (Supabase PITR)

---

## Infrastructure Map

| Service | Role | URL | Account |
|---------|------|-----|---------|
| Vercel | Dashboard (Next.js) | app.bitbit.chat | awu-team/bitbit |
| Supabase | Primary database + auth | johvduasrhmufrfdxjus (Mumbai) | hi@torkay.com |
| Fly.io | Workers (embed, agents) | bitbit-workers.fly.dev (Sydney) | bitbit org |
| Cloudflare Workers | Edge cron (*/5) | bitbit-edge-cron.bitbit-edge.workers.dev | 6a3ff72b, hi@torkay.com |
| Pinecone | Vector DB (RAG) | Serverless index `bitbit-rag` | hi@torkay.com |

---

## Recovery Objectives

| Objective | Target | Rationale |
|-----------|--------|-----------|
| RTO (Recovery Time Objective) | **1 hour** | Vercel rollback + Supabase restore takes ~30min; 1hr allows diagnosis |
| RPO (Recovery Point Objective) | **5 minutes** | Supabase Pro PITR offers ~5min resolution; Pinecone re-index from DB |

---

## Backup Coverage

### Supabase (Primary Database)

**Plan**: Pro (Mumbai region — `ap-south-1`)

**What's backed up automatically:**
- Daily backups retained for 7 days (all plans)
- Point-in-Time Recovery (PITR) available on Pro — restore to any second within the retention window
- WAL (Write-Ahead Logging) shipped continuously; ~5 min lag at worst

**How to restore:**
1. Log into [supabase.com](https://supabase.com) → project `johvduasrhmufrfdxjus`
2. Go to **Settings → Database → Backups**
3. For PITR: select a timestamp and click **Restore**
4. Restoration spins up a new project in the same region; swap env vars in Vercel and Fly.io secrets

**What is NOT backed up by Supabase:**
- Storage bucket contents (avatars, uploaded files) — manual backup needed if used
- Edge Function source code — lives in git (safe)

**RPO**: ~5 minutes via PITR

---

### Pinecone (Vector Store)

**What's stored:** Embeddings for `channel_messages` content (RAG retrieval layer)

**Backup strategy:** Vectors are **derived data** — the source of truth is `channel_messages` in Supabase. Pinecone can be fully re-created by re-running the embedding pipeline.

**How to re-create the Pinecone index after a full loss:**
```bash
# 1. Ensure PINECONE_API_KEY, VOYAGE_API_KEY, SUPABASE_* are set
# 2. Call the embed endpoint for all orgs (or use the relay daemon)
curl -X POST https://app.bitbit.chat/api/workers/embed \
  -H "Authorization: Bearer $WORKER_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_id": "all", "backfill": true}'
```

**Expected re-index time:** ~2–4 hours for full corpus depending on message volume

**What degrades during re-index:** RAG falls back to keyword/DB-only search (see Scenario B below)

**RPO**: N/A (derived data — re-create from DB)

---

### Fly.io Workers

**Auto-restart policy:** Machines are configured with `auto_start_machines = true` and `min_machines_running = 1`. Fly.io Firecracker VMs restart automatically on crash.

**Health check config** (from `deployments/fly/fly.toml`):
```toml
[checks.health]
  port = 3000
  type = "http"
  interval = "30s"
  timeout = "5s"
  path = "/api/monitoring/health"
```

Fly.io will restart a machine if the health check fails 3+ consecutive times (~90 seconds of downtime before restart).

**What is NOT automatically restored:** Secrets (`fly secrets`) — these live in Fly.io's secrets store and survive machine restarts. They are not lost on crash.

**No persistent disk:** Workers are stateless. The only stateful component is Supabase.

---

### Vercel (Dashboard)

**Deployment history:** Every git push creates a deployment. Previous deployments are retained indefinitely.

**Rollback procedure:** Vercel dashboard → **Deployments** → select previous deployment → **Promote to Production** (takes ~30 seconds).

**DNS / domain:** `app.bitbit.chat` → CNAME → `cname.vercel-dns.com`. DNS TTL change takes up to 48 hours. Vercel SSL is auto-provisioned and renewed.

---

## Failure Scenarios & Runbooks

---

### Scenario A: Supabase Down

**Symptoms:** 500 errors across all authenticated routes, login fails, agents error

**Mitigation:** Vercel serves a maintenance page if the app detects DB unavailability. Currently handled by graceful degradation in API routes (returns 503).

**Steps:**
1. Check [status.supabase.com](https://status.supabase.com) — if Supabase-side incident, wait for resolution
2. If it's your project specifically: log into Supabase dashboard → check **Database → Logs**
3. If the machine is down/unresponsive: contact Supabase support at [supabase.com/support](https://supabase.com/support)
4. If corruption or data loss: use PITR to restore (see Supabase section above)
5. Once restored: verify health check at `https://app.bitbit.chat/api/monitoring/health`

**RTO for Supabase outage (their infra):** Depends on Supabase SLA; typically < 30 min for major incidents
**RTO for data restoration (PITR):** 20–40 minutes

---

### Scenario B: Pinecone Down

**Symptoms:** RAG context is empty or returns errors; agent responses are less contextual but still functional

**Mitigation:** The retriever (`src/lib/rag/retriever.ts`) should fall back to DB-only keyword search when Pinecone is unavailable.

**Steps:**
1. Check [status.pinecone.io](https://status.pinecone.io)
2. If temporary: RAG auto-degrades; no action needed. Agents continue working.
3. If index is corrupted/deleted: re-run the backfill embed job (see Pinecone section above)
4. Monitor re-index progress via Pinecone dashboard → index stats

**User impact:** Reduced response quality (no semantic search), not an outage

---

### Scenario C: Fly.io Worker Crash

**Symptoms:** Embed jobs fail, Cloudflare cron jobs return 5xx, agent actions not executing

**Auto-recovery:** Fly.io auto-restarts crashed machines within ~90 seconds.

**Steps:**
1. Check machine status: `fly status --app bitbit-workers`
2. View logs: `fly logs --app bitbit-workers`
3. If stuck in crash loop (restarts > 5 in 10 min): `fly machine restart <machine-id> --app bitbit-workers`
4. If secrets were wiped (unlikely): re-set via `fly secrets set KEY=VALUE --app bitbit-workers`
5. If deployment is broken: `fly deploy --app bitbit-workers` from `deployments/fly/`
6. Check that Cloudflare cron is healthy: `wrangler tail bitbit-edge-cron`

**RTO:** 2–5 minutes for auto-restart; 15 minutes for manual redeploy

---

### Scenario D: Vercel Deploy Failure

**Symptoms:** New deployment is broken; production traffic may be affected if it was promoted

**Steps:**
1. Go to [vercel.com](https://vercel.com) → **awu-team/bitbit** → **Deployments**
2. Find the last working deployment (green checkmark)
3. Click **...** → **Promote to Production**
4. Monitor: deployment takes ~30 seconds, then verify `app.bitbit.chat`
5. Investigate the broken build in the Deployments tab: check build logs and Sentry for new errors
6. Fix in a branch, push a new commit — do NOT force-push to main

**RTO:** < 5 minutes (rollback is instant)

---

### Scenario E: API Key Compromise

**If a secret key is exposed** (e.g., committed to git, leaked in logs):

**Immediate steps (within 15 minutes):**

1. **Identify which key** — check git history, Sentry logs, or the security audit
2. **Revoke the key at source** (do this first, before rotating):
   - Anthropic: [console.anthropic.com](https://console.anthropic.com) → API Keys → Revoke
   - Supabase Service Role: Supabase Dashboard → Settings → API → Regenerate
   - Stripe: [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys → Roll
   - Resend: [resend.com/api-keys](https://resend.com/api-keys) → Delete
   - Telnyx: Telnyx Portal → API Keys → Delete
   - WORKER_AUTH_TOKEN: generate new: `openssl rand -hex 32`
3. **Generate a new key** at the same service
4. **Update Vercel environment variables:**
   ```bash
   vercel env rm KEY_NAME production
   vercel env add KEY_NAME production
   ```
5. **Trigger a new Vercel deployment** to pick up the new env var (Vercel doesn't auto-redeploy on env change)
6. **Update Fly.io secrets** if the key is used by workers:
   ```bash
   fly secrets set NEW_KEY=value --app bitbit-workers
   ```
7. **Scrub git history** if the key was committed:
   ```bash
   pip3 install git-filter-repo --break-system-packages
   git filter-repo --replace-text <(echo "LEAKED_KEY==>REDACTED")
   git push --force origin main  # warn Andy before doing this
   ```
8. **Check for active abuse** — Stripe dashboard, Anthropic usage, Resend sends

**RTO for key rotation:** 15–30 minutes
**Keys stored in 1Password:** Google (64b2kytbww6wtc7pk4qmom3xy4), Stripe, Resend — see MEMORY.md for item IDs

---

## Verification Script

Run `personal-assistant/scripts/verify-backups.sh` to get a quick health snapshot of all services. It checks:
- Supabase project reachability
- Fly.io machine health
- Pinecone index stats
- Cloudflare Worker health

---

## Contact & Access

| Resource | URL / Command |
|----------|--------------|
| Supabase dashboard | https://supabase.com/dashboard/project/johvduasrhmufrfdxjus |
| Supabase status | https://status.supabase.com |
| Fly.io dashboard | https://fly.io/apps/bitbit-workers |
| Vercel dashboard | https://vercel.com/awu-team/bitbit/deployments |
| Pinecone console | https://app.pinecone.io |
| Sentry | https://bitbit-d1.sentry.io |
| Cloudflare | https://dash.cloudflare.com (account 6a3ff72b) |
| Fly.io CLI | `fly status --app bitbit-workers` |
| Vercel CLI | `vercel ls` |
