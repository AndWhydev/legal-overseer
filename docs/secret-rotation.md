# Secret Rotation Policy

Recommended schedule: **quarterly** (every 90 days), or immediately if a secret is suspected compromised.

---

## Rotation Procedures

### ANTHROPIC_API_KEY

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment |
| Downtime | None (zero-downtime with staged rollout) |

1. Generate a new key at [console.anthropic.com](https://console.anthropic.com) > API Keys
2. Update in **Vercel**: Settings > Environment Variables > `ANTHROPIC_API_KEY`
3. Update in **Fly.io**: `fly secrets set ANTHROPIC_API_KEY=sk-ant-NEW`
4. Redeploy both services
5. Verify: trigger a chat or agent run, confirm AI responses work
6. Delete the old key in Anthropic console

### SUPABASE_SERVICE_ROLE_KEY

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment |
| Downtime | Brief — all server-side Supabase calls fail until redeployed |

1. In Supabase dashboard: Settings > API > Generate new service role key
2. Update in **Vercel**: `SUPABASE_SERVICE_ROLE_KEY`
3. Update in **Fly.io**: `fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...`
4. Update in **VPS** `.env` if applicable
5. Redeploy all services
6. Verify: hit `/api/monitoring/health` and confirm database connectivity
7. The old key is automatically invalidated by Supabase

### CRON_SECRET / SCHEDULER_SECRET / RELAY_SECRET

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment + VPS cron update |
| Downtime | Cron jobs fail until all services updated |

1. Generate a new random secret: `openssl rand -hex 32`
2. Update in **Vercel**: the relevant env var
3. Update in **Fly.io**: `fly secrets set CRON_SECRET=NEW_VALUE`
4. Update **VPS** cron scripts in `/etc/cron.d/bitbit` with new Bearer token
5. Redeploy Vercel and Fly.io
6. Verify: check Vercel cron logs for successful executions

### CREDENTIALS_KEY

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment + data re-encryption |
| Downtime | Stored credentials unreadable until re-encrypted |

1. Generate new key: `openssl rand -hex 32`
2. **Before updating**: run a decrypt-then-re-encrypt migration against stored credentials in Supabase using both old and new keys
3. Update in **Vercel**: `CREDENTIALS_KEY`
4. Redeploy
5. Verify: test OAuth flows that use stored credentials (Asana, Calendly, Google)

### STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment |
| Downtime | None with staged rollout |

1. In Stripe dashboard: Developers > API Keys > Roll key
2. Stripe provides a grace period where both old and new keys work
3. Update in **Vercel**: `STRIPE_SECRET_KEY`
4. For webhook secret: Developers > Webhooks > select endpoint > Roll secret
5. Update `STRIPE_WEBHOOK_SECRET` in Vercel
6. Redeploy
7. Verify: process a test payment or check webhook delivery logs in Stripe

### WHATSAPP_ACCESS_TOKEN / WHATSAPP_APP_SECRET

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment |
| Downtime | WhatsApp messages fail until updated |

1. In Meta Business Suite: App > WhatsApp > API Setup
2. Generate a new system user token (set 90-day expiry)
3. Update in **Vercel**: `WHATSAPP_ACCESS_TOKEN`
4. For app secret: App Settings > Basic > Reset app secret
5. Update `WHATSAPP_APP_SECRET` in Vercel
6. Redeploy
7. Verify: send a test WhatsApp message, verify webhook HMAC validation passes

### RESEND_API_KEY

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment |
| Downtime | Email sending fails until updated |

1. In Resend dashboard: API Keys > Create new key
2. Update in **Vercel**: `RESEND_API_KEY`
3. Redeploy
4. Verify: trigger a test email (daily digest or notification)
5. Delete old key in Resend dashboard

### OAuth Secrets (OUTLOOK, GOOGLE, ASANA, CALENDLY)

| Property | Value |
|----------|-------|
| Rotation impact | Requires redeployment |
| Downtime | Related integrations fail until updated |

1. Rotate in the respective developer console (Azure, Google Cloud, Asana, Calendly)
2. Update `*_CLIENT_SECRET` in **Vercel**
3. Redeploy
4. Verify: test the OAuth flow for each rotated integration
5. Note: users may need to re-authorize if tokens are invalidated

---

## Hot-Reload vs Restart

| Secret | Hot-reload? |
|--------|-------------|
| `NEXT_PUBLIC_*` vars | No — baked into client bundle at build time, requires rebuild |
| All other env vars | No — Next.js serverless functions read env at cold start. Redeployment triggers new cold starts. |
| Fly.io secrets | `fly secrets set` automatically restarts machines |
| VPS cron secrets | Edit `/etc/cron.d/bitbit` — takes effect on next cron invocation |

---

## Rotation Checklist Template

```
[ ] Generate new secret
[ ] Update in Vercel environment variables
[ ] Update in Fly.io (if applicable): fly secrets set KEY=VALUE
[ ] Update in VPS (if applicable): /etc/cron.d/bitbit or .env
[ ] Redeploy all affected services
[ ] Verify functionality (health check, test request)
[ ] Revoke/delete old secret in provider dashboard
[ ] Log rotation date for next quarterly reminder
```

---

## Rotation Schedule

Set a recurring calendar event for the **1st Monday of each quarter**:
- January, April, July, October
- Rotate all secrets in a single maintenance window
- Coordinate with any active deployments to avoid conflicts
