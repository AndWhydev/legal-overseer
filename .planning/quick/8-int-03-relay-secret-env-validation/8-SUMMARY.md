---
phase: quick
plan: 8
subsystem: deployments, invoice-flow
tags: [integration, fly-io, env-validation, invoice-pipeline]
dependency-graph:
  requires: [invoice-flow, agent-executor, env-validation]
  provides: [fly-io-invoice-dispatch, worker-auth-validation]
  affects: [middleware, csrf]
tech-stack:
  added: []
  patterns: [vercel-callback-dispatch, service-to-service-auth]
key-files:
  created:
    - personal-assistant/src/app/api/agent/invoices/dispatch/route.ts
  modified:
    - deployments/fly/src/agent-executor.ts
    - personal-assistant/src/lib/env-validation.ts
    - personal-assistant/src/middleware.ts
    - personal-assistant/src/lib/security/csrf.ts
decisions:
  - HTTP callback pattern (Fly.io -> Vercel) instead of importing Next.js modules into Fly.io worker
  - WORKER_AUTH_TOKEN reused for dispatch auth (already shared between Cloudflare and Fly.io)
  - Dispatch supports both tick and create modes for flexibility
  - VERCEL_APP_URL env var needed on Fly.io (deployment config change)
metrics:
  duration: 5min
  completed: 2026-03-12
---

# Quick Task 8: INT-03 -- RELAY_SECRET Env Validation + Fly.io Invoice Handler

Wire Fly.io worker's invoice-flow handler to the real invoice pipeline via HTTP callback to Vercel dispatch endpoint, replacing the stub that only returned `{ status: "extracted" }`.

## What Changed

### 1. New Vercel Dispatch Endpoint (`/api/agent/invoices/dispatch`)

Created a service-to-service endpoint that the Fly.io worker calls to execute invoice pipeline operations. Supports two modes:

- **tick mode** (default): Runs `runInvoiceFlowTick` for the org -- processes approved invoices, sends pending invoices, checks overdue
- **create mode**: Runs `createInvoiceFromIntent` for a single invoice from intent payload

Auth: Bearer WORKER_AUTH_TOKEN (same token already used in the Cloudflare -> Fly.io chain).

### 2. Rewired Fly.io `handleInvoiceFlow`

Replaced the stub (lines 173-192) that only extracted fields and returned `{ status: "extracted" }` with a real implementation that:

- Resolves `org_id` from payload or by querying `agent_task_queue` via Supabase REST
- Determines dispatch mode (tick vs create) based on payload contents
- POSTs to `{VERCEL_APP_URL}/api/agent/invoices/dispatch` with 30s timeout
- Handles network errors, auth failures, and timeouts gracefully

Requires new env var `VERCEL_APP_URL` on Fly.io (e.g., `https://app.bitbit.chat`).

### 3. Env Validation Updates

- **RELAY_SECRET**: Already present in env-validation.ts (z.string().min(16).optional()). Added descriptive comment explaining when it's required.
- **WORKER_AUTH_TOKEN**: Added to env-validation.ts (z.string().min(16).optional()) -- validates the shared secret used across Cloudflare, Fly.io, and Vercel dispatch endpoints.

### 4. Middleware + CSRF Updates

- Added `/api/agent/invoices/dispatch` to middleware auth skip list (endpoint handles own Bearer auth)
- Added to CSRF exempt prefixes (server-to-server calls have no Origin header)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Middleware would block Fly.io dispatch requests**
- **Found during:** Task 1
- **Issue:** The dispatch endpoint would go through `updateSession()` middleware (fails without cookie) and CSRF validation (blocks requests without Origin header in production)
- **Fix:** Added dispatch endpoint to middleware skip list and CSRF exempt prefixes
- **Files modified:** middleware.ts, csrf.ts
- **Commit:** 27e232c3

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 | 27e232c3 | Wire Fly.io handleInvoiceFlow to Vercel dispatch endpoint |

## Deployment Note

After deploying this code, the Fly.io worker needs `VERCEL_APP_URL` set:

```bash
fly secrets set VERCEL_APP_URL=https://app.bitbit.chat -a bitbit-workers
```

## Self-Check: PASSED

- [x] dispatch/route.ts exists
- [x] agent-executor.ts exists
- [x] env-validation.ts exists
- [x] 8-SUMMARY.md exists
- [x] Commit 27e232c3 exists
- [x] TypeScript compiles cleanly (both Vercel app and Fly.io worker)
