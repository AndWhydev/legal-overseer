# Phase 40: Multimodal Web Automation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

BitBit autonomously navigates websites via browser control -- logging in, filling forms, clicking buttons, capturing evidence -- on secure, ephemeral, isolated browser infrastructure. The key principle: lean on the provider's infrastructure rather than custom-building browser management, screenshot capture, self-healing navigation, or session recording.

</domain>

<decisions>
## Implementation Decisions

### Browser Engine Choice
- **D-01:** Engine choice is Claude's discretion. Research must evaluate: Anthropic CUA API + Playwright on Fly.io, Stagehand + Browserbase, or other managed options. Pick the best tool for the job.
- **D-02:** Research MUST evaluate the paradigm choice: vision-based (screenshot → visual model reasons about pixels) vs accessibility-tree/markdown-based (DOM parsed → LLM reasons about structure). Determine which approach is more reliable for BitBit's use cases (business ops: invoicing platforms, CRMs, walled gardens).
- **D-03:** Provider infrastructure preference: choose a provider that handles self-healing navigation, session recording, and ephemeral containers out of the box. Minimize custom browser management code.

### Vision Execution Loop
- **D-04:** Fully autonomous execution -- BitBit navigates and acts without asking for confirmation. Reports results after completion. Consistent with Phase 38's "pure intelligence" pattern.
- **D-05:** Self-healing navigation should be handled by the provider/model, not custom code. Don't build a custom self-healing layer on top of the browser engine. The research should evaluate which provider handles DOM shifts, popups, and layout changes best natively.

### Security & Isolation
- **D-06:** Credential injection via both Composio (primary managed integration) AND 1Password vault (fallback for credentials not in Composio). Dual approach for maximum coverage.
- **D-07:** Open domain access by default -- BitBit can navigate any site. User can optionally block specific domains. No required allowlist. Consistent with full autonomy philosophy.
- **D-08:** Ephemeral browser containers -- no session data persists between tasks or orgs. This should be handled by the provider infrastructure, not custom container management.

### Evidence & Reporting
- **D-09:** Lean on provider's built-in session recording/livestreaming rather than building custom screenshot capture and storage infrastructure. Research should evaluate which providers offer session replay natively.
- **D-10:** Browser task results surface inline in chat (carrying from Phase 39 D-06). BitBit describes what it did conversationally, with evidence links if the provider supports them.

### Claude's Discretion
- Browser engine and provider selection
- Vision vs accessibility-tree paradigm choice
- Fly.io worker sizing and scale-to-zero configuration (if self-hosted)
- Cost circuit breaker thresholds for browser sessions
- How browser tasks integrate with the async task engine from Phase 39
- Pre-flight authorization check design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior Phase Context
- `.planning/phases/38-fiduciary-memory/38-CONTEXT.md` -- Conversational intelligence pattern, no separate UIs
- `.planning/phases/39-async-task-infrastructure/39-CONTEXT.md` -- Inline chat progress, NL cancellation, partial work preserved

### Agent Engine
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` -- TAOR loop where `spawn_browser_agent` integrates
- `personal-assistant/src/lib/agent/engine/tool-executor.ts` -- Tool dispatch integration point

### Existing Infrastructure
- Fly.io Machines API already used for bridge provisioning (pattern for browser workers if self-hosted)
- `personal-assistant/src/lib/agent/approval-queue.ts` -- Execution tracking pattern

### Requirements
- `.planning/REQUIREMENTS.md` -- CUA-01 through CUA-11

### Open Decisions (STATE.md)
- Browser automation direction: CUA + Playwright self-hosted vs Stagehand + Browserbase → resolved to "Claude's discretion with provider-first philosophy"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Fly.io Machines API provisioning: Already used for bridge machines, reusable for browser workers if self-hosted
- Async task engine (Phase 39): Browser jobs will run as async tasks with the same lifecycle
- Anthropic SDK: Already integrated for agent engine, natural fit for CUA API

### Established Patterns
- Phase 39 async task lifecycle: Browser tasks are a task type within the durable execution engine
- Phase 38 conversational intelligence: Browser results reported in chat, no separate browser UI
- Approval queue execution tracking: Pattern for tracking browser task execution state

### Integration Points
- TAOR loop tool dispatch: `spawn_browser_agent` as a new tool
- Async task engine: Browser jobs dispatched as async tasks
- ContextAssembler: Browser results fed back into conversation context
- Credential sources: Composio + 1Password for authenticated navigation

</code_context>

<specifics>
## Specific Ideas

- Provider-first philosophy: don't custom-build what Browserbase/Stagehand/Anthropic CUA provides natively (self-healing, recording, isolation)
- Research must distinguish vision-based vs accessibility-tree/markdown-based browser paradigms -- different reliability profiles for business ops sites
- BitBit's target sites are business tools (Stripe, LinkedIn, myGov, WordPress) -- research should evaluate provider reliability on these specific categories
- Session recording from provider replaces custom screenshot infrastructure -- link to recordings rather than storing screenshots

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 40-multimodal-web-automation*
*Context gathered: 2026-04-08*
