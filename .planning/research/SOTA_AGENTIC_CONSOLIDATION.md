# BitBit: State of the Art Consolidation Plan (Revised 2026)

## Executive Summary

BitBit is an award-winning deterministic agentic operations platform ("harness"). Its strength lies in its **Role Engine**, **Confidence Gating**, and the highly sophisticated **Memory Palace**, which already implements bleeding-edge active memory management, pattern detection, and sleep consolidation. 

To cross the chasm from "Task Automation" to true "Autonomous Relationship Management" and consolidate "hands-free intelligent agency" (e.g., the *Steve West Scenario*), BitBit must bridge its deterministic harness with the ungated, multimodal realities of SOTA 2026 frameworks (Browser-Use, OpenHands). 

This revised plan acknowledges the advanced state of BitBit's existing Memory Palace and details the architectural roadmap to fuse this active memory with unbounded execution and optimal game theory.

---

## Phase 0: Security-First Codebase Reconciliation

An exhaustive study of BitBit's core engine files against the GSD security research (which highlights real-world CVEs and $400M+ cost runaway incidents in 2026) reveals that we must upgrade our deterministic harness *securely*. We cannot simply remove guardrails; we must implement **Dynamic Security Boundaries**.

Before implementing the new paradigms, these atomic items must be reconciled:

1. **The TAOR Loop Execution Cap (`taor-loop.ts`)**:
   - **Current State:** The loop has a hardcoded `SAFETY_CEILING = 50` iterations. 
   - **Reconciliation:** An unbounded ephemeral workspace task might exceed 50 iterations. Instead of gutting the ceiling, we introduce a **Dynamic Fiduciary Ceiling**. If an entity holds an "Infinite Autopilot" mandate, the ceiling is raised to a computed maximum based on their LTV, but *always* backed by a 5-minute hard infrastructure kill switch on the container.
2. **Confidence Routing & Autonomy Gates (`confidence-router.ts`)**:
   - **Current State:** The router resolves thresholds linearly and is unaware of emergent CUA action sequences. 
   - **Reconciliation:** Implement an `autopilot_restricted` mode specifically for Web/CUA actions. For entities with a Fiduciary Mandate, the router can bypass the standard `ask` threshold for read/reversible actions, but **irreversible actions** (like clicking "Submit Payment") must trigger a pre-submission pause and capture a screenshot for the Approval Queue.
3. **Role Cost Guards & Budget Reservation (`role-cost-guard.ts`)**:
   - **Current State:** `canRoleProceed` limits execution based on post-hoc token cost estimates and fails open on database errors.
   - **Reconciliation:** Infinite delegation will rapidly consume standard daily budgets and vision tokens (screenshots). We must refactor to a **Pre-deduction Budget Reservation** system. High-LTV entities can bypass the standard daily cap by drawing from a separate "High-Value Fiduciary Budget", but the gate must strictly fail-closed.
4. **Token Budget Assembly (`token-budget-manager.ts`)**:
   - **Current State:** Defaults to a fixed `48,000` token budget with aggressive character truncation.
   - **Reconciliation:** When injecting massive, unstructured SOTA context (AOM trees, bash logs), this aggressive truncation will destroy the structure. Allocate a dedicated `dynamic_workspace` tier that leverages 200K+ context windows, bypassing aggressive string truncation for active execution threads.

---

## Phase 1: Elevating the Memory Palace (Fiduciary Core)

**The Current State:** BitBit *already* possesses a SOTA Letta-style active memory system. The `Memory Palace` architecture (MEM-01 to MEM-15) and `sleep-consolidation.ts` successfully handle daily summaries, conflict resolution, relationship discovery, pattern promotion, and morning briefings.

**The SOTA Consolidation:** We do not need to build active memory; we need to wire the existing Memory Palace into a proactive "Fiduciary Mandate."

### Implementation Plan:
1. **The Fiduciary Filter Integration:**
   - Extend the existing `Memory Category` to include a new type: `fiduciary_constraint`.
   - Update `sleep-consolidation.ts` (specifically `stageSystemLearning` or a new stage `stageFiduciaryReflection`) to calculate Game Theory matrices (LTV vs. Drain) for entities.
   - Automatically write `fiduciary_constraint` memories (e.g., "Do not allow scope creep without invoicing") via the `MemoryWriter` API.
2. **Context Injection (The Mandate):**
   - Ensure the `ContextAssembler` strictly prioritizes `fiduciary_constraint` memories and injects them into the system prompt for the `Confidence Router`. 
   - This ensures BitBit natively defends the user's margins before executing any action.

---

## Phase 1b: Durable Async Task Engine

**The Problem:** The current TAOR loop and dashboard run on Vercel, which has strict 30s-300s serverless timeouts. SOTA features like Vision-First Web Automation and Ephemeral Workspaces can run for 5-15 minutes. If a task runs over the timeout or a Fly.io worker restarts, the task is orphaned, leaving the user waiting indefinitely with a broken UI.

**The SOTA + GSD Paradigm:** Decouple task submission from task execution via a robust database-backed state machine.

### Implementation Plan:
1. **The `async_tasks` Table (7-State FSM):**
   - Create a durable execution table with states: `queued`, `claimed`, `running`, `paused_approval`, `completing`, `completed`, `failed`, `abandoned`.
   - Every state transition is a database write with a timestamp, scoped by `org_id`.
2. **Claim-Based Execution & Heartbeats:**
   - Fly.io workers claim tasks atomically (`UPDATE ... SET status = 'claimed' ... RETURNING *`) to prevent double-execution.
   - Workers must write a heartbeat to the task row every 30 seconds. A cron job moves tasks with stale heartbeats (>90s) to `abandoned` and notifies the user.
3. **Supabase Realtime Progress:**
   - The dashboard no longer holds a connection open to the worker. It submits the task (`POST /api/tasks`), gets an ID, and uses Supabase Realtime to stream status updates, logs, and screenshots directly from the database as the worker updates the row.

---

## Phase 2: Multimodal "Vision-First" Web Automation (Sandboxed)

**The Problem:** BitBit's current web tools (`browse_website` via Playwright and `web_extract` via Cheerio) are read-only or rely on brittle CSS selectors. They fail when client portals update. However, migrating to full Computer Use Automation (CUA) introduces severe security risks: prompt injection via navigated pages (leading to API key exfiltration) and cross-tenant session leakage if containers are reused.

**The SOTA + GSD Paradigm:** Browser-Use / Anthropic Computer Use wrapped in a strict, ephemeral, and network-isolated sandbox.

### Implementation Plan:
1. **The Multimodal Sub-Agent (via Browserbase):**
   - Augment the toolset with a `spawn_browser_agent({ goal, start_url, credentials_ref })` tool.
   - **Crucial Infrastructure Choice:** Use **Browserbase** to manage the headless browser fleet. This provides out-of-the-box anti-bot fingerprinting, session management, and **noVNC streaming telemetry** (enabling a "Manus-style" visual feedback component in the chat UI).
   - It operates on a "Vision-First" loop: Take screenshot -> parse Accessibility Object Model (AOM) -> Claude 4.5/4.6 determines the physical coordinates of the target -> execute click/type.
2. **Strict Sandboxing & Domain Allowlisting:**
   - **Crucial Security Requirement:** The CUA MUST only navigate to domains explicitly approved per-org. Default to zero domains allowed.
   - **Ephemeral Containers Only:** Every CUA task gets a freshly created Docker container with its own network namespace. **No container reuse. No warm pools.** This prevents cross-tenant state leakage. The container must be destroyed immediately after.
3. **Credential Injection (Phase 3 Superpowers):**
   - Implement the planned 1Password Connect Server / Composio integration.
   - **Never expose raw credentials to the LLM.** The orchestrator injects credentials directly into the browser session (via cookies or headers), bypassing the agent's context window to prevent prompt injection credential theft. Redact password fields in screenshots before passing them to the Anthropic API.
4. **Self-Healing Navigation:**
   - If a DOM element is missing, the vision model visually scans the page for the nearest semantic equivalent, allowing BitBit to navigate arbitrary client portals autonomously without breaking.

---

## Phase 3: Ungated Ephemeral Workspaces (The OpenHands Paradigm)

**The Problem:** BitBit's `execute_code` tool is constrained to the BitBit SDK. If a client requests a task requiring an unsupported proprietary library or a complex data transformation, BitBit is sandboxed.

**The SOTA Paradigm:** OpenHands / SWE-agent (Agent-Computer Interfaces with raw bash/REPL access).

### Implementation Plan:
1. **Firecracker MicroVM Provisioning (via Fly.io):**
   - **Crucial Infrastructure Choice:** Unlike Phase 2 which uses Browserbase for DOM navigation, use **Fly.io's Machines API** to dynamically provision raw Firecracker MicroVMs. This provides true OS-level isolation for executing arbitrary code. Build an endpoint to provision these *ephemeral, isolated* Linux sandboxes on demand.
2. **The `spawn_ephemeral_workspace` Tool:**
   - When the Haiku Planner recognizes a task outside predefined API boundaries, it triggers this tool.
   - The tool provides the main agent with a stateful bash shell (`execute_bash`) and a Python/Node REPL.
3. **Dynamic Tool Compilation:**
   - In this workspace, BitBit can `npm install` required libraries, write custom scripts, and execute them. 
   - It effectively *builds the tool it needs* at runtime, executes the task, and destroys the workspace, returning the final output to the main TAOR loop.

---

## Phase 4: Infinite Delegation via the Role Engine (Verified)

**The Problem:** BitBit's autonomy is role-based (Finance, Comms, Sales), not entity-based. There is no native mechanism to say "Handle everything for Steve West indefinitely."

**The SOTA + GSD Paradigm:** Fully autonomous proxies operating under global utility functions, but backed by a rigorous **Observe-Act-Verify** loop to prevent hallucinated success during autonomous execution.

### Implementation Plan:
1. **Entity-Level Delegation Mandates:**
   - Update `agent_configs` and the `Confidence Router` (as noted in Phase 0) to accept Entity-Level overrides.
   - When instructed ("Take Steve off my hands"), BitBit updates Steve's Entity Profile: `delegation_mandate: 'infinite_autopilot'`.
   - The Confidence Router bypasses the human Approval Queue for all tasks related to Steve, unless the computed "Catastrophic Risk" score is high (e.g., deleting infrastructure).
2. **Observe-Act-Verify Loop (Crucial for Autonomous CUA):**
   - Because BitBit operates entirely without human oversight under this mandate, it cannot trust its own self-assessment of success.
   - After a CUA action sequence that claims completion, the engine takes a final verification screenshot and feeds it to a **SEPARATE** Claude call (a fresh context window). The prompt asks: "Did this task complete successfully? Look for error messages or success dialogs." Only if this independent verification passes is the action marked successful.
3. **The Subconscious Whisper:**
   - Because BitBit is acting autonomously, it aggregates its actions into the daily "Morning Briefing" (already built in `sleep-consolidation.ts` Stage 5): *"Handled 3 requests for Steve. Pushed back on scope creep and successfully invoiced $150."*

---

## Phase 5: The Terminal COO (Legacy Reconciliation)

**The Problem:** The legacy agent system (circa Feb/Mar 2026) struggled heavily with the "last mile" of execution. As evidenced by the `delegation-prompts-feb18.md` and `imsg_triage.txt` logs, the legacy system was often reduced to generating structured prompts for a human or hitting hard blockers. It frequently aborted on tasks requiring authentication (e.g., "STOP AND ASK TOR" for Stripe or myGov), visual debugging (e.g., WordPress Elementor green video glitches), or complex local execution (e.g., generating a Python script to record portfolio videos instead of just recording them). Furthermore, managing the chaotic, unstructured multi-channel communications (Andy Taleb, Steve West, Mum) required immense manual oversight and context switching.

**The SOTA Consolidation (BitBit as the Terminal COO):**
By replacing `claudecode` in the terminal with BitBit, the user gains a true COO capable of full-loop execution, permanently resolving the legacy constraints:

1. **Multimodal Web for Walled Gardens:** Instead of stopping at login walls or lacking visual context for UI bugs, BitBit's Phase 2 Vision-First Browser Agent can natively log into platforms (LinkedIn, Stripe, myGov, WordPress) using injected credentials, visually debug "green video glitches", and autonomously execute cross-posting or document uploads without human intervention.
2. **Ephemeral Workspaces for Unbounded Execution:** The legacy system's inability to run the Selenium recording script for `portfolio_section_maps.md` is solved by Phase 3. BitBit can spawn an ephemeral Firecracker MicroVM, install the necessary dependencies, execute the Python recording script, and deliver the final `.mp4` files directly to the user's local filesystem.
3. **Memory Palace for Relationship Continuity:** The overwhelming context of iMessage triage (handling Steve's fragmented emails, Andy's rapid-fire tasks, and personal reminders) is managed by Phase 1's Memory Palace. BitBit tracks entity-level relationships, understands the casual tone required for Andy versus the professional tone for Steve, and autonomously manages the correspondence queue, prioritizing based on LTV and Fiduciary Mandates.

**Conclusion:** BitBit bridges the gap between passive planning and active execution. By combining unbounded ephemeral workspaces, multimodal UI navigation, and an active Memory Palace, BitBit transitions from a legacy "prompt generator" into a fully autonomous Terminal COO.

---

## Architectural Synthesis (The Limitless TAOR Loop)

1. **Ingest:** Message arrives. Identity mapped via `Total Recall`.
2. **Palace Injection:** `ContextAssembler` loads active `MemoryPalaceEntry` rows, prioritizing `fiduciary_constraint` memories and expanding token budgets if a dynamic workspace is detected.
3. **Think (Planner):** Haiku determines the required tools.
4. **Act (SOTA Execution):** 
   - If structured: use standard API tools.
   - If unstructured web: `spawn_browser_agent` (Vision/AOM).
   - If unstructured logic: `spawn_ephemeral_workspace` (Bash/Code).
5. **Observe/Reflect:** Analyze output (bypassing 50-iteration caps for Infinite Mandate entities).
6. **Game Theory Check:** Is this action optimal based on the Fiduciary constraints (checking dynamic LTV budgets)?
7. **Execute:** Confidence > 0.85 (or Infinite Delegation = True) -> Do it.
8. **Sleep:** Run `sleep-consolidation.ts` to detect new patterns, prune dead edges, and generate the Morning Briefing.

By executing this roadmap and reconciling the atomic safety constraints, BitBit transcends the limitations of rigid API wrappers. It becomes an unbounded, multimodal intelligence anchored by an unbreakable fiduciary harness—ambiguous by nature, precise in execution.

---

## Execution Preparation Guide (For Opus 4.6 in Claude Code)

### 1. Infrastructure API Keys
Prepare these in your `.env` or terminal session before orchestration:
- `FLY_API_TOKEN` (For Phase 3: provisioning Firecracker MicroVMs)
- `BROWSERBASE_API_KEY` (or equivalent, for Phase 2: headless browser pool)
- `OP_CONNECT_TOKEN` or `COMPOSIO_API_KEY` (For Phase 2/3: credential injection)
- `ANTHROPIC_API_KEY` (Ensure sufficient balance for massive AOM/log context)

### 2. Workspace Setup
Isolate the work before commencing:
```bash
git checkout -b feature/sota-terminal-coo
```

### 3. Step-by-Step Prompt Orchestration
**Do not ask Opus to implement everything at once.** Feed these prompts sequentially into `claudecode`:

**Prompt 1: Phase 0 (Atomic Reconciliation)**
> "Read `.planning/research/SOTA_AGENTIC_CONSOLIDATION.md`. I want to execute **Phase 0: Atomic Reconnaissance & Codebase Reconciliation** ONLY. Please refactor `taor-loop.ts`, `confidence-router.ts`, `role-cost-guard.ts`, and `token-budget-manager.ts` to remove the hardcoded limitations and support dynamic `entity_id` overrides and 'infinite_autopilot' mandates. Do not proceed to Phase 1. Run type checks to ensure the engine still compiles."

**Prompt 2: Phase 1 (Fiduciary Core)**
> "We are now executing **Phase 1: Elevating the Memory Palace**. Update `src/lib/memory-palace/types.ts` to include the `fiduciary_constraint` category. Modify `sleep-consolidation.ts` to include a Game Theory evaluation stage that automatically writes these constraints for high-LTV entities. Finally, update the `ContextAssembler` to prioritize injecting these constraints into the system prompt. Verify with tests."

**Prompt 3: Phase 2 (Multimodal Web)**
> "Let's build **Phase 2: Multimodal 'Vision-First' Web Automation**. Implement the `spawn_browser_agent` tool. It must connect to our headless browser infrastructure, capture the Accessibility Object Model (AOM) and screenshots, and allow the model to interact visually. Wire up the credential injection logic using our 1Password/Composio integration."

**Prompt 4: Phase 3 (Ephemeral Workspaces)**
> "Execute **Phase 3: Ungated Ephemeral Workspaces**. Build the `spawn_ephemeral_workspace` tool. It needs to call the Fly.io Machines API to boot an isolated Firecracker MicroVM, establish a secure SSH or WebSocket execution channel, allow the agent to run stateful bash/REPL commands (like `npm install`), and then destroy the machine upon completion or timeout."

**Prompt 5: Phase 4 & 5 (Infinite Delegation)**
> "Execute **Phase 4: Infinite Delegation**. Tie everything together. Ensure the `Confidence Router` correctly bypasses the human Approval Queue when an entity has an `infinite_autopilot` mandate. Ensure actions executed autonomously under this mandate are logged and summarized in the Stage 5 Morning Briefing within `sleep-consolidation.ts`."