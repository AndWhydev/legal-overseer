# Requirements: BitBit v2.0 -- Autonomous Execution

**Defined:** 2026-04-08
**Core Value:** BitBit acts to maximize user benefit. The fiduciary memory and game theory evaluation determine when to act, when to confirm, and when to escalate -- not hardcoded rules.
**North Star:** SOTA Agentic Consolidation -- ambiguous by nature, precise in execution. BitBit as an optimal game theory agent that just works.

## v2.0 Requirements

### Engine Flexibility

- [ ] **ENGINE-01**: TAOR loop supports dynamic iteration caps per entity via delegation mandates (not hardcoded SAFETY_CEILING)
- [x] **ENGINE-02**: Confidence router accepts entity_id and queries delegation mandates from Context Baseplate
- [ ] **ENGINE-03**: Role cost guard supports LTV-aware dynamic budget scaling for high-value entities
- [ ] **ENGINE-04**: Token budget manager supports 200K+ context with dedicated dynamic_workspace tier that bypasses aggressive truncation
- [x] **ENGINE-05**: All flexibility changes are backward-compatible -- existing behavior unchanged for entities without overrides

### Fiduciary Memory

- [ ] **FIDUC-01**: Memory Palace supports `fiduciary_constraint` memory category
- [ ] **FIDUC-02**: Sleep consolidation includes Game Theory LTV evaluation stage for entities
- [ ] **FIDUC-03**: MemoryWriter auto-creates fiduciary constraints for high-LTV entities (e.g., "Do not allow scope creep without invoicing")
- [ ] **FIDUC-04**: ContextAssembler prioritizes `fiduciary_constraint` memories in system prompt injection
- [ ] **FIDUC-05**: Fiduciary constraints visible and editable by user in dashboard

### Async Task Infrastructure

- [ ] **ASYNC-01**: Durable `execution_tasks` table with 7-state FSM (pending, claimed, working, paused, completed, failed, cancelled)
- [ ] **ASYNC-02**: Real-time execution visibility via Supabase Realtime subscriptions
- [ ] **ASYNC-03**: User-initiated task cancellation with clean shutdown of in-flight operations
- [ ] **ASYNC-04**: Per-step progress tracking with status messages and percentage
- [ ] **ASYNC-05**: Heartbeat monitoring with orphan detection and automatic recovery
- [ ] **ASYNC-06**: Per-step retry with configurable policies and dead letter queue integration
- [ ] **ASYNC-07**: Execution history stored per-step in `execution_steps` table
- [ ] **ASYNC-08**: Async task dashboard showing running/completed/failed tasks with live progress

### Multimodal Web Automation

- [ ] **CUA-01**: `spawn_browser_agent` tool integrated into TAOR loop tool dispatch
- [ ] **CUA-02**: Vision-first execution loop: screenshot, AOM parse, Claude determines action, execute
- [ ] **CUA-03**: Dedicated Fly.io browser worker (2GB, scale-to-zero) running headless Chromium via Playwright
- [ ] **CUA-04**: Per-org domain allowlist configurable by user (defaults to open for delegated entities)
- [ ] **CUA-05**: Ephemeral browser containers -- no session reuse between tasks or orgs
- [ ] **CUA-06**: Configurable confirmation behavior -- defaults to user's autonomy preferences per entity delegation mandate
- [ ] **CUA-07**: Screenshot evidence capture at each significant step
- [ ] **CUA-08**: Credential injection via Composio for authenticated site navigation
- [ ] **CUA-09**: Self-healing navigation -- vision model finds semantic equivalents when DOM shifts
- [ ] **CUA-10**: Cost circuit breaker -- adaptive limits based on entity LTV and task value, not hardcoded caps
- [ ] **CUA-11**: Fail-closed CUA gate -- pre-flight checks validate budget and domain authorization before execution

### Ephemeral Workspaces

- [ ] **WKSP-01**: `spawn_ephemeral_workspace` tool integrated into TAOR loop tool dispatch
- [ ] **WKSP-02**: Fly.io Firecracker MicroVM provisioning via Machines API
- [ ] **WKSP-03**: Stateful bash shell and Node/Python REPL execution channel
- [ ] **WKSP-04**: Dynamic tool compilation -- agent installs dependencies and executes scripts at runtime
- [ ] **WKSP-05**: Auto-destroy on completion, timeout, or cost limit
- [ ] **WKSP-06**: Output delivery -- workspace results returned to TAOR loop
- [ ] **WKSP-07**: Network isolation -- workspace cannot access other tenants' resources
- [ ] **WKSP-08**: Resource limits (CPU, memory, disk) enforced at infrastructure level

### Tool Priority Chain

- [ ] **CHAIN-01**: ToolResolver implements API, browser, workspace, human fallback
- [ ] **CHAIN-02**: Integration registry mapping services to execution tier
- [ ] **CHAIN-03**: Per-site reliability tracking informing automatic tier escalation
- [ ] **CHAIN-04**: Human handoff as synchronous mid-execution gate (extends approval queue for real-time blocking waits)

### Infinite Delegation

- [ ] **DELEG-01**: Entity-level `delegation_mandate` field (infinite_autopilot, supervised, standard)
- [ ] **DELEG-02**: Confidence router returns `auto_delegated` for infinite_autopilot entities
- [ ] **DELEG-03**: Fiduciary risk evaluation -- actions assessed against user benefit via Game Theory LTV matrix, not hardcoded category bans
- [ ] **DELEG-04**: Autonomous action aggregation into Morning Briefing via sleep consolidation
- [ ] **DELEG-05**: User can set/revoke delegation mandates per entity via dashboard or NL command
- [ ] **DELEG-06**: All delegated actions fully logged with evidence for audit trail

## v2.1 Requirements

### Terminal COO

- **COO-01**: BitBit replaces terminal Claude Code as the user's primary execution interface
- **COO-02**: Multimodal web handles walled gardens (LinkedIn, Stripe, myGov, WordPress) via injected credentials
- **COO-03**: Ephemeral workspaces handle unbounded execution (recording scripts, data transforms, custom tooling)
- **COO-04**: Memory Palace manages relationship continuity across all channels with entity-appropriate tone

### Workflow Intelligence

- **WFLOW-01**: Execution trace storage for successful multi-step completions
- **WFLOW-02**: Pattern detection and cached workflow replay (Stagehand-style auto-caching)
- **WFLOW-03**: Proactive execution suggestions based on recurring task patterns
- **WFLOW-04**: Cross-role orchestration for complex multi-step requests

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tab browser orchestration | Fragile -- one tab per task, spawn separate sessions if needed |
| Per-website custom scrapers | Doesn't scale -- CUA is the universal fallback |
| Full desktop/OS control | Not relevant for web operations platform |
| Real-time screen sharing / co-browsing | Periodic screenshot evidence is sufficient for business ops |
| Custom browser engine | Use Playwright + Anthropic CUA -- proven, maintained |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENGINE-01 | Phase 37 | Pending |
| ENGINE-02 | Phase 37 | Complete |
| ENGINE-03 | Phase 37 | Pending |
| ENGINE-04 | Phase 37 | Pending |
| ENGINE-05 | Phase 37 | Complete |
| FIDUC-01 | Phase 38 | Pending |
| FIDUC-02 | Phase 38 | Pending |
| FIDUC-03 | Phase 38 | Pending |
| FIDUC-04 | Phase 38 | Pending |
| FIDUC-05 | Phase 38 | Pending |
| ASYNC-01 | Phase 39 | Pending |
| ASYNC-02 | Phase 39 | Pending |
| ASYNC-03 | Phase 39 | Pending |
| ASYNC-04 | Phase 39 | Pending |
| ASYNC-05 | Phase 39 | Pending |
| ASYNC-06 | Phase 39 | Pending |
| ASYNC-07 | Phase 39 | Pending |
| ASYNC-08 | Phase 39 | Pending |
| CUA-01 | Phase 40 | Pending |
| CUA-02 | Phase 40 | Pending |
| CUA-03 | Phase 40 | Pending |
| CUA-04 | Phase 40 | Pending |
| CUA-05 | Phase 40 | Pending |
| CUA-06 | Phase 40 | Pending |
| CUA-07 | Phase 40 | Pending |
| CUA-08 | Phase 40 | Pending |
| CUA-09 | Phase 40 | Pending |
| CUA-10 | Phase 40 | Pending |
| CUA-11 | Phase 40 | Pending |
| WKSP-01 | Phase 41 | Pending |
| WKSP-02 | Phase 41 | Pending |
| WKSP-03 | Phase 41 | Pending |
| WKSP-04 | Phase 41 | Pending |
| WKSP-05 | Phase 41 | Pending |
| WKSP-06 | Phase 41 | Pending |
| WKSP-07 | Phase 41 | Pending |
| WKSP-08 | Phase 41 | Pending |
| CHAIN-01 | Phase 42 | Pending |
| CHAIN-02 | Phase 42 | Pending |
| CHAIN-03 | Phase 42 | Pending |
| CHAIN-04 | Phase 42 | Pending |
| DELEG-01 | Phase 43 | Pending |
| DELEG-02 | Phase 43 | Pending |
| DELEG-03 | Phase 43 | Pending |
| DELEG-04 | Phase 43 | Pending |
| DELEG-05 | Phase 43 | Pending |
| DELEG-06 | Phase 43 | Pending |

**Coverage:**
- v2.0 requirements: 47 total
- Mapped to phases: 47/47
- Unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after v2.0 roadmap finalized (7 phases, 47 requirements mapped)*
