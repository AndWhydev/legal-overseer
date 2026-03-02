# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** Phase 17 - Invoice & Lead Validation (v1.2 Battle-Testing & Sellability)

## Current Position

Phase: 17 of 19 (Invoice & Lead Validation)
Plan: 3 of 3 in current phase
Status: In progress
Last activity: 2026-03-02 -- Completed 17-03 (Lead Classification & Auto-Approve)

Progress: [####################..........] 100% v1.0+v1.1 | Phase 17 (3/3)

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
| 16. Confidence Routing Validation | 2 | 2/2 COMPLETE |
| 17. Invoice & Lead Validation | 3 | 3/3 IN PROGRESS |
| 18. Integration Fixes & Tech Debt | 3 | 3/3 COMPLETE |

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
| 18 | 03 | 17min | 2 | 18 |
| 16 | 01 | 11min | 2 | 4 |
| 16 | 02 | 14min | 2 | 4 |
| 17 | 01 | 11min | 2 | 2 |
| 17 | 03 | 9min | 2 | 4 |

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
- [18-03] tsconfig paths alias forces single @supabase/supabase-js resolution (fixes 68 errors)
- [18-03] TabHeader icon prop accepts ComponentType union for Lucide React 19 compat
- [18-03] IndustryPack interface extended with optional kanbanDefaults and commandCenter
- [18-03] ignoreBuildErrors removed -- builds now type-check (109 errors resolved)
- [16-01] routeAgentAction cascade: explicit agentConfig > AGENT_THRESHOLDS[type] > orgSettings > defaults
- [16-01] invoice-flow highest act threshold (0.92); sentry lowest (0.75) based on risk profiles
- [16-01] 50 AWU scenarios calibrated for 80%+ accuracy against per-agent thresholds
- [16-02] Model tier jitter: Haiku +-0.05, Sonnet 0, Opus +-0.02 deterministic for reproducibility
- [16-02] FP rate measured on auto-actions only (not total scenarios) for business-meaningful metric
- [16-02] High-stakes agents require >= 0.25 safety margin between ask and act thresholds
- [17-01] Ambiguity threshold: 3+ candidates below 0.5 or top-2 within 0.1 both below 0.7 triggers ambiguous_contact
- [17-01] Fuzzy project match uses bidirectional containment after normalization (strip suffixes, lowercase)
- [17-01] Amount tolerance 10% using max-denominator formula; 30-day window for duplicate scope
- [17-03] Auto-approve creates approval record with status approved + immediate delivery (audit trail preserved)
- [17-03] High-budget + no-service + slow-timeline scores cold (2 points) -- budget alone insufficient
- [17-03] Classification mocks validate mapping pipeline, not AI model accuracy

### Pending Todos

- [ ] Complete WhatsApp production setup (requires Andy's Meta Business access)
- [x] Run stabilization pass for unrelated TypeScript errors (completed in 18-03)
- [ ] Run `npx supabase db lint` when Docker available

### Blockers/Concerns

- WhatsApp production setup requires Andy's Meta Business access (affects Phase 15)
- Local Docker unavailable for supabase lint

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 17-03-PLAN.md (Lead Classification & Auto-Approve)
Resume file: None
