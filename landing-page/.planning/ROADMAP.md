# Roadmap: BitBit (Agent-First)

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-01-29)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-4) — SHIPPED 2026-01-29

## Architecture

```
[Simulated Input] → [BitBit Agent] → [Mock Services] → [Audit Log]
                          │
                          ├── Claude SDK (intelligence)
                          ├── Policy Engine (CLIENT-PACK.md)
                          ├── Tool Calls (order lookup, messaging, tasks)
                          └── Confidence Routing (act/ask/escalate)
```

## Policy Reference

See: `.planning/CLIENT-PACK.md` — all BitBit decisions must align with CheekyGlo policies.

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-01-29</summary>

- [x] Phase 1: Seed Data + Mock Services (2/2 plans) — completed 2026-01-29
- [x] Phase 2: Agent Core (3/3 plans) — completed 2026-01-29
- [x] Phase 3: Conversation Interface (1/1 plan) — completed 2026-01-29
- [x] Phase 4: Audit Dashboard (2/2 plans) — completed 2026-01-29

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Seed Data + Mock Services | v1.0 | 2/2 | Complete | 2026-01-29 |
| 2. Agent Core | v1.0 | 3/3 | Complete | 2026-01-29 |
| 3. Conversation Interface | v1.0 | 1/1 | Complete | 2026-01-29 |
| 4. Audit Dashboard | v1.0 | 2/2 | Complete | 2026-01-29 |

## What We Built

From the agent-first pivot:
- Next.js 15 project with React 19
- SQLite database with better-sqlite3
- Claude SDK integration (`@anthropic-ai/sdk`)
- Policy loader (`lib/policies.ts`)
- Mock service layer (swappable for real integrations)
- Agent endpoint with tool use loop
- Chat interface at /chat
- Audit dashboard at /audit
