# BitBit Pre-Launch Checklist

Generated: 2026-03-15
Auditor: Automated code analysis

---

## Task #63: Environment Variables on Vercel Production

### Critical (app will crash or be non-functional if missing)

| Variable | Used By | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, all data access, middleware | **PASS** - required by both `env-validation.ts` and `env-validator.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth, middleware, onboarding | **PASS** - required |
| `SUPABASE_SERVICE_ROLE_KEY` | All server-side routes (webhooks, cron, admin, agents) | **PASS** - required |
| `ANTHROPIC_API_KEY` | AI text, AI voice, all agent operations | **PASS** - required |

### High Priority (core features break without these)

| Variable | Used By | Status |
|----------|---------|--------|
| `CRON_SECRET` | Middleware protects all `/api/cron/*` (14 cron jobs) | **NEEDS_ACTION** - marked required in `env-validation.ts` (min 16 chars) but optional in `env-validator.ts`. Without it, ALL cron jobs return 401 |
| `SCHEDULER_SECRET` | `/api/agent/scheduler`, `/api/agent/leads/ack`, `/api/agent/approvals/digest` | **NEEDS_ACTION** - required in `env-validation.ts` but not listed in `env-validator.ts`. Without it, scheduler and lead ack endpoints reject all requests |
| `RESEND_API_KEY` | All email: approvals, digest, weekly report, monthly report, invoices, lead ack, onboarding, escalation | **NEEDS_ACTION** - marked optional in validation but all email functionality is dead without it. Graceful degradation (returns false/null) |
| `NEXT_PUBLIC_APP_URL` | OAuth redirects, email links via `getAppUrl()` | **NEEDS_ACTION** - optional in validation. `getAppUrl()` throws in production if unset |

### Medium Priority (specific integrations break)

| Variable | Used By | Status |
|----------|---------|--------|
| `STRIPE_SECRET_KEY` | Billing checkout, payment processing | **PASS** - optional, graceful skip |
| `STRIPE_WEBHOOK_SECRET` | `/api/webhooks/stripe`, `/api/billing/webhook` | **PASS** - returns 500 with log if missing |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API message sending | **PASS** - optional |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API auth | **NEEDS_ACTION** - per MEMORY.md this token is EXPIRED. Needs permanent System User token from Meta Business Suite |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook verification | **PASS** - optional |
| `WHATSAPP_APP_SECRET` | WhatsApp webhook signature verification | **PASS** - optional |
| `WHATSAPP_ANDY_PHONE` | Notification dispatcher sends WhatsApp to owner | **PASS** - optional |
| `GOOGLE_CLIENT_ID` | Google OAuth flow | **PASS** - optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth flow | **PASS** - optional |
| `SLACK_BOT_TOKEN` | Slack integration | **PASS** - optional |
| `SLACK_SIGNING_SECRET` | `/api/webhooks/slack` signature verification | **PASS** - returns 401 if missing |
| `TELNYX_API_KEY` | SMS sending | **PASS** - optional |
| `TELNYX_WEBHOOK_SECRET` | `/api/webhooks/sms` verification | **PASS** - returns 401 if missing |
| `RELAY_SECRET` | `/api/channels/relay` authentication | **PASS** - optional, rejects if missing |
| `WORKER_AUTH_TOKEN` | `/api/agent/invoices/dispatch`, `/api/workers/embed` auth | **PASS** - optional |
| `CREDENTIALS_KEY` | AES encryption for stored credentials | **PASS** - optional |

### Low Priority (optional features, graceful degradation)

| Variable | Used By | Status |
|----------|---------|--------|
| `OPENAI_API_KEY` | Voice transcription (Whisper) | **PASS** - falls back to text-only |
| `NOTIFICATION_FROM_EMAIL` | Email sender address | **PASS** - defaults to `bitbit@bitbit.chat` |
| `NOTIFICATION_TO_EMAIL` | Email recipient for notifications | **PASS** - defaults to `andy@allwebbedup.com.au` |
| `RESEND_FROM_EMAIL` | Invoice email sender | **PASS** - defaults to `invoices@bitbit.chat` |
| `MONTHLY_REPORT_FROM_EMAIL` | Monthly report sender | **PASS** - falls back to NOTIFICATION_FROM_EMAIL |
| `MONTHLY_REPORT_RECIPIENTS` | Monthly report recipients | **PASS** - falls back to NOTIFICATION_TO_EMAIL |
| `DEFAULT_ORG_ID` | WhatsApp fallback org, single-tenant setups | **PASS** - optional |
| `BITBIT_DEPLOYMENT` | Policy/voice loading per deployment | **PASS** - optional |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking init | **PASS** - Sentry silently disabled if missing |
| `SENTRY_ENVIRONMENT` | Sentry environment tag | **PASS** - falls back to NODE_ENV |
| `OUTLOOK_TENANT_ID` | Microsoft Outlook/Graph | **PASS** - defaults to `common` |
| `OUTLOOK_CLIENT_ID/SECRET` | Outlook OAuth | **PASS** - optional |
| `ASANA_PAT`/`ASANA_ACCESS_TOKEN` | Asana integration | **PASS** - optional |
| `CALENDLY_*` | Calendly integration | **PASS** - optional |
| `GSC_SERVICE_ACCOUNT`/`GSC_SITE_URL` | Google Search Console | **PASS** - optional |
| `GMAIL_USER`/`GMAIL_APP_PASSWORD` | Gmail IMAP access | **PASS** - optional |
| `INSTAGRAM_*` | Instagram integration | **PASS** - optional |
| `FACEBOOK_MESSENGER_*` | FB Messenger integration | **PASS** - optional |
| `TELEGRAM_BOT_TOKEN` | Telegram channel | **PASS** - optional |

### Missing from `.env.local.example` (referenced in code but not documented)

| Variable | Used By | Status |
|----------|---------|--------|
| `PINECONE_API_KEY` | RAG: Pinecone vector DB | **NEEDS_ACTION** - used in `pinecone-client.ts`, `embedding-service.ts`, `context-assembler.ts`, `relay-daemon.ts` but not in `.env.local.example` or `env-validation.ts` |
| `PINECONE_INDEX_NAME` | RAG: Pinecone index selection (defaults to `bitbit-rag`) | **NEEDS_ACTION** - not documented |
| `VOYAGE_API_KEY` | RAG: Voyage-3.5 embeddings | **NEEDS_ACTION** - used in `voyage-client.ts`, `embedding-service.ts` but not in `.env.local.example` or `env-validation.ts` |
| `KUZU_DB_PATH` | RAG: Kuzu knowledge graph path | **NEEDS_ACTION** - not documented |
| `SERPAPI_KEY` | Lead discovery endpoint | **NEEDS_ACTION** - used in `/api/agent/leads/discover/route.ts`, returns 503 if missing |
| `EMAIL_WEBHOOK_SECRET` | `/api/webhooks/email-command` verification | **NEEDS_ACTION** - not documented |
| `ASANA_WEBHOOK_SECRET` | `/api/webhooks/asana` verification | **NEEDS_ACTION** - not documented |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | `/api/webhooks/calendly` verification | **NEEDS_ACTION** - not documented |
| `WHATSAPP_BRIDGE_URL` | Baileys bridge URL | **PASS** - in `env-validation.ts` but not in `.env.local.example` |
| `WHATSAPP_BRIDGE_SECRET` | Baileys bridge auth | **PASS** - in `env-validation.ts` but not in `.env.local.example` |
| `TELNYX_FROM_NUMBER` | SMS sender number | **PASS** - in `env-validation.ts` |
| `TELNYX_MESSAGING_PROFILE_ID` | Telnyx messaging profile | **PASS** - in `env-validation.ts` |
| `WORKER_CALLBACK_URL` | Worker callback URL | **PASS** - in `secrets.ts` registry |

### Summary: Task #63

- **PASS**: 4 critical vars validated and required; most optional vars degrade gracefully
- **NEEDS_ACTION**: 8 env vars are used in code but missing from `.env.local.example` and/or `env-validation.ts` (PINECONE_API_KEY, PINECONE_INDEX_NAME, VOYAGE_API_KEY, KUZU_DB_PATH, SERPAPI_KEY, EMAIL_WEBHOOK_SECRET, ASANA_WEBHOOK_SECRET, CALENDLY_WEBHOOK_SIGNING_KEY)
- **NEEDS_ACTION**: WHATSAPP_ACCESS_TOKEN is expired per MEMORY.md
- **NEEDS_ACTION**: CRON_SECRET inconsistency between the two validators

---

## Task #66: Email Deliverability Verification

### Resend Integration

| Check | Status | Details |
|-------|--------|---------|
| Resend SDK imported | **PASS** | `resend` package used in 7 files: `email-transport.ts`, `email-templates.ts`, `send-invoice.ts`, `monthly-revenue-email.ts`, `onboarding-emails.ts`, `dispatcher.ts`, `conversation-interface.ts` |
| API key check before send | **PASS** | Every email function checks `process.env.RESEND_API_KEY` and returns false/null if missing |
| Graceful degradation | **PASS** | All email sends return success=false with descriptive error, never throw |

### Domain Configuration

| Check | Status | Details |
|-------|--------|---------|
| `bitbit.chat` domain | **PASS** | Per MEMORY.md, bitbit.chat already verified in Resend alongside allwebbedup.com.au |
| `allwebbedup.com.au` domain | **PASS** | Per MEMORY.md, DNS fully configured and verified since Feb 2026 |
| Default sender: `bitbit@bitbit.chat` | **PASS** | Used as fallback in `email-transport.ts` and `email-templates.ts` |
| Invoice sender: `invoices@bitbit.chat` | **PASS** | Used in `send-invoice.ts` default |
| Previous sender changed | **PASS** | Changed from `bitbit@allwebbedup.com.au` to `bitbit@bitbit.chat` in 5 files |

### Email Templates

| Template | File | Status |
|----------|------|--------|
| Approval Needed | `email-transport.ts`, `email-templates.ts` | **PASS** - HTML inline, responsive |
| Sentry Escalation | `email-transport.ts`, `email-templates.ts` | **PASS** - severity color-coded |
| Daily Digest | `email-transport.ts`, `email-templates.ts` | **PASS** - tabular summary |
| Weekly Report | `email-templates.ts` | **PASS** - WoW delta metrics |
| Monthly Revenue Report | `monthly-revenue-email.ts` | **PASS** - grid layout, top clients table |
| Lead Acknowledgment (internal) | `email-transport.ts` | **PASS** |
| Lead Acknowledgment (outbound) | `email-transport.ts` | **PASS** - sends to prospect |
| Command Reply | `email-transport.ts` | **PASS** |
| Invoice | `send-invoice.ts` + `invoice-pdf.ts` | **PASS** - PDF-style HTML |
| Welcome (client onboarding) | `onboarding-emails.ts` | **PASS** - branded, checklist |
| Credential Request | `onboarding-emails.ts` | **PASS** - reminder tracking |
| Generic (dispatcher fallback) | `dispatcher.ts` | **PASS** - plain HTML |

### Manual Verification Required

| Check | Status | Action |
|-------|--------|--------|
| Resend smoke test | **PASS** | Per MEMORY.md, smoke test passed (email delivered to hi@torkay.com) |
| SPF record | **NEEDS_ACTION** | Verify `TXT send` record for bitbit.chat in DNS |
| DKIM record | **NEEDS_ACTION** | Verify `TXT resend._domainkey` record for bitbit.chat in DNS |
| DMARC record | **NEEDS_ACTION** | Verify `TXT _dmarc` record for bitbit.chat in DNS |
| Bounce rate monitoring | **NEEDS_ACTION** | Check Resend dashboard for bounce rates. No code-level bounce handling exists |
| Unsubscribe header | **FAIL** | No `List-Unsubscribe` header in any email template. Required by Gmail/Yahoo 2024 sender requirements for bulk email |

### Summary: Task #66

- **PASS**: Resend integration is solid, 12 email templates exist, graceful degradation throughout
- **PASS**: Both domains verified in Resend
- **NEEDS_ACTION**: DNS records should be manually verified in Resend dashboard
- **FAIL**: No `List-Unsubscribe` header on any template (new Gmail/Yahoo requirement)
- **NEEDS_ACTION**: No bounce/complaint webhook handling from Resend

---

## Task #67: Sentry Error Monitoring Verification

### Configuration Files

| File | Status | Details |
|------|--------|---------|
| `sentry.client.config.ts` | **PASS** | Uses `NEXT_PUBLIC_SENTRY_DSN`, 10% trace sampling in production, Session Replay with masking enabled |
| `sentry.server.config.ts` | **PASS** | Uses `SENTRY_DSN` || `NEXT_PUBLIC_SENTRY_DSN`, 10% trace sampling in production |
| `sentry.edge.config.ts` | **PASS** | Uses `SENTRY_DSN` || `NEXT_PUBLIC_SENTRY_DSN`, 10% trace sampling in production |
| `src/lib/monitoring/sentry.ts` | **PASS** | Custom helpers: `captureAgentError`, `captureChannelError`, `setSentryUserContext`, `withMonitoring` |

### DSN Configuration

| Check | Status | Details |
|-------|--------|---------|
| DSN value | **PASS** | `https://ee289594145ed8a230201cc868efbb41@o4511020549406720.ingest.us.sentry.io/4511020611272704` per `.env.wa-migrate` |
| DSN on Vercel | **PASS** | Per MEMORY.md, `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set on Vercel |
| Graceful skip when unset | **PASS** | All three config files guard with `if (dsn)` before init |

### Source Map Upload

| Check | Status | Details |
|-------|--------|---------|
| `withSentryConfig` in `next.config.ts` | **PASS** | Wraps Next config with Sentry plugin |
| Org/Project config | **PASS** | `org: 'bitbit-d1'`, `project: 'bitbit-dashboard'` (with env var override) |
| `SENTRY_AUTH_TOKEN` on Vercel | **PASS** | Per MEMORY.md, set on Vercel |
| `widenClientFileUpload` | **PASS** | Enabled for better client-side stack traces |
| `errorHandler` | **PASS** | Source map upload failures log warning instead of crashing builds |
| `silent` mode | **PASS** | Suppresses noisy build output |

### Environment Tags

| Check | Status | Details |
|-------|--------|---------|
| Client config | **PASS** | Uses `NODE_ENV` (development/production) |
| Server config | **PASS** | Uses `NODE_ENV` |
| Edge config | **PASS** | Uses `NODE_ENV` |
| Custom sentry.ts | **PASS** | Uses `NEXT_PUBLIC_VERCEL_ENV` || `NODE_ENV` (more granular: preview vs production) |
| `SENTRY_ENVIRONMENT` on Vercel | **PASS** | Set per MEMORY.md |

### Performance Monitoring

| Check | Status | Details |
|-------|--------|---------|
| Trace sampling (production) | **PASS** | 10% across client, server, edge |
| Trace sampling (development) | **PASS** | 100% for local debugging |
| Session Replay | **PASS** | 10% sessions, 100% on error. Text masked, media blocked |
| HTTP integration | **PASS** | Enabled in custom sentry.ts |
| Express integration | **PASS** | Enabled in custom sentry.ts |

### Sentry Usage in Application Code

| Check | Status | Details |
|-------|--------|---------|
| Agent errors | **PASS** | `captureAgentError()` with agent_name tag |
| Channel errors | **PASS** | `captureChannelError()` with channel_name tag |
| User context | **PASS** | `setSentryUserContext()` sets user ID, email, org_id tag |
| Transaction monitoring | **PASS** | `withMonitoring()` wraps async operations |
| Dead letter queue | **PASS** | Uses Sentry in `dead-letter.ts` |
| Confidence router | **PASS** | Uses Sentry in `confidence-router.ts` |

### Gaps

| Check | Status | Details |
|-------|--------|---------|
| Release version tag | **NEEDS_ACTION** | `sentry.client.config.ts` does NOT set `release`. `sentry.ts` uses `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` but client/server/edge configs don't. Source maps may not correlate to releases properly |
| Profile sampling | **NEEDS_ACTION** | `SENTRY_PROFILES_SAMPLE_RATE` defined in `.env.local.example` but not used in any Sentry config file. Profiling is not enabled |
| Custom sentry.ts inconsistency | **NEEDS_ACTION** | Uses `NEXT_PUBLIC_SENTRY_DSN` (without SENTRY_DSN fallback) while server/edge configs use both. Could silently fail on server side |

### Summary: Task #67

- **PASS**: Sentry is well-configured across client, server, and edge runtimes
- **PASS**: Source map upload with error-resilient configuration
- **PASS**: Environment tags, trace sampling, Session Replay all properly configured
- **NEEDS_ACTION**: Release version not set in client/server/edge configs (only in custom sentry.ts)
- **NEEDS_ACTION**: Profiling env var defined but never used
- **NEEDS_ACTION**: Minor DSN env var inconsistency in `src/lib/monitoring/sentry.ts`

---

## Task #68: Rate Limiting Verification

### Rate Limiting Infrastructure

Two rate limiting systems exist:

#### 1. API Rate Limiter (`src/lib/api-rate-limiter.ts`)
- **Type**: In-memory sliding window per IP
- **Used in**: Middleware (`src/middleware.ts`) - applies to ALL `/api/*` routes
- **Limitation**: In-memory Map does not persist across Vercel serverless instances
- **Cleanup**: Stale entries cleaned every 60s, `.unref()` prevents blocking process exit

**Tiers defined:**

| Tier | Max Requests | Window | Applied To |
|------|-------------|--------|------------|
| `auth` | 10/min | 60s | `/api/auth/*` |
| `cron` | 5/min | 60s | `/api/cron/*` |
| `api` | 60/min | 60s | All other `/api/*` |
| `webhook` | 200/min | 60s | `/api/channels/*` |

**Status: PASS** - All API routes get rate limiting via middleware

#### 2. Channel Rate Limiter (`src/lib/channels/rate-limiter.ts`)
- **Type**: Token bucket algorithm with Supabase persistence
- **Fallback**: In-memory when Supabase unavailable
- **Used by**: Channel synthesizer for outbound API calls

**Channel limits:**

| Channel | RPM | Status |
|---------|-----|--------|
| Gmail | 60 | **PASS** |
| Outlook | 120 | **PASS** |
| Asana | 150 | **PASS** |
| Calendly | 60 | **PASS** |
| Stripe | 100 | **PASS** |
| WhatsApp | 80 | **PASS** |
| GSC | 30 | **PASS** |
| ClickUp | 120 | **PASS** |
| GA4 | 60 | **PASS** |
| WordPress | 60 | **PASS** |
| Cluely | 60 | **PASS** |

#### 3. Send Limits (`src/lib/agent/send-limits.ts`)
- **Type**: Daily cap per org per channel via Supabase
- **Limits**: Email: 50/day, SMS: 20/day
- **Status: PASS** - Prevents runaway agent sending

#### 4. Middleware-Level Rate Limiting
Additional in-memory rate limiting in `middleware.ts` itself:

| Route Pattern | Limit | Status |
|---------------|-------|--------|
| `/api/auth/*` | 20/min per IP | **PASS** |
| `/api/webhooks/*` | 100/min per IP | **PASS** |

#### 5. Data Export Rate Limiting
- `/api/data-export`: 1 export per hour per org (database-backed)
- **Status: PASS**

### Routes WITH Rate Limiting

| Route Category | Middleware Rate Limit | Route-Level Rate Limit | Status |
|---------------|----------------------|----------------------|--------|
| `/api/auth/*` | 10/min (api-rate-limiter) + 20/min (middleware) | None | **PASS** |
| `/api/cron/*` | 5/min + CRON_SECRET bearer auth | None | **PASS** |
| `/api/channels/*` | 200/min | Token bucket per channel | **PASS** |
| `/api/webhooks/*` | 100/min (middleware) + 200/min (api-rate-limiter for /api/channels path) | Signature verification | **PASS** |
| `/api/data-export` | 60/min (general) | 1/hour per org (DB) | **PASS** |
| All other `/api/*` | 60/min (general) | None | **PASS** |

### Routes that SHOULD have additional rate limiting but don't

| Route | Risk | Recommendation |
|-------|------|----------------|
| `/api/ai/text` | **HIGH** | Anthropic API calls are expensive. Currently only has general 60/min. Should have tighter per-user limit (e.g., 10/min) to prevent cost abuse |
| `/api/ai/voice` | **HIGH** | OpenAI Whisper + Anthropic double cost. Same concern as above |
| `/api/agent/chat` | **HIGH** | Direct AI chat, expensive. Same concern |
| `/api/account/delete` | **MEDIUM** | Account deletion. Has confirmation param but no rate limit beyond general 60/min. Should be 3/hour |
| `/api/admin/import` | **MEDIUM** | Data import with no route-level rate limit. Potential for large payload abuse |
| `/api/admin/export` | **LOW** | Auth-protected but no specific limit (unlike `/api/data-export` which has 1/hour) |
| `/api/billing/checkout` | **MEDIUM** | Stripe checkout session creation. Should have tighter limit to prevent Stripe API abuse |
| `/api/org/invite` | **MEDIUM** | Could be used to spam invite emails. Should be 10/hour |

### Infrastructure Gaps

| Gap | Severity | Details |
|-----|----------|---------|
| In-memory only (no Redis) | **MEDIUM** | API rate limiter uses `Map` - doesn't persist across Vercel cold starts or instances. Noted in code as acceptable for MVP with Upstash Redis migration planned (task #17) |
| No per-user rate limiting for AI routes | **HIGH** | All rate limiting is per-IP, not per-user. A single user could exhaust API budgets |
| Webhook rate limit mismatch | **LOW** | `/api/webhooks/*` routes get 100/min from middleware in-memory limiter AND go through api-rate-limiter at the `webhook` tier (200/min) because they don't start with `/api/channels/`. The `getTierForPath` function maps `/api/channels/*` to webhook tier but not `/api/webhooks/*` |

### Summary: Task #68

- **PASS**: Middleware applies rate limiting to ALL API routes via sliding window
- **PASS**: Channel-level token bucket rate limiting with Supabase persistence
- **PASS**: Daily send limits (email 50/day, SMS 20/day per org)
- **PASS**: Auth routes have double rate limiting (10/min + 20/min)
- **PASS**: Cron routes protected by bearer token + 5/min limit
- **NEEDS_ACTION**: AI endpoints (`/api/ai/text`, `/api/ai/voice`, `/api/agent/chat`) need tighter per-user rate limits to prevent cost abuse
- **NEEDS_ACTION**: No Redis/Upstash - rate limits don't persist across serverless instances
- **NEEDS_ACTION**: `getTierForPath` doesn't map `/api/webhooks/*` to the webhook tier (gets default `api` tier of 60/min instead of 200/min)

---

---

## Task #70: Custom Domain Configuration (app.bitbit.chat)

> DNS changes are manual. This section documents what to do and what order to do it.

### Current State

| Item | Status |
|------|--------|
| Domain `bitbit.chat` | Registered and active |
| `app.bitbit.chat` on Vercel | **NEEDS_ACTION** — add domain in Vercel dashboard |
| Webhook URLs | **NEEDS_ACTION** — some still point to `bitbit.vercel.app` |
| SSL | Auto-provisioned by Vercel once CNAME is confirmed |

---

### Step 1: Add Domain to Vercel

1. Go to [vercel.com/awu-team/bitbit/settings/domains](https://vercel.com/awu-team/bitbit/settings/domains)
2. Enter `app.bitbit.chat` → click **Add**
3. Vercel will display the required DNS record:
   ```
   Type:  CNAME
   Name:  app
   Value: cname.vercel-dns.com
   TTL:   Auto (or 300)
   ```

---

### Step 2: Add DNS Record

At your DNS provider (wherever `bitbit.chat` is managed):

| Type | Host | Value | TTL |
|------|------|-------|-----|
| `CNAME` | `app` | `cname.vercel-dns.com` | 300 |

- If using Cloudflare for DNS: **disable the Cloudflare proxy (orange cloud → grey cloud)** for this record, or use Vercel's nameservers instead.
- Propagation: typically 5–15 minutes; up to 48 hours in edge cases.
- Verify with: `dig app.bitbit.chat CNAME`

---

### Step 3: SSL Certificate

Vercel auto-provisions a Let's Encrypt certificate once the CNAME is confirmed. No manual action needed. It appears as "Valid Configuration" in the Vercel domains panel.

---

### Step 4: Update `NEXT_PUBLIC_APP_URL` on Vercel

```bash
vercel env rm NEXT_PUBLIC_APP_URL production
vercel env add NEXT_PUBLIC_APP_URL production
# Enter: https://app.bitbit.chat
```

Trigger a new deployment for this to take effect.

---

### Step 5: Update Webhook URLs

After the domain is live, run `personal-assistant/scripts/update-webhook-urls.sh` which updates:

| Service | Endpoint |
|---------|----------|
| Stripe | `https://app.bitbit.chat/api/webhooks/stripe` |
| Telnyx | `https://app.bitbit.chat/api/webhooks/sms` |
| Meta (WhatsApp) | `https://app.bitbit.chat/api/channels/whatsapp` |
| Google OAuth | Redirect URI: `https://app.bitbit.chat/api/auth/callback/google` |
| Google OAuth | JS Origin: `https://app.bitbit.chat` |

---

### Step 6: Update Google OAuth Console

Manual browser step (Google requires it via console.cloud.google.com):

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Project: **ThorTech Computers** (163710351496)
3. Edit the OAuth 2.0 Client ID
4. **Authorised JavaScript origins** → add `https://app.bitbit.chat`
5. **Authorised redirect URIs** → add:
   - `https://app.bitbit.chat/api/auth/callback/google`
   - `https://app.bitbit.chat/api/connections/google/callback`
6. Save

---

### Step 7: CORS Configuration

The Next.js app does not maintain an explicit CORS allowlist for the main domain — Next.js handles this at the framework level. However, check `src/middleware.ts` for any hardcoded origin checks.

Current known hardcoded origins to update if found:
- `bitbit.vercel.app` → `app.bitbit.chat`
- `localhost:3000` (keep for dev)

---

### Domain Checklist

- [ ] CNAME record added at DNS provider
- [ ] Vercel shows "Valid Configuration" for `app.bitbit.chat`
- [ ] SSL certificate issued (green padlock in browser)
- [ ] `NEXT_PUBLIC_APP_URL=https://app.bitbit.chat` set on Vercel
- [ ] New Vercel deployment triggered
- [ ] `update-webhook-urls.sh` run successfully
- [ ] Google OAuth console updated (manual browser step)
- [ ] Smoke test: open `https://app.bitbit.chat` and log in

---

## Overall Production Readiness Summary

| Task | Verdict | Critical Issues |
|------|---------|-----------------|
| #63 Env Vars | **NEEDS_ACTION** | 8 env vars used in code but not in `.env.local.example` or validation (RAG: PINECONE/VOYAGE, webhook secrets); WHATSAPP_ACCESS_TOKEN expired |
| #66 Email | **MOSTLY PASS** | Resend integration solid, domains verified, 12 templates. Missing `List-Unsubscribe` header (FAIL), no bounce handling |
| #67 Sentry | **PASS** | Well-configured client/server/edge. Minor: release tag not set in config files, profiling env var unused |
| #68 Rate Limiting | **MOSTLY PASS** | All routes rate-limited via middleware. Gap: AI endpoints need per-user limits, in-memory only (no Redis) |
| #70 Custom Domain | **NEEDS_ACTION** | CNAME not yet added; webhook URLs need updating after domain is live |

### Top 5 Action Items (Priority Order)

1. **Add PINECONE_API_KEY, VOYAGE_API_KEY to `.env.local.example` and `env-validation.ts`** -- RAG is a core feature per ADR-002
2. **Add `List-Unsubscribe` header to email templates** -- Required by Gmail/Yahoo sender policies
3. **Add per-user rate limits to AI endpoints** (`/api/ai/text`, `/api/ai/voice`, `/api/agent/chat`) -- Cost abuse risk
4. **Renew WHATSAPP_ACCESS_TOKEN** -- Currently expired, all WhatsApp messaging is broken
5. **Set `release` tag in Sentry client/server/edge configs** -- Source maps won't correlate to deploys without it
