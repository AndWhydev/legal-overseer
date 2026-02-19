# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Plan-and-Execute Agent with Skill-Based Routing

BitBit implements a hierarchical agentic system where tasks are first classified with a fast, cheap model (Haiku), then routed to domain-specific skills with appropriately-tiered models (Sonnet/Opus) for execution. This pattern optimizes for cost while maintaining capability.

**Key Characteristics:**
- Task classification is decoupled from execution (two-stage pipeline)
- Skill-based routing to domain specialists (Ops Officer, Gatekeeper, R&D Scout)
- Model tiering based on task complexity and risk level
- Governance layer enforces safety constraints across all execution
- Webhook-driven task ingestion from ClickUp and Telegram
- Persistent task state management with database-backed audit trails

## Layers

**Entry Point (HTTP + Webhook Handlers):**
- Purpose: Receive tasks from external systems and handle synchronous requests
- Location: `src/index.ts`, `src/api/health.ts`
- Contains: HTTP server routing, webhook dispatch
- Depends on: All downstream modules
- Used by: External systems (Fly.io health checks, ClickUp, Telegram)

**Webhook Integration (ClickUp & Telegram):**
- Purpose: Ingest tasks from ClickUp tasks and Telegram messages, convert to internal task format
- Location: `src/integrations/clickup/webhook.ts`, `src/telegram/webhook.ts`
- Contains: Webhook signature verification, payload parsing, task creation
- Depends on: Database repositories, logging
- Used by: HTTP entry point

**Task Processing Loop:**
- Purpose: Continuous background task processing with governance gates
- Location: `src/agent/processor.ts`
- Contains: Main event loop, governance checks, task state transitions
- Depends on: Coordinator, database repositories, governance layer
- Used by: Main entry point when `ENABLE_TASK_PROCESSOR=true`

**Coordinator (Classification & Routing):**
- Purpose: Classify tasks to determine skill type and complexity, route to appropriate skill
- Location: `src/agent/coordinator.ts`
- Contains: Task classifier (uses Haiku), skill executor dispatcher
- Depends on: Skill registry, executor, governance
- Used by: Task processor, external API callers

**Skill Executors (Domain Specialists):**
- Purpose: Execute domain-specific logic with specialized models and tools
- Location: `src/skills/{gatekeeper,ops-officer,rd-scout}/`
- Contains: System prompts, domain pipelines, tool integrations
- Depends on: Executor, integrations (ClickUp, Gmail, API clients)
- Used by: Coordinator

**Governance Layer (Safety & Control):**
- Purpose: Enforce safety constraints, rate limiting, anomaly detection, audit logging
- Location: `src/governance/`
- Contains: Rate limiter, anomaly detector, control plane (kill switches), PII redactor, circuit breaker
- Depends on: Database (for state), logger
- Used by: All execution layers

**Database Layer (Persistence & Audit):**
- Purpose: Store task state, decision traces, audit logs, trust scores, configuration
- Location: `src/db/`
- Contains: SQLite connection, migrations, repository functions
- Depends on: better-sqlite3 driver
- Used by: Task processor, governance, coordinators, all skills

**Integrations (External System Adapters):**
- Purpose: Provide client libraries for external APIs and tools
- Location: `src/integrations/`
- Contains: ClickUp (MCP server + API client), Gmail, Xero, ScraperAPI, DataForSEO
- Depends on: HTTP clients, authentication
- Used by: Skills (ops-officer uses Gmail + Xero, rd-scout uses ScraperAPI + DataForSEO)

**Briefing & Monitoring:**
- Purpose: Aggregate daily operational status and send reports
- Location: `src/briefing/`
- Contains: Aggregator (collects task stats), scheduler (cron-based), alerts (anomaly notifications)
- Depends on: Telegram notifications, governance metrics, database
- Used by: Startup initialization, scheduled event loop

## Data Flow

**Task Ingestion → Processing → Completion:**

1. External system (ClickUp or Telegram) sends webhook to `POST /clickup/webhook` or `POST /telegram/*`
2. Webhook handler parses payload and creates database task record
3. Task processor loop (running every 5 seconds) calls `processNextTask()`
4. Processor checks governance: `canExecute()` gate (control plane, rate limits, circuit breakers)
5. If allowed, processor calls `classifyTask()` with Haiku (cost: ~$0.001 per task)
6. Classification returns skill type + complexity (e.g., "ops_officer", "standard")
7. Processor calls `selectModel()` to get tier based on complexity + risk level
8. Processor calls `executeWithSkill()` which:
   - Loads skill definition from registry (system prompt, tools, budget)
   - Calls `executeQuery()` with selected model (Sonnet/Opus)
   - Query may call MCP tools (ClickUp, Gmail, file system, etc.)
   - Query returns structured result
9. Processor updates task state: `markCompleted()` or `markFailed()`
10. Processor logs decision trace and updates trust scores
11. If completion is a "flag for review" or "approved" action, triggers downstream workflow (e.g., ClickUp comment, Telegram notification)

**State Management:**

Task state transitions:
```
pending → claimed → processing → completed
                              ├→ failed
                              ├→ flagged_for_review
                              └→ approved
```

Database repositories maintain canonical state:
- `tasks` - Task lifecycle tracking
- `decisionTraces` - Complete audit log of all decisions
- `trustScores` - Confidence metrics per supplier/agent
- `approvals` - Human-in-the-loop decisions
- `audit` - General audit logs
- Other domain tables (invoices, suppliers, style guides)

**Async Patterns:**

Most execution is async-over-sync (Node.js event loop):
- HTTP handler awaits webhook processing
- Task loop runs on interval with `setInterval()`
- Skill execution uses `async/await` with `for await` for streaming SDK results
- Telegram + Gmail integrate via polling (no guaranteed delivery webhooks in some cases)

## Key Abstractions

**Task:**
- Purpose: Unit of work for the agent system
- Examples: `src/db/repositories/tasks.ts`, `src/agent/processor.ts`
- Pattern: Database record with state machine transitions, PII-redacted logging

**Skill:**
- Purpose: Domain-specialist agent with specific system prompt and tool set
- Examples: `src/skills/{gatekeeper,ops-officer,rd-scout}/`
- Pattern: Registry-based lookup by skill type, defines system prompt + tools + budget

**SkillDefinition:**
- Purpose: Type-safe declaration of skill configuration
- Examples: `src/skills/registry.ts`, `src/skills/types.ts`
- Pattern: Immutable registry mapping SkillType → SkillDefinition

**Coordinator:**
- Purpose: Route task to skill based on classification
- Examples: `src/agent/coordinator.ts`
- Pattern: Two-stage query (classify with Haiku, execute with selected model)

**Repository:**
- Purpose: Data access functions for a domain
- Examples: `src/db/repositories/tasks.ts`, `src/db/repositories/approvals.ts`
- Pattern: Exported async functions, no class-based ORM, direct SQL manipulation

**MCP Server Config:**
- Purpose: Register available tools for agent execution
- Examples: `src/agent/tools.ts`, `src/integrations/clickup/config.ts`
- Pattern: Passed to SDK query() as `mcpServers` option

## Entry Points

**HTTP Server:**
- Location: `src/index.ts:main()`
- Triggers: Process startup, process.exit() on shutdown
- Responsibilities: Listen on PORT, route webhooks, graceful shutdown

**Task Processor Loop:**
- Location: `src/agent/processor.ts:processNextTask()`
- Triggers: Started by `main()` if `ENABLE_TASK_PROCESSOR=true`, runs every TASK_POLL_INTERVAL (default 5s)
- Responsibilities: Fetch pending tasks, classify, route to skills, persist results

**Webhook Handlers:**
- Location: `src/integrations/clickup/webhook.ts`, `src/telegram/webhook.ts`
- Triggers: HTTP request to `/clickup/webhook` or `/telegram/*`
- Responsibilities: Validate signature, parse payload, create database task

**Briefing Scheduler:**
- Location: `src/briefing/scheduler.ts:initBriefingScheduler()`
- Triggers: Started by `main()` if `BRIEFING_ENABLED=true`, runs on cron (default 9 AM UTC daily)
- Responsibilities: Aggregate task stats, send Telegram summary, check alerts

**R&D Scout Scheduler:**
- Location: `src/skills/rd-scout/index.ts:initRDScout()`
- Triggers: Started by `main()` if `RD_SCOUT_ENABLED=true`, runs on cron (default weekly)
- Responsibilities: Execute market research pipeline, post results to ClickUp

## Error Handling

**Strategy:** Fail-safe with fallback to human review

**Patterns:**

1. **Governance Gates:** Any execution reaches `canExecute()` check first. If blocked, task marked as `flagged_for_review` with audit log
2. **Classification Fallback:** If `classifyTask()` fails, defaults to `general` skill with lower budget
3. **Execution Timeout:** All queries have `maxTurns` limit and `maxBudgetUsd` guard to prevent runaway
4. **Circuit Breakers:** Track consecutive failures per integration. If open, tasks for that skill are blocked until manual reset
5. **Graceful Degradation:** Failed integration (e.g., ClickUp API down) triggers circuit breaker; system continues processing other tasks
6. **Async Error Handling:** Try-catch in processor catches unhandled rejections, logs safely (with PII redaction), marks task as failed

**Logging:**
- All errors go through `createSafeLogger()` which redacts PII before writing
- Decision traces capture full execution path (classification, model selection, tool calls)
- Audit logs are immutable (append-only in database)

## Cross-Cutting Concerns

**Logging:**
- Framework: `src/governance/logger.ts:createSafeLogger()`
- Pattern: Each module creates scoped logger with namespace, logs via console (no file)
- PII: Automatic redaction of emails, API keys, phone numbers

**Validation:**
- At database layer: SQLite schema enforces types
- At task input: Webhook handlers parse/validate payload before storing
- At model selection: `selectModel()` validates complexity + risk enum values
- At API responses: JSON parsing with explicit type assertions

**Authentication:**
- Webhook validation: HMAC signature checks for ClickUp (X-Signature), Telegram (token in URL)
- API keys: Stored in environment variables, loaded at startup, never logged
- Token refresh: Some integrations (Xero, Gmail) manage refresh tokens in database

**Cost Control:**
- Model tiering: Each skill defines default model tier + max budget (e.g., ops_officer: sonnet, maxBudgetUsd: 1.5)
- Query guardrails: `executeQuery()` enforces maxBudgetUsd + maxTurns limits via SDK options
- Cheap classification: Always use Haiku for initial routing (cost: ~$0.001)

**Rate Limiting:**
- Framework: `src/governance/rate-limiter.ts`
- Pattern: Token bucket per skill, checked before task execution
- Action: If rate limit exceeded, task goes to governance review instead of execution

---

*Architecture analysis: 2026-02-19*
