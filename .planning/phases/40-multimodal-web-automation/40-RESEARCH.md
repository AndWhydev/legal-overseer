# Phase 40: Multimodal Web Automation - Research

**Researched:** 2026-04-08
**Question:** What do I need to know to PLAN this phase well?

## RESEARCH COMPLETE

---

## 1. Browser Automation Paradigm Evaluation

### Vision-Based (Screenshot → Model Reasons About Pixels)

**How it works:** Take screenshot → send to multimodal model → model decides action → execute via Playwright → repeat.

**Strengths:**
- Works on ANY website regardless of DOM quality or accessibility structure
- Handles canvas-rendered UIs, iframes, shadow DOM, and sites with broken ARIA
- Most reliable for walled gardens (LinkedIn, Stripe dashboard, myGov) where DOM structures are complex and change frequently
- Anthropic CUA is production-ready as of March 2026 with Claude Opus 4.6 / Sonnet 4.6

**Weaknesses:**
- Slower: each action requires screenshot + model inference (not sub-100ms like DOM-based)
- Higher token cost: screenshots are ~1,000-2,000 tokens per image
- Can misinterpret visually similar elements

**Best for:** BitBit's target use case -- business ops sites (Stripe, LinkedIn, myGov, WordPress) that are walled gardens with complex, frequently-changing UIs.

### Accessibility-Tree / DOM-Based (Structured Text → LLM Reasons About Structure)

**How it works:** Parse DOM → extract accessibility tree → send structured text to LLM → LLM selects element → execute action.

**Strengths:**
- Fast: sub-100ms per action (no screenshot overhead)
- Cheaper: text tokens vs image tokens
- Deterministic selectors when DOM is well-structured

**Weaknesses:**
- Breaks on sites with poor accessibility markup
- Cannot handle canvas-rendered UIs or complex shadow DOM
- Fragile against layout changes that alter DOM structure

**Best for:** Well-structured sites with good ARIA markup, simple forms.

### Hybrid Approach (Recommended by Research)

Modern frameworks (Stagehand) combine both: use DOM/accessibility tree for speed when structure is clear, fall back to vision when DOM is ambiguous. This is the emerging best practice.

**Recommendation for BitBit:** Stagehand's hybrid approach (DOM-first with vision fallback) is the best fit. It gives speed on well-structured pages and reliability on walled gardens. The `act()`, `observe()`, and `extract()` primitives map directly to TAOR loop semantics.

---

## 2. Provider Evaluation

### Option A: Stagehand + Browserbase (RECOMMENDED)

**What Browserbase provides (so we don't build it):**
- Ephemeral cloud browsers (no session persistence between tasks -- CUA-05 for free)
- Video-based session recording with up to 10 tabs as separate streams (CUA-07 evidence capture)
- Session replay dashboard at `https://browserbase.com/sessions/{session_id}`
- Agent Identity (anti-bot fingerprinting)
- CAPTCHA solving built-in
- Auto-caching: when an AI action succeeds, Stagehand records the selector path and replays without LLM on repeat runs (~2x faster, ~30% cost reduction)
- Zero infrastructure management -- no Fly.io browser workers needed

**What Stagehand provides:**
- `act(instruction)` -- natural language browser actions (maps to TAOR "Act")
- `observe()` -- understand what's actionable on a page (maps to TAOR "Observe")
- `extract(instruction, schema)` -- structured data extraction with Zod validation
- `agent()` -- higher-level autonomous task orchestration
- Hybrid paradigm: DOM/accessibility-tree first, vision fallback
- TypeScript SDK (native fit for Next.js codebase)
- Model-agnostic: can use Claude via Browserbase Model Gateway

**Pricing:**
- Developer: $20/mo, 100 browser hours included ($0.12/hr overage)
- Startup: $99/mo, 500 browser hours included ($0.10/hr overage)
- Billed by the minute, first minute rounded up

**Trade-offs:**
- External dependency on Browserbase infrastructure
- Custom tool caching has a known limitation (agent cache doesn't replay custom tool calls)
- Session recording API (programmatic rrweb access) being deprecated -- must use dashboard URLs or video

### Option B: Anthropic CUA + Playwright on Fly.io (Self-Hosted)

**What Anthropic CUA provides:**
- `computer_20251124` tool type for Claude Opus 4.6 / Sonnet 4.6
- Screenshot → analyze → act loop built into the model
- Zoom feature for viewing specific screen regions at full resolution
- Production-ready as of March 2026

**What we'd need to build:**
- Fly.io Machine provisioning for headless Chromium (2GB workers)
- Scale-to-zero configuration
- Session isolation between orgs
- Screenshot capture and storage pipeline
- Self-healing navigation layer
- Session recording infrastructure
- CAPTCHA handling

**Pricing:**
- Fly.io Machine: ~$1.90/mo per worker (scale-to-zero)
- Claude API: Sonnet 4.6 at $3/$15 per MTok (vision tokens extra)
- Lower infrastructure cost, higher development cost

**Trade-offs:**
- Significantly more custom code to build and maintain
- Must build session recording, evidence capture, self-healing ourselves
- Full control over infrastructure and data
- Already have Fly.io Machines API patterns from bridge provisioning

### Option C: Playwright MCP (Accessibility-Tree Only)

**Not recommended:** Pure accessibility-tree approach via Playwright MCP. Fast and cheap but unreliable on the walled garden business sites BitBit targets. Microsoft now recommends Playwright CLI over MCP (4x fewer tokens), but both are DOM-only.

### Recommendation: Stagehand + Browserbase

**Rationale aligned with CONTEXT.md decisions:**
- **D-03 (provider infrastructure preference):** Browserbase handles self-healing, session recording, and ephemeral containers out of the box
- **D-05 (self-healing by provider):** Stagehand's auto-caching and hybrid paradigm handle DOM shifts natively
- **D-08 (ephemeral containers):** Browserbase sessions are ephemeral by default
- **D-09 (provider session recording):** Browserbase records every session as video, accessible via dashboard URL
- **D-02 (paradigm evaluation):** Stagehand's hybrid approach (DOM-first + vision fallback) is the best of both worlds

This eliminates the need to build: browser worker infrastructure, session recording, self-healing navigation, CAPTCHA handling, and container isolation. The only custom code is the integration layer between TAOR loop and Stagehand SDK.

---

## 3. Credential Injection Architecture

### Composio (Primary)

Composio provides managed authentication for 500+ apps with a brokered credentials pattern -- the LLM never sees the actual token. Supports OAuth flows, API keys, and token refresh. For browser automation, Composio can inject credentials via its `execute_action` auth parameter.

**Key security pattern:** Brokered credentials -- Composio makes the API call on the agent's behalf. The LLM decides WHAT to do; Composio handles HOW (with the credential). This prevents prompt injection credential leakage.

**Integration:** Already used in BitBit via `personal-assistant/src/lib/agent/tools/composio-tools.ts` and `personal-assistant/src/lib/composio/mcp-session.ts`.

### 1Password (Fallback)

For credentials not managed by Composio (custom internal tools, legacy systems), 1Password CLI (`op read`) injects secrets at runtime. Already documented in the project's skill set.

**Browser flow:** Before navigation, retrieve credential from 1Password → inject into Stagehand `act()` instruction or page fill action → credential never enters LLM context.

### Credential Flow for Browser Tasks

1. Task requests authenticated site navigation
2. Check Composio for managed auth (OAuth token, API key)
3. If not in Composio → check 1Password vault for stored credentials
4. Inject credential into browser session via Stagehand `act("fill username with {email}")` + `act("fill password with {password}")`
5. Credential values passed to Stagehand but NOT included in LLM prompt context (brokered pattern)

---

## 4. Integration Architecture

### TAOR Loop Integration

The `spawn_browser_agent` tool integrates at the tool dispatch level in `tool-executor.ts`. When the TAOR loop determines a browser task is needed:

1. **Triage:** User request identified as requiring web navigation
2. **Assess:** `spawn_browser_agent` selected as the tool
3. **Orient:** Browser task parameters extracted (URL, objective, credential source)
4. **Respond:** Task dispatched to async task engine, result returned inline

### Async Task Engine Integration

Browser tasks run as async tasks (Phase 39 infrastructure):
- Task type: `browser_automation`
- State machine: pending → claimed → working → completed/failed
- Real-time progress via Supabase Realtime
- User cancellation via NL command
- Heartbeat monitoring for orphan detection

### Stagehand ↔ TAOR Mapping

| TAOR Phase | Stagehand Method | Purpose |
|------------|-----------------|---------|
| Observe | `observe()` | Understand page state, available actions |
| Act | `act(instruction)` | Execute browser action |
| Extract | `extract(instruction, schema)` | Pull structured data from page |
| Agent | `agent({ task })` | Full autonomous multi-step task |

### Cost Circuit Breaker (CUA-10)

Implement at the task level, not the Browserbase level:
- Track token spend per browser task (LLM calls via Stagehand)
- Track Browserbase session minutes
- Compare against entity LTV-scaled budget (from Phase 37 dynamic caps)
- Terminate session when budget exceeded
- Log partial results before termination

---

## 5. Domain Authorization (CUA-04, CUA-11)

### Pre-Flight Authorization Check

Before any browser task executes:
1. Extract target domain(s) from task parameters
2. Check org-level domain blocklist (stored in org settings)
3. Default: open access (any domain allowed)
4. If domain blocked: reject task with explanation
5. Log authorization decision for audit trail

### Fail-Closed Gate (CUA-11)

Pre-flight checks MUST pass before browser session starts:
- Budget authorization (sufficient LTV-scaled budget remaining)
- Domain authorization (not on blocklist)
- Credential availability (if authenticated navigation required)
- If any check fails: task fails immediately with diagnostic message

---

## 6. Evidence and Reporting (CUA-07, D-09, D-10)

### Provider Session Recording

Browserbase automatically records every session as video:
- Accessible at `https://browserbase.com/sessions/{session_id}`
- Adjustable playback (0.5x-4x speed)
- Up to 10 tabs as separate streams
- No custom screenshot infrastructure needed

### Result Surfacing

Browser task results surface inline in chat (D-10):
- BitBit describes what it did conversationally
- Includes Browserbase session replay URL as evidence link
- Extracted data presented as structured results
- Error states described with context for user action

### Evidence Storage

Store in `execution_steps` table (Phase 39):
- Step type: `browser_action`
- Evidence: Browserbase session URL, extracted data, action log
- Duration: session minutes consumed
- Cost: LLM tokens + Browserbase time

---

## 7. Codebase Integration Points

### Files to Create
- `personal-assistant/src/lib/browser/stagehand-client.ts` -- Stagehand SDK wrapper
- `personal-assistant/src/lib/browser/browser-task.ts` -- Browser task execution engine
- `personal-assistant/src/lib/browser/credential-injector.ts` -- Composio + 1Password credential injection
- `personal-assistant/src/lib/browser/domain-gate.ts` -- Domain authorization pre-flight
- `personal-assistant/src/lib/browser/cost-monitor.ts` -- Per-task cost tracking and circuit breaker
- `personal-assistant/src/lib/agent/tools/browser-tools.ts` -- `spawn_browser_agent` tool definition

### Files to Modify
- `personal-assistant/src/lib/agent/engine/tool-executor.ts` -- Add browser tool dispatch
- `personal-assistant/src/lib/agent/tools/index.ts` -- Register browser tools
- `personal-assistant/package.json` -- Add `@browserbasehq/stagehand` dependency

### Existing Patterns to Follow
- Tool definition pattern: see `personal-assistant/src/lib/agent/tools/spawn-agent.ts`
- Composio integration: see `personal-assistant/src/lib/agent/tools/composio-tools.ts`
- Async task dispatch: Phase 39 task engine (execution_tasks table)
- Cost guard pattern: see `personal-assistant/src/lib/agent/cost-guard.ts`

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Browserbase outage blocks all browser tasks | High | Implement fallback to direct Playwright (degraded mode, no recording) |
| Stagehand auto-cache doesn't replay custom tool calls | Medium | Don't rely on caching for credential injection -- always execute credential steps live |
| Cost overrun on long browser sessions | High | Circuit breaker per-task with LTV-scaled limits |
| Credential leakage via prompt injection | Critical | Brokered credential pattern -- LLM never sees raw credentials |
| DOM shifts on target sites break navigation | Low | Stagehand's hybrid approach handles this natively |
| Browserbase session recording deprecated API | Low | Use dashboard URLs for evidence, not programmatic rrweb access |

---

## Validation Architecture

### Testable Claims

1. **Stagehand SDK connects to Browserbase and executes `act()` on a real site** -- Integration test with Browserbase API key
2. **`spawn_browser_agent` dispatches from TAOR loop** -- Unit test with mock Stagehand client
3. **Domain gate rejects blocked domains** -- Unit test for pre-flight checks
4. **Cost circuit breaker terminates session at budget limit** -- Unit test with mock cost tracking
5. **Credential injection works via Composio and 1Password** -- Integration test with test credentials
6. **Browser task results surface in execution_steps** -- Integration test with async task engine
7. **Ephemeral sessions don't persist data** -- Verify Browserbase session config has no persistence

### Verification Strategy

- Unit tests for domain gate, cost monitor, credential injector
- Integration tests for Stagehand SDK connection and basic navigation
- E2E test: TAOR loop → spawn_browser_agent → Browserbase session → result in chat
- Cost monitoring: track actual Browserbase usage against projections

---

*Research completed: 2026-04-08*
*Recommendation: Stagehand + Browserbase (provider-first, hybrid paradigm, managed infrastructure)*
