---
id: milestone-autonomous-execution-2026-04-09
intent: "v2.0 Autonomous Execution — Transform BitBit from an agent that understands and plans into one that autonomously executes real-world tasks"
created: 2026-04-09T12:00:00Z
migrated_from: ".planning/"
source_status: "executing"
complexity: ambiguous
phases: 30
---

## Acceptance Criteria

- [ ] TAOR loop iteration cap is entity-aware with dynamic overrides
- [ ] Confidence router supports entity delegation mandates and auto_delegated decisions
- [ ] Role cost guard scales budgets dynamically based on entity LTV
- [ ] Token budget manager supports 200K+ dynamic workspace tier
- [ ] Entities without overrides behave identically to current system (zero regression)
- [ ] Memory Palace stores and retrieves fiduciary_constraint memories
- [ ] Sleep consolidation includes Game Theory LTV evaluation stage
- [ ] ContextAssembler injects fiduciary constraints with higher priority than standard memories
- [ ] Durable execution engine with 7-state FSM, real-time progress, cancellation, heartbeats
- [ ] Vision-first browser control on isolated worker with credential injection and evidence capture
- [ ] Firecracker MicroVM provisioning for arbitrary code execution with network isolation
- [ ] ToolResolver selects optimal execution tier (API > browser > workspace > human)
- [ ] User delegates complete entity management with fiduciary evaluation and Morning Briefing

## Phase DAG

### Phase 37: Engine Flexibility (completed)
1. 37-01-entity-overrides-schema (depends_on: none) — Entity overrides table + TAOR dynamic iteration caps
2. 37-02-confidence-router-delegation (depends_on: none) — Confidence router entity delegation support
3. 37-03-ltv-cost-guard (depends_on: none) — LTV-aware dynamic cost guard budget scaling
4. 37-04-token-budget-workspace (depends_on: none) — Token budget manager dynamic workspace tier
5. 37-05-entity-override-resolution (depends_on: 37-01, 37-02, 37-03, 37-04) — Entity override resolution + backward compatibility regression

### Phase 38: Fiduciary Memory (completed)
6. 38-01-fiduciary-constraint-category (depends_on: none) — Fiduciary constraint memory category
7. 38-02-sleep-consolidation-ltv (depends_on: none) — Sleep consolidation Game Theory LTV evaluation
8. 38-03-fiduciary-priority-recall (depends_on: 38-01) — Fiduciary constraint priority recall + context injection

### Phase 39: Async Task Infrastructure (depends_on: Phase 37)
9. 39-01-execution-tasks-schema-fsm (depends_on: 37-05) — execution_tasks schema + FSM service
10. 39-02-heartbeat-step-retry (depends_on: 37-05) — Heartbeat monitor + step tracker + retry engine
11. 39-03-realtime-progress-cancellation (depends_on: 39-01, 39-02) — Real-time chat progress + NL cancellation
12. 39-04-taor-spawn-async (depends_on: 39-01, 39-02) — TAOR loop integration + spawn_async_task tool
13. 39-05-task-api-chat-rendering (depends_on: 39-03, 39-04) — Task API endpoints + chat progress rendering

### Phase 40: Multimodal Web Automation (depends_on: Phase 37, 39)
14. 40-01-stagehand-browser-tool (depends_on: 39-05) — Stagehand SDK client + spawn_browser_agent tool
15. 40-02-domain-gate-credentials (depends_on: 39-05) — Domain gate + credential injection + cost circuit breaker
16. 40-03-browser-task-engine (depends_on: 40-01, 40-02) — Browser task engine + async task integration
17. 40-04-evidence-self-healing (depends_on: 40-01, 40-02) — Evidence capture + self-healing + integration tests

### Phase 41: Ephemeral Workspaces (depends_on: Phase 37, 39)
18. 41-01-e2b-workspace-tool (depends_on: 39-05) — E2B provider + workspace tool registration
19. 41-02-stateful-workspace-schema (depends_on: 39-05) — Stateful workspace execution + Supabase schema
20. 41-03-workspace-lifecycle-output (depends_on: 39-05) — Workspace lifecycle + output delivery
21. 41-04-isolation-resource-limits (depends_on: 41-01, 41-02, 41-03) — Isolation, resource limits + integration wiring

### Phase 42: Tool Priority Chain (depends_on: Phase 40, 41)
22. 42-01-reliability-tracker (depends_on: 40-04, 41-04) — Reliability tracker — execution history storage & aggregation
23. 42-02-tool-resolver (depends_on: 42-01) — ToolResolver — context injection & tier-aware dispatch
24. 42-03-human-handoff (depends_on: 42-01, 42-02) — Human handoff — synchronous mid-execution gate
25. 42-04-tier-feedback-loop (depends_on: 42-01, 42-02, 42-03) — Tier feedback loop — end-to-end integration & escalation tests

### Phase 43: Infinite Delegation (depends_on: Phase 38, 42)
26. 43-01-delegation-mandate-schema (depends_on: 38-03, 42-04) — Delegation mandate schema & service layer
27. 43-02-confidence-delegation-bypass (depends_on: 38-03, 42-04) — Confidence router & approval queue delegation bypass
28. 43-03-morning-briefing-aggregation (depends_on: 38-03, 42-04) — Morning briefing autonomous action aggregation
29. 43-04-nl-delegation-activation (depends_on: 43-01, 43-02) — NL delegation activation & revocation
30. 43-05-delegation-audit-trail (depends_on: 43-01, 43-02, 43-03) — Delegation audit trail & integration tests
