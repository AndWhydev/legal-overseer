# BitBit Production Deployment Checklist

**Quick reference for deploying to production. See PRODUCTION_REVIEW.md for full analysis.**

---

## Critical Fixes Required Before Deployment

### 1. Fix Fly.io Health Check Path
**File:** `/home/claude/bitbit/fly.toml` (line 47)

```diff
  [checks.health]
    port = 8080
-   path = "/health"
+   path = "/api/monitoring/health"
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
```

**Why:** Worker listens on `/api/monitoring/health`, not `/health`. Without this, Fly.io thinks the instance is unhealthy and restart loops it.

---

### 2. Add Request Authentication to Fly Worker
**File:** `/home/claude/bitbit/deployments/fly/src/worker.ts` (around line 96)

Add before the payload check:

```typescript
async function handleAgentRun(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // NEW: Validate worker secret
  const workerSecret = process.env.WORKER_SECRET
  const authHeader = req.headers.authorization || ''

  if (workerSecret && authHeader !== `Bearer ${workerSecret}`) {
    json(res, 401, { error: 'Unauthorized' })
    return
  }

  // ... rest of function
}
```

**Why:** Without this, anyone who discovers your Fly URL can submit arbitrary tasks.

**Add to environment:** `WORKER_SECRET` (32+ character random string)

---

### 3. Rate-Limit Cloudflare Worker Trigger
**File:** `/home/claude/bitbit/deployments/cloudflare/src/index.ts` (around line 82)

```typescript
if (url.pathname === "/trigger" && request.method === "POST") {
  // NEW: Simple rate limit (one trigger per 30 seconds)
  const rateLimitKey = "trigger-throttle"
  const lastTrigger = await env.TRIGGER_KV.get(rateLimitKey)
  const now = Date.now()

  if (lastTrigger && (now - parseInt(lastTrigger)) < 30000) {
    return jsonResponse({ error: "Rate limited" }, 429)
  }

  await env.TRIGGER_KV.put(rateLimitKey, now.toString(), { expirationTtl: 60 })
  ctx.waitUntil(pollAndDispatch(env))
  return jsonResponse({ dispatched: true })
}
```

**Why:** Prevents abuse and reduces unnecessary Supabase queries.

**Note:** Requires KV binding. Alternative: Remove `/trigger` endpoint entirely for production (cron already runs automatically).

---

### 4. Set CRON_SECRET in All Environments

This is non-negotiable. Without it, cron endpoints are public.

```bash
# Generate strong secret
openssl rand -base64 32

# Fly.io
flyctl secrets set CRON_SECRET="<generated-secret>"

# Cloudflare
wrangler secret put CRON_SECRET
# Paste: <generated-secret>

# VPS (.env file)
echo "CRON_SECRET=<generated-secret>" >> /opt/bitbit/.env

# Vercel (Next.js cron routes)
# Set via dashboard: Settings → Environment Variables
```

---

## Environment Variables Checklist

### Fly.io (both configs)

```bash
# deployments/fly/fly.toml and fly.toml (root)

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sbp_...
ANTHROPIC_API_KEY=sk-ant-...
WORKER_SECRET=<generated-above>  # NEW
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
TZ=Australia/Sydney
```

### Cloudflare Workers

```bash
# wrangler.toml variables + secrets

# Variables (in wrangler.toml)
ENVIRONMENT=production

# Secrets (via wrangler secret put)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WORKER_CALLBACK_URL  # https://bitbit-workers.fly.dev (your Fly app)
CRON_SECRET          # NEW
```

### VPS (docker-compose)

Create `/opt/bitbit/.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=sbp_...
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=<generated-above>  # NEW

# Email (optional, for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=app-password

# Channel integrations (as available)
ASANA_ACCESS_TOKEN=
CALENDLY_API_KEY=
STRIPE_SECRET_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# Monitoring
SENTRY_DSN=
SENTRY_ENVIRONMENT=production

# Chrome worker
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
AUSTENDER_BASE_URL=https://www.tenders.gov.au

# System
NODE_ENV=production
LOG_LEVEL=info
WORKER_TYPE=cron  # or chrome
```

### Vercel (Next.js Cron Routes)

```bash
# Settings → Environment Variables

CRON_SECRET=<generated-above>  # NEW
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
# ... other service keys as needed
```

---

## Deployment Steps

### 1. Verify Fixes Applied

```bash
# Confirm fly.toml health check path
grep -A2 "path = " fly.toml

# Confirm worker.ts has auth check
grep -A3 "WORKER_SECRET" deployments/fly/src/worker.ts

# Confirm Cloudflare has rate limiting (or no /trigger)
grep -A5 "/trigger" deployments/cloudflare/src/index.ts
```

### 2. Deploy Fly.io

```bash
# Root Fly config (background cron, metrics)
flyctl secrets set CRON_SECRET="<secret>"
flyctl secrets set SUPABASE_URL="<url>"
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY="<key>"
flyctl secrets set ANTHROPIC_API_KEY="<key>"
fly deploy -c fly.toml

# Workers Fly config (agent executor)
flyctl secrets set WORKER_SECRET="<secret>"  # NEW
fly deploy -c deployments/fly/fly.toml --app bitbit-workers
```

### 3. Deploy Cloudflare Workers

```bash
cd deployments/cloudflare
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put WORKER_CALLBACK_URL  # e.g., https://bitbit-workers.fly.dev
wrangler secret put CRON_SECRET
wrangler deploy
```

### 4. Deploy VPS

```bash
# On your local machine
scp -r deployments/vps/* deploy@your-vps:/opt/bitbit/

# On the VPS
ssh deploy@your-vps
cd /opt/bitbit
docker-compose up -d

# Verify
docker ps
docker-compose logs -f agent-worker
```

### 5. Deploy Vercel (Next.js Cron Routes)

```bash
# Via Vercel dashboard or CLI
vercel env add CRON_SECRET
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... other vars
vercel deploy --prod
```

---

## Post-Deployment Validation

### Check All Health Endpoints

```bash
# Fly.io root
curl https://bitbit-cheekyglo.fly.dev/health

# Fly.io workers
curl https://bitbit-workers.fly.dev/api/monitoring/health

# Cloudflare
curl https://bitbit-edge-cron.workers.dev/health

# Vercel cron (with secret)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-dashboard.vercel.app/api/cron/channel-sync
```

### Trigger One Poll Cycle

```bash
# Via Cloudflare manual trigger
curl -X POST https://bitbit-edge-cron.workers.dev/trigger

# Then check logs for dispatch success
# Fly logs
flyctl logs --app bitbit-workers

# Vercel logs
vercel logs --prod
```

### Monitor First 24 Hours

- Watch Fly.io instance dashboard (no restart loops)
- Check Sentry for errors
- Review cron job logs in Vercel
- Verify Supabase agent_task_queue changes (pending → completed)

---

## Troubleshooting

### Fly.io instances restart constantly

**Cause:** Health check failing
**Fix:** Ensure path is `/api/monitoring/health` not `/health`

```bash
fly logs --app bitbit-workers
```

### Cloudflare Worker fails to dispatch tasks

**Cause:** WORKER_CALLBACK_URL not set or Fly worker rejects request
**Fix:**
1. Check Cloudflare secret is set: `wrangler secret list`
2. Check Fly worker has WORKER_SECRET set
3. Test manually: `curl -H "Authorization: Bearer $WORKER_SECRET" -X POST https://bitbit-workers.fly.dev/api/agent/run -d '{"task_id":"test","agent_type":"sentry","payload":{}}'`

### Cron routes return 401 Unauthorized

**Cause:** CRON_SECRET not set or missing from request header
**Fix:** Add header when testing: `curl -H "Authorization: Bearer $CRON_SECRET" https://...`

### VPS containers not starting

**Cause:** .env file missing or invalid
**Fix:**
```bash
docker-compose logs agent-worker
docker-compose logs chrome-worker
# Fix .env and retry
docker-compose up -d
```

---

## Quick Command Reference

```bash
# Generate secure secret
openssl rand -base64 32

# Check deployment status
flyctl status --app bitbit-workers
flyctl status --app bitbit-cheekyglo
wrangler deployments list
vercel list --prod

# View logs
fly logs --app bitbit-workers
fly logs --app bitbit-cheekyglo
wrangler tail  # Cloudflare live logs
vercel logs --prod
docker-compose logs -f  # VPS

# Run cron manually
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-dashboard.vercel.app/api/cron/channel-sync

# Test worker
curl https://bitbit-workers.fly.dev/api/monitoring/health
curl https://bitbit-cheekyglo.fly.dev/health

# Update Fly secrets
flyctl secrets set KEY=VALUE
```

---

## Sign-Off

**Status:** Ready to deploy after applying fixes #1-4 above.

**Estimated deployment time:** 1-2 hours (includes testing)

**Rollback plan:** Each platform supports instant rollback:
- Fly.io: `flyctl releases list` → `flyctl releases rollback`
- Cloudflare: Publish previous version via dashboard
- Vercel: Revert to previous deployment
- VPS: Keep previous docker-compose config, roll back with git

