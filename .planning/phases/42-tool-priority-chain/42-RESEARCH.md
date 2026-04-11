# Phase 42: Tool Priority Chain — Research

**Researched:** 2026-04-08
**Researcher:** Claude Opus 4.6

## Research Question

"What do I need to know to PLAN this phase well?"

Phase 42 introduces ToolResolver -- a model-driven tier selection system that routes tasks to the optimal execution method: structured API, browser automation (Phase 40), ephemeral workspace (Phase 41), or human handoff.

---

## 1. Current Tool Dispatch Architecture

### TAOR Loop (`taor-loop.ts`)
- The TAOR loop is the main agent execution cycle: Think, Act, Observe, Repeat
- Tool dispatch happens via `executeToolBatchStreaming()` which runs tool_use blocks in parallel
- Tools are selected by the model from a flat list; no tier routing exists today
- The model calls tools by name (e.g., `send_email`, `create_task`, `web_search`)

### Tool Executor (`tool-executor.ts`)
- `executeToolBatch()` and `executeToolBatchStreaming()` handle parallel dispatch
- Budget checks happen per-role (ads, seo, content, tenders)
- Tool execution flows: budget check → parallel dispatch via `executeAgentTool()` → result processing (citations, truncation, JIT instructions)
- No concept of "try API first, fall back to browser" exists today

### Tool Registry (`tools.ts`)
- Tools organized into groups: core, memory, channel, web, comms, agentic, ads, seo, tenders, content, builder, creative, composio
- Each group has definitions (Anthropic tool format) and handler functions
- `getAgentTools()` assembles tool definitions based on org plan gates and feature flags
- Deferred tool loading via `deferred-loader.ts` for tools not always needed

### Approval Queue (`approval-queue.ts`)
- 8-state FSM: pending → approved → executing → completed/failed/expired
- Confidence-based routing: `routeAgentAction()` returns act/ask/escalate
- Approval resolution via dashboard, WhatsApp, or chat
- This is the existing human-in-the-loop pattern -- reusable for human handoff tier

### Confidence Router
- `routeAgentAction()` already makes routing decisions based on confidence scores
- Returns `act` (auto-execute), `ask` (queue for approval), or `escalate`
- Similar conceptual pattern to tier selection -- model reasons, system routes

---

## 2. Design Analysis: Model-Driven vs Static Registry

### Context Decision D-03: Fully Dynamic (No Static Registry)
The CONTEXT.md explicitly decides against a static service→tier mapping. The model reasons from its knowledge about which services have APIs vs require browser access.

### Tension with Roadmap Success Criterion 2
The roadmap says: "Integration registry maps common services (Xero, Asana, Stripe, LinkedIn, etc.) to their optimal execution tier." But CONTEXT.md D-03 says "fully dynamic -- no static registry."

**Resolution:** The "registry" is reliability data, not a static mapping. The model knows Stripe has an API and LinkedIn requires a browser. Reliability data (success/failure rates per service per tier) supplements the model's base knowledge. The "registry" is execution history, not a config file.

### How This Works in Practice
1. Model receives task: "Create invoice in Xero for $500"
2. Context includes reliability data: "Xero API tier: 48/50 success this month"
3. Model selects structured API tier (Xero integration)
4. If API fails, model sees failure and may escalate to browser on retry

---

## 3. Tier Definitions

### Tier 1: Structured API
- Existing tool handlers in `tools.ts` (Composio, channel tools, core tools)
- Cheapest, fastest, most reliable
- Examples: Xero invoice via Composio, Gmail via channel tools, Stripe via API

### Tier 2: Browser Automation (Phase 40)
- `spawn_browser_agent` tool from Phase 40
- Medium cost, variable reliability
- Examples: LinkedIn actions, WordPress admin, myGov, sites without APIs

### Tier 3: Ephemeral Workspace (Phase 41)
- `spawn_ephemeral_workspace` tool from Phase 41
- Higher cost, good for compute-heavy tasks
- Examples: Data transforms, script execution, file generation

### Tier 4: Human Handoff
- Task pauses, user notified, resumes on user confirmation
- Most expensive (user time), highest reliability for tasks requiring human judgment
- Examples: Physical world actions, legal/financial sign-offs, ambiguous situations

---

## 4. ToolResolver Integration Design

### Where It Lives
ToolResolver should integrate at the TAOR loop level, wrapping or extending the existing tool dispatch. Two approaches:

**Option A: Pre-dispatch context injection**
- Before the model's Think step, inject reliability data into context
- Model makes tier selection naturally through tool choice
- ToolResolver is really "context enrichment + reliability tracking"
- Minimal code change -- the model already picks tools

**Option B: Post-think tier resolution**
- Model says "I need to invoice Xero" → ToolResolver resolves the tier
- Adds an indirection layer between model intent and tool dispatch
- More explicit but more code

**Recommended: Option A** -- Consistent with D-01 "model carries the reasoning weight." The model already selects tools; we just give it better data (reliability scores, tier availability) to make informed choices. No new routing layer needed.

### Implementation Shape
1. **ReliabilityTracker** -- Records success/failure per service per tier
2. **Context injection** -- Feeds reliability data into system prompt at decision time
3. **Tier escalation** -- On tool failure, model sees failure + reliability update, naturally tries next tier
4. **Human handoff** -- New tool `request_human_handoff` that pauses async task and notifies user

---

## 5. Reliability Tracking Design

### Data Model
```
execution_reliability (Supabase table)
├── id (uuid)
├── org_id (uuid)
├── service_name (text) -- e.g., "xero", "linkedin", "stripe"
├── tier (text) -- "api", "browser", "workspace", "human"
├── success (boolean)
├── error_category (text, nullable) -- e.g., "auth_expired", "rate_limited", "dom_changed"
├── latency_ms (integer)
├── cost_tokens (integer)
├── created_at (timestamptz)
```

### Aggregation
- Rolling 7-day window for recent reliability
- Pre-computed materialized view or on-read aggregation:
  ```
  service: "xero", tier: "api", success_rate: 0.96, avg_latency_ms: 450, sample_count: 48
  service: "linkedin", tier: "browser", success_rate: 0.40, avg_latency_ms: 12000, sample_count: 5
  ```

### Context Injection Format
Inject into system prompt as structured data the model can reference:
```
## Execution Reliability (last 7 days)
| Service | API | Browser | Workspace | Human |
|---------|-----|---------|-----------|-------|
| xero | 96% (48) | - | - | - |
| linkedin | - | 40% (5) | - | 100% (2) |
| stripe | 100% (23) | - | - | - |
```

---

## 6. Human Handoff Design

### Extending Approval Queue (D-07)
The approval queue already implements human-in-the-loop with pause/resume semantics. Human handoff extends this pattern:

1. Agent determines task needs human action
2. Creates handoff record (extends `approval_queue` or new `human_handoff` table)
3. Async task transitions to `paused` state (Phase 39 FSM)
4. User notified via chat + WhatsApp with context
5. User completes action and confirms (or reports failure)
6. Task resumes from where it paused

### Key Difference from Approval Queue
- Approval queue: "Should I do X?" → User approves → Agent executes X
- Human handoff: "I can't do X. Please do X." → User does X → User confirms → Agent continues with result

### Handoff Tool
```
request_human_handoff({
  description: "Log into LinkedIn and accept the connection request from Sarah Chen",
  context: { service: "linkedin", attempted_tiers: ["browser"], reason: "Browser automation blocked by CAPTCHA" },
  urgency: "normal" | "urgent",
  expected_result: "Confirmation that connection was accepted"
})
```

---

## 7. Validation Architecture

### Unit Tests
- ReliabilityTracker: record, aggregate, query methods
- Context injection: reliability data formatting
- Tier selection: model receives correct context for different scenarios

### Integration Tests
- End-to-end tier resolution: task → API attempt → failure → browser fallback
- Human handoff: task → pause → user notification → resume
- Reliability tracking: execution → record → aggregation → context injection

### Key Test Scenarios
1. API tier succeeds → no escalation, reliability recorded
2. API tier fails → model sees failure, selects browser on retry
3. Browser tier fails → model considers workspace or human handoff
4. Low reliability data triggers tier shift in model reasoning
5. Human handoff → task pauses → user confirms → task resumes
6. New service with no history → model uses base knowledge

---

## 8. Dependencies and Integration Points

### Phase 39 (Async Tasks)
- Handoff tier requires async task `paused` state
- All tier executions tracked as async tasks
- Task resumption on handoff completion

### Phase 40 (Browser)
- `spawn_browser_agent` tool available as browser tier
- Browser execution results feed into reliability tracking

### Phase 41 (Workspaces)
- `spawn_ephemeral_workspace` tool available as workspace tier
- Workspace execution results feed into reliability tracking

### Existing Systems
- Approval queue: Reused/extended for human handoff
- Confidence router: Similar pattern for tier selection reasoning
- Context assembler: Injects reliability data into model context
- Tool executor: Records execution outcomes for reliability tracking

---

## 9. Risk Assessment

### Low Risk
- Reliability tracking is straightforward CRUD + aggregation
- Context injection follows existing ContextAssembler patterns

### Medium Risk
- Model tier selection quality depends on prompt engineering
- Need enough execution history before reliability data is useful (cold start)

### High Risk
- None identified -- this phase mostly assembles patterns from prior phases

### Cold Start Mitigation
- Model's base knowledge handles the cold start (knows Stripe has API, LinkedIn needs browser)
- Reliability data improves over time but isn't required for initial functionality
- Could seed common services with expected tier preferences, but CONTEXT.md D-03 argues against this

---

## RESEARCH COMPLETE

Phase 42 is well-scoped. The core insight is that ToolResolver is NOT a routing engine -- it's a context enrichment system. The model already makes tool choices; we give it reliability data to make better choices. The implementation decomposes into:

1. Reliability tracking (new table + tracker service)
2. Context injection (extend ContextAssembler)
3. Human handoff tool (extend approval queue pattern)
4. Execution feedback loop (record outcomes from tool executor)

No new architectural patterns needed. All major patterns exist in the codebase (approval queue, context assembly, tool dispatch).
