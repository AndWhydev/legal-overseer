# Phase 38: Fiduciary Memory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 38-fiduciary-memory
**Areas discussed:** Game Theory LTV model, Constraint generation

---

## Game Theory LTV Model

### Q1: How should entity LTV be determined?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured signals + model reasoning | Store raw signals (invoice totals, message frequency, project count, relationship age) as entity metadata. Let the model reason about LTV from these signals at decision time -- no hardcoded formula. | |
| Explicit LTV score | Calculate a numeric LTV score during sleep consolidation (formula-based from revenue + engagement). Store as a field on the entity. Model uses the score as input. | |
| You decide | Claude picks the pragmatic approach based on what's already in the entity model. | ✓ |

**User's choice:** You decide
**Notes:** User trusts Claude to pick the pragmatic approach. Broader note: "The model, if Opus 4.6 at least, can carry the weight of generating this stuff on the fly if it has all the context."

### Q2: What should 'defending user margins' look like in practice?

| Option | Description | Selected |
|--------|-------------|----------|
| Financial protection | "Don't let Steve's project scope creep without invoicing" -- focused on revenue leakage, unpaid work, undercharging | |
| Relationship + financial | Financial protection PLUS relationship signals | |
| Full business intelligence | Financial + relationship + strategic: opportunity cost, competitive signals, churn risk | ✓ |

**User's choice:** Full business intelligence
**Notes:** None

### Q3: Should LTV evaluation happen real-time or during sleep consolidation?

| Option | Description | Selected |
|--------|-------------|----------|
| Sleep consolidation only | Constraints generated overnight. Cheaper -- runs once/day. | |
| Hybrid: sleep generates, real-time validates | Sleep creates baseline, high-stakes actions trigger real-time check. | |
| You decide | Claude picks based on cost/complexity tradeoffs. | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Constraint Generation

### Q4: How should fiduciary constraints be expressed?

| Option | Description | Selected |
|--------|-------------|----------|
| Natural language rules | Plain English stored as memory content. Flexible, easy to edit. | |
| Structured + natural language | Structured fields PLUS natural language description. Queryable and filterable. | |
| You decide | Claude picks the format that fits the existing Memory Palace schema best. | ✓ |

**User's choice:** You decide
**Notes:** None

### Q5: Should users be able to manually create fiduciary constraints?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto + manual | Sleep consolidation auto-generates AND users create/edit via dashboard or NL. | |
| Auto-only, user edits | Only sleep consolidation creates. Users can view, edit, delete. | |
| You decide | Claude picks based on what's most useful for a business owner. | |

**User's choice:** Other -- "No manual or user facing anything, all under-the-hood, and expelled through what seems pure stinking intelligence"
**Notes:** Explicitly no dashboard UI for constraints. FIDUC-05 requirement superseded. The intelligence surfaces through conversation, not settings.

### Q6: How should fiduciary reasoning surface to the user?

| Option | Description | Selected |
|--------|-------------|----------|
| Woven into conversation | BitBit naturally mentions it in chat. No special UI. | ✓ |
| Morning Briefing highlights | Aggregate into daily briefing. | |
| Both -- real-time + briefing | Conversation when relevant AND Morning Briefing for big picture. | |

**User's choice:** Woven into conversation
**Notes:** None

---

## Claude's Discretion

- LTV model structure
- Constraint storage format
- Evaluation timing split
- Sleep consolidation stage ordering
- Priority weighting in ContextAssembler

## Deferred Ideas

None -- discussion stayed within phase scope
