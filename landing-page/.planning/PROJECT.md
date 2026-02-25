# BitBit

## What This Is

BitBit is an **agentic AI assistant** for beauty e-commerce operations. It receives messages from any channel (WhatsApp, voice notes, email, SMS), understands what needs to be done, and **acts** — not just recommends. It looks up orders, sends replies, creates tasks, and escalates when uncertain. The human sends a message; the problem disappears.

**v1.0 MVP shipped:** Mock services, seed data, real Claude intelligence. The brain works; channels connect later via clawdbot.

## Core Value

**"I sent a voice note and the problem disappeared."**

BitBit replaces the mental load of operational work. Xixi is driving, sends: "customer Jane asking about order 12345" — BitBit looks it up, sees it's arriving today, drafts and sends the reply in CheekyGlo voice, confirms back: "Done — told Jane it's arriving today, sent tracking."

## Current State (v1.0)

**Shipped:** 2026-01-29

**Tech Stack:**
- Next.js 15, React 19, TypeScript
- SQLite with better-sqlite3
- Claude SDK (@anthropic-ai/sdk)
- ~9,300 lines of code

**What's Working:**
- Agent endpoint at `/api/agent` with 7 Claude tools
- Confidence routing: act (>80%), ask (50-80%), escalate (<50%)
- Policy-aware decisions using CLIENT-PACK.md
- Chat interface at `/chat` with channel/sender selection
- Audit dashboard at `/audit` with timeline, flagging, metrics
- Mock services ready to swap for real integrations

**Routes:**
- `/chat` — Demo conversation interface
- `/audit` — Decision review dashboard
- `/api/agent` — Agent endpoint (POST)
- `/api/agent/audit` — Audit history (GET)
- `/api/agent/session/[id]` — Session detail (GET)

## Requirements

### Validated

- ✓ Receive message with context (channel, sender, content) — v1.0
- ✓ Claude tool use with 7 tools (lookup, messaging, tasks, inventory, escalate) — v1.0
- ✓ Confidence routing (act/ask/escalate) — v1.0
- ✓ Policy-aware decisions from CLIENT-PACK.md — v1.0
- ✓ Audit logging with session grouping — v1.0
- ✓ Chat interface for demos — v1.0
- ✓ Audit dashboard with flagging and metrics — v1.0
- ✓ Mock services (orders, messaging, tasks, inventory) — v1.0

### Active

- [ ] Deploy and test in staging
- [ ] Real channel integration (clawdbot)
- [ ] Production hardening

### Out of Scope

- Mobile app — web-first approach
- Multi-user permissions — single-tenant for now
- Voice transcription — assume transcript provided
- Real email/SMS sending — mock for demo

## Context

**Client: CheekyGlo**
- DTC beauty/skincare brand, viral exfoliating products
- 130K+ customers, premium/elevated brand positioning
- Hero products: exfoliating gloves (regular, sensitive, men's CheekyBro), body tools
- Shipping: 1-2 business days processing, carriers vary by destination

**Users**
- **Xixi** — marketing, customer emails, team comms, content pipeline
- **Allen** — operations, logistics, warehouse, vendor management

**Policy Reference**: `.planning/CLIENT-PACK.md` — all decisions must align with policies

## Constraints

- **Tech stack**: Next.js 15, React 19, better-sqlite3, Claude SDK
- **Services**: Mock layer swappable for real integrations
- **Performance**: Agent response under 10 seconds
- **Reliability**: Correct decisions > fast decisions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Agent-first, dashboard-second | The magic is "problem disappeared", not "nice UI" | ✓ Good — demo proves intelligence |
| Mock all services | Get brain working, connect real channels via clawdbot later | ✓ Good — clean interfaces |
| Confidence thresholds (80/50) | Act vs Ask vs Escalate routing | ✓ Good — working in demo |
| Session-based audit logging | Groups all actions for review | ✓ Good — full audit trail |
| Store flags as tasks | Reuse existing table, no schema change | ✓ Good — simple approach |
| Client-side filtering | MVP simplicity for audit dashboard | — Pending — works at demo scale |

---
*Last updated: 2026-01-29 after v1.0 milestone*
