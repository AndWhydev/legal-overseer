# Phase 42: Tool Priority Chain - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

ToolResolver selects the optimal execution tier for any task -- the model reasons per-task about whether to use a structured API, browser automation, ephemeral workspace, or human handoff. No static waterfall, no rigid registry. The model carries the reasoning weight, informed by execution history.

</domain>

<decisions>
## Implementation Decisions

### Tier Resolution Logic
- **D-01:** Model decides per-task which execution tier to use. No rigid cheapest-first waterfall. The model reasons about the specific task, service, and context to choose the best tier. More flexible, consistent with "model carries the weight" philosophy.
- **D-02:** Available tiers: structured API, browser automation (Phase 40), ephemeral workspace (Phase 41), human handoff. Model selects from available tiers based on task characteristics.

### Integration Registry
- **D-03:** Fully dynamic -- no static registry mapping services to tiers. The model reasons from its knowledge about which services have APIs vs require browser access vs need compute. Zero maintenance. Registry would be stale the day it's written.
- **D-04:** Execution history provides the learning signal (see D-06). Over time, the model gets reliability data that supplements its base knowledge.

### Reliability Tracking
- **D-05:** Yes -- learn from execution history. Track success/failure rates per service per tier. Feed this data into context so the model factors in past results when choosing a tier.
- **D-06:** Reliability data stored and surfaced to the model at decision time. Example: "Browser automation on LinkedIn: 2/5 success rate this week" helps the model adjust strategy.

### Human Handoff
- **D-07:** Human handoff design is Claude's discretion. Should integrate with the async task lifecycle from Phase 39 -- task pauses, user is notified, task resumes when user confirms completion.

### Claude's Discretion
- Human handoff mechanics (conversational vs blocking vs hybrid)
- Reliability data storage schema and retention policy
- How reliability data is formatted and injected into model context
- ToolResolver integration with TAOR loop tool dispatch
- Cost tracking per tier per execution

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior Phase Context
- `.planning/phases/39-async-task-infrastructure/39-CONTEXT.md` -- Async task lifecycle, inline chat progress
- `.planning/phases/40-multimodal-web-automation/40-CONTEXT.md` -- Browser tier, provider-first
- `.planning/phases/41-ephemeral-workspaces/41-CONTEXT.md` -- Workspace tier, provider-first

### Agent Engine
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` -- TAOR loop where ToolResolver integrates
- `personal-assistant/src/lib/agent/engine/tool-executor.ts` -- Current tool dispatch
- `personal-assistant/src/lib/agent/tools.ts` -- Tool registry

### Approval System
- `personal-assistant/src/lib/agent/approval-queue.ts` -- Existing human-in-the-loop pattern for approval gate

### Requirements
- `.planning/REQUIREMENTS.md` -- CHAIN-01 through CHAIN-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Tool executor: Existing dispatch pattern in taor-loop, extend for multi-tier resolution
- Approval queue: Existing human-in-the-loop gate, reusable for human handoff tier
- Confidence router: Model already makes routing decisions based on context -- similar pattern for tier selection

### Established Patterns
- Model-driven decision making (confidence router) -- same paradigm for tier selection
- Async task lifecycle (Phase 39) -- all tiers use the same task tracking
- Memory Palace execution tracking (System Learning in sleep consolidation) -- can inform reliability scores

### Integration Points
- TAOR loop: ToolResolver replaces or wraps current tool dispatch
- Async task engine: All tier executions tracked as async tasks
- Context assembler: Reliability data injected into model context at decision time
- Approval queue: Reused for human handoff tier

</code_context>

<specifics>
## Specific Ideas

- Model-first philosophy: ToolResolver is really "model + reliability data" making a judgment call, not a decision tree
- Execution history as learning signal: every task execution feeds back into reliability data, making future decisions better
- No static service → tier mapping: the model knows LinkedIn needs a browser and Stripe has an API. Adding a registry would be maintaining stale data.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 42-tool-priority-chain*
*Context gathered: 2026-04-08*
