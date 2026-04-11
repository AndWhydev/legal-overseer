# T011 — Production Validation & Deployment

## Overview

Take code-complete agents, channels, and infrastructure from "compiles with mocked tests" to "runs correctly in production." Deploy background processing infrastructure. Validate under real conditions.

## Problem

BitBit has 1433 tests passing with mocks, 10 agent implementations, 15+ channel adapters, and deployment configs for Fly.io/VPS/Cloudflare. None of this has been validated against real infrastructure or real data at production scale.

## What Exists (configs ready, not deployed)

- `deployments/fly/` — Dockerfile, worker.ts, health.ts for agent executor
- `deployments/vps/` — docker-compose, Dockerfile, setup.sh for relay daemon
- `deployments/cloudflare/` — wrangler.toml for edge cron triggers
- `deployments/whatsapp-bridge/` — Baileys bridge for testing
- 11 cron routes in `/api/cron/*`
- 5 GitHub Actions workflows (ci, e2e, deploy, migrate, preview)

## Tasks

### Deployment (configs exist, need actual deployment)

| # | Task | Effort | Details |
|---|------|--------|---------|
| 1 | Deploy Fly.io worker — agent executor + health endpoint | 2 hr | From deployments/fly/ |
| 2 | Deploy VPS (Hetzner CX22) — Docker + cron + relay daemon | 3 hr | From deployments/vps/ |
| 3 | Deploy Cloudflare Worker — edge cron triggers | 1 hr | From deployments/cloudflare/ |
| 4 | Deploy WhatsApp bridge (if testing before Meta approval) | 2 hr | From deployments/whatsapp-bridge/ |
| 5 | Configure Vercel Cron jobs for all 11 cron routes | 1 hr | vercel.json crons config |
| 6 | Set env vars across Vercel + Fly.io + VPS + Cloudflare | 1 hr | Consistent config |
| 7 | Verify Vercel serverless timeout for Gmail IMAP (Pro plan 300s) | 30 min | Or confirm Gmail API migration |

### Test Fixes

| # | Task | Effort | Details |
|---|------|--------|---------|
| 8 | Fix dashboard page test failure | 30 min | src/app/dashboard/page.test.ts |
| 9 | Fix email-command test failure | 30 min | email-command.test.ts |
| 10 | Fix whatsapp-parser-entry test failure | 30 min | whatsapp-parser-entry.test.ts |
| 11 | Fix email-templates test failure | 30 min | email-templates.test.ts |

### Production Validation

| # | Task | Effort | Details |
|---|------|--------|---------|
| 12 | Smoke test relay daemon against real channel credentials | 2 hr | One channel at a time |
| 13 | Test agent execution with real Supabase data | 2 hr | Sentry + Lead Swarm first |
| 14 | Load test: 50 concurrent relay daemon cycles | 3 hr | DB connection pooling |
| 15 | Load test: 10 simultaneous agent runs | 2 hr | Cost guard + circuit breaker |
| 16 | Multi-tenant isolation test (org A vs org B) | 3 hr | RLS policy validation |

## Acceptance Criteria

- [ ] All 4 deployment targets responding to health checks
- [ ] All 1433+ tests passing (0 failures)
- [ ] At least one agent has completed a real run against production Supabase
- [ ] Relay daemon has successfully polled at least one real channel
- [ ] Load tests confirm no DB connection exhaustion under expected load
- [ ] Multi-tenant isolation confirmed (org A cannot see org B data)

## Depends On

- T008 (credentials needed for real channel testing)
