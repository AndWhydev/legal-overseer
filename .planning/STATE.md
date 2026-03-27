---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Media, Billing & Growth Roles
status: executing
stopped_at: Completed 35-03-PLAN.md (Tasks 1-2; Task 3 pending user verification)
last_updated: "2026-03-27T16:15:31.337Z"
last_activity: "2026-03-28 - Completed 35-02: Trigger Wiring & Cross-Role Tool Bridge"
progress:
  total_phases: 21
  completed_phases: 14
  total_plans: 37
  completed_plans: 38
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** v1.6 Beta Launch & First Revenue

## Current Position

Phase: 35 of 36 (Proactive Workflows)
Plan: 3 of 3 in current phase
Status: Executing
Last activity: 2026-03-28 - Completed 35-03: Workflow CRUD API & Dashboard (Tasks 1-2; Task 3 pending verification)

Progress: v1.0 ======== | v1.1 ======== | v1.2 ======== | v1.4 ======== | v1.5 ========== | v1.6 ===--- 33%

## Performance Metrics

**Delivery totals:**
- Total plans completed: 84 (v1.0: 19, v1.1: 16, v1.2: 22, v1.4: 24, v1.5: 2, v1.6: 1)
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
| 28. Intelligence Dashboard Wiring | 1 | COMPLETE |

**v1.5 Phases:**

| Phase | Plans | Status |
|-------|-------|--------|
| 26. SOTA Response Drafter | 2 | COMPLETE (2/2) |
| 33. Beta Program Infrastructure | 1 | COMPLETE (1/1) |
| Phase 30 P03 | 25min | 2 tasks | 6 files |
| Phase 32 P03 | 26 | 2 tasks | 9 files |
| Phase 29 P01 | 15min | 3 tasks | 10 files |
| Phase 30 P02 | 13min | 2 tasks | 5 files |
| Phase 30 P01 | 20min | 3 tasks | 4 files |
| Phase 31 P01 | 9min | 2 tasks | 5 files |
| Phase 31 P02 | 7min | 2 tasks | 1 file |
| Phase 32 P02 | 14min | 2 tasks | 5 files |
| Phase 32 P01 | 15min | 2 tasks | 15 files |
| Phase 34 P01 | 20min | 3 tasks | 17 files |
| Phase 34 P02 | 9min | 2 tasks | 5 files |
| Phase 34 P03 | 15min | 2 tasks | 4 files |
| Phase 34 P04 | 12min | 2 tasks | 7 files |

**v1.6 Phases:**

| Phase | Plans | Status |
|-------|-------|--------|
| 35. Proactive Workflows | 3 | IN PROGRESS (3/3, Task 3 pending verify) |
| Phase 35 P01 | 27min | 2 tasks | 7 files |
| Phase 35 P02 | 15min | 2 tasks | 4 files |
| Phase 35 P03 | 19min | 2 tasks | 8 files |

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
- [28-01] Extracted mapIntelligenceResponses as pure exported function for testability -- avoids jsdom/React render overhead in unit tests
- [33-01] Invite codes expire after 7 days, single-use -- prevents sharing/abuse
- [33-01] Feedback widget uses file input for screenshots -- simpler than html2canvas, cross-browser
- [33-01] Daily tips use account age (days since signup) -- stateless, no progress table needed
- [33-01] Beta metrics aggregate from existing agent_runs + channel_messages -- no new counters
- [Phase 30]: Pure data extraction for discovery (no LLM) to hit <60s target; template-based welcome message references real contact names and thread subjects
- [Phase 32]: JSON-LD via dangerouslySetInnerHTML in server components for page-specific structured data (Organization, FAQPage, Article, WebPage)
- [Phase 32]: metadataBase + relative canonical for Next.js URL resolution; AUD pricing in structured data matching actual tiers
- [Phase 29]: Uses detectVisibilityChanges (pure function) not checkVisibilityChanges (notification side-effect) to prevent double-notify
- [Phase 29]: Single growth role wraps both SEO and tender monitoring with independent 24h sub-interval gating
- [Phase 30 P01]: All 12 T010 FRs pass without code changes -- Plan 03 already implemented all requirements including ONBD-04 progress persistence
- [Phase 30]: Added role=status and data-testid to shadcn Empty component for testability instead of migrating to old EmptyState
- [Phase 31-02]: Task 1 code pre-existing from 31-01 -- verified all 12 resilience tests pass, no new code needed
- [Phase 31-02]: Per-org concurrent scheduler invocations for true concurrency testing rather than single all-org call
- [Phase 31-02]: Pool-tracking Supabase mock with increment/decrement and simulated latency for connection limit verification
- [Phase 32-01]: Server component page.tsx composing client section components for marketing landing page -- clean separation of metadata (server) and interactivity (client)
- [Phase 32-01]: NavBar visibility via HIDDEN_PREFIXES array instead of isLanding guard -- renders on all public pages, hidden on dashboard/auth/chat
- [Phase 32-01]: Industry page metadata in layout.tsx (not page.tsx) since pages are 'use client' -- standard Next.js pattern
- [Phase 32-02]: Server/client split for pricing page -- page.tsx (server, metadata) + pricing-page-client.tsx ('use client', Stripe checkout)
- [Phase 32-02]: Case study CTA links to /industries/agencies (not /pricing) to maintain funnel from social proof to industry page before conversion
- [Phase 34-01]: Builder role uses copilot autonomy with $2/day budget -- chat-driven, tick only monitors stale projects
- [Phase 34-01]: Template variables use {{mustache}} syntax with CSS custom properties for color injection
- [Phase 34-01]: website_projects.slug unique per org (UNIQUE(org_id, slug)) for org-scoped namespacing
- [Phase 34-01]: IconCode (violet) for builder role in dashboard UI, consistent with existing role color scheme
- [Phase 34-02]: Claude Sonnet for website generation (creative task, speed over reasoning depth)
- [Phase 34-02]: Artifact data embedded in tool result (data.artifact) for chat engine artifact detection
- [Phase 34-02]: sandbox=allow-scripts without allow-same-origin on all HTML artifact iframes (browser-level isolation)
- [Phase 34-03]: Blob wrapper for Buffer/Uint8Array in WordPress uploadMedia -- TS DOM lib type bridge
- [Phase 34-03]: Elementor HTML fallback widget for forms and unrecognised elements instead of skipping
- [Phase 34-03]: Inline WordPress credentials for now; encrypted org_integrations store deferred to Plan 04
- [Phase 34-04]: deploy_website at L2_propose (external WP push); generate/revise at L3_notify; list/preview at L4_silent
- [Phase 34-04]: Preview route allows unauthenticated access for preview/deployed status (shareable client links)
- [Phase 34-04]: Deploy action on dashboard redirects to chat with suggested message (simpler than direct API call for v1)
- [Phase 34-04]: iframe thumbnail uses 400% oversize with scale-25 CSS transform for miniature preview rendering
- [Phase 35-01]: Zod v4 z.record requires (key, value) pair -- z.record(z.string(), z.unknown()) for parameter maps
- [Phase 35-01]: Migration uses timestamp format (20260328000001) matching existing convention not plan-specified 151_ prefix
- [Phase 35-01]: vi.hoisted() for Anthropic SDK mock in Vitest ESM mode -- vi.mock factory hoisted before variable declarations
- [Phase 35-01]: matchesCronPattern uses 5-minute tolerance window matching role tick interval for HH:MM patterns
- [Phase 35]: [Phase 35-02]: WorkflowToolBridge uses TOOL_GROUPS registry for resolution -- org-level canProceed for cross-role budget guard
- [Phase 35]: [Phase 35-02]: Event triggers in triage only evaluate/record; workflow starting deferred to role tick for budget control
- [Phase 35]: Hard-delete workflow rules with active workflow cancellation for clean removal
- [Phase 35]: Workflows gated to growth+ tiers (beta, growth, scale, enterprise) in Intelligence sidebar category

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

Last session: 2026-03-27T16:15:31.316Z
Stopped at: Completed 35-03-PLAN.md (Tasks 1-2; Task 3 pending user verification)
Resume file: None
