# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.4 -- Media, Billing & Growth Roles

**Shipped:** 2026-03-27
**Phases:** 14 | **Plans:** 34
**Timeline:** 10 days (2026-03-18 - 2026-03-27)

### What Was Built
- File upload pipeline with signed URLs, inline previews, and AI analysis (Vision + text extraction)
- Stripe billing: subscription lifecycle, plan gating at tool execution layer, usage metering, pricing page, 30-day trial
- Role engine foundation: composable RoleImplementation interface, autonomy levels, 5 domain roles (Finance, Comms, Sales, Growth, Intelligence)
- Cost controls: per-execution token budgets, daily limits, circuit breakers
- SOTA response drafter: 7-source parallel context assembly with priority truncation and tone adaptation
- Intelligence layer: revenue radar, client health scoring, cash flow projections, capacity oracle
- Role dashboard: activity feed, status cards, autonomy controls, attention view, intelligence widgets
- Gap closure phases (27-28): fixed role runtime imports and intelligence dashboard wiring

### What Worked
- Wrapping existing implementations (SEO 700+ LOC, Tender Hunter) as tool groups was fast -- reuse over rebuild
- Signed upload URL pattern (server validates, client PUTs directly) cleanly bypassed Vercel 4.5MB body limit
- Lazy Stripe singleton via Proxy prevented build failures in test/dev environments without the secret key
- safeCall never-throw wrapper for parallel context fetches eliminated brittle try/catch nesting
- Gap closure phases (27-28) as explicit audit-driven work items caught integration issues before v1.5

### What Was Inefficient
- 9/14 phases missing VERIFICATION.md -- verification was skipped during the fast execution phase and accumulated as debt
- The "b" phase numbering (20b, 21b, 22b, 23b, 24b) created confusion in tooling that expected numeric phases -- roadmap analyze CLI only found 9 phases instead of 14
- Role engine foundation and domain roles were planned as part of T035 (v1.3) but executed within v1.4 scope -- milestone boundaries were blurry
- content_calendar shipped as a stub returning empty -- better to have deferred entirely or shipped with persistence
- convertTrial() British spelling bug survived through all reviews -- no integration test exercised the trial conversion path

### Patterns Established
- Growth tool group pattern: tool definitions + handlers + autonomy levels + plan gating in a single file (ad-tools.ts as template)
- Budget enforcement at executeAgentTool layer (before autonomy routing) -- single enforcement point
- Side-effect imports for role registration in cron paths (over barrel re-exports)
- assembleDraftContext called inside draftReply (not from callers) -- preserves API stability when adding context sources
- mapIntelligenceResponses extracted as pure function for testability without jsdom overhead

### Key Lessons
1. Audit-driven gap closure works: the v1.4 audit identified 3 broken E2E flows that would have shipped broken into v1.5 without phases 27-28
2. Plan gating must precede growth tools in execution order -- BILL before ADS/SEO/TNDR/CONT was the correct dependency
3. Verification debt compounds: skipping VERIFICATION.md during fast execution means re-auditing later costs more than doing it inline
4. Token budget heuristics (char/4) are good enough for context assembly -- no need for tiktoken precision
5. Confidence floor (0.15) and cap (0.95) on auto-send prevents both over-confident sends and zero-confidence dead letters

### Cost Observations
- Model mix: ~70% Opus, ~25% Sonnet, ~5% Haiku (Opus for all coding, Sonnet for content generation tools)
- 342 commits across 10 days
- Notable: wrapping existing implementations (SEO, Tender, Ad Script) as tool groups was 2-3x faster than building from scratch

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 19 | Foundation -- established GSD workflow |
| v1.1 | 6 | 16 | Agent runtime -- first real agents |
| v1.2 | 7 | 22 | Battle-testing -- credential provisioning, integration fixes |
| v1.4 | 14 | 34 | Growth roles -- largest milestone, audit-driven gap closure |
| v1.5 | 8 | 22 | Beta launch -- marketing, mobile, proactive workflows |

### Top Lessons (Verified Across Milestones)

1. Integration testing at milestone boundaries catches issues that unit tests miss (v1.2 integration fixes, v1.4 gap closure phases)
2. Wrapping existing code as tool groups is consistently faster than building new (v1.1 agents, v1.4 growth tools)
3. Explicit gap closure phases are more effective than hoping gaps get fixed organically
