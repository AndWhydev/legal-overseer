# Feature Landscape: Autonomous Execution (v2.0)

**Domain:** Autonomous AI agent execution -- browser automation, async task management, workflow orchestration, execution verification
**Researched:** 2026-03-31
**Confidence:** MEDIUM-HIGH (grounded in real product analysis of Devin, Operator, Anthropic CUA, Stagehand, and industry patterns; verified against official docs)

---

## Table Stakes

Features users expect from an autonomous execution platform. Missing any of these and the system feels broken or unsafe.

| Feature | Why Expected | Complexity | Dependencies on Existing BitBit | Notes |
|---------|-------------|------------|--------------------------------|-------|
| **Real-time execution visibility** | Every major product (Devin, Operator, Claude Cowork) shows what the agent is doing in real-time. Users refuse to trust a black box. | Med | Extends existing `AgentEvent` SSE streaming in TAOR loop | Devin shows Shell/Browser/Editor/Planner tabs with <50ms latency. Operator shows a live browser view with narration. BitBit needs equivalent: a live activity feed showing current step, elapsed time, and what tool is active. |
| **Step-by-step execution plan** | Operator, Devin, and Pulumi Neo all show the plan before or during execution. Users need to see "here are the 5 things I will do" before the agent acts. | Low | Extends existing `PlanStage` system (planner.ts already generates plans) | BitBit already has plan generation and plan_stage_update events. Extend to cover multi-step async executions, not just single-turn tool calls. |
| **Human confirmation for sensitive actions** | Anthropic CUA, Operator, and Claude Cowork all pause for confirmation on logins, payments, form submissions, and consent actions. This is table stakes for trust and safety. | Med | Extends existing approval-queue.ts and confidence routing | BitBit already has approval flow with confidence thresholds (act/ask/escalate). Extend to cover real-time execution pauses where the agent stops mid-workflow and waits for user confirmation. Currently approvals are fire-and-forget; needs to become synchronous mid-execution gates. |
| **Task cancellation** | MCP async tasks spec, Devin, and Operator all support user-initiated cancellation. An unstoppable autonomous agent is terrifying. | Med | New -- no existing cancellation mechanism for in-flight tool executions | Must implement clean cancellation semantics: stop current step, transition to `cancelled` state, never resume. The TAOR loop's safety ceiling (50 iterations) is not the same as user-initiated cancel. |
| **Execution progress tracking** | Users need to know: how far along is this task? MCP Tasks spec defines `working`/`completed`/`failed`/`cancelled` states. Devin shows a Progress tab. | Med | Extends existing `tool_progress` event type in AgentEvent | Current `tool_progress` only tracks elapsed_ms for a single tool. Need durable task state: a DB-backed task record with lifecycle states, percentage progress, and status messages. |
| **Error recovery and retry** | Long-running tasks fail. Every production system implements retry with exponential backoff and dead letter queues. Research shows "doubling task duration quadruples the failure rate." | High | Extends existing DLQ (dlq.ts) and circuit breaker (circuit-breaker.ts) | BitBit already has circuit breakers and a dead letter queue. Extend to per-step retry within multi-step executions, with configurable retry policies per action type. |
| **Execution history and audit log** | Users need to review what the agent did after the fact. Devin records every terminal command, file edit, and browser action in a full replay timeline. | Med | Extends existing run-logger.ts (logAgentRun) | Current logging tracks token usage and cost. Extend to capture every action taken, every screenshot captured, every decision made, stored in a durable execution_steps table. |
| **Tool priority chain (API-first, browser fallback)** | The "all-or-nothing" approach to autonomy is brittle. Best practice: try structured API first, fall back to browser automation if no API exists, escalate to human if browser fails. | High | New orchestration layer above existing tool system | This is the architectural core of v2.0. Current tools are all API-based (invoice, email, etc.). Need a resolver that: (1) checks if a structured tool exists, (2) falls back to CUA/browser, (3) escalates to human. Each level has different cost, speed, and reliability characteristics. |

## Differentiators

Features that would set BitBit apart. Not expected by users, but create significant competitive advantage.

| Feature | Value Proposition | Complexity | Dependencies on Existing BitBit | Notes |
|---------|-------------------|------------|--------------------------------|-------|
| **Workflow learning and replay** | Remember successful multi-step executions and replay them faster next time. Stagehand v3's auto-caching (cache selector paths, replay without LLM inference, re-engage AI only on failure) is the gold standard. AFLOW (ICLR 2025) uses MCTS to preserve and reuse workflow experiences. | High | Extends existing Memory Palace and workflow-rule-engine | When BitBit successfully completes "invoice Sezer for White House RE work" via 4 steps, store that execution trace. Next time a similar request comes in, replay the cached workflow without full LLM reasoning on each step. Falls back to LLM reasoning only when the cached path fails. This compounds -- the more BitBit works, the faster and cheaper it gets. |
| **Evidence capture and verification** | After completing a task, capture proof: screenshots of the result, API response confirmations, before/after state comparison. No competing product for business operations does this well. | Med | Extends existing file attachment system (signed URLs, storage) | Screenshot the invoice after sending, capture the confirmation email, store the Stripe payment receipt. Users can see "here is proof I did what you asked." This is the difference between "I sent the invoice" and "here is the sent invoice, the recipient email, and the delivery confirmation." |
| **Proactive execution suggestions** | When the agent notices a pattern ("you invoice Sezer every month around the 15th"), suggest pre-building the next execution. Move from reactive to proactive without being asked. | Med | Extends existing role tick scheduler and workflow templates | BitBit already has proactive role ticks and workflow rules. Layer execution pattern recognition on top: detect recurring multi-step tasks, suggest automating them, and eventually auto-execute with high-confidence approval bypass. |
| **Cross-role orchestration for multi-step tasks** | A single user request like "Onboard new client FooBar" might need Sales (create contact, log deal), Finance (set up billing), Comms (send welcome email), and Builder (spin up staging site). Orchestrate across roles seamlessly. | High | Extends existing role system (5 roles) and workflow-tool-bridge.ts | BitBit already has cross-role tool bridge and role registry. Need an orchestrator that decomposes a complex request into role-specific sub-tasks, executes them in the right order (respecting dependencies), and aggregates results. Similar to Devin's "orchestrate Devins" feature where a coordinator delegates to specialists. |
| **Execution cost prediction** | Before executing, show the user "this will cost ~$0.45 in API calls and take ~3 minutes." Users can then decide if it is worth running autonomously vs. doing it manually. | Low | Extends existing cost-guard.ts and estimateRunCost | No competing product surfaces cost prediction pre-execution for business operations agents. BitBit already tracks per-execution costs. Extend to predict costs based on historical execution data for similar tasks. |
| **Contextual browser session management** | For CUA tasks, maintain browser sessions with saved cookies, logins, and state across executions. Reuse sessions for the same service (e.g., always logged into the client's WordPress admin). | High | New -- requires session persistence layer | Operator runs ephemeral browser sessions (cookies discarded). For a business ops agent, persistent sessions are more valuable -- stay logged into Xero, WordPress, Asana. Requires careful security (encrypted credential vault, session isolation per org). |
| **Async task inbox/dashboard** | A dedicated view showing all running, completed, and failed background tasks. Like a "job queue" UI that non-technical users understand. | Med | Extends existing role dashboard (activity feed, status cards) | Current role dashboard shows role activity. Add a "Tasks" view that shows background executions: running tasks with live progress, completed tasks with evidence links, failed tasks with retry buttons. |

## Anti-Features

Features to explicitly NOT build. These look tempting but would damage the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| **Full desktop/OS control (a la Claude Cowork)** | BitBit is a web platform, not a desktop app. Desktop CUA requires OS-level access, introduces massive security surface area, and is not relevant for business operations. Anthropic's own CUA is macOS-only and requires local installation. | Use headless browser automation (Browserbase/Stagehand) running server-side. Users see the result, not the agent controlling their computer. This is the Operator model, not the Cowork model. |
| **Autonomous social media posting** | Anthropic explicitly limits CUA for social media impersonation. Autonomous posting risks brand damage, legal liability, and platform bans. Even Claude refuses this. | Build draft-and-approve workflows for social content. The agent drafts the post, the human reviews and publishes. Never auto-publish. |
| **Unrestricted autonomous execution without escape hatch** | "All-or-nothing autonomy is too brittle." Research consistently shows the hybrid model (human can interrupt at any time) outperforms fully autonomous systems in trust, adoption, and actual outcomes. | Always provide: (1) live visibility, (2) ability to pause, (3) ability to cancel, (4) ability to take over manually. The agent should never be running where the user cannot intervene. |
| **Building a custom browser engine** | Stagehand v3 already removed Playwright dependency and talks directly to CDP. Building a browser from scratch is years of work. Even OpenAI uses a custom browser (Atlas) but it is their core product. | Use Browserbase + Stagehand (TypeScript-native, CDP-direct, auto-caching, self-healing). Or Playwright for the structured 80% and Stagehand for the AI-driven 20%. |
| **Real-time screen sharing / co-browsing** | Technically cool but enormously complex (WebRTC, low-latency streaming, coordinate synchronization). Devin does this because it IS a coding workspace. BitBit is an operations platform. | Show task progress via event stream and screenshots. Users do not need to watch the agent browse in real-time for business tasks. Periodic screenshot evidence is sufficient. |
| **Autonomous financial transactions without confirmation** | Even with high confidence routing, auto-executing payments, wire transfers, or contract signatures is a liability disaster. Every major platform blocks this by default. | Financial actions always require human confirmation, regardless of confidence score. This is a hard rule, not a threshold. |
| **Per-website custom scrapers** | Tempting to build custom integrations for every SaaS tool. This does not scale and creates massive maintenance burden. Skyvern specifically exists because per-site customization fails. | Use CUA/browser automation as the universal fallback. It works on any website without per-site code. Build structured API integrations only for high-frequency, high-value services (Stripe, Xero, Gmail -- which BitBit already has). |
| **Multi-tab browser orchestration** | Complex, fragile, and full of edge cases. Popups, modals, cross-origin iframes all break. | One tab per task. If multi-tab is needed, spawn separate CUA sessions. Keep each browser context simple and isolated. |

## Feature Dependencies

```
Execution Visibility -----> SSE Event System (existing)
       |
       v
Step-by-Step Plans -------> Planner (existing, extend)
       |
       v
Durable Task Store -------> New DB table: execution_tasks
       |                         |
       v                         v
Progress Tracking           Task Cancellation
       |                         |
       v                         v
Error Recovery & Retry ---> Circuit Breaker (existing, extend)
       |
       v
Tool Priority Chain ------> New: ToolResolver layer
       |                    |              |
       v                    v              v
  API Tools (existing)  CUA/Browser    Human Handoff
                        (new)          (approval-queue, extend)
       |
       v
Evidence Capture ---------> File Storage (existing, extend)
       |
       v
Workflow Learning --------> Memory Palace (existing, extend)
       |
       v
Execution History --------> run-logger (existing, extend)
```

Key dependency chain:
1. **Durable Task Store** must exist before anything else (progress tracking, cancellation, retry all depend on it)
2. **Tool Priority Chain** (ToolResolver) must exist before CUA can be a fallback
3. **CUA/Browser automation** requires headless browser infrastructure (Browserbase or self-hosted)
4. **Workflow Learning** depends on Evidence Capture (need to know what succeeded) and Execution History (need the trace to replay)

## MVP Recommendation

### Phase 1: Async Task Engine + Execution Visibility (foundation)
Build the durable task store, progress tracking, cancellation, and execution visibility first. These are the infrastructure that everything else depends on.

Prioritize:
1. **Durable execution_tasks table** with lifecycle states (pending, working, paused, completed, failed, cancelled) -- follows MCP Tasks 5-state FSM
2. **Extended AgentEvent streaming** for multi-step async executions
3. **Task cancellation** via user action (AbortController pattern)
4. **Execution history** stored per-step in execution_steps table

### Phase 2: Tool Priority Chain + Human Handoff Extensions
Build the ToolResolver that implements API-first, browser-fallback, human-handoff. This is the architectural core.

Prioritize:
1. **ToolResolver abstraction** that wraps existing tool system with priority resolution
2. **Human handoff as synchronous mid-execution gate** (extend approval-queue to support blocking waits)
3. **Confirmation flow for sensitive actions** during execution (per-tool gates, not per-agent)

### Phase 3: CUA / Browser Automation
Add headless browser automation as the universal fallback tool.

Prioritize:
1. **Browserbase + Stagehand integration** (TypeScript-native, auto-caching, self-healing) on Fly.io workers
2. **Screenshot capture pipeline** for evidence and verification
3. **Anthropic Computer Use API integration** via beta header for vision-driven browser control

### Phase 4: Workflow Learning + Evidence + Dashboard
Layer intelligence on top of the working execution engine.

Prioritize:
1. **Evidence capture** (screenshots, API confirmations, before/after state)
2. **Execution pattern detection** and cached replay (Stagehand auto-caching model)
3. **Async task inbox/dashboard** UI

Defer:
- **Contextual browser sessions** (persistent logins) -- complex security implications, revisit after core CUA is proven
- **Cross-role orchestration** -- start with single-role multi-step, add cross-role after patterns emerge
- **Cost prediction** -- nice to have, build after enough execution history exists to make predictions meaningful
- **Proactive execution suggestions** -- depends on workflow learning being mature

## Product Comparisons: How Others Handle Each Feature

### Execution Transparency

| Product | Approach | Lesson for BitBit |
|---------|----------|-------------------|
| **Devin** | 4-tab workspace (Shell, Browser, Editor, Planner) with "Following" mode showing real-time tab switching. Full replay timeline with slide bar. Pulsating indicator + text description of current action. Time to first action reduced to ~10 seconds. | Best-in-class but overkill for business ops. BitBit needs the activity feed and current-step indicator, not a full IDE view. |
| **OpenAI Operator** | Small browser window with on-screen narration of each action. Users can interrupt and take over at any point. Now integrated into ChatGPT as "agent mode" dropdown. | Right model for BitBit: show a compact progress view with narration text, not a full workspace. |
| **Claude Cowork** | Desktop control with user confirmation before actions. Natural language explanations of what it will do. Safety guardrails block trading/banking/adult content. | Confirmation-before-action is essential. BitBit should narrate intent before each significant step. |

### Browser Automation

| Product | Approach | Lesson for BitBit |
|---------|----------|-------------------|
| **Anthropic CUA API** | Screenshot-analyze-act loop. Client-side tool: you provide the browser, Claude provides the intelligence. Beta header `computer-use-2025-11-24` for Opus 4.6/Sonnet 4.6. TypeScript SDK supported. 735 tokens per tool definition. Enhanced actions include zoom for detailed region inspection. | Direct integration path via Anthropic SDK (BitBit already uses). Run headless browser server-side, send screenshots to Claude, execute returned actions. |
| **Stagehand v3** | AI-native browser automation. CDP-direct (no Playwright dependency). `act()` for single actions, `agent()` for multi-step. Auto-caching: cache selector paths, replay without LLM, re-engage on failure. 44% faster than v2. Self-healing execution adapts when DOM shifts. | Best option for BitBit. TypeScript-native. Auto-caching aligns perfectly with workflow learning goal. `agent()` method handles multi-step browser tasks natively. |
| **Browserbase** | Cloud browser infrastructure. Stealth mode, session recording, proxy rotation. Managed browsers that Stagehand connects to. | Pairs with Stagehand. Provides the headless browser infra without self-hosting. Critical for server-side execution (BitBit runs on Fly.io/Vercel). |
| **Skyvern** | LLM + computer vision to automate workflows on unseen websites. No per-site customization. No-code builder for non-developers. | Good for handling broken accessibility on government/insurance portals. Overkill for BitBit's use case -- Stagehand + Anthropic CUA covers the same ground with more control. |

### Async Task Management

| Product | Approach | Lesson for BitBit |
|---------|----------|-------------------|
| **MCP Tasks Spec** | 5-state FSM (working, input_required, completed, failed, cancelled). Durable task store pattern. Polling via `tasks/get`. Blocking result fetch via `tasks/result`. Progress via `progressToken`. TTL-based task expiry. Idempotency keys for retry dedup. | The specification to follow. Implement this state machine in the execution_tasks table. |
| **Devin** | Session-based. Each task runs in an isolated cloud sandbox with full environment. Coordinator can delegate to parallel sub-Devins. | Overkill for BitBit. But the "coordinator delegates to parallel workers" pattern maps well to cross-role orchestration. |
| **Azure Agent Framework** | 202 Accepted + task ID pattern. Background workers. Client polls for status with real-time progress. Durable state storage. | Standard REST pattern. BitBit should expose task creation via API route that returns task ID immediately, then SSE for live updates. |

### Human Handoff

| Product | Approach | Lesson for BitBit |
|---------|----------|-------------------|
| **OpenAI Operator** | Pauses for login credentials, CAPTCHAs, and sensitive actions. Monitoring model detects suspicious content and pauses. | Two-layer approach: (1) predefined rules for known sensitive actions, (2) model-level detection for unexpected situations. |
| **OpenAI Agents SDK** | Handoff primitive: agent delegates to another agent (or human) via special tool call. Full conversation context transfers. | BitBit already has approval-queue with context_snapshot. Extend to support real-time mid-execution handoff, not just queued approvals. |
| **Microsoft Semantic Kernel** | HITL gates scoped to specific tool invocations, not full agent outputs. Low-risk actions proceed autonomously; sensitive operations require approval. | Exactly what BitBit needs: per-tool confirmation gates. The tool priority chain should mark certain tool categories (financial, external communication, account changes) as always-confirm. |

### Workflow Learning

| Product | Approach | Lesson for BitBit |
|---------|----------|-------------------|
| **Stagehand v3 Auto-Caching** | When an AI-driven action succeeds, record the selector path. Replay on subsequent runs without LLM. If replay fails, re-engage AI and update cache. | Direct implementation path for BitBit. Cache successful tool call sequences. Replay them. Fall back to LLM reasoning on cache miss/failure. |
| **AFLOW (ICLR 2025)** | MCTS-based workflow optimization. Preserves exploration tree. Reuses past successful experiences. Records performance metrics per workflow. | Academic but the principle applies: track which execution paths work, prune failures, and exploit successes. BitBit's Memory Palace can store workflow traces. |
| **AgentQ** | Self-critique + Monte Carlo Tree Search + DPO fine-tuning. The agent literally improves its own decision-making over time. | Too heavy for BitBit's use case. The simpler Stagehand-style caching is sufficient for business operations workflows. |

## Complexity Assessment

| Feature Category | Complexity | Rationale |
|-----------------|------------|-----------|
| Durable Task Store | **Medium** | New DB table + state machine. Well-understood pattern (MCP spec provides the exact design). |
| Execution Visibility | **Low-Medium** | Extends existing SSE events. BitBit already streams agent events to the frontend. |
| Task Cancellation | **Medium** | Requires clean shutdown of in-flight operations. AbortController pattern in Node.js. |
| Tool Priority Chain | **High** | New architectural layer. Needs resolver logic, fallback chain, and integration with all existing tools. |
| CUA / Browser Automation | **High** | New infrastructure: headless browser (Browserbase), Stagehand integration, screenshot pipeline, Anthropic CUA API integration. Runs on Fly.io workers. |
| Human Handoff Extensions | **Medium** | Extends existing approval-queue to support synchronous blocking during execution. |
| Evidence Capture | **Medium** | Screenshot storage, API response archival. Extends existing file attachment system. |
| Workflow Learning | **High** | Execution trace storage, pattern matching, cached replay, fallback logic. Novel for BitBit. |
| Async Task Dashboard | **Medium** | New UI page. Data already flows through execution_tasks table. |
| Cross-Role Orchestration | **High** | Dependency graph resolution, parallel sub-task execution, result aggregation across 5 roles. |

## Sources

### Official Documentation (HIGH confidence)
- [Anthropic Computer Use Tool API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- Tool definition format, supported actions, TypeScript SDK, beta headers, implementation guide
- [Anthropic Computer Use Reference Implementation](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo) -- Docker container, agent loop, tool implementations
- [AI SDK Computer Use Guide](https://ai-sdk.dev/cookbook/guides/computer-use) -- Vercel AI SDK integration for Computer Use
- [OpenAI Operator Introduction](https://openai.com/index/introducing-operator/) -- Product launch, CUA model, confirmation patterns
- [OpenAI CUA](https://openai.com/index/computer-using-agent/) -- Technical architecture, perception-reasoning-action loop
- [OpenAI OWL/Atlas Architecture](https://openai.com/index/building-chatgpt-atlas/) -- How they built the agent browser
- [Stagehand v3 Launch](https://www.browserbase.com/blog/stagehand-v3) -- AI-native rewrite, CDP-direct, auto-caching, 44% faster
- [Stagehand GitHub](https://github.com/browserbase/stagehand) -- Open source, TypeScript, act/agent/extract API
- [Browserbase](https://www.browserbase.com) -- Cloud browser infrastructure for AI agents
- [Devin Session Tools Docs](https://docs.devin.ai/work-with-devin/devin-session-tools) -- Shell, IDE, Browser workspace
- [MCP Async Tasks](https://workos.com/blog/mcp-async-tasks-ai-agent-workflows) -- Task lifecycle, polling, cancellation, durable store pattern
- [MCP Long-Running Operations Issue](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391) -- SEP-1391 specification discussion
- [OpenAI Agents SDK Handoffs](https://openai.github.io/openai-agents-python/handoffs/) -- Agent-to-agent and agent-to-human handoff pattern

### Industry Analysis (MEDIUM confidence)
- [Agentic Browser Landscape 2026](https://nohacks.co/blog/agentic-browser-landscape-2026) -- Comprehensive comparison of Stagehand, Browser Use, Playwright, Skyvern
- [Stagehand vs Browser Use vs Playwright](https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026) -- Comparison matrix
- [Browser Use vs Stagehand](https://www.skyvern.com/blog/browser-use-vs-stagehand-which-is-better/) -- Detailed feature comparison
- [AI Agent Design Patterns - Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) -- Orchestration patterns including handoff
- [Cognition Devin 2025 Performance Review](https://cognition.ai/blog/devin-annual-performance-review-2025) -- PR merge rate improvement, execution patterns
- [Designing for Autonomy UX Principles](https://www.uxmatters.com/mt/archives/2025/12/designing-for-autonomy-ux-principles-for-agentic-ai.php) -- Transparency, trust, and control in agentic UX
- [Enterprise Browser Agents](https://engineering.silnahealth.com/posts/autonomous-browser-agents-enterprise) -- Production experience: context management > model scale

### Research (MEDIUM confidence)
- [AFLOW - ICLR 2025](https://arxiv.org/pdf/2410.10762) -- Workflow optimization via MCTS, experience caching and replay
- [Agent Skills Architecture](https://arxiv.org/html/2602.12430v3) -- Skill acquisition, security, agent-tool integration
- [AgentQ](https://github.com/sentient-engineering/agent-q) -- Self-critique + MCTS + DPO for browser agents
- [Checkpoint/Restore for AI Agents](https://eunomia.dev/blog/2025/05/11/checkpointrestore-systems-evolution-techniques-and-applications-in-ai-agents/) -- State persistence, recovery patterns
- [Atomix: Transactional Tool Use](https://arxiv.org/html/2602.14849v1) -- Reliability patterns for agentic workflows
- [Building Browser Agents: Architecture and Security](https://arxiv.org/html/2511.19477v1) -- Architecture decisions > model scale
