# T022 — Security Verification & Monitoring

## Overview

Production-grade security audit and observability infrastructure. Verify that multi-tenant isolation is real, webhooks are authenticated, and errors are caught before users see them.

## Depends On

- T011 (Production Validation & Deployment) — monitoring needs deployed infrastructure

## What Exists

- RLS policies across 54 migrations
- Rate limiter: `api-rate-limiter.ts`
- Circuit breaker: `circuit-breaker.ts` with tests
- Dead letter queue: migration 030, handler code
- Cost guard: `cost-guard.ts` with tests
- Secret rotation docs: `docs/secret-rotation.md`
- Security hardening completed (WS1): auth guards, field allowlists, DEV_BYPASS_AUTH guarded

## Tasks

### Security Audit

| # | Task | Effort | Details |
|---|------|--------|---------|
| 1 | RLS policy audit — verify org isolation across all 54 migrations | 3 hr | Critical for multi-tenant |
| 2 | Audit all API routes for auth guards | 2 hr | Every /api/* route checked |
| 3 | Webhook signature verification for Stripe, Asana, Calendly | 1 hr | Prevent spoofed webhooks |
| 4 | Rate limiting on public API routes (auth, webhooks) | 2 hr | Uses existing rate-limiter.ts |
| 5 | Content Security Policy headers | 1 hr | Next.js middleware |
| 6 | VPS SSH hardening + firewall | 30 min | Uses existing setup.sh |

### Monitoring

| # | Task | Effort | Details |
|---|------|--------|---------|
| 7 | Set up Sentry.io error tracking — wire into engine.ts, relay-daemon.ts, all agents | 2 hr | Free tier |
| 8 | Set up UptimeRobot for /api/health endpoint | 15 min | Downtime alerts |
| 9 | Wire agent cost tracking to /api/monitoring/costs with real token data | 2 hr | From run-logger |
| 10 | Dead letter queue monitoring alerts (DLQ depth > threshold) | 1 hr | |
| 11 | Configure circuit-breaker thresholds per agent | 1 hr | Tuning based on expected error rates |
| 12 | Implement automated secret rotation for Anthropic API key, Supabase service key | 2 hr | |

## Acceptance Criteria

- [ ] RLS audit report confirms no cross-org data leakage
- [ ] All webhook endpoints verify signatures
- [ ] Sentry capturing errors from production
- [ ] UptimeRobot alerting on downtime
- [ ] Cost tracking showing real token usage per agent
- [ ] No public API endpoints without auth guards (except health check)
