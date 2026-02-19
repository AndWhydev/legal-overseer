# Migration Guide: Monorepo Consolidation

## Current State

```
~/bitbit/
├── demo-1/              → Legacy e-commerce demo (v1.0, shipped Jan 29)
├── personal-assistant/  → Active platform dev (Next.js 16, Supabase)
├── packages/            → NEW: Monorepo packages
├── deployments/         → NEW: Per-org deployment configs
└── package.json         → NEW: Workspace root
```

## Migration Plan

### Phase 1: Extract Core (packages/core)

Move from `personal-assistant/src/lib/agent/` into `packages/core/src/`:

| Source | Destination |
|--------|------------|
| `personal-assistant/src/lib/agent/engine.ts` | `packages/core/src/engine.ts` |
| `personal-assistant/src/lib/agent/model-router.ts` | `packages/core/src/model-router.ts` |
| `personal-assistant/src/lib/agent/orchestrator.ts` | `packages/core/src/orchestrator.ts` |
| `personal-assistant/src/lib/agent/tools.ts` | `packages/core/src/tools.ts` |
| `personal-assistant/src/lib/agent/prompt-builder.ts` | `packages/core/src/prompt-builder.ts` |
| `personal-assistant/src/lib/channels/` | `packages/core/src/channels/` |
| `personal-assistant/supabase/migrations/` | `packages/core/src/db/migrations/` |

After migration, `personal-assistant` imports from `@bitbit/core` instead of local paths.

### Phase 2: Dashboard as Package

Move `personal-assistant/` into `packages/dashboard/`:

- The Next.js app becomes the dashboard package
- Imports core engine from `@bitbit/core`
- Imports agent definitions from `@bitbit/agent-*`
- Reads deployment config from `BITBIT_DEPLOYMENT` env var

### Phase 3: Agent Extraction

Current agent logic embedded in the engine becomes standalone packages:

- Each agent in `packages/agents/<name>/` self-registers via `registerAgent()`
- Agents define their own tools, schedules, and confidence thresholds
- Dashboard dynamically loads agents based on org configuration

### Phase 4: Archive Legacy

- `demo-1/` → Archive or keep as reference
- `personal-assistant/` → Absorbed into `packages/dashboard/`

## Workspace Commands

```bash
# Development
npm run dev              # Default deployment
npm run dev:awu          # AWU deployment
npm run dev:torkay       # Torkay deployment
npm run dev:demo         # Demo deployment

# Build
npm run build            # Build core + dashboard

# Database
npm run db:migrate       # Run Supabase migrations
npm run db:seed          # Seed default data

# Agents
npm run agents:list      # List all registered agents
```

## Environment Variables

Each deployment needs:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# AI
ANTHROPIC_API_KEY=sk-ant-xxx
GEMINI_API_KEY=xxx

# Deployment
BITBIT_DEPLOYMENT=awu|torkay|demo

# Channel secrets (per deployment)
GMAIL_MCP_TOKEN=xxx
OUTLOOK_CLIENT_ID=xxx
OUTLOOK_CLIENT_SECRET=xxx
WHATSAPP_API_TOKEN=xxx
CALENDLY_API_KEY=xxx
STRIPE_SECRET_KEY=xxx
ASANA_PAT=xxx
```
