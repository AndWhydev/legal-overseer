# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** Phase 18 - Integration Fixes & Tech Debt (v1.2 Battle-Testing & Sellability)

## Current Position

Phase: 18 of 19 (Integration Fixes & Tech Debt)
Plan: 2 of 3 in current phase
Status: Executing Phase 18
Last activity: 2026-03-02 -- Completed 18-02 (Fly.io Worker Agent Executor)

Progress: [####################..........] 100% v1.0+v1.1 | Phase 18 in progress (2/3)

## Performance Metrics

**Delivery totals:**
- Total plans completed: 35 (v1.0 + v1.1)
- Milestones shipped: v1.0 on 2026-02-21, v1.1 on 2026-02-22

**By Phase (v1.2):**

| Phase | Plans | Status |
|-------|-------|--------|
| 13. Deployment Stability | 4 | 4/4 COMPLETE |
| 14. Channel Relay & OAuth | 5 | 5/5 COMPLETE |
| 15. WhatsApp Pipeline | 2 | 2/2 COMPLETE |
| 16. Confidence Routing Validation | TBD | Not started |
| 17. Invoice & Lead Validation | TBD | Not started |
| 18. Integration Fixes & Tech Debt | 3 | 2/3 IN PROGRESS |

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13 | 04 | 8min | 2 | 2 |
| 14 | 01 | 7min | 2 | 6 |
| 14 | 02 | 17min | 2 | 5 |
| 14 | 03 | 13min | 2 | 5 |
| 14 | 04 | 10min | 2 | 4 |
| 15 | 01 | 11min | 2 | 5 |
| 15 | 02 | 10min | 2 | 4 |
| 18 | 01 | 13min | 2 | 3 |
| 18 | 02 | 16min | 2 | 2 |

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
- [15-01] Dynamic import for Baileys -- module loads without library installed, isBaileysAvailable() gates bridge ops
- [15-01] Uint8Array wrapper for Buffer-to-Blob conversion in voice transcription
- [15-01] Voice note prefix [Voice note] prepended in parser for lenient speech-origin parsing
- [15-02] Conversation history passed as system prompt extension for Haiku cost efficiency
- [15-02] Fallback heuristic for contact resolution only fires for action intents
- [15-02] Approval retry: single retry after 1s, immediate rethrow for ALREADY_RESOLVED/NOT_FOUND
- [15-02] Emoji approval uses string comparison not regex unicode flag for ES target compat
- [18-01] Supabase .update() returns { error } not throws -- must check and throw for retry reachability
- [18-01] channel-grid.tsx data.success checks verified correct against /api/channels/sync response shape
- [18-01] WhatsApp QR polls every 3s with useEffect cleanup to prevent memory leaks
- [18-02] Raw fetch for Anthropic API (no SDK) to keep Fly.io worker dependency-free
- [18-02] 10s AbortController timeout on Anthropic calls consistent with Phase 13
- [18-02] Unknown agent types return success no-op, not errors

### Pending Todos

- [ ] Complete WhatsApp production setup (requires Andy's Meta Business access)
- [ ] Run stabilization pass for unrelated TypeScript errors
- [ ] Run `npx supabase db lint` when Docker available

### Blockers/Concerns

- WhatsApp production setup requires Andy's Meta Business access (affects Phase 15)
- Local Docker unavailable for supabase lint

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 18-02-PLAN.md (Fly.io Worker Agent Executor)
Resume file: None
