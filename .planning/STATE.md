# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** Phase 19 - Credential Provisioning & Live Verification

## Current Position

Phase: 19 of 19 (Credential Provisioning & Live Verification)
Plan: 2 of 3 in current phase
Status: Executing Phase 19
Last activity: 2026-03-14 - Completed quick task 15: Inbox redesign — neutral icons, edge-knock panel with proximity detection

Progress: [####################..........] 100% v1.0+v1.1 | Phase 19 (2/3)

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
| 17. Invoice & Lead Validation | 3 | 3/3 COMPLETE |
| 18. Integration Fixes & Tech Debt | 3 | 3/3 COMPLETE |
| 19. Credential Provisioning & Live Verification | 3 | 2/3 IN PROGRESS |

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
| 17 | 02 | 15min | 2 | 4 |
| 17 | 03 | 9min | 2 | 4 |
| 19 | 01 | 12min | 2 | 7 |
| 19 | 02 | 7min | 2 | 2 |

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
- [17-02] gst_registered defaults to true (Australian business assumption); explicit false required to disable
- [17-02] payment_instructions takes precedence over bank_details when both provided
- [17-02] Email from uses "{OrgName} Invoices" display name for professional inbox appearance
- [17-02] Lifecycle functions return error objects not throws for graceful caller handling
- [17-03] Auto-approve creates approval record with status approved + immediate delivery (audit trail preserved)
- [17-03] High-budget + no-service + slow-timeline scores cold (2 points) -- budget alone insufficient
- [17-03] Classification mocks validate mapping pipeline, not AI model accuracy
- [19-01] Separate Fly.io app (bitbit-whatsapp-bridge) from agent worker due to persistent WebSocket requirement
- [19-01] Volume mount at /data for auth state persistence across deploys
- [19-01] 5 reconnect attempts with 3x exponential backoff (5s to 405s) then notification alert
- [19-01] Health reporting every 60s to channel_health table via upsert
- [19-01] Public health endpoint for Fly.io monitoring, Bearer token auth on management routes
- [19-02] Inline env parsing (no dotenv) for standalone verification script portability
- [19-02] 10s timeout per HTTP request in smoke tests consistent with Phase 13 conventions
- [19-02] JSON report output alongside console for CI/automation consumption
- [Q3] PlanOutput dual-format parsing: object {stages,toolGroups} + legacy array fallback for Haiku robustness
- [Q3] Late-arriving plans never re-filter tools mid-conversation (KV cache coherence preservation)
- [Q3] Core tool group always included server-side; planner instructed to exclude from selections
- [Q3] Invalid tool group names from Haiku silently filtered (robustness against LLM hallucination)
- [Q4] All outbound comms (email, SMS) always queue for approval during beta -- no auto-execute path
- [Q4] Kill switch check runs outside cost guard block so it applies to all agent execution modes
- [Q4] Send limits use existing rate_limit_buckets table with daily key pattern send:{channel}:{orgId}:{date}
- [Q5] Dynamic import for Playwright in browse_website — graceful fallback when not installed
- [Q5] Token refresh cron test: GET first, POST fallback on 405 (Vercel cron convention)
- [Q5] Onboarding route is /onboard (not /onboarding), OAuth callback is /callback/google (not /api/auth/callback/google)
- [Q5] browse_website returns full screenshot_base64 — caller decides truncation for token efficiency
- [Q11] Calibrated thresholds stored in agent_configs.calibrated_thresholds JSONB — no new table
- [Q11] routeAgentAction stays synchronous; calibrated thresholds passed by caller (no async lookup inside router)
- [Q11] Safety rails: act floor 0.70, ask floor 0.45, min 20 samples/band, min 50 total before activating
- [Q11] Fire-and-forget outcome tracking via async IIFE to never block approval resolution
- [Q9] v2.0 agent_action_outcomes named separately from 064 action_outcomes (different schema, different purpose)
- [Q9] Monday briefing uses AEST (UTC+10) for year-round scheduling stability (7am during AEDT)
- [Q7] Email channels (gmail, email, outlook, mail) routed to Resend sendLeadAckEmailToRecipient; WhatsApp to Meta Cloud API
- [Q10] Greedy pairing for response latency: each sent pairs with next received (measures "how quickly does ANY response come")
- [Q10] Dual storage: entity_patterns (7-day cache) + contacts.communication_patterns (fast dashboard reads)
- [Q10] AEST bucketing (UTC+10) for Australian business context; 5 min samples per window, 10 events per contact

### Pending Todos

- [ ] Complete WhatsApp production setup (requires Andy's Meta Business access)
- [x] Run stabilization pass for unrelated TypeScript errors (completed in 18-03)
- [ ] Run `npx supabase db lint` when Docker available

### Blockers/Concerns

- WhatsApp production setup requires Andy's Meta Business access (affects Phase 15)
- Local Docker unavailable for supabase lint

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | SOTA tool engine optimizations — JIT instructions, tool group metadata, description optimization | 2026-03-11 | d25c85d0 | [1-sota-tool-engine-optimizations-jit-instr](./quick/1-sota-tool-engine-optimizations-jit-instr/) |
| 2 | SOTA agent tool architecture research update + ADR-001 (hybrid Pattern D) | 2026-03-11 | fdfa637f | [2-research-sota-agent-tool-architecture-pa](./quick/2-research-sota-agent-tool-architecture-pa/) |
| 3 | ADR-001 Phase 1: planner-compiled tool group filtering (20 tools -> 5-12 per session) | 2026-03-11 | 080cf0cc | [3-implement-phase-1-from-adr-001-planner-c](./quick/3-implement-phase-1-from-adr-001-planner-c/) |
| 4 | Fix 7 Tier 1 beta blockers: org_id scoping, agent kill switch, approval-gated comms, send limits, AI disclosure | 2026-03-11 | 95fa7194 | [4-fix-9-tier-1-beta-blockers-from-quality-](./quick/4-fix-9-tier-1-beta-blockers-from-quality-/) |
| 5 | Channel smoke tests (12 tests), onboarding E2E (6 tests), browse_website agent tool | 2026-03-11 | 781252fc | [5-channel-smoke-tests-onboarding-verificat](./quick/5-channel-smoke-tests-onboarding-verificat/) |
| 6 | INT-01: Wire WhatsApp invoice to createInvoiceFromIntent pipeline | 2026-03-12 | 4b2f0673 | [6-int-01-wire-whatsapp-invoice-to-createin](./quick/6-int-01-wire-whatsapp-invoice-to-createin/) |
| 7 | INT-02: Wire lead auto-approve ack to outbound email sender (Resend) | 2026-03-12 | 4b2f0673 | [7-int-02-wire-lead-ack-to-outbound-sender](./quick/7-int-02-wire-lead-ack-to-outbound-sender/) |
| 8 | INT-03: RELAY_SECRET env validation + Fly.io invoice handler wired to Vercel dispatch | 2026-03-12 | 27e232c3 | [8-int-03-relay-secret-env-validation](./quick/8-int-03-relay-secret-env-validation/) |
| 9 | v2.0 shared schema (3 tables + 7 entity_profiles cols) + Monday Morning Briefing (WhatsApp + email + API) | 2026-03-12 | 1f6a0650 | [9-v2-schema-monday-briefing](./quick/9-v2-schema-monday-briefing/) |
| 10 | v2.0 Optimal contact timing: response latency analysis, AEST bucketing, weekly cron, timing API, scheduling helper | 2026-03-12 | 2e59df16 | [10-v2-optimal-contact-timing](./quick/10-v2-optimal-contact-timing/) |
| 11 | v2.0 Confidence auto-calibration: band analysis, safety rails, daily cron, outcome tracking, trust API | 2026-03-12 | 4c225460 | [11-v2-confidence-auto-calibration](./quick/11-v2-confidence-auto-calibration/) |
| 12 | v2.0 Relationship graph with strength decay: 5-dimension scorer, cold detection, nudge generation, cron + API | 2026-03-12 | 2eb26763 | [12-v2-relationship-graph-decay](./quick/12-v2-relationship-graph-decay/) |
| 13 | Wire Gmail relay pipeline and fix connection flow | 2026-03-14 | 13285155 | [13-wire-gmail-relay-pipeline-and-fix-connec](./quick/13-wire-gmail-relay-pipeline-and-fix-connec/) |
| 14 | Chat UX overhaul: animated face avatar with cursor tracking, smooth streaming, smart scroll, conversation history | 2026-03-14 | e393ba44 | [14-chat-ux-overhaul-animated-face-avatar-wi](./quick/13-chat-ux-overhaul-animated-face-avatar-wi/) |
| 15 | Redesign inbox: neutral channel icons, time placement fix, edge-knock panel with proximity detection | 2026-03-14 | 2ad5e21d | [14-redesign-inbox-component-neutral-channel](./quick/14-redesign-inbox-component-neutral-channel/) |

## Session Continuity

Last session: 2026-03-14
Stopped at: Completed quick task 15 (Inbox redesign with edge-knock panel)
Resume file: None
