# Project Research Summary

**Project:** BitBit v2.0 — Autonomous Execution
**Domain:** Agentic browser automation, async task orchestration, workflow learning
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

BitBit v2.0 adds autonomous execution capabilities to an existing, production-grade agentic AI platform. The research identifies a conservative, leverage-first approach: use Anthropic's Computer Use API (CUA) as the browser intelligence layer with Playwright as the headless execution substrate, Trigger.dev v4 for durable async orchestration, and extend the existing Supabase + Pinecone stack for workflow pattern storage. The total new production dependencies are two packages (`playwright`, `@trigger.dev/sdk`) plus an SDK version bump. Infrastructure cost increases by ~$12/month to fund a dedicated 2GB Fly.io machine for browser sessions.

The recommended phase structure is driven by hard dependencies: the async task engine and CUA security sandbox must exist before any automation can safely run. Workflow learning should be deferred until a corpus of successful executions exists to learn from — building it prematurely is one of the highest-probability failure modes documented across comparable deployments. The architectural insight from PITFALLS research is that CUA must be the fallback of last resort in a tool priority chain (API first, headless browser second, CUA third), not the primary execution method — reliability on real-world SaaS platforms averages 40–70%, whereas structured API calls are near-100%.

The critical risks are non-negotiable security requirements, not nice-to-have hardening. Prompt injection via navigated webpages, cross-tenant session leakage from container reuse, and irreversible actions without approval gates have all been exploited against Anthropic CUA in documented incidents (October 2025 through March 2026). Every phase of CUA infrastructure must address these or the feature will be a liability rather than an asset.

## Key Findings

### Recommended Stack

The existing BitBit stack already contains ~80% of what v2.0 needs. The Anthropic SDK, Playwright (as devDep), Supabase, Pinecone, and Voyage embeddings require no new procurement. The TAOR loop's existing tool dispatch pattern, circuit breakers, approval queue, and confidence routing all slot naturally into the new architecture. The CUA API is a new `tools` entry in `client.beta.messages.create()`, not a new service.

**Core technologies:**
- **Anthropic CUA (`computer_20251124`)**: Vision-driven browser intelligence — already paid for via Anthropic API, activates via beta header on existing SDK; version bump to `^0.80.0` required
- **Playwright (`^1.58.2`)**: Headless Chromium execution substrate — already present as devDep; add as production dep for CUA worker; no Xvfb required for headless mode
- **Trigger.dev v4 (`^4.4.3`)**: Durable async task orchestration — provides waitpoints, step-level durability, retry, and human-in-loop gates; self-hostable on Fly.io; Apache 2.0
- **Dedicated Fly.io CUA worker** (`bitbit-cua-worker`, 2GB, scale-to-zero): Separate from existing 1GB workers; Chromium requires minimum 2GB to avoid OOM kills
- **Supabase pgmq**: Durable task queue already available in existing Supabase instance; no new infrastructure

**Explicitly rejected:**
- **Stagehand v3 + Browserbase** — see Divergence Flag section below
- **BullMQ** — requires Redis; new infra cost for solo-dev operation
- **Temporal** — enterprise cluster overhead (Cassandra + Elasticsearch + Temporal Server)
- **Inngest** — cannot self-host orchestration engine

### Expected Features

**Must have (table stakes):**
- Real-time execution visibility — users refuse to trust a black box; extends existing SSE streaming
- Step-by-step execution plan displayed before/during execution — extends existing `PlanStage` system
- Human confirmation for sensitive actions — extends existing `approval-queue.ts` to support mid-execution blocking gates (pre-submission pause)
- Task cancellation — AbortController pattern; currently no in-flight cancellation exists in TAOR
- Execution progress tracking — durable state machine in Supabase (`async_tasks` table), not in-memory
- Error recovery and retry — per-step retry within multi-step executions, extends existing DLQ and circuit breaker
- Execution history and audit log — per-step structured logging in `execution_steps` table
- Tool priority chain (API first, browser fallback, human handoff) — architectural core of v2.0

**Should have (competitive differentiators):**
- Evidence capture — screenshots + API confirmations stored as execution proof
- Async task inbox/dashboard — "Tasks" view with live progress, evidence links, retry buttons
- Execution cost prediction — pre-execution cost estimate based on historical execution data
- Proactive execution suggestions — pattern recognition on recurring multi-step tasks

**Defer to v2+:**
- Contextual browser session persistence (saved logins) — complex credential security implications
- Cross-role orchestration for multi-step tasks — requires stable single-role execution first
- Workflow learning and pattern replay — explicitly flagged as Pitfall 9; defer until execution corpus exists
- Full desktop/OS control — not relevant for web operations platform

### Architecture Approach

The architecture is deliberately decoupled: the TAOR loop (Vercel, 60s limit) spawns async tasks and returns immediately, while a dedicated Fly.io browser worker runs the CUA loop independently. Communication is via Supabase (task state, Realtime subscriptions) rather than direct HTTP proxying through Vercel. This avoids the fundamental mismatch between serverless timeouts and browser automation duration (30s–5min). The TAOR loop requires zero structural changes — CUA becomes a new `execute_task` tool in the existing tool dispatch system, using the existing `tool_result.queued === true` pattern already used by the approval queue.

**Major components:**
1. **Task Manager** (`lib/tasks/task-manager.ts`) — creates and tracks async tasks through a 7-state FSM; bridges TAOR loop, Supabase pgmq queue, and dashboard via Realtime
2. **Browser Worker** (`deployments/fly-browser/`) — dedicated 2GB Fly.io app running Playwright + CUA agent loop; isolated from existing 1GB workers; scale-to-zero when idle
3. **Tool Priority Chain** (`lib/agent/tools/execute-task.ts`) — new `execute_task` meta-tool implementing API → browser → human fallback; sits inside existing tool executor without modifying `taor-loop.ts`
4. **Workflow Learner** (`lib/workflows/workflow-learner.ts`) — deferred to Phase 4; structured per-step logging in Phases 1–3 creates the corpus

### Critical Pitfalls

1. **Prompt injection via navigated webpages** — Multiple documented real-world exploits against Anthropic CUA (October 2025 through March 2026, including CVE-2025-59536 and CVE-2026-21852). Mitigation: mandatory per-org domain allowlist (default zero), ephemeral sandboxed containers, credentials injected at orchestrator level never through LLM context, screenshot audit trail for forensics.

2. **Runaway cost spiral from looping CUA sessions** — A stuck agent (CAPTCHA, rate-limit, unexpected UI) can burn $2–5/session. Existing `cost-guard.ts` uses post-hoc tracking; CUA costs accrue during execution. Mitigation: pre-deduct budget reservation before session starts, hard 30-step circuit breaker, 5-minute container lifetime limit enforced at infrastructure level (not trusting agent self-termination).

3. **Cross-tenant session leakage** — Container reuse carries cookies/localStorage/session tokens between orgs. Supabase RLS does not protect browser-level state. Mitigation: ephemeral containers only (no warm pools), network namespace isolation per container, WebRTC disabled (`--disable-webrtc`), zero-trust org-scoped JWT for all container-to-platform communication.

4. **Irreversible actions without approval gates** — Existing approval queue intercepts at tool-call level; CUA operates at mouse-click level. By the time "Submit" is clicked, 15 preceding actions have already executed. Mitigation: pre-submission pause before any action with text "Send/Submit/Pay/Delete/Confirm/Accept," screenshot capture and approval queue entry at that point, browser session held open for 10 minutes awaiting approval.

5. **Plan gates "fail open" for CUA** — Existing `checkPlanGate()` and `cost-guard.ts` both return `allow` on database errors — acceptable for low-stakes actions, catastrophic for $0.50–$5.00 CUA tasks during outages. Mitigation: separate `checkCuaGate()` that fails closed; CUA blocked unless ALL four pre-flight checks pass positively (plan, budget, domain, action classification).

6. **CUA used when structured API exists** — Browser automation on real SaaS platforms fails 30–60% of the time (anti-bot detection, SSO, CAPTCHAs, layout shifts). Mitigation: strict tool priority chain with integration registry; API first, structured DOM second, CUA as last resort; staged rollout to 5–10 tested sites only.

## Implications for Roadmap

Based on the combined research, the dependency chain is unambiguous: the async task engine and CUA security sandbox are prerequisites for everything else. Workflow learning is the last thing to build, not the first.

### Phase 1: CUA Infrastructure and Security Sandbox

**Rationale:** Security requirements (prompt injection, session isolation, fail-closed gates) are non-negotiable and must be in place before any browser automation runs in production. This is the foundation everything else depends on.

**Delivers:** Safe, isolated CUA execution on a single task against a pre-approved domain.

**Addresses from FEATURES.md:** Human confirmation for sensitive actions (pre-submission pause), execution history (screenshot audit trail), tool priority chain (architecture definition).

**Must avoid:** Pitfall 1 (prompt injection), Pitfall 3 (cross-tenant leakage), Pitfall 4 (irreversible actions), Pitfall 10 (fail-open plan gates), Pitfall 14 (machine sizing — 2048MB+ required), Pitfall 15 (anti-bot detection — `--disable-blink-features=AutomationControlled`).

**Stack changes:** Playwright added as production dep, `@anthropic-ai/sdk` bumped to `^0.80.0`, `bitbit-cua-worker` Fly.io app created (2GB performance-1x), domain allowlist table, `checkCuaGate()` fail-closed function, `execution_steps` table with org-scoped storage bucket.

**Research flag:** Needs `/gsd:research-phase` — Chromium Docker container hardening options, anti-detection configuration, credential injection via `context.addCookies()` are niche and version-specific.

### Phase 2: Async Task Engine

**Rationale:** The existing TAOR loop on Vercel cannot hold connections for CUA's 30s–5min duration. Durable task state, heartbeats, and Supabase Realtime progress are required before CUA can be surfaced in the dashboard as a first-class feature.

**Delivers:** Multi-step async tasks with live dashboard progress, cancellation, retry, cost metering, and orphan detection.

**Addresses from FEATURES.md:** Durable execution tasks, progress tracking, task cancellation, error recovery and retry, execution visibility, async task dashboard widget.

**Must avoid:** Pitfall 2 (runaway cost — budget reservation with pre-deduction), Pitfall 5 (orphaned tasks — heartbeat every 30s + claim-based `UPDATE ... RETURNING *` execution), Pitfall 7 (compute costs missing from budget — unified cost model: API + vision tokens + compute seconds), Pitfall 11 (Vercel timeout — decouple via Supabase Realtime, no Vercel→CUA proxy), Pitfall 12 (false completion — observe-act-verify with a separate Claude call).

**Stack changes:** `@trigger.dev/sdk` `^4.4.3` installed; `async_tasks` table with 7-state FSM; `execution_steps` table; `agent_task_queue` Supabase Realtime subscription added; `RealtimeTable` type extended; unified cost model decomposed into `api_tokens_cost`, `vision_tokens_cost`, `compute_seconds_cost`.

**Research flag:** Standard patterns — Trigger.dev v4 is well-documented with official Fly.io deployment repo; skip `/gsd:research-phase`.

### Phase 3: Tool Priority Chain

**Rationale:** CUA should never be the primary execution method. The tool priority chain is the architectural safeguard that keeps reliable paths fast and cheap while providing CUA as the universal fallback. Must exist before CUA is promoted to users.

**Delivers:** `execute_task` meta-tool with three-tier resolution; integration registry mapping services to execution tier; per-site reliability tracking that feeds human handoff escalation.

**Addresses from FEATURES.md:** Tool priority chain (table stakes), evidence capture, execution cost prediction, credential management.

**Must avoid:** Pitfall 6 (CUA used when API exists — integration registry with `tool_integrations` table), Pitfall 8 (credential exposure — OAuth-first, envelope encryption vault for username/password, 2FA human handoff, screenshot OCR redaction of credential fields).

**Stack changes:** `execute_task` tool definition registered in `TOOL_GROUPS`; `tool_integrations` table; `ToolResolver` layer extending `tool-executor.ts`; credential vault with per-org envelope key.

**Research flag:** Needs `/gsd:research-phase` for credential vault — envelope encryption options (Supabase Vault, application-level AES-GCM, external KMS) are security-critical and need explicit selection.

### Phase 4: Workflow Learning and Intelligence Layer

**Rationale:** Explicitly defer until Phases 1–3 produce a corpus of successful executions. Building the learning layer before reliable execution exists compounds complexity without compounding value. Measure repeat-task rate during Phase 3; if < 20% of tasks are repeats, defer Phase 4 further.

**Delivers:** Cached workflow replay for repeat tasks, proactive execution suggestions, per-site reliability-based routing improvements.

**Addresses from FEATURES.md:** Workflow learning and replay (differentiator), proactive execution suggestions (differentiator).

**Must avoid:** Pitfall 9 (premature complexity — use structured workflow templates before AI-learned patterns; AI learning requires the Phase 1–3 corpus).

**Stack changes:** `learned_workflows` table with `trigger_embedding VECTOR(1024)`; Pinecone upsert via existing `embedding_jobs` pipeline; Voyage-3.5 embedding (existing). No new vendors.

**Research flag:** Skip `/gsd:research-phase` for the storage pattern (straight-line extension of existing RAG pipeline). May need research on MCTS-based workflow optimization (AFLOW, ICLR 2025) if simple replay is insufficient.

### Phase Ordering Rationale

- Phase 1 before Phase 2: Security sandbox is the foundation. An async task engine dispatching unsandboxed CUA sessions is worse than no CUA at all.
- Phase 2 before Phase 3: The tool priority chain requires the async task engine to exist — browser fallback is an async task, not a synchronous tool call.
- Phase 3 before Phase 4: Workflow learning requires a corpus of successful executions from Phases 1–3, and per-site reliability data from the tool priority chain.
- Trigger.dev's waitpoints (introduced in Phase 2) immediately back-fill Phase 1's approval gate needs at the infrastructure level.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 1:** Chromium container hardening, anti-detection configuration (`--disable-blink-features=AutomationControlled`, fingerprint randomization), credential injection via `context.addCookies()` — implementation details are version-specific and security-sensitive.
- **Phase 3:** Non-OAuth credential vault — envelope encryption options (Supabase Vault vs. application-level AES-GCM vs. external KMS). Security-critical, needs explicit selection before implementation.

Phases with standard patterns (skip research):
- **Phase 2:** Trigger.dev v4 is well-documented with official Fly.io deployment repo; Supabase Realtime subscription patterns are already established in the codebase.
- **Phase 4:** RAG pipeline extension is a straight-line continuation of the existing Pinecone + Voyage + `embedding_jobs` pattern.

## Divergence Flag: Browser Automation Implementation

**DECISION REQUIRED before Phase 1 planning begins.**

The two researchers reached different conclusions on browser automation implementation:

| Dimension | STACK.md recommendation | FEATURES.md recommendation |
|-----------|------------------------|---------------------------|
| Browser intelligence | Anthropic CUA directly | Anthropic CUA via Stagehand `agent()` method |
| Execution substrate | Playwright self-hosted on Fly.io | Stagehand v3 + Browserbase cloud |
| Auto-caching | Manual (log + replay) | Built-in (Stagehand v3 selector caching, 44% faster) |
| Cost per action | One API call | Two API calls (Stagehand LLM + Anthropic) |
| Infra cost | ~$12/mo (Fly.io machine) | ~$20–50/mo (Browserbase subscription) |
| Vendor lock-in | None | Browserbase ecosystem |
| Vision capability | Full screenshot analysis | Accessibility tree (text-based, not vision) |

**STACK.md argues:** Stagehand adds a second AI layer on top of CUA, doubling cost and adding a conflicting reasoning engine. Playwright is already in the project. Self-hosting eliminates Browserbase lock-in and data residency concerns.

**FEATURES.md argues:** Stagehand v3's auto-caching and self-healing are the gold standard for workflow learning (the Phase 4 goal). The `agent()` method handles multi-step browser tasks natively. CDP-direct is 44% faster than Playwright-via-Stagehand in v2.

**Recommended default:** STACK.md's position (Anthropic CUA + Playwright, self-hosted on Fly.io) for Phases 1–3. If workflow learning in Phase 4 proves to need Stagehand's selector caching, add it then without replacing the CUA intelligence layer. This keeps Phase 1 simpler, cheaper, and less vendor-dependent while preserving the option to adopt Stagehand in Phase 4 specifically.

**User must confirm this direction before roadmap locks Phase 1 scope.**

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Primary sources: Anthropic official docs, npm registry verified 2026-03-31, Trigger.dev v4 GA release notes. All npm versions verified against current registry. |
| Features | MEDIUM-HIGH | Grounded in Devin, Operator, and Claude Cowork product analysis plus MCP Tasks spec. Feature complexity estimates are research-based but need validation against actual TAOR internals. |
| Architecture | HIGH | Based on existing codebase analysis (TAOR loop integration points, approval queue patterns, Supabase Realtime wiring) plus official Anthropic CUA architecture docs. Integration points are specific and verifiable against source. |
| Pitfalls | HIGH | Critical pitfalls backed by documented CVEs, official Anthropic warnings, and direct codebase analysis of fail-open patterns in `plan-gates.ts` and `cost-guard.ts`. No theoretical risks — all grounded in observed code behavior or public incidents. |

**Overall confidence:** HIGH for Phases 1–3. MEDIUM for Phase 4 (workflow learning effectiveness is empirical and depends on execution corpus size and repeat-task rate).

### Gaps to Address

- **Trigger.dev Cloud vs. self-hosted decision**: Research recommends starting with Trigger.dev Cloud free tier ($5/mo credit, 20 concurrent). Self-hosting path exists but adds operational burden. Confirm before Phase 2 design.
- **CUA model selection (Sonnet 4.5 vs. Opus 4.6)**: STACK.md recommends Sonnet for cost (~3x cheaper) with Opus reserved for complex tasks. No empirical comparison available for BitBit's specific workflow types — will need measurement in Phase 1 testing.
- **Stagehand vs. Playwright final decision**: The browser automation implementation divergence (documented above) affects Phase 4 workflow learning architecture. Confirm before Phase 1 locks.
- **Per-site failure rates for initial rollout**: PITFALLS recommends launching with 5–10 tested sites only. The actual site list (Asana? Xero? Trello? LinkedIn?) must be validated against BitBit's current user workflows before Phase 1 scope is finalized.
- **pgmq availability**: Architecture uses Supabase pgmq for durable task queuing with fallback to existing `agent_task_queue` table. Confirm pgmq is enabled on the `johvduasrhmufrfdxjus` Supabase project before Phase 2 design.
- **Screenshot storage cost curve**: At 100 CUA tasks/day, screenshot storage grows 150–600MB/day. Retention policy (7 days active, 30 days final verification screenshots) should be designed before Phase 2 ships.

## Sources

### Primary (HIGH confidence)
- [Anthropic Computer Use Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) — CUA API spec, beta headers, `computer_20251124` tool type, TypeScript SDK examples
- [Anthropic CUA Reference Demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo) — reference architecture, Docker setup, agent loop pattern
- [Playwright Docker](https://playwright.dev/docs/docker) — official Docker images, headless mode (no Xvfb required)
- [Trigger.dev v4 GA](https://trigger.dev/launchweek/2/trigger-v4-ga) — v4 features, waitpoints, self-hosting, Apache 2.0 license
- [Trigger.dev Pricing](https://trigger.dev/pricing) — verified tier details, compute pricing ($0.0000338/sec Small 1x)
- [Trigger.dev Fly.io repo](https://github.com/triggerdotdev/fly.io) — official Fly.io deployment template
- [Supabase pgmq](https://supabase.com/docs/guides/queues/pgmq) — durable queue capabilities
- [MCP Async Tasks](https://workos.com/blog/mcp-async-tasks-ai-agent-workflows) — 5-state FSM spec, durable store pattern, idempotency keys
- [OpenAI Operator](https://openai.com/index/introducing-operator/) — confirmation patterns, pre-submission pause model
- [Stagehand v3 Launch](https://www.browserbase.com/blog/stagehand-v3) — auto-caching, CDP-direct, 44% performance improvement over v2

### Secondary (MEDIUM confidence)
- [Agentic Browser Landscape 2026](https://nohacks.co/blog/agentic-browser-landscape-2026) — framework comparison matrix
- [Stagehand vs Browser Use vs Playwright](https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026) — detailed comparison
- [TypeScript Orchestration Guide](https://medium.com/@matthieumordrel/the-ultimate-guide-to-typescript-orchestration) — Temporal vs Trigger.dev vs Inngest comparison
- [AFLOW - ICLR 2025](https://arxiv.org/pdf/2410.10762) — workflow optimization via MCTS, experience caching and replay
- [Enterprise Browser Agents](https://engineering.silnahealth.com/posts/autonomous-browser-agents-enterprise) — production experience: "architecture decisions > model scale"
- [Designing for Autonomy UX](https://www.uxmatters.com/mt/archives/2025/12/designing-for-autonomy-ux-principles-for-agentic-ai.php) — transparency and trust principles

### Tertiary (LOW confidence — needs validation)
- AnalyticsWeek 2026 — $400M collective cloud overspend figure (single source, not independently verified)
- Gartner prediction — "40% of agentic AI projects cancelled by 2027 due to cost" (secondary citation, primary source not located)

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes — pending Stagehand/Playwright divergence decision from user*
