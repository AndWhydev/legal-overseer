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
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **BitBit** (39400 symbols, 58532 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/BitBit/context` | Codebase overview, check index freshness |
| `gitnexus://repo/BitBit/clusters` | All functional areas |
| `gitnexus://repo/BitBit/processes` | All execution flows |
| `gitnexus://repo/BitBit/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Agent area (640 symbols) | `.claude/skills/generated/agent/SKILL.md` |
| Work in the Ui area (439 symbols) | `.claude/skills/generated/ui/SKILL.md` |
| Work in the Channels area (436 symbols) | `.claude/skills/generated/channels/SKILL.md` |
| Work in the Portal area (164 symbols) | `.claude/skills/generated/portal/SKILL.md` |
| Work in the Memory-palace area (123 symbols) | `.claude/skills/generated/memory-palace/SKILL.md` |
| Work in the Dashboard area (120 symbols) | `.claude/skills/generated/dashboard/SKILL.md` |
| Work in the Hooks area (115 symbols) | `.claude/skills/generated/hooks/SKILL.md` |
| Work in the Rag area (114 symbols) | `.claude/skills/generated/rag/SKILL.md` |
| Work in the Tabs area (107 symbols) | `.claude/skills/generated/tabs/SKILL.md` |
| Work in the Intelligence area (99 symbols) | `.claude/skills/generated/intelligence/SKILL.md` |
| Work in the Revenue area (96 symbols) | `.claude/skills/generated/revenue/SKILL.md` |
| Work in the Scripts area (92 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Onboarding area (75 symbols) | `.claude/skills/generated/onboarding/SKILL.md` |
| Work in the Components area (72 symbols) | `.claude/skills/generated/components/SKILL.md` |
| Work in the Chat area (67 symbols) | `.claude/skills/generated/chat/SKILL.md` |
| Work in the Swarm area (61 symbols) | `.claude/skills/generated/swarm/SKILL.md` |
| Work in the Bridges area (60 symbols) | `.claude/skills/generated/bridges/SKILL.md` |
| Work in the Composio area (59 symbols) | `.claude/skills/generated/composio/SKILL.md` |
| Work in the Lifecycles area (57 symbols) | `.claude/skills/generated/lifecycles/SKILL.md` |
| Work in the Connections area (55 symbols) | `.claude/skills/generated/connections/SKILL.md` |

<!-- gitnexus:end -->
