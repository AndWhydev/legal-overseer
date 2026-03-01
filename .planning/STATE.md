# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** Phase 14 - Channel Relay & OAuth (v1.2 Battle-Testing & Sellability)

## Current Position

Phase: 14 of 17 (Channel Relay & OAuth) -- IN PROGRESS
Plan: 4 of 5 in current phase -- COMPLETE
Status: Executing Phase 14
Last activity: 2026-03-01 -- Completed 14-03 (Channel Settings UI)

Progress: [####################..........] 100% v1.0+v1.1 | 4/5 plans Phase 14

## Performance Metrics

**Delivery totals:**
- Total plans completed: 35 (v1.0 + v1.1)
- Milestones shipped: v1.0 on 2026-02-21, v1.1 on 2026-02-22

**By Phase (v1.2):**

| Phase | Plans | Status |
|-------|-------|--------|
| 13. Deployment Stability | 4 | 4/4 COMPLETE |
| 14. Channel Relay & OAuth | 5 | 4/5 IN PROGRESS |
| 15. WhatsApp Pipeline | TBD | Not started |
| 16. Confidence Routing Validation | TBD | Not started |
| 17. Invoice & Lead Validation | TBD | Not started |

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13 | 04 | 8min | 2 | 2 |
| 14 | 01 | 7min | 2 | 6 |
| 14 | 02 | 17min | 2 | 5 |
| 14 | 03 | 13min | 2 | 5 |
| 14 | 04 | 10min | 2 | 4 |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table.

- [13-02] Service client uses REST API; Supavisor pooling is infrastructure-side
- [13-02] Classifier lazy-loaded via dynamic import for cold start optimization
- [13-02] Health endpoint publicly accessible (no auth) for monitoring services
- [13-03] Plain Node.js HTTP server for Fly.io (no Express, minimal cold start)
- [13-03] AbortController timeouts: 5s Supabase, 10s worker dispatch, 3s status pings
- [13-03] Dispatch failure recovery: revert task to pending for cron retry
- [13-01] Keep ignoreBuildErrors: 106 TS errors are monorepo SupabaseClient type mismatches, not real app errors
- [13-01] Service-role createClient for cron routes (no user session in cron context)
- [13-01] Standardize all cron maxDuration to 300s via shared constant
- [13-04] Vercel deploys via git integration; CI job only verifies health endpoint
- [13-04] Deploy jobs skip gracefully when API tokens not configured
- [13-04] Cron guard refactored to use getServiceClient() singleton
- [14-01] Migration 045 (sequential) instead of plan's 052 for proper ordering
- [14-01] Gmail access_type=offline + prompt=consent as provider-specific URL params
- [14-01] Content-hash dedup: SHA-256 of sender:subject:body(200) with 5-min window
- [14-01] Channel status API merges org_integrations + channel_connections + adapter fallback
- [14-02] OAuth channels redirect to existing /api/auth/oauth/start flow (no duplication)
- [14-02] WhatsApp connect creates pairing session for future QR bridge (Phase 15)
- [14-02] Token refresh: 15min proactive window, 24-retry grace period before error state
- [14-02] Error state triggers dashboard + email notification via existing dispatcher
- [14-03] OAuth popup (600x700) stays on settings page per user decision
- [14-03] Static 6-channel list always rendered regardless of adapter availability
- [14-03] WhatsApp QR is UI shell only -- actual QR generation deferred to Phase 15
- [14-04] Two-tier dedup: fast external_id check then SHA-256 content-hash cross-channel within 5-min window
- [14-04] Burst handling: log warning at >20/channel and >50/total, process all sequentially
- [14-04] WhatsApp health logged to existing channel_health table via upsert
- [14-04] Classification retry: 3 attempts with exponential backoff (1s/2s/4s), then mark unclassified

### Pending Todos

- [ ] Complete WhatsApp production setup (requires Andy's Meta Business access)
- [ ] Run stabilization pass for unrelated TypeScript errors
- [ ] Run `npx supabase db lint` when Docker available

### Blockers/Concerns

- WhatsApp production setup requires Andy's Meta Business access (affects Phase 15)
- Local Docker unavailable for supabase lint

## Session Continuity

Last session: 2026-03-01
Stopped at: Completed 14-03-PLAN.md (Channel Settings UI)
Resume file: None
