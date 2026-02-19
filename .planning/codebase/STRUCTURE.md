# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
/home/claude/bitbit/
├── src/                          # Main application source code
│   ├── index.ts                  # HTTP server entry point
│   ├── agent/                    # Agent execution logic
│   ├── api/                      # HTTP endpoint handlers
│   ├── briefing/                 # Daily operational briefing
│   ├── core/                     # Core utilities (placeholder - .gitkeep only)
│   ├── db/                       # Database & persistence
│   ├── governance/               # Safety, compliance, audit
│   ├── integrations/             # External system adapters
│   ├── skills/                   # Domain-specialist agents
│   └── telegram/                 # Telegram bot integration
├── dist/                         # Compiled TypeScript (generated, do not commit)
├── data/                         # Runtime data directory
│   ├── bitbit.db                 # SQLite database (generated)
│   ├── reports/                  # Generated research reports
│   ├── skills/                   # Skill configuration data
│   ├── style_guide/              # CheekyGlo brand guidelines
│   └── tmp/                      # Temporary files
├── deployments/                  # Deployment configurations
│   ├── awu/                      # AWU deployment config
│   ├── demo/                     # Demo deployment config
│   └── torkay/                   # Torkay deployment config
├── packages/                     # Monorepo workspaces (currently unused)
│   ├── core/                     # (placeholder)
│   ├── dashboard/                # (placeholder)
│   └── agents/                   # (placeholder)
├── docs/                         # Project documentation
├── research/                     # Research notes and references
├── scripts/                      # Build and utility scripts
├── node_modules/                 # Dependencies (generated, not committed)
├── .planning/                    # Planning and analysis documents
│   ├── codebase/                 # Codebase analysis (this directory)
│   ├── milestones/               # Project milestones
│   └── phases/                   # Implementation phases
├── package.json                  # Root workspace config
├── tsconfig.json                 # TypeScript compiler settings
├── eslint.config.js              # ESLint configuration
├── fly.toml                      # Fly.io deployment config
└── MIGRATION.md                  # Database migration notes
```

## Directory Purposes

**`src/`:**
- Purpose: Complete application source code
- Contains: TypeScript files for all modules
- Key files: `index.ts` (entry point), subdirectory index exports

**`src/index.ts`:**
- Purpose: Application entry point and HTTP server
- Contains: `main()` function, HTTP routing, graceful shutdown
- Responsibilities: Start DB, start task processor, start briefing scheduler, listen on PORT
- Imports: All major subsystems (agent, db, telegram, integrations, skills, governance)

**`src/agent/`:**
- Purpose: Agent execution framework
- Contains: Classification, routing, task processing, model selection
- Key files:
  - `index.ts` - Barrel export
  - `coordinator.ts` - Task classification and skill routing (uses Haiku)
  - `processor.ts` - Main task processing loop
  - `executor.ts` - Query execution wrapper around Claude Agent SDK
  - `models.ts` - Model tiering logic (Haiku/Sonnet/Opus selection)
  - `tools.ts` - MCP server configuration
  - `._*.ts` - Draft/backup versions (ignore these)

**`src/api/`:**
- Purpose: HTTP endpoint handlers
- Contains: Health check and status endpoints
- Key files: `health.ts` - Health check endpoint for Fly.io

**`src/briefing/`:**
- Purpose: Daily operational briefing system
- Contains: Task aggregation, scheduled reporting, alert dispatch
- Key files:
  - `index.ts` - Barrel export
  - `aggregator.ts` - Collects task stats from database
  - `scheduler.ts` - Cron-based briefing delivery
  - `alerts.ts` - Alert condition checking
  - `types.ts` - Type definitions

**`src/core/`:**
- Purpose: Core utilities (reserved for future use)
- Contains: Only `.gitkeep`
- Status: Placeholder directory

**`src/db/`:**
- Purpose: Database and persistence layer
- Contains: SQLite connection, migrations, repository functions
- Key files:
  - `connection.ts` - Database singleton connection
  - `init.ts` - Schema initialization
  - `index.ts` - Barrel export
  - `migrations/` - SQL schema migrations (numbered 001-006)
  - `repositories/` - Data access layer by domain

**`src/db/repositories/`:**
- Purpose: Domain-specific data access functions
- Contains: Task, approval, supplier, invoice management functions
- Key files:
  - `tasks.ts` - Task lifecycle (getNextPending, markCompleted, markFailed)
  - `approvals.ts` - HITL approval tracking
  - `audit.ts` - Immutable audit log
  - `trustScores.ts` - Supplier/agent confidence metrics
  - `decisionTraces.ts` - Complete execution path logs
  - `invoices.ts` - Invoice records
  - `suppliers.ts` - Approved suppliers list
  - `styleGuide.ts` - Brand guidelines storage

**`src/governance/`:**
- Purpose: Safety, compliance, audit, and operational control
- Contains: Rate limiting, anomaly detection, kill switches, PII redaction, logging
- Key files:
  - `index.ts` - Barrel export
  - `logger.ts` - Safe logging with automatic PII redaction
  - `pii-redactor.ts` - Redaction rules for emails, API keys, phone numbers
  - `rate-limiter.ts` - Token bucket rate limiting per skill
  - `anomaly-detector.ts` - Behavioral anomaly detection
  - `control-plane.ts` - Global kill switches for agent execution
  - `circuit-breaker.ts` - Per-integration failure tracking

**`src/integrations/`:**
- Purpose: External system adapters and client libraries
- Contains: ClickUp, Gmail, Xero, ScraperAPI, DataForSEO integrations
- Key files:
  - `clickup/` - ClickUp MCP server + API client + webhooks
  - `xero/` - Xero accounting API client
  - `dataforseo/` - DataForSEO API client for SEO trend data
  - `scraperapi/` - ScraperAPI client for web scraping

**`src/integrations/clickup/`:**
- Purpose: ClickUp task management integration
- Contains: MCP server registration, webhook handler, API client, workflows
- Key files:
  - `config.ts` - MCP server configuration
  - `webhook.ts` - Webhook signature validation and handler
  - `service.ts` - ClickUp API client functions
  - `workflow.ts` - High-level workflows (gatekeeper completion, etc.)
  - `attachments.ts` - File upload to ClickUp
  - `dashboard.ts` - Dashboard summary functions
  - `types.ts` - Type definitions

**`src/skills/`:**
- Purpose: Domain-specialist agent implementations
- Contains: Ops Officer, Gatekeeper, R&D Scout skill modules
- Key files:
  - `index.ts` - Barrel export
  - `registry.ts` - Central skill registry mapping type → definition
  - `types.ts` - Shared type definitions (SkillType, TaskClassification)

**`src/skills/ops-officer/`:**
- Purpose: Invoice processing and operational approval workflows
- Contains: Email monitoring, invoice extraction, supplier verification, payment drafts
- Key files:
  - `index.ts` - Barrel export
  - `pipeline.ts` - Main orchestration (email monitor → extract → verify → approve → pay)
  - `task-context.ts` - Context builder for ops-officer tasks
  - `types.ts` - Invoice, anomaly, verification types
  - `email/` - Gmail integration (monitor inbox, fetch messages)
  - `extraction/` - Claude Vision invoice OCR
  - `verification/` - Supplier checks, anomaly detection
  - `approval/` - HITL approval flow
  - `payment/` - Xero payment draft creation

**`src/skills/gatekeeper/`:**
- Purpose: Content QA and brand compliance verification
- Contains: Media processing, video analysis, style guide checking
- Key files:
  - `index.ts` - Barrel export
  - `pipeline.ts` - QA pipeline (probe → extract frames → analyze → score)
  - `task-context.ts` - Context builder for gatekeeper tasks
  - `types.ts` - QA result types
  - `media/` - FFmpeg-based media processing (probe, frames, audio)
  - `analysis/` - Content analysis (technical, visual, scoring)

**`src/skills/rd-scout/`:**
- Purpose: Market research and product opportunity discovery
- Contains: Alibaba/Amazon scraping, SEO trend analysis, report generation
- Key files:
  - `index.ts` - Barrel export
  - `pipeline.ts` - Research orchestration (scan → cross-ref → trends → report)
  - `types.ts` - ResearchReport, ProductOpportunity types
  - `scheduler.ts` - Weekly report scheduling
  - `scrapers/` - Product scraping (Alibaba, Amazon)
  - `analysis/` - Cross-reference and margin calculation
  - `trends/` - SEO trend detection via DataForSEO
  - `reports/` - Report generation and formatting

**`src/telegram/`:**
- Purpose: Telegram bot integration
- Contains: Bot commands, webhooks, notifications, keyboards
- Key files:
  - `index.ts` - Barrel export
  - `webhook.ts` - Webhook handler for Telegram updates
  - `notifications.ts` - Message sending (approvals, alerts, reports)
  - `keyboards.ts` - Inline keyboard builders
  - `commands/` - Chat commands (status, emergency)
  - `callbacks/` - Callback query handlers

**`data/`:**
- Purpose: Runtime data directory (gitignored)
- Contains: SQLite database, generated reports, configuration
- Key files:
  - `bitbit.db` - Main SQLite database (generated at startup if missing)
  - `reports/` - Generated research reports (PDF, JSON)
  - `skills/` - Skill configuration YAML
  - `style_guide/` - CheekyGlo brand guidelines (JSON)

**`deployments/`:**
- Purpose: Deployment-specific configuration
- Contains: Environment-specific app configs
- Key directories: `awu/`, `demo/`, `torkay/` (one per deployment)

**`.planning/codebase/`:**
- Purpose: Codebase analysis documents
- Contains: Architecture, structure, conventions, testing patterns, concerns
- These files guide future Claude instances writing code

## Key File Locations

**Entry Points:**
- `src/index.ts` - HTTP server startup, task processor initialization, graceful shutdown

**Configuration:**
- `src/agent/models.ts` - Model tier definitions and costs
- `src/skills/registry.ts` - Skill registry (system prompts, tools, budgets)
- `src/integrations/clickup/config.ts` - ClickUp MCP server configuration
- `data/style_guide/` - CheekyGlo brand guidelines (loaded by gatekeeper)

**Core Logic:**
- `src/agent/coordinator.ts` - Task classification and routing
- `src/agent/processor.ts` - Task processing loop
- `src/skills/ops-officer/pipeline.ts` - Invoice workflow orchestration
- `src/skills/gatekeeper/pipeline.ts` - Content QA workflow orchestration
- `src/skills/rd-scout/pipeline.ts` - Market research workflow orchestration

**Testing:**
- No test files found in repository (testing approach: integration testing in phases)

**Database:**
- `src/db/migrations/` - SQL schema migrations (001-006 numbered)
- `src/db/repositories/` - Data access functions by domain

## Naming Conventions

**Files:**
- `*.ts` - TypeScript source files
- `index.ts` - Barrel export files (re-export public API from directory)
- `types.ts` - Type definitions (interfaces, types, enums for a module)
- `._*.ts` - Draft/backup versions created by development tools (ignore)
- Kebab-case for multi-word filenames: `skill-context.ts`, `circuit-breaker.ts`

**Directories:**
- Kebab-case for subdirectories: `ops-officer/`, `rd-scout/`, `style-guide/`
- Plural for collections: `skills/`, `integrations/`, `migrations/`, `repositories/`

**Functions:**
- camelCase: `classifyTask()`, `executeQuery()`, `markCompleted()`
- Prefixed with verb: `get*()`, `set*()`, `create*()`, `update*()`, `delete*()`

**Variables:**
- camelCase: `taskId`, `skillType`, `maxBudgetUsd`
- UPPER_SNAKE_CASE for constants: `DEFAULT_MODEL_TIER`, `MAX_TURNS`, `CLASSIFIER_PROMPT`

**Types:**
- PascalCase: `TaskClassification`, `SkillDefinition`, `QueryResult`, `ProcessGatekeeperResult`
- Suffix with type suffix: `Result`, `Config`, `Options`, `Data`, `Params`

## Where to Add New Code

**New Feature:**
- If domain-specific (invoice, content, research): Add to `src/skills/{skill-name}/`
- If integrates external API: Add to `src/integrations/{service}/`
- If governance/safety: Add to `src/governance/`
- If database schema needed: Add migration to `src/db/migrations/` (numbered 007, 008, etc.) and repository to `src/db/repositories/`

**New Skill:**
- Create directory: `src/skills/{skill-type}/`
- Add `index.ts` barrel export and `types.ts` type definitions
- Add `pipeline.ts` for main orchestration
- Add skill definition to `src/skills/registry.ts`
- Add system prompt and tool list to registry definition
- Wire startup in `src/index.ts` if needed (e.g., scheduler initialization)

**New Integration:**
- Create directory: `src/integrations/{service}/`
- Add `config.ts` for MCP server setup (if using Claude Agent SDK)
- Add `index.ts` barrel export
- Add client code: `client.ts` or `service.ts`
- Add type definitions: `types.ts`
- Add webhook handler if needed: `webhook.ts`

**New API Endpoint:**
- Add handler to `src/api/` as new file
- Add route in `src/index.ts:handleRequest()` switch statement
- Export from `src/api/index.ts` barrel export
- Include authentication/validation in handler

**New Database Table:**
- Create migration in `src/db/migrations/` (next number in sequence)
- Add repository file in `src/db/repositories/{domain}.ts`
- Export from `src/db/repositories/index.ts`
- Wire into task context if needed for skill execution

**Utilities:**
- Shared helpers: `src/governance/` (e.g., logger, rate-limiter)
- Domain-specific helpers: Subdirectories within skill (e.g., `src/skills/ops-officer/email/`)
- Avoid creating new top-level directories without architecture review

## Special Directories

**`data/`:**
- Purpose: Runtime data storage (gitignored)
- Generated: Yes (SQLite db created at startup)
- Committed: No (`.gitignore` excludes `data/`)
- Structure: Database, reports, configuration files created at runtime

**`dist/`:**
- Purpose: Compiled JavaScript output from TypeScript
- Generated: Yes (created by build process)
- Committed: No
- How to rebuild: `npm run build`

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes
- Committed: No (use `package-lock.json` for deterministic installs)
- How to install: `npm install`

**`.planning/`:**
- Purpose: Project planning and codebase analysis documents
- Generated: No (written by Claude instances via gsd commands)
- Committed: Yes
- Structure: `codebase/` (analysis), `phases/` (implementation), `milestones/` (roadmap)

**`deployments/`:**
- Purpose: Environment-specific configuration
- Generated: No (manually maintained)
- Committed: Yes
- Usage: Select deployment via `BITBIT_DEPLOYMENT` env var in dev scripts

---

*Structure analysis: 2026-02-19*
