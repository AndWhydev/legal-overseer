---
phase: quick
plan: 8
type: quick-task
autonomous: true
---

# Quick Task 8: INT-03 -- RELAY_SECRET Env Validation + Fly.io Invoice Handler

## Objective

Fix two MEDIUM severity integration gaps from the v1.2 milestone audit:
1. RELAY_SECRET already exists in env-validation.ts (confirmed: line 27, optional with min 16 chars) -- no change needed
2. Fly.io `handleInvoiceFlow` is a stub that only returns `{ status: "extracted" }` -- wire it to call back to the Vercel invoice creation API

## Context

- `personal-assistant/src/lib/env-validation.ts` -- already has RELAY_SECRET as optional (z.string().min(16).optional())
- `deployments/fly/src/agent-executor.ts` -- handleInvoiceFlow at lines 173-192 is a stub
- `personal-assistant/src/app/api/agent/invoices/route.ts` -- the real invoice API (requires auth)
- `personal-assistant/src/lib/agent/invoice-flow.ts` -- createInvoiceFromIntent (requires SupabaseClient)
- `personal-assistant/src/lib/agent/scheduler.ts` -- runInvoiceFlowTick via Vercel cron/scheduler path

## Tasks

### Task 1: Wire Fly.io handleInvoiceFlow to call Vercel invoice API
type="auto"

The Fly.io worker cannot import Next.js modules directly. Instead, handleInvoiceFlow should:
1. POST to the Vercel app's `/api/cron/scheduler` endpoint (which already runs all agent ticks including invoice-flow) or better, create a dedicated internal endpoint
2. Since the Vercel `/api/agent/invoices` requires user auth (not service-role), the best approach is to have the Fly.io worker call the existing scheduler endpoint which uses CRON_SECRET auth and runs `runScheduledAgents` (which includes invoice-flow)
3. Actually, the simplest correct approach: Fly.io worker should call back to a Vercel API endpoint using service-role auth, and that endpoint runs `createInvoiceFromIntent` for the specific task payload

**Implementation plan:**
- Create `/api/agent/invoices/dispatch` endpoint on Vercel that accepts service-role auth (WORKER_AUTH_TOKEN) and runs createInvoiceFromIntent with the provided payload
- Update Fly.io handleInvoiceFlow to POST to `{VERCEL_APP_URL}/api/agent/invoices/dispatch` with the task payload
- The Fly.io worker already has WORKER_AUTH_TOKEN for auth

**Done criteria:**
- handleInvoiceFlow calls the real invoice pipeline via HTTP callback
- New dispatch endpoint validates auth and delegates to createInvoiceFromIntent
- Error handling for network failures, auth failures, and pipeline errors

### Task 2: Add RELAY_SECRET production recommendation comment
type="auto"

RELAY_SECRET is already in env-validation.ts as optional. Add a descriptive comment explaining when it becomes required (external relay callers). No code change needed beyond documentation.

Actually, on re-reading the env-validation.ts, RELAY_SECRET is already present at line 27 with proper validation. The audit finding is already addressed. This task just verifies and documents.

**Done criteria:**
- Verify RELAY_SECRET validation exists and is correct
- Add a comment explaining the relay secret's purpose if not already documented

## Verification

- [ ] Fly.io handleInvoiceFlow calls real invoice pipeline via HTTP
- [ ] New dispatch endpoint has proper auth (WORKER_AUTH_TOKEN)
- [ ] Error cases handled (network, auth, pipeline errors)
- [ ] TypeScript compiles without errors
- [ ] RELAY_SECRET validation confirmed present

## Success Criteria

The Fly.io worker's invoice-flow agent handler delegates to the real invoice pipeline instead of returning a stub response. External relay callers are protected by RELAY_SECRET validation (already present).
