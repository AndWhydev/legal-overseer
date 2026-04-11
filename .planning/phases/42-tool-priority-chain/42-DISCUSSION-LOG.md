# Phase 42: Tool Priority Chain - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 42-tool-priority-chain
**Areas discussed:** Tier resolution logic, Integration registry, Reliability tracking, Human handoff design

---

## Tier Resolution Logic

### Q1: How should ToolResolver decide which tier?

| Option | Description | Selected |
|--------|-------------|----------|
| Cheapest reliable first | Rigid waterfall: API → browser → workspace → human. | |
| Model decides per-task | Model reasons about best tier for this specific task. | ✓ |
| You decide | Claude designs resolution strategy. | |

**User's choice:** Model decides per-task
**Notes:** More flexible, consistent with "model carries the weight."

---

## Integration Registry

### Q2: How should BitBit know what tiers are available?

| Option | Description | Selected |
|--------|-------------|----------|
| Static registry + model reasoning | Known services mapped to tiers, model for unknowns. | |
| Fully dynamic (model only) | No static registry. Model reasons from context. | ✓ |
| You decide | Pick based on tradeoffs. | |

**User's choice:** Fully dynamic (model only)
**Notes:** Zero maintenance. Model knows which services have APIs vs need browser.

---

## Reliability Tracking

### Q3: Track per-service reliability scores?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes -- learn from execution history | Track success/failure, feed into model context. | ✓ |
| No -- model reasons fresh each time | No tracking, simpler. | |
| You decide | Pick based on data availability. | |

**User's choice:** Yes -- learn from execution history
**Notes:** Improves decisions over time.

---

## Human Handoff Design

### Q4: How should human handoff work?

| Option | Description | Selected |
|--------|-------------|----------|
| Conversational handoff | Async -- "I need you to do X, let me know when done." | |
| Blocking gate | Pause execution, urgent notification, wait for confirm. | |
| You decide | Design based on Phase 39 async task lifecycle. | ✓ |

**User's choice:** You decide
**Notes:** Integrate with async task lifecycle.

---

## Claude's Discretion

- Human handoff mechanics
- Reliability data schema
- Context injection format
- ToolResolver integration
- Cost tracking per tier

## Deferred Ideas

None -- discussion stayed within phase scope
