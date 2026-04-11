# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
bitbit/
├── packages/
│   ├── core/                    # TypeScript type definitions and registries
│   │   └── src/
│   │       ├── index.ts         # Public API exports
│   │       ├── types.ts         # Domain models and interfaces
│   │       └── agent-registry.ts # Agent definition registry
│   ├── agents/                  # Agent implementations (future expansion)
│   │   ├── invoice-flow/
│   │   ├── client-onboarding/
│   │   └── ... (planned)
│   └── dashboard/               # Next.js UI dashboard (planned)
├── src/                         # Main BitBit platform code
│   ├── index.ts                 # HTTP server entry point
│   ├── agent/                   # Task coordination and execution
│   │   ├── index.ts
│   │   ├── coordinator.ts       # Task classification and routing
│   │   ├── executor.ts          # Query execution wrapper
│   │   ├── models.ts            # Model selection logic
│   │   ├── tools.ts             # MCP tools configuration
│   │   └── processor.ts         # Background task processing loop
│   ├── skills/                  # Specialized agent skills
│   │   ├── index.ts
│   │   ├── types.ts             # Skill interface definitions
│   │   ├── registry.ts          # Skill definitions and routing
│   │   ├── gatekeeper/          # Content QA and style compliance
│   │   │   ├── index.ts
│   │   │   ├── pipeline.ts      # QA workflow orchestration
│   │   │   ├── types.ts
│   │   │   ├── media/           # FFmpeg-based media processing
│   │   │   └── analysis/        # Content analysis and scoring
│   │   ├── rd-scout/            # Market research agent
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── analysis/
│   │   │   ├── reports/
│   │   │   ├── scrapers/
│   │   │   └── trends/
│   │   └── ops-officer/         # Invoice and payment processing
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── approval/
│   │       ├── extraction/
│   │       ├── email/
│   │       ├── payment/
│   │       └── verification/
│   ├── db/                      # Database layer
│   │   ├── index.ts
│   │   ├── connection.ts        # SQLite setup and connection
│   │   ├── init.ts              # Migration runner
│   │   ├── migrations/          # Schema migrations (001-006)
│   │   └── repositories/        # Data access layer
│   │       ├── approvals.ts
│   │       ├── invoices.ts
│   │       ├── tasks.ts
│   │       ├── suppliers.ts
│   │       ├── styleGuide.ts
│   │       └── audit.ts
│   ├── integrations/            # External service adapters
│   │   ├── clickup/             # ClickUp task management
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   ├── config.ts
│   │   │   ├── service.ts
│   │   │   ├── webhook.ts
│   │   │   ├── workflow.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── attachments.ts
│   │   │   └── types.ts
│   │   ├── xero/                # Xero accounting
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   └── draft.ts
│   │   ├── dataforseo/          # SEO and keyword research
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── scraperapi/          # Web scraping proxy
│   │       ├── index.ts
│   │       ├── client.ts
│   │       └── types.ts
│   ├── telegram/                # Telegram bot integration
│   │   ├── index.ts
│   │   ├── bot.js               # Graceful bot lifecycle
│   │   ├── webhook.ts           # Message handling
│   │   ├── notifications.ts     # Approval and status messages
│   │   ├── keyboards.ts         # Inline keyboard UI
│   │   ├── callbacks/           # Button callback handlers
│   │   └── commands/            # Telegram slash commands
│   ├── briefing/                # Scheduled briefing reports
│   │   ├── index.ts
│   │   ├── scheduler.ts         # Cron-based scheduling
│   │   ├── alerts.ts            # Alert aggregation
│   │   └── types.ts
│   ├── governance/              # Safety and compliance controls
│   │   ├── index.ts
│   │   ├── logger.ts            # Safe logging with context
│   │   ├── pii-redactor.ts      # PII detection and masking
│   │   ├── rate-limiter.ts      # Token and API rate limits
│   │   ├── anomaly-detector.ts  # Fraud/misuse detection
│   │   ├── circuit-breaker.ts   # Integration reliability patterns
│   │   └── control-plane.ts     # Global kill switches, agent disabling
│   ├── api/                     # HTTP API handlers
│   │   └── health.ts            # Fly.io health check endpoint
│   └── core/                    # Core utilities (deprecated)
├── personal-assistant/          # Next.js dashboard UI (in-progress migration)
│   ├── src/
│   │   ├── index.ts
│   │   ├── lib/
│   │   │   ├── agent/           # Local agent loop (being replaced by src/agent)
│   │   │   ├── channels/        # Email, SMS, iMessage, calendar adapters
│   │   │   ├── supabase/        # Auth and database
│   │   │   ├── integrations/
│   │   │   ├── medications/     # Personal health domain
│   │   │   └── utils.ts
│   │   ├── app/                 # Next.js App Router
│   │   ├── middleware.ts
│   │   └── hooks/
│   └── package.json
├── deployments/                 # Multi-tenant deployment configs
│   ├── awu/                     # All Webbed Up (primary testbed)
│   │   ├── config.ts            # Org settings, agent rollout plan
│   │   ├── package.json
│   │   ├── policies/            # Organization-specific policies
│   │   ├── voices/              # Communication style profiles
│   │   └── seeds/               # Org-specific seed data
│   ├── torkay/                  # Tor Kay (secondary testbed)
│   ├── demo/                    # Demo deployment
│   └── demo-1/                  # Variant for testing
├── docs/                        # Documentation (roadmaps, design docs)
├── scripts/                     # Utility scripts
├── data/                        # Test data, fixtures
├── research/                    # Research and exploration
├── dist/                        # Compiled TypeScript output
├── .planning/
│   └── codebase/               # This directory (codebase analysis)
├── package.json                 # Root workspace definition
├── tsconfig.json                # TypeScript config (ES2022, NodeNext)
└── fly.toml                     # Fly.io deployment config
```

## Directory Purposes

**packages/core:**
- Purpose: Shared type definitions and registries
- Contains: TypeScript interfaces, agent registry, domain models
- Key files: `index.ts` (public API), `types.ts` (100+ entity types), `agent-registry.ts`

**src/ (Main application):**
- Purpose: Core BitBit platform implementation
- Contains: HTTP server, agent coordination, skills, database, integrations
- Entry point: `src/index.ts` (main())

**src/agent/:**
- Purpose: Task coordination and Claude interaction
- Contains: Task classification (coordinator), query execution (executor), model selection
- Key pattern: Coordinator uses Haiku → routes to Skill → Skill uses Sonnet/Opus

**src/skills/:**
- Purpose: Domain-specific task implementations
- Contains: Gatekeeper (QA), RD Scout (research), Ops Officer (invoices)
- Pattern: Each skill is registered and routable via coordinator

**src/db/:**
- Purpose: Data persistence layer
- Contains: SQLite connection, migrations, repositories
- Pattern: One repository per entity (approvals, invoices, suppliers, etc.)

**src/integrations/:**
- Purpose: External service communication
- Contains: ClickUp client, Xero accounting, web scraping, SEO tools
- Pattern: Each integration exports client and type definitions

**src/telegram/:**
- Purpose: Telegram bot for notifications and user interaction
- Contains: Bot lifecycle, webhook handler, approval keyboards, command handlers
- Pattern: Sends approval requests and status updates

**src/governance/:**
- Purpose: Safety controls and compliance
- Contains: Logging, PII redaction, rate limiting, circuit breakers, kill switches
- Pattern: Used by all modules; injected at entry points

**personal-assistant/:**
- Purpose: Next.js dashboard UI (in-progress migration from earlier codebase)
- Contains: Channel adapters, authentication, personal health domain
- Note: Being migrated to use core package; some duplication during transition

**deployments/:**
- Purpose: Multi-tenant configuration and customization
- Contains: Organization-specific settings, agent rollout plans, voice profiles, policies
- Pattern: `config.ts` defines org settings and feature flags

## Key File Locations

**Entry Points:**
- `src/index.ts`: HTTP server main()
- `packages/core/src/index.ts`: Public API exports
- `personal-assistant/src/app`: Next.js pages and routes

**Configuration:**
- `tsconfig.json`: TypeScript compiler options (ES2022, NodeNext)
- `package.json`: Root workspace definition, build scripts
- `fly.toml`: Fly.io deployment manifest
- `deployments/{org}/config.ts`: Per-organization settings

**Core Logic:**
- `src/agent/coordinator.ts`: Task classification and routing
- `src/agent/executor.ts`: Query execution with budget guardrails
- `src/agent/models.ts`: Model selection logic
- `src/skills/registry.ts`: Skill definitions and lookup
- `src/governance/control-plane.ts`: Global safety controls

**Database:**
- `src/db/connection.ts`: SQLite setup
- `src/db/init.ts`: Migration runner
- `src/db/migrations/`: Schema files (001_initial_schema.ts through 006_key_value_store.ts)
- `src/db/repositories/`: Data access objects

**Testing:** Not detected in current codebase.

## Naming Conventions

**Files:**
- Kebab-case: `model-router.ts`, `circuit-breaker.ts`, `rd-scout/`
- Domain-based: `{feature}/{module}.ts` (e.g., `skills/gatekeeper/analysis.ts`)
- Index pattern: `index.ts` in each directory exports public API

**Directories:**
- Plural for collections: `skills/`, `integrations/`, `repositories/`
- Kebab-case for multi-word: `rd-scout/`, `ops-officer/`, `gatekeeper/`

**Functions:**
- Camel case: `executeQuery()`, `classifyTask()`, `selectModel()`
- Verb-prefixed: `get*()`, `create*()`, `process*()`, `send*()`
- Async suffixes: No special prefix; async keyword used directly

**Types:**
- PascalCase with suffix: `QueryResult`, `SkillDefinition`, `HealthResponse`
- Options: `*Options` (e.g., `QueryOptions`, `PipelineOptions`)
- Enums: All caps with UPPER_SNAKE_CASE (e.g., `MODEL_COSTS`, `MODELS`)

**Variables:**
- Private/internal: `_name` prefix or closure scope
- Constants: ALL_CAPS (e.g., `DEFAULT_OPTIONS`, `CLASSIFIER_PROMPT`)

## Where to Add New Code

**New Feature (cross-cutting):**
- Primary code: `src/{feature}/`
- Configuration: `deployments/{org}/config.ts`
- Tests: Would go to `src/{feature}/__tests__/` (pattern not yet established)

**New Skill:**
- Implementation: `src/skills/{skill-name}/`
- Handler function: `src/skills/{skill-name}/index.ts` (exports processTask)
- Types: `src/skills/{skill-name}/types.ts`
- Registration: Call `registerSkill()` in registry
- Router: Coordinator classifies and routes to registered skill

**New Integration:**
- Client: `src/integrations/{service}/client.ts`
- Types: `src/integrations/{service}/types.ts`
- Webhook: `src/integrations/{service}/webhook.ts` (if inbound)
- Index: `src/integrations/{service}/index.ts` (exports public API)

**Database Schema Change:**
- Migration: `src/db/migrations/{###}_description.ts` (incremental number)
- Repository: `src/db/repositories/{entity}.ts` (if new entity)
- Types: Update `packages/core/src/types.ts`

**Governance Rule:**
- Logic: Add to appropriate module in `src/governance/`
- Types: Add to module exports
- Entry point: Integrate into control-plane or middleware

**Utilities/Helpers:**
- Shared: `src/{layer}/utils.ts` or utility module
- Specific to skill: `src/skills/{skill}/utils.ts`
- Type utilities: `packages/core/src/types.ts`

## Special Directories

**dist/:**
- Purpose: Compiled TypeScript output
- Generated: Yes (by `tsc` or build step)
- Committed: No (.gitignore)
- Content: JavaScript compiled from `src/`

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (by npm)
- Committed: No (.gitignore)

**deployments/:**
- Purpose: Tenant-specific customizations
- Generated: No (hand-written config)
- Committed: Yes (part of git repo)
- Pattern: Each org has own directory with config, policies, voices, seeds

**personal-assistant/:**
- Purpose: UI dashboard (Next.js) - in transition
- Generated: No (source code)
- Committed: Yes (separate workspace)
- Note: Being refactored to use packages/core; some code still local

**.planning/codebase/:**
- Purpose: Analysis documents for GSD commands
- Generated: Yes (by gsd:map-codebase)
- Committed: Yes
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

---

*Structure analysis: 2026-02-19*
