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

BitBit connects to users' messaging accounts via per-user bridge instances:

| Protocol | Bridge | Compute | Linking UX |
|----------|--------|---------|------------|
| WhatsApp | mautrix-whatsapp via Matrix/Conduit | Fly.io Machine ($1.90/mo) | QR scan |
| Android Messages | mautrix-gmessages via Matrix/Conduit | Fly.io Machine ($1.90/mo) | QR scan |
| iMessage | BlueBubbles on macOS Sequoia | LightNode Mac VPS ($7.70/mo) | noVNC Apple ID sign-in |

Key subsystems:
- `src/lib/bridges/` — provisioners (Fly + Mac VPS), lifecycle, health, warm pool
- `src/lib/connections/` — provider registry, Envelope normalization, webhook handling
- `src/lib/connections/providers/` — beeper.ts (WhatsApp/Android), bluebubbles.ts (iMessage)
- `infra/conduit/` — Matrix homeserver on Fly.io (shared, federation off)
- `infra/bridges/` — mautrix bridge container
- `infra/imessage/` — BlueBubbles setup + kiosk lockdown scripts

## Key Patterns

- **Provider Registry:** Runtime-extensible plugins implementing `ProviderPlugin` interface (pull/send/webhookParse/healthCheck)
- **Envelope:** Universal message format normalized from all providers before entering the pipeline
- **Warm Pool:** Pre-provisioned Mac VPS instances for instant iMessage provisioning (<5s)
- **Tiered Lifecycle:** Active -> Suspended (7 days idle, WhatsApp/Android only) -> Destroyed (on disconnect)
- **TAOR Loop:** Triage -> Assess -> Orient -> Respond (agent decision cycle)
- **Autonomy Levels:** Observer -> Co-pilot -> Autopilot (per-role user control)

## Context Hierarchy

1. `conductor/product.md` — what BitBit is and who it's for
2. `conductor/tech-stack.md` — infrastructure and dependencies
3. `conductor/tracks.md` — work tracking (completed and active)
4. `.planning/STATE.md` — current milestone progress
5. `docs/adr/` — architectural decision records
6. `personal-assistant/docs/superpowers/specs/` — feature design specs

## Development

```bash
cd personal-assistant && npm run dev    # Dashboard on localhost:3000
cd personal-assistant && npm run test   # Vitest (884+ tests)
cd personal-assistant && npm run build  # Production build
```

<!-- gitnexus:start -->
## GitNexus Code Intelligence

If gitnexus MCP tools are available, use them for impact analysis before editing symbols and change detection before committing. Run `npx gitnexus analyze` to rebuild the index if stale or missing.

See `.claude/skills/gitnexus/` for detailed workflow guides.
<!-- gitnexus:end -->
