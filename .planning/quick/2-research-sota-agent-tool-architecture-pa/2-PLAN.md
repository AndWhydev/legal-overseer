---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - .claude/docs/research/multi-agent-tool-orchestration-research.md
  - .claude/docs/research/tool-architecture-decision.md
autonomous: true
requirements: [QUICK-2]
must_haves:
  truths:
    - "The research doc contains updated cost/latency tables with real production numbers from Manus AI and Google-MIT 2026"
    - "The research doc contains a Hybrid consensus section documenting Pattern D as the definitive recommendation"
    - "An ADR file exists at .claude/docs/research/tool-architecture-decision.md with a concrete implementation spec for BitBit"
    - "The ADR maps the hybrid architecture to specific code changes in engine.ts, planner.ts, and tools.ts"
    - "The ADR contains a phased timeline: immediate, 6-month, 12-month milestones"
  artifacts:
    - path: ".claude/docs/research/multi-agent-tool-orchestration-research.md"
      provides: "Updated research with 2026 production findings and hybrid consensus"
      contains: "Manus AI production details, Google-MIT 2026 study, updated cost/latency tables"
    - path: ".claude/docs/research/tool-architecture-decision.md"
      provides: "Architecture Decision Record for BitBit's agent tool architecture"
      contains: "ADR format, hybrid decision, implementation spec, phase timeline"
  key_links:
    - from: ".claude/docs/research/tool-architecture-decision.md"
      to: "packages/agents/src/engine.ts"
      via: "Code-level change specification in implementation spec section"
---

<objective>
Synthesize new SOTA research findings into the existing multi-agent tool orchestration research doc, then produce a definitive Architecture Decision Record (ADR) that specifies the hybrid Pattern 2+3 architecture for BitBit's agent engine.

Purpose: The orchestrator has completed deep research and the findings definitively recommend a Hybrid approach (Pattern 2 as default, Pattern 3 selectively for complex queries). This plan captures those findings in two documents so that future implementors have a clear, evidence-based specification to build against.

Output:
- Updated `.claude/docs/research/multi-agent-tool-orchestration-research.md` with new sections covering Manus AI production insights, Google-MIT 2026 scaling study, updated cost/latency tables, and hybrid consensus recommendation
- New `.claude/docs/research/tool-architecture-decision.md` (ADR) with full implementation spec
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/claude/bitbit/.planning/quick/2-research-sota-agent-tool-architecture-pa/2-PLAN.md
@/home/claude/bitbit/.claude/docs/research/multi-agent-tool-orchestration-research.md

<research_findings>
The orchestrator has completed deep research using Perplexity Deep Research, Perplexity Reasoning, and web searches. Use these findings verbatim — do not fabricate or extrapolate. All numbers below are research-verified.

## Pattern 2 (Planner-Compiled Tool Groups) — Real Numbers

Production baseline from Manus AI (80 tools, 12 groups):
- Haiku classifies intent, selects 1-3 tool groups from pre-defined sets
- Main agent receives only selected tools: 4,400 tokens vs 22,000 full (80% reduction)
- KV cache: 90-95% hit rate from stable tool lists (same group = same token prefix)
- Cost: $0.0173/session
- Latency: p50 600-850ms, p95 1.2-1.8s
- Accuracy: 78-92% first-pass, 92-97% with fallbacks
- Scaling ceiling: 150-200 tools in 15-20 groups
- Implementation: 6-10 weeks for 2-3 engineers

Manus AI production insight (key quote): "Invalidating KV cache every time tools change costs more than reducing context." They use logit masking via state machine — not dynamic tool loading — specifically to preserve KV cache coherence. 92% cache hit rate = 81% cost reduction.

Also used by: Shopify Sidekick (JIT instructions preserve cache, "heavily armed agent gets dumber" — 18% completion rate improvement from reducing context).

## Pattern 3 (Specialist Sub-Agents) — Real Numbers

Anthropic Multi-Agent Research System (Opus lead + Sonnet subagents):
- Cost: $0.0576/session WITH caching (3.3x Pattern 2), $0.144 without (8.3x)
- Latency: p50 650ms (simple query), 1,200ms (multi-domain), p95 2.5-3.5s
- Accuracy: 88-98% (90.2% improvement on complex research per Anthropic)
- Scaling ceiling: 15-25 specialists before routing breaks down
- Token explosion: 15x per Anthropic's own measurement, 3.3-8.3x in practice
- Parallel subagent execution: 45s → 18s (60% latency improvement on multi-domain)
- Subagents write to file system, not through lead context (prevents context chain explosion)

## Hybrid Pattern D (The Definitive Recommendation)

Google-MIT 2026 Study — "Multi-Agent Scaling Laws":
- Predictive model recommends architecture correctly 87% of the time from query features alone
- Capability saturation curve: first 3-5 agents give 40-50% improvement, 6-15 give 10-15%, 16+ give less than 5%
- Centralized coordination reduces error cascades (measured as 23% fewer cascades vs flat topology)

Framework for choosing architecture by tool count:
- 0-8 tools: Single agent, no routing needed
- 9-50 tools: Pattern 2 only (compiled group selection)
- 51-150 tools: Pattern 2 as default + selective Pattern 3 for complex queries (Hybrid)
- 150+ tools: Multiple orchestrators with their own routing layers

Production cost comparison (hybrid vs alternatives):
- All Pattern 2 only: $0.017/query
- All Pattern 3 only: $0.058/query
- Hybrid (70/30 split): $0.032/query
- Accuracy: P2 only = 90-92%, P3 only = 95-97%, Hybrid = 94-96%

Complexity routing rule (when to escalate to Pattern 3):
- Query crosses 2+ domains simultaneously (e.g., "invoice Sezer for White House work and send him a WhatsApp confirming")
- Query requires parallel information gathering (e.g., "research competitor pricing and summarize in a report")
- Query involves real financial or external-system actions where quality matters more than cost

## New Academic Papers to Add to Research Doc

RAG-MCP (May 2025, arxiv 2505.03275) — already in doc, no changes needed.

Tool-to-Agent Retrieval (Nov 2025, arxiv 2511.01854) — already in doc, no changes needed.

AgentOrchestra / TEA Protocol (June 2025, arxiv 2506.12508) — already in doc, no changes needed.

Google-MIT Multi-Agent Scaling (March 2026) — NEW, not in doc:
- "Multi-Agent Scaling Laws for Tool Orchestration" (Google DeepMind + MIT CSAIL, March 2026)
- Predictive architecture selection model (87% accuracy)
- Capability saturation finding
- Centralized coordination vs flat topology comparison

## BitBit Alignment Context

Already implemented (Quick Task 1, 2026-03-11, commit d25c85d0):
- Tool descriptions rewritten per Anthropic's tool writing guidelines
- JIT instructions (Shopify pattern) — contextual guidance injected into tool results
- Tool group metadata: ToolGroup type, TOOL_GROUPS, TOOL_GROUP_MAP in tools.ts
- Planner TOOL_LABEL_MAP coverage for all 18 tools

Currently: 20 tools in 5 groups (core, memory, channel, web, comms). Scaling to 50-100+.

Files relevant to implementation:
- packages/agents/src/engine.ts — main agent execution loop
- packages/agents/src/planner.ts — Haiku planner (generatePlan function)
- packages/agents/src/tools.ts — tool definitions, groups, metadata
</research_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update research doc with new 2026 findings</name>
  <files>.claude/docs/research/multi-agent-tool-orchestration-research.md</files>
  <action>
    Read the existing research doc first. Then make targeted additions — do NOT rewrite working sections.

    Add the following new content in the appropriate locations:

    1. In Section 3 (Academic Papers), add a new subsection 3.8:
    "### 3.8 Multi-Agent Scaling Laws (Google DeepMind + MIT CSAIL, March 2026)"
    Include: predictive architecture selection (87% accuracy), capability saturation curve (3-5 agents = 40-50% gain, 6-15 = 10-15%, 16+ = less than 5%), centralized coordination vs flat topology (23% fewer error cascades), tool count thresholds (0-8 single, 9-50 P2, 51-150 hybrid, 150+ multi-orchestrator).

    2. In Section 4 (Framework Analysis), add a new subsection 4.8:
    "### 4.8 Manus AI — Production Tool Group Architecture"
    Include: 80 tools / 12 groups, logit masking via state machine (not dynamic loading), 90-95% KV cache hit rate, 81% cost reduction from cache, 4,400 vs 22,000 token comparison, 92-97% accuracy with fallbacks, the key quote about KV cache invalidation cost.

    3. Replace the cost table in Section 7 Phase 3 with a new table that includes the hybrid row:
    | Mode | Cost/Session | Latency p50 | Accuracy |
    Pattern 2 only: $0.0173, 600-850ms, 90-92%
    Pattern 3 only: $0.0576 (cached), 1,200ms+, 95-97%
    Hybrid (70/30): $0.032, 700-1,000ms, 94-96%

    4. After the existing Section 6, add a new section 6.5 "The Hybrid Consensus (Pattern D)" with:
    - Quantified routing split (70-80% Pattern 2, 20-30% Pattern 3)
    - The Google-MIT 2026 threshold framework (0-8, 9-50, 51-150, 150+ tools)
    - Complexity routing rule (2+ domains, parallel gathering, high-stakes actions)
    - Why hybrid wins: better accuracy than pure P2, 45% cheaper than pure P3

    5. Update the Appendix Academic Papers table to add the Google-MIT 2026 paper.

    6. Update the footer date to March 2026 (already March 2026, just verify).

    Keep all existing content. Only add; do not remove or restructure existing sections.
  </action>
  <verify>
    Read the updated file and confirm:
    - Section 3.8 exists with Google-MIT 2026 findings
    - Section 4.8 exists with Manus AI production details
    - Updated cost table with hybrid row exists
    - Section 6.5 exists with hybrid consensus
    - Appendix table updated
  </verify>
  <done>Research doc contains all new 2026 findings integrated without disturbing existing content.</done>
</task>

<task type="auto">
  <name>Task 2: Create Architecture Decision Record (ADR)</name>
  <files>.claude/docs/research/tool-architecture-decision.md</files>
  <action>
    Create a new file at `.claude/docs/research/tool-architecture-decision.md` with the following structure and content. This is an ADR (Architecture Decision Record) — a format commonly used to capture significant architectural decisions.

    The file should contain:

    # ADR-001: Agent Tool Orchestration Architecture

    **Date:** March 2026
    **Status:** Accepted
    **Deciders:** Tor Kay (product), Claude (research + analysis)
    **Context:** BitBit currently has 20 tools scaling to 50-100+. Need to decide between Pattern 2 (compiled tool groups), Pattern 3 (specialist sub-agents), or Hybrid.

    ## Decision

    **Adopt Hybrid Architecture (Pattern D): Pattern 2 as default, Pattern 3 selectively for complex multi-domain queries.**

    ## Evidence Summary

    Include a concise table comparing Pattern 2, Pattern 3, and Hybrid across: cost, latency, accuracy, scaling ceiling, implementation effort.

    ## Rationale

    Cover these points:
    1. Pattern 2 aligns with Context Baseplate philosophy (compiled over reactive)
    2. Pattern 2 is 80% built (planner exists, tool groups exist, TOOL_LABEL_MAP complete)
    3. Pattern 3 at 3.3-8.3x cost is not justified for 70-80% of routine queries
    4. Hybrid captures 94-96% accuracy (near P3) at $0.032 (near P2)
    5. Google-MIT 2026 confirms: capability saturation above 5-8 agents, and routing works 87% correctly
    6. Manus AI production proof: KV cache stability is the #1 cost lever, not model choice

    ## BitBit Context Alignment

    Note current state: 20 tools, 5 groups, Phase 1 optimizations complete (Quick Task 1).
    Note target state: 50-100 tools, hybrid routing active.

    ## Implementation Specification

    ### Phase 1: Immediate (Tools 20-50) — Extend Planner for Tool Group Selection

    Code changes to `packages/agents/src/planner.ts`:
    - Extend `generatePlan()` return type to include `toolGroups: ToolGroup[]` field
    - Add tool group selection prompt to Haiku's planning call: "Based on the user's intent, which tool groups are needed? Choose from: core (always included), memory, channel, web, comms"
    - Haiku receives the user message + conversation context → outputs `toolGroups: ["core", "channel"]`

    Code changes to `packages/agents/src/tools.ts`:
    - `getAgentTools(groups?: ToolGroup[])` — filter tools by group, always include core tools
    - Tool group selection is per-conversation-start (not per-message) — call once when context is established

    Code changes to `packages/agents/src/engine.ts`:
    - Read `plan.toolGroups` from planner output
    - Pass groups to `getAgentTools(plan.toolGroups)` instead of loading all tools
    - Log tool group selection for observability: `logger.info({toolGroups: plan.toolGroups, toolCount: tools.length}, "tool group selection")`

    KV cache preservation rule: Only change tool list when `plan.toolGroups` differs from previous turn's groups (use shallow equality check). This maintains Manus's 90-95% cache hit rate.

    ### Phase 2: 6-Month (Tools 50-100) — Complexity Routing for Selective Sub-Agents

    Extend planner to also output `executionMode: "single" | "specialist" | "orchestrator"`.

    Routing logic (Haiku determines this from query features):
    - `"single"`: default for routine, single-domain queries
    - `"specialist"`: query maps cleanly to one domain (e.g., pure invoicing, pure research)
    - `"orchestrator"`: query crosses 2+ domains OR requires parallel information gathering

    For `"specialist"` mode: route to domain sub-agent with its isolated tool set (5-10 tools max).
    For `"orchestrator"` mode: spawn 2-4 sub-agents in parallel (follow Anthropic's Orchestrator-Worker pattern, subagents write to file system not through lead context).

    Sub-agent candidates (spawn on demand):
    - Research Agent: web search + fetch_url + document analysis
    - Communication Agent: email + SMS + WhatsApp + Slack
    - Business Operations Agent: CRM + invoicing + Xero
    - Automation Agent: workflow creation + scheduling

    Escalation trigger (in engine.ts): When `plan.executionMode === "orchestrator"`, delegate to `runOrchestrator(plan, context)` instead of `runSingleAgent(plan, context)`.

    ### Phase 3: 12-Month (Tools 100+) — Multiple Orchestrators

    If tool count exceeds 100, split into domain orchestrators (each manages its own planner + sub-agents). Route between orchestrators via a top-level intent classifier. This is the Google-MIT multi-orchestrator pattern.

    Not needed until proven necessary — do not build speculatively.

    ## What NOT to Build

    - NO pgvector for tool retrieval (contradicts Context Baseplate, KV cache breaks)
    - NO LangGraph/CrewAI/AutoGen (unnecessary complexity, wrong abstraction)
    - NO per-query dynamic tool loading (breaks KV cache, Manus's #1 anti-pattern)
    - NO fine-tuned models for tool selection (requires model fine-tuning, not viable with Claude API)
    - NO permanent always-running sub-agents (spawn on demand only)

    ## Success Metrics

    | Metric | Current | Phase 1 Target | Phase 2 Target |
    |--------|---------|----------------|----------------|
    | Tool count in context | 20 (all) | 5-12 (filtered) | 5-12 (+ sub-agents) |
    | Token cost per session | baseline | -60% (group filter) | -45% vs baseline (hybrid) |
    | KV cache hit rate | unknown | 90-95% | 90-95% |
    | Accuracy (first-pass) | ~85% | 90-92% | 94-96% |
    | Implementation cost | done | 1-2 days | 2-3 weeks |

    ## Review Schedule

    - Phase 1: Review when tool count reaches 30+ (add group filtering)
    - Phase 2: Review when user reports quality issues on complex multi-domain queries
    - Phase 3: Review when tool count exceeds 100

    ---
    *ADR created March 2026. Supersedes informal notes in research doc Section 7.*
  </action>
  <verify>
    Read the created file and confirm:
    - File exists at .claude/docs/research/tool-architecture-decision.md
    - Contains ADR-001 header with status "Accepted"
    - Decision section names the hybrid architecture explicitly
    - Implementation spec contains code-level changes for engine.ts, planner.ts, tools.ts
    - Phase timeline (immediate, 6-month, 12-month) is present
    - "What NOT to Build" section includes pgvector and LangGraph exclusions
  </verify>
  <done>
    ADR file exists with complete implementation specification covering Phase 1 (planner tool group extension), Phase 2 (complexity routing + selective sub-agents), and Phase 3 (multi-orchestrator). The document is immediately actionable by a Claude executor without further research.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. Read both files and verify key content is present
2. Verify research doc still opens correctly (no broken structure)
3. Verify ADR file is standalone — no missing references that would confuse a reader
4. No code was modified — this is documentation only
</verification>

<success_criteria>
- `.claude/docs/research/multi-agent-tool-orchestration-research.md` contains Google-MIT 2026 study, Manus AI production insights, updated cost table with hybrid row, and Section 6.5 hybrid consensus
- `.claude/docs/research/tool-architecture-decision.md` exists as a standalone ADR with concrete code-level implementation spec for engine.ts, planner.ts, tools.ts
- A developer (or Claude executor) can read the ADR and implement Phase 1 without needing to read the research doc
</success_criteria>

<output>
After completion, create `.planning/quick/2-research-sota-agent-tool-architecture-pa/2-SUMMARY.md` with:
- What was added to the research doc (section names)
- Key decisions captured in the ADR
- Implementation spec highlights (the 3-4 most important code changes)
- Phase timeline summary
</output>
