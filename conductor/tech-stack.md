# BitBit — Tech Stack

## Languages

- **TypeScript 5** — all application code
- **SQL** — Supabase migrations (PostgreSQL)
- **CSS** — TailwindCSS 4 with custom design system

## Frameworks

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js | 16.1.6 |
| React | React | 19.2.3 |
| CSS framework | TailwindCSS | 4.x |
| Database | Supabase (PostgreSQL) | - |
| AI SDK | @anthropic-ai/sdk | 0.74.0 |
| Error monitoring | @sentry/nextjs | 10.40.0 |

## Key Dependencies

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| @supabase/supabase-js | 2.95.3 | Database client |
| @supabase/ssr | 0.8.0 | Server-side Supabase auth |
| @pinecone-database/pinecone | 7.1.0 | Vector database for RAG |
| voyageai | 0.2.1 | Voyage-3.5 embeddings |
| @kuzu/kuzu-wasm | 0.7.0 | In-process knowledge graph |
| radix-ui | 1.4.3 | Accessible UI primitives |
| lucide-react | 0.567.0 | Icons |
| motion | 12.36.0 | Animation library |
| react-markdown | 10.1.0 | Markdown rendering in chat |
| remark-gfm | 4.0.1 | GitHub-flavored markdown |
| recharts | 3.7.0 | Charts/analytics |
| resend | 6.9.2 | Transactional email |
| class-variance-authority | 0.7.1 | Component variants |
| clsx + tailwind-merge | 2.1.1 / 3.4.1 | Class merging |
| @dnd-kit/* | 6.3.1+ | Drag and drop |
| imapflow | 1.2.9 | IMAP email integration |
| simple-icons | 14.0.0 | Brand icons for connections |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| vitest | 4.0.18 | Unit/integration testing |
| @playwright/test | 1.58.2 | E2E testing |
| eslint + eslint-config-next | 9.x / 16.1.6 | Linting |
| @tailwindcss/postcss | 4.x | CSS processing |

## Infrastructure

| Service | Purpose | Region | Status |
|---------|---------|--------|--------|
| Vercel | Dashboard hosting & serverless functions | Auto | Deployed |
| Supabase | Database, auth, realtime, storage | ap-south-1 (Mumbai) | Deployed |
| Fly.io | Agent worker processes (Firecracker MicroVMs) | syd (Sydney) | Deployed |
| Fly.io | Conduit Matrix homeserver (`bitbit-conduit`) | syd (Sydney) | Deployed |
| Fly.io | Per-user bridge machines (mautrix-whatsapp, mautrix-gmessages) | syd (Sydney) | Deployed |
| LightNode | Per-user Mac VPS (BlueBubbles iMessage bridge) | syd (Sydney) | Deployed |
| Cloudflare Workers | Edge cron (task polling), rate limiting | Edge (global) | Deployed |
| Sentry | Error tracking & monitoring | us (bitbit-d1 org) | Deployed |
| Stripe | Billing, webhook endpoint | - | Keys set, webhook configured |
| Telnyx | SMS channel | - | Keys set, webhook configured |
| Resend | Transactional email | - | Key set, DNS verified |
| Brave Search | Agent web search tool | - | API key configured |
| Pinecone | Vector database (RAG semantic search) | us-east-1 (Serverless) | Deployed |
| Voyage AI | Embedding model (voyage-3.5-lite) | - | API key configured |
| Vercel (landing) | Landing page / waitlist (`bitbit.chat`) | Auto | Deployed (separate project: `bitbit-landing-page`) |

### Fly.io Worker
- **App**: `bitbit-workers` → `https://bitbit-workers.fly.dev`
- **VM**: `shared-cpu-1x`, 1024MB RAM, 2 machines
- **Auto-scaling**: suspend on idle, auto-start on request, min 1 running
- **Health**: `/api/monitoring/health` every 30s
- **Auth**: Bearer token (`WORKER_AUTH_TOKEN`)
- **Secrets**: WORKER_AUTH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

### Cloudflare Edge Cron
- **Worker**: `bitbit-edge-cron` → `https://bitbit-edge-cron.bitbit-edge.workers.dev`
- **Cron**: `*/5 * * * *` (polls Supabase for pending agent tasks, dispatches to Fly.io)
- **Rate limiting**: 10 req/min/IP on `/trigger` endpoint
- **Secrets**: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_AUTH_TOKEN, WORKER_CALLBACK_URL

### Messaging Bridges (Per-User)

**Conduit Matrix Homeserver** (`bitbit-conduit` on Fly.io):
- Shared homeserver for all WhatsApp/Android bridge users
- server_name: `bitbit.chat`, federation off, registration on
- Appservice registration via admin room messages

**WhatsApp/Android Bridges** (Fly.io Machines, per user):
- mautrix-whatsapp + mautrix-gmessages in single container
- Per-user Fly Machine with 1GB volume for bridge state
- QR scan linking via qr-callback relay to dashboard
- Lifecycle: active ($1.90/mo) -> suspended (7 days idle) -> destroyed

**iMessage Bridge** (LightNode Mac VPS, per user):
- BlueBubbles on macOS Sequoia (REST API + webhooks)
- Warm pool of 2 pre-provisioned instances for instant provisioning
- noVNC embedded in dashboard for Apple ID sign-in (kiosk-locked)
- No suspension — runs continuously at $7.70/mo
- See `docs/adr/0005-imessage-bridge-approach.md`

### Sentry
- **Org**: `bitbit-d1`, **Project**: `bitbit-dashboard`
- **Platform**: javascript-nextjs (`@sentry/nextjs`)
- **DSN**: Configured via `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` env vars
- **Features**: Context enrichment, PII filtering, Vercel env vars set

### Request Flow
```
Vercel (Next.js dashboard) → Cloudflare Workers (edge cron / webhooks) → Fly.io Sydney (agent execution) → Supabase Mumbai (database)
```
Fly.io Sydney → Supabase Mumbai latency: ~1-2ms (APAC co-location)

## Monorepo Structure

```
bitbit/                      # npm workspaces root
  personal-assistant/        # Main Next.js app (deployed to Vercel)
  packages/core/             # Shared types and utilities
  packages/agents/           # 10 specialist agent packages
  deployments/
    fly/                     # Fly.io worker (Dockerfile, fly.toml, src/)
    cloudflare/              # Cloudflare edge cron (wrangler.toml, src/)
    # Baileys bridge removed — WhatsApp now uses Beeper/Matrix bridges
    vps/                     # VPS relay daemon config
    awu/                     # AWU client deployment
    torkay/                  # Torkay client deployment
    demo/                    # Demo deployment
  landing-page/              # Waitlist / marketing site (bitbit.chat, separate Vercel project)
  demo-1/                    # Demo app
```

**Package manager**: npm (with workspaces)
**Node requirement**: >=20
**Build**: `next build --webpack` (webpack mode, turbopack available for dev)

## Database

- **Engine**: PostgreSQL via Supabase
- **Migrations**: 120 SQL migration files in `personal-assistant/supabase/migrations/`
- **Auth**: Supabase Auth with RLS policies
- **Tenancy**: Dual-tier — personal orgs (auto-created) + shared orgs
- **Key patterns**: RLS on all tables, `org_id` scoping, `created_by` tracking

## RAG Infrastructure (ADR-002)

- **Vector DB**: Pinecone Serverless (us-east-1, `bitbit-rag` index, 1024 dimensions, cosine metric)
- **Embeddings**: Voyage-3.5-lite via `voyageai` SDK
- **Knowledge Graph**: Kuzu WASM (in-process, entity relationships via Graphiti pattern)
- **Chunker**: Semantic chunking with overlap for documents, emails, messages
- **Retriever**: Hybrid search (vector similarity + metadata filtering + knowledge graph traversal)
- **Queue**: `embedding_queue` table for async embedding generation
- **Key files**: `src/lib/rag/pinecone-client.ts`, `src/lib/rag/embedding-service.ts`, `src/lib/rag/retriever.ts`, `src/lib/rag/chunker.ts`

## Role Engine (v1.3)

- **Core**: `src/lib/roles/` — role-runtime, role-registry, role-scheduler, autonomy-gate, action-dispatcher, workflow-executor, role-cost-guard, role-activity-logger
- **TAOR Engine**: `src/lib/agent/engine/taor-loop.ts` — Think-Act-Observe-Reflect loop replacing legacy 1,100-line engine. Unbounded iterations, pre-flight + tool-executor extracted. Old `engine.ts` is a thin re-export shim
- **Sub-agents**: `src/lib/agent/tools/spawn-agent.ts` — isolated sub-agent decomposition for parallel domain queries
- **Deferred tools**: Eager core tools loaded at start, growth tools loaded on demand
- **Leads lib**: `src/lib/leads/` — types, utils, constants, scoring, enrichment, outreach, discovery, campaign-types, plan-limits, campaign-sender
- **Roles**: `src/lib/roles/{finance,comms,sales}/` — domain-owning roles wrapping existing agents
- **Intelligence**: `src/lib/intelligence/` — revenue-radar, client-health, cash-flow-prophet, capacity-oracle
- **Dashboard**: `src/components/roles/` — activity feed, status cards, autonomy toggle, attention view, intelligence widgets
- **API routes**: `/api/roles/` (enable, disable, autonomy, activity, status, attention), `/api/cron/role-tick`, `/api/cron/intelligence`, `/api/intelligence/[metric]`
- **DB tables**: role_configs, role_states, role_workflows, role_activity, bi_snapshots (migrations 092-093)
- **Patterns**: Advisory lock concurrency, optimistic versioning on state, Haiku pre-screen before Sonnet/Opus, durable workflows with time-delayed steps, per-role daily budget caps
- **Autonomy**: Observer (insights only) / Co-pilot (draft + approve) / Autopilot (confidence-gated execution)

## AI Models

- **Primary**: Claude (via @anthropic-ai/sdk)
- **Agent routing**: Confidence-based — high confidence = auto-act, low = ask user
- **Background**: Haiku for fact extraction (reflection) and tool group planning, larger models for synthesis
- **Agent tools**: 26 tools across 6 groups (core, memory, channel, web, comms, agentic) — includes `approve_action` for conversational approval, `execute_code` for agentic execution
- **Safety**: Kill switch per org, approval queue for outbound comms, daily send limits, commitment-prevention prompt
- **Conversation memory**: Total Recall system — persistent threads, cross-channel identity, 3-tier compression (Haiku), action execution dispatcher with 7 transport handlers

### Tool Orchestration (ADR-001)

**Architecture**: Hybrid Pattern D — Planner-compiled tool groups (default) with selective sub-agents (future).

**Phase 1 (Shipped)**: Haiku planner selects 1-3 tool groups per conversation. Sonnet receives 5-12 filtered tools instead of all 26. Core group always included.
- `PlanOutput` type: planner returns both `stages` (UI pipeline) and `toolGroups` (tool filtering)
- `getAgentTools(groups?)`: optional group filter, backward compatible (no args = all tools)
- KV cache preservation: tools locked at first Sonnet call, never changed mid-turn (90-95% hit rate)
- Fallback: trivial messages, planner timeouts, and empty groups all use full tool set

**Tool Groups** (6 groups, 26 tools):
| Group | Tools | When Selected |
|-------|-------|---------------|
| core | create_task, update_task, search_tasks, search_contacts, get_contact, log_activity, compose_creator_notification_mockup | Always included |
| memory | search_memory, add_memory | "Remember...", preference recall |
| channel | find_messages, read_message, draft_reply, summarize_inbox, get_upcoming, create_reminder, schedule_event, send_gmail, send_outlook | Calendar, email, messaging |
| web | web_search, fetch_url, browse_website | Research, URL reading, page rendering |
| comms | send_email, send_sms, send_whatsapp, approve_action | Outbound communications + action approval |
| agentic | execute_code | Complex multi-step operations via BitBit SDK |

**Phase 2 (Planned, not built)**: Complexity routing — Haiku also selects `executionMode: 'single' | 'specialist' | 'orchestrator'`. Specialist sub-agents for single-domain deep queries. Orchestrator for multi-domain parallel queries. Trigger: quality complaints on complex queries.

**Phase 3 (Planned, not built)**: Multiple orchestrators for 100+ tools. Top-level intent classifier routes between domain orchestrators. Trigger: tool count exceeds 100.

**Key files**: `planner.ts` (Haiku planning), `tools.ts` (tool definitions + group filtering), `engine/taor-loop.ts` (TAOR orchestration loop), `engine.ts` (legacy shim)
**Decision record**: `.claude/docs/research/tool-architecture-decision.md` (ADR-001)
**Research**: `.claude/docs/research/multi-agent-tool-orchestration-research.md`

## Development Environment

- **OS**: Linux
- **Shell**: zsh
- **IDE tools**: Claude Code CLI, GitNexus (codebase indexing)
- **Dev server**: `npm run dev` (Next.js dev with turbopack, auth enforced via `DEV_BYPASS_AUTH=false`)
- **Dev server (no auth)**: `npm run dev:noauth` (bypass auth redirect — limited, API routes still need real sessions)
- **Remote access**: Dev server binds `--hostname 0.0.0.0`, accessible from MacBook via Tailscale IP (100.124.167.125:3000). LAN IP blocked by Docker iptables
- **Testing**: `vitest run` (2,072 tests across 768 test suites)
- **E2E**: `npx playwright test` (21 spec files)
- **Preflight**: `npm run preflight` (tests + typecheck + build — same as pre-push hook)
- **Pre-push hook**: `.git/hooks/pre-push` blocks pushes to main unless preflight passes (tests, tsc, build)
- **Cron routes**: 23 routes in `/api/cron/` (including archive-threads */15, channel-sync, triage, process-embeddings, role-tick, intelligence)
- **Landing page dev**: `cd landing-page && npm run dev`
- **CI/CD**: 5 GitHub Actions workflows (ci, e2e, deploy, migrate, preview)

## Design System (v5.0 — Shadcn UI baseline)

- **Component library**: shadcn UI (39 installed) on Radix primitives — see `personal-assistant/components.json`. CLAUDE.md: "Exclusive Shadcn UI — component contracts enforced".
- **Tokens**: `src/styles/bitbit-design-system.css` — CSS variables for color, spacing, radius, motion, z-index. Light + dark themes only (Aurora removed 2026-04-17).
- **Theme files**: `src/styles/theme-light.css`, `src/styles/theme-midnight.css`
- **Component contract**: `personal-assistant/COMPONENT_CONTRACTS.md` — archetypes (StatCard, ContentCard, DashboardWidget, Empty, Panel, InputGroup, Badge) + anti-patterns (no inline `style={{}}` for visuals, no raw hex/rgba in components, no orange/amber outside status-warning)
- **Audit / consolidation plan**: `COMPONENT_AUDIT.md` (repo root) — 350-component inventory, missing typography/weight token scale, 8 proposed atoms (Surface/Pill/IconButton/etc.) to absorb duplicated class strings
- **Deprecated (archived 2026-04-17)**: glassmorphic `S`/`C` tokens (`src/lib/styles/design-tokens.ts`), inline-style + monochrome-only system documented in `personal-assistant/docs/archive/2026-04-STYLE_GUIDE-DEPRECATED.md`

## Conventions

- Path alias: `@/*` maps to `./src/*`
- Server external packages: @whiskeysockets/baileys, jimp, sharp, link-preview-js
- Agent packages aliased to `false` in webpack (not deployed to Vercel)
- CSS: Custom design system in `src/styles/bitbit-design-system.css` + temp stylesheets per module
