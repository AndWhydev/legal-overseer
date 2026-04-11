# Troubleshooting & Incident Runbook

---

## 1. Health Check Failures

**Symptoms**: `/api/monitoring/health` returns non-200 or times out.

**Diagnosis**:
```bash
curl -v https://app.bitbit.chat/api/monitoring/health
```
- Check Vercel function logs: Vercel Dashboard > Deployments > Functions
- Check Supabase status: Supabase Dashboard > Project > Database health

**Resolution**:
- If Supabase unreachable: check Supabase status page, verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- If Vercel 500: check function logs for stack trace, redeploy if transient
- If timeout: check if database connections are exhausted (Supabase Dashboard > Database > Connections)

**Prevention**: Monitor health endpoint with uptime service (e.g., Betterstack, Checkly).

---

## 2. Sentry Error Spikes

**Symptoms**: Spike in error volume in Sentry dashboard.

**Diagnosis**:
1. Open Sentry: check issue grouping for the spike
2. Look at breadcrumbs and stack traces
3. Check if correlated with a recent deployment (Vercel > Deployments)
4. Check Supabase logs for database errors

**Resolution**:
- If caused by new deploy: rollback in Vercel Dashboard > Deployments > select previous > Promote to Production
- If database-related: check Supabase connection pool, restart if needed
- If third-party API: check circuit breaker status, verify API keys are valid

**Prevention**: Enable Sentry alerts for error rate thresholds. Test in staging before deploying.

---

## 3. Agent Cost Overruns

**Symptoms**: Anthropic API costs exceed expected budget. Cost tracker shows high spend.

**Diagnosis**:
1. Check `agent_runs` table: `SELECT agent_type, count(*), sum(tokens_used) FROM agent_runs WHERE created_at > now() - interval '24 hours' GROUP BY agent_type`
2. Check Anthropic console usage dashboard
3. Look for runaway agent loops in logs

**Resolution**:
- If single agent type: check its configuration in `agent_configs` table, reduce `max_tokens` or frequency
- If runaway loop: the circuit breaker should have tripped — check `dead_letter_queue` for failed runs
- Emergency: set agent cost cap lower in `agent_configs`, or temporarily disable the agent
- Verify cost guard is active in scheduler.ts

**Prevention**: Set per-agent and global daily cost caps. Monitor `agent_runs` costs daily.

---

## 4. Webhook Delivery Failures

**Symptoms**: WhatsApp messages not arriving, Stripe payments not processing, Asana updates missing.

**Diagnosis**:
```bash
# Check channel status
curl https://app.bitbit.chat/api/channels/status

# Check webhook logs in provider dashboards:
# - Stripe: Developers > Webhooks > select endpoint > Recent deliveries
# - Meta: App Dashboard > Webhooks > Recent deliveries
# - Asana: check webhook subscription status
```

**Resolution**:
- If 401/403: secret or token has expired — rotate per docs/secret-rotation.md
- If 500: check Vercel function logs for the webhook route
- If timeout: webhook handler is too slow — check for database bottlenecks
- If DNS: verify webhook URLs point to correct domain
- WhatsApp HMAC failure: verify `WHATSAPP_APP_SECRET` matches Meta dashboard

**Prevention**: Enable webhook retry in provider settings. Monitor delivery success rates.

---

## 5. Authentication Issues

**Symptoms**: Users can't log in, 401 errors on dashboard, session expires immediately.

**Diagnosis**:
1. Check Supabase Auth logs: Authentication > Logs
2. Verify redirect URLs in Supabase Auth settings include the app domain
3. Check if `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
4. Check middleware.ts for bypass issues

**Resolution**:
- If redirect URL mismatch: add correct URL in Supabase Auth > URL Configuration
- If anon key wrong: update in Vercel env vars and redeploy
- If cookies not setting: check domain/CORS settings, ensure HTTPS
- If `DEV_BYPASS_AUTH` is accidentally set in production: the production guard logs a critical error and blocks the bypass

**Prevention**: Test auth flow after every deployment. Never set `DEV_BYPASS_AUTH` in production env vars.

---

## 6. Database Connection Timeouts

**Symptoms**: Slow page loads, 500 errors, "connection timeout" in logs.

**Diagnosis**:
1. Supabase Dashboard > Database > Connections — check active/idle counts
2. Check for long-running queries: Database > Query Performance
3. Check if connection pooler (Supavisor) is healthy

**Resolution**:
- If pool exhausted: restart the database from Supabase dashboard (Settings > General > Restart)
- If long-running query: identify and kill it via SQL Editor: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > interval '5 minutes'`
- If consistently high: upgrade Supabase plan for more connections

**Prevention**: Use connection pooling (default with Supabase). Add query timeouts. Add pagination to heavy queries.

---

## 7. Cron Jobs Not Firing

**Symptoms**: Scheduled tasks not running, stale data, morning briefing not sent.

**Diagnosis**:
1. Vercel Dashboard > Crons tab — check execution history
2. Verify `vercel.json` has all 9 crons configured
3. Check if `CRON_SECRET` matches between Vercel env and cron route auth
4. Check Vercel plan — free plan limits cron to once/day

**Resolution**:
- If auth failure: verify `CRON_SECRET` env var matches the route's expected header
- If not configured: check `personal-assistant/vercel.json` for missing entries
- If plan limit: upgrade to Pro, or use VPS cron as fallback
- If function timeout: optimize the cron handler, break into smaller tasks

**Prevention**: Monitor cron execution logs. Set up alerting for missed scheduled runs.

---

## 8. Realtime Subscriptions Dropping

**Symptoms**: Dashboard not updating live, notification center stale, agent status indicator not reflecting changes.

**Diagnosis**:
1. Browser DevTools > Network > WS tab — check WebSocket connection status
2. Supabase Dashboard > Realtime > check channel subscriptions
3. Check if Supabase Realtime is enabled for the relevant tables

**Resolution**:
- If WebSocket disconnects: the client-side hook has automatic reconnection — check browser console for errors
- If Realtime not enabled: enable via Supabase Dashboard > Database > Replication
- If hitting connection limits: upgrade Supabase plan
- Fallback: the SSE endpoint at `/api/realtime/sse` provides polling-based updates

**Prevention**: Monitor realtime connection counts. The sidebar badge system includes a 30-second polling fallback.

---

## 9. Build Failures

**Symptoms**: Vercel deployment fails, TypeScript errors, ESLint errors.

**Diagnosis**:
1. Vercel Dashboard > Deployments > select failed > Build Logs
2. Run locally: `cd personal-assistant && npx tsc --noEmit && npx eslint src/`

**Resolution**:
- TypeScript errors: fix type issues (ignoreBuildErrors is disabled)
- ESLint errors: fix lint issues (continue-on-error is disabled in CI)
- Dependency issues: clear Vercel build cache (Settings > General > Build Cache > Clear)
- If agent package resolution: verify webpack aliases in next.config.ts

**Prevention**: Run `npm run build` locally before pushing. CI catches issues on PR.

---

## Incident Response Template

```
## Incident: [TITLE]
**Severity**: P1/P2/P3
**Detected**: [timestamp]
**Resolved**: [timestamp]
**Duration**: [minutes]

### Timeline
- HH:MM — Issue detected via [monitoring/user report]
- HH:MM — Investigation started
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Verified resolved

### Root Cause
[Description]

### Resolution
[What was done to fix it]

### Prevention
[What changes will prevent recurrence]
```

---

## Dashboard Links

| Service | URL |
|---------|-----|
| Vercel | https://vercel.com/dashboard |
| Supabase | https://supabase.com/dashboard |
| Sentry | https://sentry.io (check SENTRY_DSN for org) |
| Fly.io | https://fly.io/dashboard |
| Stripe | https://dashboard.stripe.com |
| Anthropic | https://console.anthropic.com |
| Meta Business | https://business.facebook.com |
| Resend | https://resend.com/overview |
