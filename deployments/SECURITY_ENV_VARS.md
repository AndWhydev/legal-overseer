# BitBit Deployment Security: Environment Variables

This document describes the security-critical environment variables required for BitBit deployments.

## Overview

BitBit uses three security tokens to protect different components:

1. **CRON_SECRET** — Protects scheduled cron routes in the Next.js dashboard
2. **WORKER_AUTH_TOKEN** — Authenticates task dispatch from Cloudflare to Fly worker
3. **Fly.io secrets** — Standard API keys (Supabase, etc.)

---

## 1. CRON_SECRET (Next.js Dashboard)

### Location
- Set on: Vercel deployment
- Used by: All routes under `/api/cron/*` in `personal-assistant/`

### Purpose
Prevents unauthorized triggering of scheduled tasks (channel sync, proactive alerts, etc.).

### Implementation
All cron routes use the `withCronGuard()` wrapper from `personal-assistant/src/lib/cron/cron-guard.ts`:

```typescript
// Any cron route automatically checks CRON_SECRET
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Your handler code
  })
}
```

The guard validates:
- Authorization header: `Bearer ${CRON_SECRET}`
- Returns `401 Unauthorized` if missing or invalid
- Logs all unauthorized attempts

### Setup

1. Generate a random token:
   ```bash
   openssl rand -hex 32
   ```

2. Set on Vercel:
   ```bash
   vercel env add CRON_SECRET
   # Paste the token when prompted
   # Do this for: Preview, Development, Production
   ```

3. Test:
   ```bash
   curl -H "Authorization: Bearer YOUR_SECRET" \
     https://bitbit.app/api/cron/channel-sync
   ```

---

## 2. WORKER_AUTH_TOKEN (Fly → Worker Authentication)

### Location
- Set on: Fly.io machine via `fly secrets set`
- Used by:
  - Fly worker (`deployments/fly/src/worker.ts`) — validates incoming requests
  - Cloudflare worker (`deployments/cloudflare/src/index.ts`) — sends token with dispatch

### Purpose
Prevents unauthorized task execution on the Fly worker. Only the Cloudflare edge cron can dispatch jobs.

### Implementation

**Cloudflare Worker (dispatcher)**:
```typescript
const response = await fetch(`${env.WORKER_CALLBACK_URL}/api/agent/run`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${env.WORKER_AUTH_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ task_id, agent_type, payload }),
});
```

**Fly Worker (receiver)**:
```typescript
async function handleAgentRun(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.WORKER_AUTH_TOKEN;

  if (!expectedToken) {
    json(res, 500, { error: "Server misconfigured: missing WORKER_AUTH_TOKEN" });
    return;
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }
  // ... rest of handler
}
```

### Setup

1. Generate a random token:
   ```bash
   openssl rand -hex 32
   ```

2. Set on Fly.io:
   ```bash
   cd /path/to/bitbit
   fly secrets set WORKER_AUTH_TOKEN=YOUR_TOKEN_HERE -a bitbit-cheekyglo
   ```

3. Verify it was set:
   ```bash
   fly secrets list -a bitbit-cheekyglo
   ```

4. Test by triggering a dispatch from Cloudflare:
   ```bash
   # In your Cloudflare worker environment, curl the /trigger endpoint
   curl -X POST https://bitbit-edge-cron.example.com/trigger
   ```

---

## 3. Fly Deployment Secrets

### Standard Secrets
These are set via `fly secrets set`:

```bash
fly secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  -a bitbit-cheekyglo
```

See `fly.toml` for the full list of environment variables.

---

## 4. Cloudflare Worker Environment

### Required Variables
Set in `wrangler.toml` or Cloudflare dashboard:

```
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
WORKER_CALLBACK_URL=<your-fly-worker-url>
WORKER_AUTH_TOKEN=<shared-with-fly-worker>
ENVIRONMENT=production
```

---

## Rate Limiting

### Cloudflare Worker — /trigger Endpoint
- **Limit**: 10 requests per minute per IP
- **Mechanism**: In-memory counter per client IP
- **Response**: 429 Too Many Requests
- **Code**: `deployments/cloudflare/src/index.ts`

```typescript
function isRateLimited(clientIp: string): boolean {
  // Tracks requests per IP, resets every 60 seconds
}
```

---

## Health Checks

### Fly.io Health Check
- **Path**: `/api/monitoring/health` (was incorrectly `/health`)
- **Port**: 8080 (matches internal port in Dockerfile)
- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Grace period**: 10 seconds
- **Config**: `fly.toml` (fixed in this PR)

---

## Security Best Practices

1. **Rotate tokens regularly** (every 90 days for production)
2. **Use different tokens** for each environment (dev, staging, prod)
3. **Never commit secrets** to version control
4. **Log all unauthorized attempts** (already implemented)
5. **Monitor rate limit hits** in Cloudflare analytics

---

## Troubleshooting

### "Unauthorized" errors on cron routes
- Check CRON_SECRET is set on Vercel
- Verify Authorization header format: `Bearer {token}` (no extra spaces)
- Check that the route uses `withCronGuard()`

### Fly worker not receiving tasks from Cloudflare
- Verify WORKER_AUTH_TOKEN is set on both Fly and Cloudflare
- Check tokens are identical
- Test with `curl -H "Authorization: Bearer {token}" {fly-url}/api/agent/run`

### Rate limit errors on /trigger
- Check Cloudflare Analytics for IP address distribution
- Verify your client IP isn't shared with many other users (office network, VPN, etc.)
- Consider allowlisting trusted IPs if needed

---

## References

- `personal-assistant/src/lib/cron/cron-guard.ts` — Cron auth implementation
- `deployments/fly/src/worker.ts` — Fly worker with auth
- `deployments/cloudflare/src/index.ts` — Cloudflare worker with rate limiting
- `fly.toml` — Fly.io configuration (includes health check path)
