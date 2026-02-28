# Phase 13: Deployment Stability — Implementation Context

> Decisions gathered through discussion. Downstream agents (researcher, planner) should treat these as locked unless contradicted by technical discovery.

## 1. Cron Job Strategy

### Runtime Decision: Claude decides
- Evaluate Vercel Cron vs Cloudflare Workers vs split approach
- Consider: Vercel cron limits (1-min minimum, timeout constraints), existing Cloudflare edge cron code in `deployments/cloudflare/`
- Pick the right runtime per job based on frequency and criticality

### Failure Handling: Claude decides
- Pick appropriate failure handling per job criticality
- Options range from retry+alert (for critical jobs like digest/reports) to log-only (for non-critical)
- Consider existing audit logging and Sentry integration

### Status Visibility: Claude decides
- Evaluate what's already built in admin panel (`src/lib/admin/`)
- Decide whether a dedicated cron health view adds value vs relying on existing audit logs + Sentry

### Deploy Gap Tolerance: Claude decides
- Evaluate based on job frequency (most are hourly/daily)
- Consider whether external triggers are needed to prevent missed runs during Vercel redeploys

## 2. Cold Start Mitigation

### Approach: Claude decides
- Must meet success criteria: agent classification requests < 3 seconds from cold start
- Evaluate keep-alive pings vs boot optimization vs hybrid approach
- Consider route priority (agent classification routes are most latency-sensitive for WhatsApp/channel messages)

### Vercel Tier: Plan for constraints, note where Pro helps
- User is not sure of current tier
- Plan conservatively for hobby constraints (10s timeout, limited concurrency)
- Document where Pro plan would unlock better performance

### External Monitoring: Claude decides
- Evaluate existing monitoring in `src/lib/monitoring/uptime-tracker.ts`
- Consider whether external uptime service (BetterUptime/UptimeRobot) adds value as both monitor and keep-alive

## 3. Connection Pooling

### Pool Method: Claude decides
- User wants the option that scales effectively across all BitBit operations
- Evaluate Supabase's built-in pooler (Supavisor) vs self-managed PgBouncer
- Must handle 10 concurrent agent requests without pool exhaustion (success criteria)

### Exhaustion Strategy: Claude decides
- Pick based on agent vs dashboard traffic patterns
- Options: queue-and-wait (slower, no failures) vs fail-fast-with-retry (prevents cascading timeouts)

### Pool Separation: Claude decides
- Evaluate single pool vs separate pools for dashboard reads vs agent writes
- Must satisfy the 10-concurrent-agent success criteria

### Tier Recommendation: Recommend for scale
- User wants the correct option eligible to scale across all BitBit operations
- Research Supabase free vs Pro tier connection limits
- Make a clear recommendation with reasoning

## 4. Multi-Runtime Split

### Architecture: Three runtimes (LOCKED)
- **Vercel**: Dashboard, API routes, most serverless functions
- **Cloudflare Workers**: Edge cron, lightweight edge tasks
- **Fly.io**: Browser-based agent tasks (scraping, web automation, headless browser work) — **LOCKED: needed now**

### Rationale
- Vercel and Cloudflare cannot run headless browsers (no Puppeteer/Playwright support)
- Fly.io provides persistent compute for browser automation that agents need
- Three-runtime architecture is the minimum viable setup

### Health Checks: Claude decides
- Each runtime needs health checking
- Claude picks appropriate depth (simple vs deep) based on what each runtime does

### Deployment: CI/CD on push to main (LOCKED)
- GitHub Actions deploys all three runtimes when main is updated
- Existing CI/CD scaffolding to build on
- Vercel auto-deploys from git; Fly.io and Cloudflare via GitHub Actions

## Deferred Ideas
*(None raised during discussion)*

## Success Criteria Reference
1. Vercel production build deploys cleanly and all pages load without errors
2. All 9 cron jobs fire on schedule and complete successfully over a 24-hour observation window
3. Agent classification requests return in under 3 seconds from cold start
4. 10 concurrent agent requests execute without connection pool exhaustion
5. Fly.io workers and Cloudflare edge cron are deployed and responding to health checks
