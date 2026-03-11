# Multi-Agent Tool Orchestration for LLM-Based AI Assistants

**Research Summary | March 2026**
**Context**: BitBit AI assistant — currently 20 tools, scaling to 50-100+. Anthropic Claude API (Sonnet for main brain, Haiku for planning/routing).

---

## Table of Contents

1. [The Core Problem: Tool Scaling](#1-the-core-problem-tool-scaling)
2. [Architecture Patterns](#2-architecture-patterns)
3. [Academic Papers & Key Research (2024-2026)](#3-academic-papers--key-research-2024-2026)
4. [Framework Analysis](#4-framework-analysis)
5. [Tool Retrieval Mechanisms](#5-tool-retrieval-mechanisms)
6. [The Central Question: Single vs Multi-Agent vs Hybrid](#6-the-central-question-single-vs-multi-agent-vs-hybrid)
7. [Recommendation for BitBit](#7-recommendation-for-bitbit)

---

## 1. The Core Problem: Tool Scaling

### What Happens When You Add More Tools

Evidence from both research and production deployments reveals a clear degradation curve:

| Tool Count | Observed Behavior |
|------------|-------------------|
| 0-20 | Clear boundaries, straightforward behavior. LLMs handle tool selection well. |
| 20-50 | Boundaries become unclear. Tool combinations cause unexpected outcomes. |
| 50+ | Multiple ways to accomplish the same task. System becomes difficult to reason about. Performance degrades measurably. |
| 100+ | Context window consumed by tool descriptions alone (22%+ of window). Hallucinations increase. Latency spikes. |

**Key data points:**
- Tool descriptions at scale consume ~22% of the context window (MCP stress tests)
- Cursor enforces a hard limit of 40 MCP tools to prevent context window flooding
- RAG-MCP experiments show baseline tool selection accuracy drops to 13.62% with many tools; retrieval-augmented selection restores it to 43.13% (3x improvement)
- Shopify's production experience (Sidekick) confirmed "Death by a Thousand Instructions" — their system prompt became an unwieldy collection of conflicting guidance that degraded both performance and maintainability

### The "Context Rot" Effect

Research from Chroma (2025) demonstrates that LLM performance degrades as input tokens increase — not just from running out of context window, but from diluted attention over irrelevant content. Tool descriptions are particularly harmful because they are semantically dense and compete for the model's attention with the actual user query and conversation history.

---

## 2. Architecture Patterns

### Pattern A: Single Agent with All Tools

The agent receives all tool definitions in its system prompt and selects which to use.

**Pros:** Simple architecture, no routing latency, full context awareness.
**Cons:** Context window bloat, degraded selection accuracy at scale, "Death by a Thousand Instructions."
**Works well at:** <30 tools.

### Pattern B: Single Agent with Filtered/Retrieved Tools (Tool RAG)

A retrieval layer selects the top-k relevant tools per query before passing them to the agent.

**Pros:** Scales to thousands of tools, preserves context window, maintains selection accuracy.
**Cons:** Retrieval errors can hide the right tool, adds a retrieval step, requires embedding infrastructure.
**Works well at:** 30-1000+ tools.

> **CONTRADICTION NOTE (2026-03-11):** This pattern uses reactive per-query retrieval, which contradicts BitBit's core architectural decision: **Context Baseplate = compiled world model, NOT reactive RAG** (see `docs/comprehensive-roadmap.md` citing RAGFlow: "structured context assembly > naive retrieval"). BitBit's knowledge layer deliberately chose compiled context over reactive retrieval. Applying reactive RAG to the tool layer breaks that philosophical consistency. See **Pattern B-alt** below for the aligned alternative.

### Pattern B-alt: Single Agent with Planner-Compiled Tool Groups (Context Baseplate Aligned)

A lightweight planner (Haiku) classifies intent and selects relevant tool groups *before* the main agent runs. Tool groups are pre-defined, deterministic sets — not dynamically retrieved via embedding similarity.

**Pros:** Consistent with Context Baseplate philosophy. Deterministic (same intent → same tools). No embedding infrastructure. Cache-friendly (Manus insight: stable tool definitions preserve KV cache). Planner already exists in BitBit.
**Cons:** Requires well-defined group boundaries. Less flexible than continuous semantic similarity — a query must match a discrete group, not a gradient.
**Works well at:** 30-100 tools with clear domain boundaries.
**Inspiration:** Manus (logit masking via state machine), Composio (5 fixed meta-tools), Claude Code (deferred loading by category).

### Pattern C: Specialist Sub-Agents with Router

A lightweight router agent (or classifier) dispatches to domain-specific sub-agents, each with its own small tool set.

**Pros:** Each sub-agent has clear, focused context. Natural team structure. Independent scaling.
**Cons:** Routing errors cascade. Cross-domain queries require multi-agent coordination. Higher token cost (15x per Anthropic's data). Added latency from sequential hops.
**Works well at:** Complex workflows, high-value tasks where quality justifies cost.

### Pattern D: Hybrid (The Emerging Consensus)

A single primary agent with filtered tools handles most queries. For complex multi-step tasks, it spawns specialist sub-agents. A lightweight model handles routing/classification. Tool filtering can be implemented via reactive retrieval (Tool RAG) or compiled planner selection (Pattern B-alt) — the latter is preferred when the system already has a planning step.

**Pros:** Best of both worlds. Cost-efficient for simple queries, powerful for complex ones.
**Cons:** Most complex to implement and debug. Requires clear escalation criteria.
**Works well at:** Production systems at scale.

> **BitBit alignment:** Pattern D with compiled tool group selection (B-alt) + selective sub-agent spawning is the target architecture. This preserves Context Baseplate philosophy while scaling to 100+ tools.

### Pattern E: Orchestrator-Worker (Anthropic's Pattern)

A lead agent dynamically breaks down tasks and spawns worker agents. Workers operate in parallel with separate context windows.

**Pros:** 90%+ improvement over single-agent on complex tasks (Anthropic's data). Parallel execution. Dynamic task decomposition.
**Cons:** 15x token cost. Best for high-value research/analysis tasks, not routine operations.
**Works well at:** Complex, open-ended tasks where quality >> cost.

---

## 3. Academic Papers & Key Research (2024-2026)

### 3.1 ToolLLM (ICLR 2024)

**Paper:** "ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs"
**Source:** arxiv.org/abs/2307.16789

- **Architecture:** Single agent with neural API retriever
- **Tool Selection:** Sentence-BERT dense retriever encodes instructions and API docs into embeddings, calculates relevance via embedding similarity. Top-k retrieval from 16,464 real-world APIs across 49 categories.
- **Key Innovation:** Depth-first search-based decision tree for reasoning — enables LLMs to evaluate multiple reasoning traces and expand the search space.
- **Results:** Fine-tuned LLaMA (ToolLLaMA) achieves comparable performance to ChatGPT on tool use.
- **Scaling:** Demonstrated effective retrieval from 16,000+ APIs, proving embedding-based retrieval is viable at massive scale.
- **Relevance to BitBit:** Validates that semantic retrieval over tool descriptions works well even at scales far beyond 100 tools.

### 3.2 ToolGen (ICLR 2025)

**Paper:** "ToolGen: Unified Tool Retrieval and Calling via Generation"
**Source:** arxiv.org/abs/2410.03439

- **Architecture:** Single agent with tools encoded as special tokens in the LLM vocabulary
- **Tool Selection:** Each tool is represented as a unique token. The LLM generates tool calls as part of next-token prediction — no separate retrieval step needed.
- **Training:** Three-stage process: tool memorization (associate token with documentation), retrieval training (generate tool tokens from queries), agent training (end-to-end task completion).
- **Results:** Superior performance with 47,000+ tool tokens in both retrieval and task completion.
- **Scaling:** Excellent — tools are part of the model's vocabulary, so no context window cost per tool.
- **Relevance to BitBit:** Academically interesting but requires fine-tuning the base model, which is not viable when using Claude via API. However, the concept of "tool tokens" may inspire prompt engineering approaches.

### 3.3 RAG-MCP (May 2025)

**Paper:** "RAG-MCP: Mitigating Prompt Bloat in LLM Tool Selection via Retrieval-Augmented Generation"
**Source:** arxiv.org/abs/2505.03275

- **Architecture:** Retrieval layer in front of MCP tool selection
- **Tool Selection:** Semantic retrieval identifies the most relevant MCP servers/tools for a query from an external index before engaging the LLM. Only selected tool descriptions are passed to the model.
- **Results:** Cuts prompt tokens by 50%+. Triples tool selection accuracy (43.13% vs 13.62% baseline).
- **Latency:** Adds retrieval step (~50-100ms) but reduces LLM inference time by shrinking prompt.
- **Relevance to BitBit:** Directly applicable. This is the paper most relevant to BitBit's architecture — it solves exactly the tool scaling problem you will face.

### 3.4 Tool-to-Agent Retrieval (November 2025)

**Paper:** "Tool-to-Agent Retrieval: Bridging Tools and Agents for Scalable LLM Multi-Agent Systems"
**Source:** arxiv.org/abs/2511.01854

- **Architecture:** Shared vector space embedding both tools and their parent agents, connected through metadata relationships.
- **Tool Selection:** Enables granular tool-level or agent-level retrieval without context dilution from chunking many tools together.
- **Results:** 19.4% improvement in Recall@5 and 17.7% in nDCG@5 over prior state-of-the-art on LiveMCPBench. Consistent across 8 different embedding models (gains come from the indexing design, not embedding choice).
- **Relevance to BitBit:** If BitBit moves to a multi-agent architecture, this framework shows how to route queries to the right agent AND the right tool simultaneously.

### 3.5 Mixture-of-Agents (ICLR 2025 Spotlight)

**Paper:** "Mixture-of-Agents Enhances Large Language Model Capabilities"
**Source:** arxiv.org/abs/2406.04692

- **Architecture:** Layered multi-LLM system where each layer's agents receive outputs from all agents in the previous layer.
- **Key Insight:** "Collaborativeness" — LLMs generate better responses when presented with outputs from other models, even weaker ones.
- **Results:** 65.1% on AlpacaEval 2.0 with open-source models only (vs GPT-4 Omni's 57.5%).
- **Relevance to BitBit:** Less directly applicable (this is about response quality, not tool orchestration), but the layered aggregation pattern could inform how BitBit synthesizes results from multiple sub-agents.

### 3.6 AgentOrchestra / TEA Protocol (June 2025)

**Paper:** "AgentOrchestra: Orchestrating Multi-Agent Intelligence with the Tool-Environment-Agent (TEA) Protocol"
**Source:** arxiv.org/abs/2506.12508

- **Architecture:** Hierarchical multi-agent with central planner orchestrating specialized sub-agents (web navigation, data analysis, file operations).
- **Key Innovation:** Tool Manager Agent that dynamically creates, retrieves, and reuses tools at runtime. TEA protocol provides unified lifecycle management for tools, environments, and agents.
- **Results:** 83.39-89.04% on GAIA benchmark (state-of-the-art for general-purpose agents).
- **Relevance to BitBit:** The dynamic tool creation/reuse concept is interesting for a system that may need to compose new capabilities from existing tools.

### 3.7 Multi-Agent LLM Orchestration for Incident Response (November 2025)

**Paper:** "Multi-Agent LLM Orchestration Achieves Deterministic, High-Quality Decision Support for Incident Response"
**Source:** arxiv.org/abs/2511.15755

- **Results:** 100% actionable recommendation rate vs 1.7% for single-agent approaches. Zero quality variance across trials.
- **Relevance to BitBit:** Demonstrates that multi-agent orchestration can achieve production SLA commitments impossible with single-agent. However, incident response is a high-value, low-frequency use case — the cost/quality tradeoff differs from a general assistant.

---

## 4. Framework Analysis

### 4.1 Anthropic's Composable Patterns

**Source:** anthropic.com/research/building-effective-agents

**Architecture:** Six composable patterns — Prompt Chaining, Routing, Parallelization, Orchestrator-Workers, Evaluator-Optimizer, Context-Augmentation.

**Key Recommendations from Anthropic:**
1. Start with the simplest solution. Many applications need only optimized single LLM calls with retrieval.
2. Workflows (predictable) for well-defined tasks; Agents (flexible) for open-ended problems.
3. "Too many tools or overlapping tools can distract agents from pursuing efficient strategies."
4. Build "a few thoughtful tools targeting specific high-impact workflows" and scale up from there.
5. Tools are "a new kind of software" — design them for agents, not for developers.

**Anthropic's Multi-Agent Research System (June 2025):**
- Lead agent (Claude Opus 4) coordinates 3-5 subagents (Claude Sonnet 4) in parallel
- Each subagent uses 3+ tools in parallel
- Result: 90%+ improvement over single-agent, but 15x token consumption
- "Token usage explains 80% of quality variance" — more tokens = better results
- Architecture works because separate context windows add capacity for parallel reasoning

**Tool Writing Best Practices (Anthropic Engineering Blog):**
- Small refinements to tool descriptions yield dramatic improvements
- Example: Claude was appending "2025" to web search queries, degrading results — fixed by improving the tool description
- Use human-readable fields, not raw technical IDs
- Focus on high-leverage tools, not thin API wrappers

**Latency:** Native Claude tool use has no additional routing overhead.
**Cost:** Scales linearly with tool count in context. Subagent pattern multiplies cost 15x.
**Best for BitBit:** The routing + JIT tool loading pattern is directly applicable.

### 4.2 OpenAI Swarm

**Source:** github.com/openai/swarm

**Architecture:** Educational/experimental framework. Two abstractions: Agents and Handoffs. Fully stateless (runs on Chat Completions API). Each agent has its own instructions, role, and available functions.

**Tool Selection:** Explicit — each agent has a fixed set of functions. Routing via handoff functions that transfer control between agents.

**Key Design Principles:**
- Lightweight, stateless agents with explicit handoffs
- Context variables enable shared state
- Trades "opaque automation for clarity and observability"
- Developer controls exactly when control moves and what context travels

**Latency:** Minimal — built on raw Chat Completions API.
**Cost:** Low overhead — no embedding infrastructure, no retrieval step.
**Scaling:** Manual — you must design the agent topology and handoff functions yourself.
**Relevance to BitBit:** Good conceptual model for how to structure agent handoffs, but too minimal for production. The "explicit handoff" pattern is worth adopting even in a more sophisticated system.

### 4.3 LangGraph

**Source:** LangChain ecosystem

**Architecture:** Graph-based (DAG) orchestration. Nodes = agents/functions/decision points. Edges = data flow with conditional routing. Centralized StateGraph for intermediate results and metadata.

**Tool Selection:** Via conditional edges and routing nodes. The graph structure determines which agent/tool handles each step.

**Key Features:**
- Conditional branching based on agent outputs or state
- Parallel execution with result merging at downstream nodes
- Automated retries, per-node timeouts, pause/resume
- Cyclical workflows (agents can critique/improve own outputs)
- Persistent state management

**Latency:** Graph traversal adds overhead. Each node is a potential LLM call.
**Cost:** Proportional to graph depth and branching factor.
**Scaling:** Good architectural scalability but production deployment requires "meticulous infrastructure planning" — memory leaks, distributed agent coordination, and monitoring are cited challenges.
**Relevance to BitBit:** Powerful but heavy. The graph-based paradigm adds complexity that may not be justified for BitBit's use case. However, the conditional routing and state management concepts are valuable.

### 4.4 CrewAI

**Architecture:** Role-based agent teams ("crews"). Each agent has a role, backstory, and goal. Tasks are assigned to agents within a crew.

**Tool Selection:** Each agent has its own tool set. Task assignment determines which agent (and thus which tools) are used.

**Strengths:** Fast prototyping, intuitive role-based mental model, gentler learning curve.
**Weaknesses:** Less control over complex workflows. Role-based abstraction can be limiting for technical tasks.
**Cost/Latency:** Lower resource usage than AutoGen (15% less CPU/GPU for similar tasks).
**Relevance to BitBit:** Good for rapid experimentation but not ideal for production. The role-based metaphor doesn't map well to a personal assistant where the user expects a unified interface.

### 4.5 AutoGen (Microsoft Research)

**Architecture:** Multi-agent conversation patterns — two-agent chats, group chats, sequential conversations, nested patterns. Agents interact through structured dialogues.

**Tool Selection:** Agents negotiate tool use through conversation. Group chat patterns allow consensus-building.
**Strengths:** Most diverse conversation patterns. Strong human-in-the-loop support. Good for regulated/auditable workflows.
**Weaknesses:** Complex mental model (message flows and policies). 15% higher resource usage than CrewAI.
**Relevance to BitBit:** Overcomplicated for a personal assistant. The conversation-based paradigm is better suited for multi-party reasoning tasks.

### 4.6 Google ADK (Agent Development Kit)

**Source:** google.github.io/adk-docs

**Architecture:** Hierarchical multi-agent with both workflow agents (Sequential, Parallel, Loop) and LLM-driven dynamic routing.

**Tool Selection:** Three mechanisms:
1. LLM-driven routing (dynamic, flexible)
2. Hierarchical delegation (coordinator routes to specialists)
3. Dynamic transfer via `transfer_to_agent` (tools can hand off to specialized agents)

**Strengths:** Same framework powering Google's Agentspace and CES. Strong developer tools (CLI, visual Web UI for step-by-step inspection).
**Relevance to BitBit:** The hierarchical delegation + dynamic transfer pattern is directly relevant. However, ADK is tightly coupled to Google's ecosystem.

### 4.7 Gorilla (UC Berkeley)

**Source:** gorilla.cs.berkeley.edu

**Architecture:** Fine-tuned LLaMA for API/tool calling. RAT (Retrieval Aware Training) with API documentation retrieval.

**Key Contribution:** Berkeley Function-Calling Leaderboard (BFCL) — the standard benchmark for LLM tool-calling ability. BFCL V4 (July 2025) added agentic evaluation: web search with multi-hop reasoning, error recovery, agent memory management.

**Execution Engine:** GoEx provides "post-facto validation" — assess LLM actions after execution with undo and damage confinement.

**Relevance to BitBit:** BFCL is valuable as an evaluation framework. The "undo/damage confinement" concept from GoEx is relevant for a production assistant that takes real-world actions.

---

## 5. Tool Retrieval Mechanisms

### 5.1 Embedding-Based Semantic Search (Most Common)

**How it works:** Tool names, descriptions, and argument schemas are embedded into a vector space. User queries are embedded and matched via cosine similarity. Top-k tools are retrieved and injected into the LLM prompt.

**Performance:**
- 82.3% accuracy with top-20 retrieval (vs 75.8% baseline)
- 91.9% recall
- 21% faster end-to-end latency (less prompt = faster inference)

**Infrastructure:** Requires a vector store (Pinecone, FAISS, pgvector). Embeddings must be updated when tool descriptions change.

**Best practice (from ToolScale):** Enhance tool documents with: tool name, detailed description, argument schema, synthetic usage questions, and key topics/intents extracted from usage examples.

### 5.2 Auto-Synchronizing Tool Index (ToolScale Pattern)

**How it works:** A pipeline periodically polls tool registries (e.g., MCP servers), computes SHA-256 hashes on tool documents, and issues CRUD operations to keep the embedding index in sync.

**Retrieval flow:**
1. Compute query embedding
2. Retrieve overcomplete candidate set via approximate KNN
3. Optionally rerank with cross-encoder (e.g., Cohere or GPT-4o)
4. Apply threshold for final top-k selection
5. Multiple query variations may be issued per user query (union + rerank)

### 5.3 Hierarchical Tool Organization (MCP Enhancement Proposal)

**How it works:** Tools are organized into categories. The LLM first selects a category, then discovers tools within it via lazy loading.

**Benefits:** Reduces initial context window consumption. Category selection is easier than individual tool selection. Backward-compatible with existing MCP.

**Status:** Proposal stage (GitHub Discussion #532 on modelcontextprotocol).

### 5.4 Just-in-Time (JIT) Instructions (Shopify Pattern)

**How it works:** Instead of loading all tool instructions into the system prompt, relevant instructions are returned alongside tool results exactly when needed. The core system prompt contains only fundamental agent behavior.

**Production validated:** Shopify's Sidekick uses this at scale.

**Key advantage:** Instructions appear only when relevant, keeping the primary prompt focused and preventing the "Death by a Thousand Instructions" problem.

### 5.5 Tool-as-Token (ToolGen Pattern)

**How it works:** Each tool is a special token in the LLM's vocabulary. Tool selection is pure next-token prediction — no retrieval step.

**Limitation:** Requires fine-tuning the base model. Not viable for API-based usage (Claude, GPT).

---

## 6. The Central Question: Single vs Multi-Agent vs Hybrid

### Evidence For Single Agent (with Tool RAG)

**Shopify's production lesson:** "Avoid multi-agent architectures early — simple single-agent systems can handle more complexity than expected." They explicitly recommend starting with a single agent + JIT tool loading and only escalating to multi-agent when proven necessary.

**Anthropic's guidance:** "Find the simplest solution possible, and only increase complexity when needed. For many applications, optimizing single LLM calls with retrieval and in-context examples is usually enough."

**Cost advantage:** Single agent = 1x token cost. Multi-agent = 15x token cost (Anthropic's data).

**When it breaks down:** When the task requires parallel exploration of multiple information sources, or when the domain complexity exceeds what a single context window can hold.

### Evidence For Multi-Agent

**Anthropic's research system:** 90%+ improvement over single-agent on complex research queries. But this is a high-value, compute-intensive use case.

**Incident response paper:** 100% actionable rate (vs 1.7% single-agent). But this uses a deterministic orchestration pattern, not dynamic agent spawning.

**AgentOrchestra:** 83-89% on GAIA benchmark with hierarchical specialist agents.

**When it's worth it:** Complex, multi-step tasks where the value of the outcome justifies 15x token cost. Tasks that naturally decompose into parallel sub-problems.

### Evidence For Hybrid (The Emerging Consensus)

The 2025-2026 research consensus converges on a hybrid approach:

1. **Default mode:** Single agent with tool retrieval (Tool RAG). Handles 80-90% of queries.
2. **Escalation mode:** For complex queries, the primary agent spawns specialist sub-agents that work in parallel.
3. **Routing layer:** A lightweight/fast model (Haiku) classifies query complexity and determines the execution mode.

This matches how Anthropic's own products work, how Shopify evolved, and what the academic research supports.

---

## 7. Recommendation for BitBit

> **Architectural Constraint (2026-03-04):** BitBit uses the **Context Baseplate** pattern — a compiled world model, NOT reactive RAG. This was a deliberate founding decision (see `docs/comprehensive-roadmap.md`, citing RAGFlow: "structured context assembly > naive retrieval"). All tool scaling recommendations below must align with this principle: **compiled/planned selection over reactive per-query retrieval.**

### Why Tool RAG Is Wrong for BitBit

The RAG-MCP paper (Section 3.3) demonstrates impressive results: 3x accuracy improvement via per-query embedding retrieval. However, this pattern is architecturally misaligned with BitBit for three reasons:

1. **Philosophical inconsistency.** BitBit's knowledge layer deliberately rejects reactive RAG in favor of compiled context assembly. The entire Semantic Context Engine (Phase 1, 28 tasks) was built on this principle. Applying reactive RAG to tools while rejecting it for knowledge creates an incoherent architecture.

2. **BitBit already has a planner.** The Haiku planner (`planner.ts`) already runs intent classification in ~500ms before the main Sonnet call. This is a compiled decision point — extending it to select tool groups is natural, zero-infrastructure, and consistent with Context Baseplate.

3. **Manus's cache insight applies.** Manus found that dynamically changing tool lists between turns breaks KV cache coherence — their single most important production metric. Per-query Tool RAG changes the tool list every turn. Compiled tool groups maintain stable tool sets within a conversation.

### Architecture: Phased Compiled Approach

#### Phase 1: Now (18 tools) — Optimized Single Agent ✅ DONE

BitBit is within the single-agent sweet spot. All tools loaded, descriptions optimized, JIT instructions injected.

**Completed (Quick Task 1, 2026-03-11):**
- ✅ Tool descriptions rewritten per Anthropic's "Writing Tools for Agents" guidelines
- ✅ JIT instructions (Shopify pattern) — contextual guidance injected into tool results
- ✅ Tool group metadata added — `ToolGroup` type, `TOOL_GROUPS`, `TOOL_GROUP_MAP`
- ✅ Planner `TOOL_LABEL_MAP` coverage for all 18 tools

#### Phase 2: 30-50 Tools — Planner-Compiled Tool Group Selection

When tools exceed ~30, extend the existing Haiku planner to select which tool groups are relevant for each message. This is a **compiled** decision, not reactive retrieval.

**Recommended approach:**
- Extend `generatePlan()` in `planner.ts` to output a `toolGroups: ToolGroup[]` field alongside the existing plan stages
- Haiku sees the user message + conversation context → selects 1-3 relevant groups from the 5 defined groups (core, memory, channel, web, comms)
- `getAgentTools()` accepts an optional `groups?: ToolGroup[]` filter parameter
- Core tools (5-7) are "always-on" — they bypass group filtering
- Tool group selection is deterministic for the same intent class → cache-friendly

**Why this beats Tool RAG:**
- No embedding infrastructure (no pgvector index, no embedding model costs)
- Deterministic: same intent → same tool groups → reproducible behavior
- Cache-friendly: tool list is stable within a conversation (Manus insight)
- Already 80% built: planner exists, group metadata exists, just need the bridge

**Inspiration:** Composio's 5 meta-tools (fixed surface, dynamic depth), Manus's state-machine tool masking, Claude Code's category-based deferred loading.

**Expected cost:** $0 additional — Haiku planner already runs, adding one more classification field is negligible.

#### Phase 3: 50-100+ Tools — Selective Sub-Agent Spawning

Add specialist sub-agents only for domains that demonstrably benefit from isolated context and parallel execution. This is the Anthropic Orchestrator-Worker pattern, not a permanent multi-agent topology.

**Candidate sub-agent domains (spawn on demand, not always running):**
- **Research Agent**: Web search + fetch_url + document analysis — benefits from parallel exploration of multiple sources
- **Communication Agent**: Email + SMS + WhatsApp + Slack — benefits from channel-specific templates and confirmation workflows
- **Business Operations Agent**: CRM + invoicing + reporting — benefits from financial context isolation
- **Automation Agent**: Workflow creation + scheduling — benefits from system state awareness

**Routing:** Haiku planner classifies intent AND complexity:
- Simple queries → Single agent + group-filtered tools (fast, cheap)
- Domain-specific queries → Route to specialist sub-agent (moderate cost, better depth)
- Complex multi-domain queries → Orchestrator spawns multiple sub-agents in parallel (expensive, highest quality)

**Cost model (per query):**
| Mode | Estimated Cost | Latency | Quality |
|------|---------------|---------|---------|
| Single + group-filtered tools | ~$0.003-0.01 | 1-3s | Good for 80% of queries |
| Specialist sub-agent | ~$0.01-0.03 | 2-5s | Better for domain-specific |
| Multi-agent parallel | ~$0.05-0.15 | 3-8s | Best for complex queries |

### Key Technical Decisions

1. **NO pgvector for tool retrieval.** Tool selection is a compiled planner decision, not reactive embedding lookup. pgvector remains reserved for the knowledge layer (entity graph, memory search) where it belongs.

2. **Haiku for routing/classification.** At $1/M input tokens and 2x+ the speed of Sonnet, Haiku is the right choice for the compiled planning step. It classifies intent, selects tool groups, and determines execution mode — all in one call.

3. **Sonnet for the main agent.** Continue using Sonnet as the primary reasoning model. Strong tool-calling accuracy, handles the main conversation.

4. **JIT instructions over system prompt bloat.** Follow Shopify's pattern — return contextual instructions with tool results rather than front-loading everything. ✅ Already implemented.

5. **Stable tool lists within conversations.** Follow Manus's insight: don't change the tool list between turns. Tool group selection happens once at conversation start (or when intent shifts significantly), not per-message.

6. **MCP for future tool integration.** Anthropic's Model Context Protocol is the emerging standard. Structure new tools as MCP servers for interoperability — but route through the planner, not through MCP's own tool discovery.

### What NOT to Do

- **Do not use Tool RAG (embedding-based per-query tool retrieval).** It contradicts the Context Baseplate architecture. Use planner-compiled tool group selection instead.

- **Do not adopt a full multi-agent framework** (LangGraph, CrewAI, AutoGen). These add substantial complexity and are designed for different use cases. BitBit should own its orchestration logic directly.

- **Do not start with multi-agent.** Anthropic and Shopify both explicitly recommend against this. The 15x cost multiplier is not justified for routine personal assistant queries.

- **Do not fine-tune models for tool selection.** ToolGen and ToolLLM are academically interesting but require model fine-tuning. With Claude API, use prompt engineering and compiled planning instead.

- **Do not put all tool descriptions in the system prompt** once you pass 30 tools. The context rot research is clear: more irrelevant context = worse performance. Use planner-selected tool groups to keep the active set small.

- **Do not change tool lists between conversation turns** unless intent shifts significantly. This breaks KV cache coherence (Manus's primary production insight).

---

## Appendix: Source Registry

### Academic Papers
| Paper | Venue | Year | Key Contribution |
|-------|-------|------|------------------|
| ToolLLM | ICLR | 2024 | Neural API retriever for 16K+ tools |
| ToolGen | ICLR | 2025 | Tools as tokens in LLM vocabulary |
| Mixture-of-Agents | ICLR Spotlight | 2025 | Layered multi-LLM collaboration |
| RAG-MCP | arXiv | 2025 | Retrieval-augmented tool selection for MCP |
| Tool-to-Agent Retrieval | arXiv | 2025 | Shared embedding space for tools + agents |
| AgentOrchestra / TEA | arXiv | 2025 | Hierarchical orchestration with tool lifecycle |
| Multi-Agent Incident Response | arXiv | 2025 | Deterministic multi-agent decision support |
| Gorilla | NeurIPS | 2024 | LLM connected to massive APIs + BFCL benchmark |

### Industry Sources
| Source | Organization | Key Insight |
|--------|-------------|-------------|
| Building Effective Agents | Anthropic | Start simple, composable patterns, tool design principles |
| Multi-Agent Research System | Anthropic | Orchestrator-worker with 90% improvement, 15x cost |
| Writing Tools for Agents | Anthropic | Tool description quality matters more than quantity |
| Shopify Sidekick | Shopify Engineering | JIT instructions, avoid multi-agent early, Death by 1000 Instructions |
| Google ADK | Google | Hierarchical delegation + dynamic transfer |
| OpenAI Swarm | OpenAI | Explicit handoffs, stateless agents |

### Framework Comparison Summary
| Framework | Architecture | Best For | Production Ready |
|-----------|-------------|----------|-----------------|
| Anthropic Patterns | Composable building blocks | Claude-based systems | Yes (1st party) |
| OpenAI Swarm | Stateless agents + handoffs | Learning/prototyping | No (educational) |
| LangGraph | Graph-based DAG | Complex stateful workflows | Yes (with effort) |
| CrewAI | Role-based crews | Rapid prototyping | Partial |
| AutoGen | Conversation patterns | Auditable multi-party reasoning | Partial |
| Google ADK | Hierarchical + dynamic routing | Google ecosystem | Yes |

---

*This research was conducted March 2026. The field is moving rapidly — key findings should be re-validated quarterly.*
