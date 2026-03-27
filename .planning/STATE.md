---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Media, Billing & Growth Roles
status: executing
stopped_at: Completed 27-01-PLAN.md (Role Runtime Import Fix)
last_updated: "2026-03-27T03:11:14.957Z"
last_activity: "2026-03-27 - Completed 31-01: Channel Adapter Smoke Tests"
progress:
  total_phases: 19
  completed_phases: 8
  total_plans: 32
  completed_plans: 24
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** v1.6 Beta Launch & First Revenue

## Current Position

Phase: 31 of 36 (Channel Smoke Tests)
Plan: 1 of 3 in current phase
Status: In Progress
Last activity: 2026-03-27 - Completed 31-01: Channel Adapter Smoke Tests

Progress: v1.0 ======== | v1.1 ======== | v1.2 ======== | v1.4 ======== | v1.5 ========== 100%

## Performance Metrics

**Delivery totals:**
- Total plans completed: 83 (v1.0: 19, v1.1: 16, v1.2: 22, v1.4: 23, v1.5: 2, v1.6: 1)
- Milestones shipped: v1.0 (2026-02-21), v1.1 (2026-02-22), v1.2 (2026-03-02), v1.4 (2026-03-26)

**v1.4 Phases:**

| Phase | Plans | Status |
|-------|-------|--------|
| 20. File Attachments & Multimedia | 3 | COMPLETE |
| 21. Billing Infrastructure | 3 | COMPLETE |
| 22. Cost Controls & Ad Script Generator | 2 | COMPLETE |
| 23. SEO Monitor & Tender Hunter | 2 | COMPLETE |
| 24. Content Creator | 1 | COMPLETE |
| 22b. Comms Role | 3 | COMPLETE |
| 23b. Sales Role | 3 | COMPLETE |
| 24b. Intelligence Layer | 3 | COMPLETE |
| 25. Role Dashboard | 3 | COMPLETE |
| 27. Role Runtime Fix | 1 | COMPLETE |

**v1.5 Phases:**

| Phase | Plans | Status |
|-------|-------|--------|
| 26. SOTA Response Drafter | 2 | COMPLETE (2/2) |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table.

- [v1.4 roadmap] File attachments first -- zero dependencies, immediate UX improvement
- [v1.4 roadmap] Billing must precede growth roles -- plan gating broken otherwise
- [v1.4 roadmap] Cost controls bundled with Ad Script Generator -- validate budget guard with simplest role
- [v1.4 roadmap] SEO + Tender Hunter paired -- both wrap existing 700+ LOC implementations
- [v1.4 roadmap] Content Creator last -- new build, most novel growth role code
- [v1.4 roadmap] Builder Role deferred to v1.5 -- highest risk, lowest validated demand
- [20-01] Signed upload URL pattern: server validates + creates DB record, client PUTs directly to Supabase Storage
- [20-01] Storage quota via RPC: replaced broken .select('size:sum') with get_org_storage_bytes() function
- [20-02] XHR over fetch for uploads: XHR.upload.onprogress provides reliable progress tracking unavailable in fetch API
- [20-02] Custom event bridge (CHAT_ATTACHMENTS_EVENT): decoupled attachment ID delivery between VoicePill and ChatInterface
- [20-02] Engine-level multimodal injection: contentBlocks in EngineConfig replaces last user message with ContentBlockParam[]
- [20-02] Graceful attachment failure: individual block failures logged and skipped, message still sends
- [20-03] On-demand signed URL fetch: thumbnails load via signed URL on mount, downloads fetch fresh URLs on click (no caching)
- [20-03] CHAT_ATTACHMENTS_EVENT extended to carry metadata { ids, items } for immediate preview rendering
- [20-03] PDF thumbnails deferred: static FileText icon with download link per research recommendation
- [21-01] Lazy Stripe singleton via Proxy: avoids build/test failures when STRIPE_SECRET_KEY absent
- [21-01] Consolidated webhook uses service-role Supabase client (no user auth context)
- [21-01] Legacy /api/webhooks/stripe re-exports consolidated route for backwards compatibility
- [21-01] All subscription upserts write to `plan` column (not `tier`) matching getOrgPlan() reader
- [21-01] Trial period changed from 14 to 30 days (TRIAL_PERIOD_DAYS constant)
- [21-02] Server-side plan gate in executeAgentTool: gate check before autonomy routing and handler call
- [21-02] PLAN_ORDER array for tier comparison instead of numeric values
- [21-02] TRIAL_PERIOD_DAYS constant (30) replacing hardcoded 14
- [21-03] Stripe.js v8 URL redirect: redirectToCheckout removed, checkout API returns session URL for direct redirect
- [21-03] Trial email dedup via Stripe subscription metadata (trial_end_notified flag)
- [21-03] Portal endpoint fallback chain: organizations.stripe_customer_id -> subscriptions.stripe_customer_id
- [22-01] TOOL_ROLE_MAP as static constant -- explicit control over budget categories vs deriving from TOOL_PLAN_REQUIREMENTS
- [22-01] Budget-blocked tools return synthetic error, not engine halt -- graceful agent communication
- [22-01] Execution cap injects convergence hint, not force-stop -- agent produces useful summary
- [22-02] adaptForPlatform takes raw string (not AdScript object) -- matches existing library API
- [22-02] 'chat-generated' sentinel for offerPackageId when user provides only description
- [22-02] Autonomy: generate=L3_notify (DB write), list/adapt=L4_silent (read-only/pure)
- [23-01] SEO tool autonomy: audit/content=L3_notify (DB writes), schema/report=L4_silent (pure/read-only)
- [23-01] Followed ad-tools.ts pattern exactly for growth role tool group consistency
- [23-02] All 3 tender tools set to L3_notify -- all persist data to DB (search upserts, score persists, generate upserts)
- [23-02] generate_tender_response flattens nested content object for cleaner tool result
- [24-01] Content tools use claude-sonnet-4-20250514 for cost-effective generation within budget guard limits
- [24-01] Autonomy: schedule_post/generate_blog at L3_notify (LLM token spend), content_calendar at L4_silent (read-only)
- [24-01] content_calendar returns empty with guidance in v1.4 -- persistence deferred to future version
- [26-01] safeCall never-throw wrapper for parallel context fetches -- cleaner than individual try/catch
- [26-01] Token budget char/4 heuristic with priority-ordered truncation (history highest, RAG lowest)
- [26-01] Confidence floor 0.15 and cap 0.95 -- never fully confident for auto-send
- [26-02] assembleDraftContext called inside draftReply (not from callers) -- preserves external API stability
- [26-02] Tone adaptation (learnClientTone + adaptDraft) applied as post-processing after LLM generation, not as prompt instruction
- [26-02] Context assembly and tone adaptation wrapped in try/catch with fallback -- zero crash risk from new features
- [27-01] Direct domain role imports in cron path over barrel import -- avoids cold-start bundle bloat while ensuring registerRole() side effects fire

### Roadmap Evolution

- Phase 26 added: SOTA Context-Enriched Response Drafter — wire ContextAssembler + RAG + Memory Palace into draft path for business-aware replies

### Pending Todos

- [ ] Complete WhatsApp production setup (requires Andy's Meta Business access)
- [ ] Run `npx supabase db lint` when Docker available

### Blockers/Concerns

- WhatsApp production setup requires Andy's Meta Business access (affects Phase 15, not v1.4)
- Local Docker unavailable for supabase lint
- ~~Fragmented Stripe webhook handling~~ RESOLVED in 21-01: consolidated into single /api/billing/webhook endpoint
- ~~Growth role token costs can spiral 10-50x vs classification tasks~~ RESOLVED in 22-01: per-role budget enforcement with daily limits and per-execution caps

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 21 | Improve whisper text generation to be user-facing, concise single-line, product-oriented | 2026-03-26 | 7bdfbba6 | Verified | [21-improve-whisper-text](./quick/21-improve-whisper-text-generation-to-be-us/) |

## Session Continuity

Last session: 2026-03-27
Stopped at: Completed 27-01-PLAN.md (Role Runtime Import Fix)
Resume file: None
