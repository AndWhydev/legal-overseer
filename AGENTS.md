# BitBit

Agentic AI assistant platform. Each user gets a personal BitBit that reads their messages, manages invoices, triages communications, and works autonomously across their connected services.

## Workspace Structure

```
personal-assistant/    Main Next.js 16 app (dashboard, API, agent engine)
docs-portal/           Documentation site (MDX, 3-column layout)
packages/core/         Shared types and utilities
deployments/           Fly.io worker configs
mobile/                React Native mobile app
conductor/             Product spec, tech decisions, track registry
.planning/             GSD milestone/phase plans (113 completed, v2.0 in progress)
docs/                  Architecture docs, ADRs, specs
```

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Radix UI
- **Backend:** Vercel Functions (Fluid Compute), Supabase (Postgres + Auth + Realtime)
- **AI:** Anthropic Claude (agent engine), dual embeddings (OpenAI + Voyage)
- **Infrastructure:** Fly.io (bridge machines, workers), Cloudflare (DNS, tunnels)
- **Testing:** Vitest (unit/integration), Playwright (E2E)

## Messaging Bridge Architecture

| Protocol | Bridge | Compute | Linking UX |
|----------|--------|---------|------------|
| WhatsApp | mautrix-whatsapp via Matrix/Conduit | Fly.io Machine ($1.90/mo) | QR scan |
| Android Messages | mautrix-gmessages via Matrix/Conduit | Fly.io Machine ($1.90/mo) | QR scan |
| iMessage | BlueBubbles on macOS Sequoia | LightNode Mac VPS ($7.70/mo) | noVNC Apple ID sign-in |

## Key Patterns

- **Provider Registry:** Runtime-extensible plugins implementing `ProviderPlugin` interface
- **Envelope:** Universal message format from all providers
- **TAOR Loop:** Triage -> Assess -> Orient -> Respond (agent decision cycle)
- **Autonomy Levels:** Observer -> Co-pilot -> Autopilot (per-role)

## Context

1. `conductor/product.md` — what BitBit is
2. `conductor/tech-stack.md` — infrastructure
3. `.planning/STATE.md` — current progress
4. `docs/adr/` — architectural decisions
