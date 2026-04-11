# ADR-001: Agent Tool Orchestration Architecture

**Date:** March 2026
**Status:** Accepted
**Deciders:** Tor Kay (product), Claude (research + analysis)
**Context:** BitBit currently has 20 tools scaling to 50-100+. Need to decide between Pattern 2 (compiled tool groups), Pattern 3 (specialist sub-agents), or Hybrid.

---

## Decision

**Adopt Hybrid Architecture (Pattern D): Pattern 2 as default, Pattern 3 selectively for complex multi-domain queries.**

70-80% of queries use Pattern 2 (planner-compiled tool group selection). 20-30% escalate to Pattern 3 (specialist sub-agents spawned on demand). A Haiku-class planner determines the routing at conversation start.

---

## Evidence Summary

| Dimension | Pattern 2 (Tool Groups) | Pattern 3 (Sub-Agents) | Hybrid (70/30) |
|-----------|------------------------|----------------------|-----------------|
| Cost/session | $0.0173 | $0.0576 (cached), $0.144 (uncached) | $0.032 |
| Latency p50 | 600-850ms | 1,200ms+ | 700-1,000ms |
| Accuracy | 90-92% | 95-97% | 94-96% |
| Scaling ceiling | 150-200 tools | 15-25 specialists | 150+ tools |
| Implementation | 1-2 days (Phase 1 80% built) | 2-3 weeks | Phased (immediate + 6mo) |
| KV cache hit rate | 90-95% (Manus validated) | Variable (new context per agent) | 90-95% for P2 queries |
| Token multiplier | 1x | 3.3-8.3x (Anthropic measured 15x worst case) | ~1.7x blended |

**Sources:** Manus AI production (80 tools), Anthropic Multi-Agent Research System, Google-MIT 2026 "Multi-Agent Scaling Laws," Shopify Sidekick.

---

## Rationale

### 1. Pattern 2 aligns with Context Baseplate philosophy

BitBit's knowledge layer deliberately chose compiled context assembly over reactive RAG (see `docs/comprehensive-roadmap.md`, citing RAGFlow). Applying the same principle to tools -- planner-compiled selection over per-query embedding retrieval -- maintains architectural consistency. Tool groups are pre-defined, deterministic sets, not dynamically retrieved via embedding similarity.

### 2. Pattern 2 is 80% built

Quick Task 1 (2026-03-11, commit `d25c85d0`) completed:
- Tool descriptions rewritten per Anthropic's tool writing guidelines
- JIT instructions (Shopify pattern) injected into tool results
- Tool group metadata: `ToolGroup` type, `TOOL_GROUPS`, `TOOL_GROUP_MAP` in `tools.ts`
- Planner `TOOL_LABEL_MAP` coverage for all 18 tools

The remaining work is bridging the planner output to tool filtering -- extending `generatePlan()` to output `toolGroups` and `getAgentTools()` to accept a group filter. This is 1-2 days of work.

### 3. Pattern 3 cost is not justified for routine queries

At 3.3-8.3x cost per session, Pattern 3 is overkill for 70-80% of BitBit queries that are single-domain operations (e.g., "send Sezer a WhatsApp", "check my calendar", "search for plumbers in Sydney"). These queries need 5-10 tools, not a full specialist sub-agent with its own context window.

### 4. Hybrid captures near-P3 accuracy at near-P2 cost

$0.032/session (hybrid) vs $0.0576 (pure P3) = 45% cheaper. 94-96% accuracy (hybrid) vs 95-97% (pure P3) = within 1-2%. The accuracy/cost tradeoff strongly favors hybrid.

### 5. Google-MIT 2026 confirms the approach

The Google-MIT scaling study found:
- **Capability saturation** above 5-8 agents (adding more agents yields <5% improvement)
- **Predictive routing** selects the correct architecture 87% of the time from query features alone
- **Centralized coordination** produces 23% fewer error cascades vs flat topology

BitBit's centralized planner + selective sub-agent spawning matches this recommendation exactly.

### 6. KV cache stability is the #1 cost lever

Manus AI's production insight: "Invalidating KV cache every time tools change costs more than reducing context." Their 90-95% KV cache hit rate = 81% cost reduction. Per-query Tool RAG (embedding retrieval) would change tool lists every turn, destroying cache coherence. Compiled tool groups maintain stable tool sets within a conversation.

---

## BitBit Context Alignment

### Current State (March 2026)

| Dimension | Value |
|-----------|-------|
| Tool count | 20 tools in 5 groups |
| Tool groups | core (8), memory (2), channel (3), web (2), comms (3) |
| Planner | Haiku (`planner.ts`) runs intent classification before main Sonnet call |
| JIT instructions | Implemented (Shopify pattern) |
| Tool group metadata | `ToolGroup`, `TOOL_GROUPS`, `TOOL_GROUP_MAP` in `tools.ts` |
| `TOOL_LABEL_MAP` | Complete coverage for all 18 tools |

### Target State

| Dimension | Phase 1 Target | Phase 2 Target |
|-----------|---------------|---------------|
| Tool count | 30-50 | 50-100+ |
| Tools in context per session | 5-12 (filtered) | 5-12 (+ sub-agents for complex) |
| Architecture | Pattern 2 (planner selects groups) | Hybrid (P2 default + selective P3) |
| Cost per session | ~$0.017 | ~$0.032 (blended) |

---

## Implementation Specification

### Phase 1: Immediate (Tools 20-50) -- Extend Planner for Tool Group Selection

**Goal:** Haiku planner selects relevant tool groups per conversation. Main agent receives only selected tools instead of all tools.

#### Code changes to `packages/agents/src/planner.ts`

1. **Extend `generatePlan()` return type** to include `toolGroups: ToolGroup[]`:

```typescript
interface PlanOutput {
  // ... existing fields
  toolGroups: ToolGroup[];  // NEW: which tool groups are relevant
}
```

2. **Add tool group selection to Haiku's planning prompt:**

```
Based on the user's intent, which tool groups are needed?
Available groups: core (always included), memory, channel, web, comms
Select 1-3 groups. Core is always included automatically.

Examples:
- "Send Sezer a WhatsApp" → ["channel", "comms"]
- "Search for plumbers in Sydney" → ["web"]
- "Remember that Sezer's rate is $150/hr" → ["memory"]
- "Invoice Sezer for White House work and email it" → ["channel", "comms"] (orchestrator mode)
```

3. **Haiku receives** the user message + conversation context and outputs `toolGroups: ["core", "channel"]` alongside the existing plan stages.

#### Code changes to `packages/agents/src/tools.ts`

1. **Add `getAgentTools(groups?: ToolGroup[])` function:**

```typescript
export function getAgentTools(groups?: ToolGroup[]): Tool[] {
  if (!groups) return allTools; // backward compatible

  const selectedGroups = new Set(['core', ...groups]); // core always included
  return allTools.filter(tool => selectedGroups.has(TOOL_GROUP_MAP[tool.name]));
}
```

2. **Tool group selection is per-conversation-start** (not per-message). Call `getAgentTools()` once when context is established, not on every user turn. This preserves KV cache coherence.

#### Code changes to `packages/agents/src/engine.ts`

1. **Read `plan.toolGroups`** from planner output:

```typescript
const plan = await generatePlan(userMessage, context);
const tools = getAgentTools(plan.toolGroups);
```

2. **Log tool group selection** for observability:

```typescript
logger.info(
  { toolGroups: plan.toolGroups, toolCount: tools.length },
  "tool group selection"
);
```

3. **KV cache preservation rule:** Only change the tool list when `plan.toolGroups` differs from the previous turn's groups. Use shallow array equality check:

```typescript
const groupsChanged = !arraysEqual(plan.toolGroups, previousToolGroups);
if (groupsChanged) {
  tools = getAgentTools(plan.toolGroups);
  previousToolGroups = plan.toolGroups;
  logger.info({ toolGroups: plan.toolGroups, reason: 'intent_shift' }, "tool group change");
}
```

This maintains Manus's 90-95% cache hit rate by only invalidating the cache when the user's intent genuinely shifts domains.

#### Expected Impact

| Metric | Before | After Phase 1 |
|--------|--------|---------------|
| Tools in context | 20 (all) | 5-12 (filtered) |
| Context tokens for tools | ~6,000 | ~2,000-3,500 |
| KV cache hit rate | N/A | 90-95% (projected) |
| Cost per session | baseline | -60% (group filter + cache) |
| Implementation effort | -- | 1-2 days |

### Phase 2: 6-Month (Tools 50-100) -- Complexity Routing for Selective Sub-Agents

**Goal:** Haiku planner also determines execution mode. Complex multi-domain queries route to specialist sub-agents.

#### Extend planner output

```typescript
interface PlanOutput {
  // ... existing fields
  toolGroups: ToolGroup[];
  executionMode: 'single' | 'specialist' | 'orchestrator';  // NEW
}
```

#### Routing logic (Haiku determines from query features)

- **`"single"`**: Default for routine, single-domain queries. 70-80% of traffic.
- **`"specialist"`**: Query maps cleanly to one domain (e.g., pure invoicing, pure research). Routes to a domain sub-agent with its isolated tool set (5-10 tools max).
- **`"orchestrator"`**: Query crosses 2+ domains OR requires parallel information gathering. Spawns 2-4 sub-agents in parallel.

#### Escalation triggers (complexity routing rule)

Escalate to `"specialist"` or `"orchestrator"` when:
1. Query simultaneously spans 2+ tool groups (e.g., invoicing + communication)
2. Query requires parallel information gathering from multiple sources
3. Query involves real financial or external-system actions where quality > cost

#### Sub-agent candidates (spawn on demand, NOT always running)

| Sub-Agent | Tools | When Spawned |
|-----------|-------|-------------|
| Research Agent | web_search, fetch_url, document analysis | Parallel multi-source research |
| Communication Agent | send_email, send_sms, send_whatsapp, send_slack | Multi-channel outreach |
| Business Operations Agent | CRM, invoicing, Xero integration | Financial transactions |
| Automation Agent | workflow creation, scheduling | Complex workflow setup |

#### Execution flow in `engine.ts`

```typescript
switch (plan.executionMode) {
  case 'single':
    return runSingleAgent(plan, context, tools);
  case 'specialist':
    return runSpecialistAgent(plan, context);  // isolated tool set
  case 'orchestrator':
    return runOrchestrator(plan, context);     // parallel sub-agents
}
```

#### Sub-agent design principles (from Anthropic's Orchestrator-Worker pattern)

- Sub-agents write results to file system / shared state, NOT through lead agent's context (prevents context chain explosion)
- Lead agent synthesizes sub-agent outputs into final response
- Each sub-agent has its own context window with only its domain tools
- Sub-agents execute in parallel where possible (60% latency improvement on multi-domain queries per Anthropic's data)

### Phase 3: 12-Month (Tools 100+) -- Multiple Orchestrators

If tool count exceeds 100, split into domain orchestrators, each managing its own planner + sub-agents. Route between orchestrators via a top-level intent classifier.

This is the Google-MIT multi-orchestrator pattern for the 150+ tool tier.

**Not needed until proven necessary -- do not build speculatively.** Review when tool count reaches 100 or when routing accuracy degrades below 85%.

---

## What NOT to Build

| Anti-Pattern | Why Not |
|-------------|---------|
| pgvector for tool retrieval | Contradicts Context Baseplate (compiled > reactive). Breaks KV cache with per-query tool list changes. pgvector belongs in the knowledge layer, not tool selection. |
| LangGraph / CrewAI / AutoGen | Unnecessary abstraction complexity. BitBit should own its orchestration logic directly. These frameworks solve different problems (graph workflows, role-play, multi-party conversation). |
| Per-query dynamic tool loading | Manus's #1 anti-pattern. Changing tool lists between turns invalidates KV cache, destroying the 81% cost reduction. |
| Fine-tuned models for tool selection | ToolGen/ToolLLM require model fine-tuning. Not viable with Claude API. Use prompt engineering + compiled planning. |
| Permanent always-running sub-agents | Sub-agents should spawn on demand and terminate after task completion. Permanent agents waste resources and add coordination complexity. |

---

## Success Metrics

| Metric | Current (March 2026) | Phase 1 Target | Phase 2 Target |
|--------|---------------------|----------------|----------------|
| Tool count in context | 20 (all loaded) | 5-12 (filtered by group) | 5-12 (+ sub-agents for complex) |
| Token cost per session | baseline | -60% (group filter + KV cache) | -45% vs baseline (hybrid blended) |
| KV cache hit rate | unknown (no grouping) | 90-95% | 90-95% |
| Accuracy (first-pass) | ~85% (estimated) | 90-92% | 94-96% |
| Implementation cost | Phase 1 prep done | 1-2 days | 2-3 weeks |
| Queries requiring sub-agents | N/A | N/A | 20-30% |

---

## Review Schedule

| Trigger | Action |
|---------|--------|
| Tool count reaches 30+ | Implement Phase 1 (planner tool group selection) |
| User reports quality issues on complex multi-domain queries | Evaluate Phase 2 (complexity routing + sub-agents) |
| Tool count exceeds 100 | Evaluate Phase 3 (multi-orchestrator) |
| Quarterly | Re-validate research findings (field moves fast) |

---

## Consequences

### Positive
- Consistent with Context Baseplate philosophy (compiled over reactive)
- Minimal implementation cost for Phase 1 (1-2 days, 80% already built)
- Production-validated by Manus AI (80 tools, 92-97% accuracy)
- Clear scaling path from 20 to 150+ tools without architectural rewrites
- KV cache preservation reduces costs by up to 81%

### Negative
- Complexity routing logic requires careful calibration of escalation thresholds
- Sub-agents (Phase 2) add operational complexity: monitoring, error handling, cost tracking per sub-agent
- Tool group boundaries must be maintained as tools are added (manual curation, not automatic)

### Neutral
- This decision is reversible: if Pattern 2 proves insufficient below 50 tools, Pattern 3 can be added independently
- Tool groups may need to be split as count grows (e.g., "channel" might split into "channel-inbound" and "channel-outbound")

---

*ADR created March 2026. Supersedes informal notes in research doc Section 7. For supporting evidence, see `.claude/docs/research/multi-agent-tool-orchestration-research.md`.*
