# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Layered event-driven architecture with agent routing and skill-based task execution.

**Key Characteristics:**
- Task-driven workflow: Messages → Classification → Skill Routing → Execution → State Management
- Cost-optimized model selection: Haiku (classification) → Sonnet/Opus (execution)
- Governance overlay: PII redaction, rate limiting, circuit breakers, kill switches
- Multi-skill agent system: Generalist coordinator routes to specialist subagents
- Database-backed state with migrations and repositories
- Event webhooks for external integrations (Telegram, ClickUp)

## Layers

**Coordinator (Orchestrator):**
- Purpose: Fast classification and skill routing
- Location: `src/agent/coordinator.ts`
- Contains: Task classification logic, skill selection
- Depends on: Haiku model, skill registry, Claude Agent SDK
- Used by: Main task loop, processor

**Skill Layer (Execution):**
- Purpose: Domain-specific task execution
- Location: `src/skills/{gatekeeper,rd-scout,ops-officer}/`
- Contains: Multi-modal QA, market research, invoice processing
- Depends on: Tools, integrations, models, database repositories
- Used by: Coordinator for routed task execution

**Agent Engine (Low-level):**
- Purpose: Query execution with cost guardrails and logging
- Location: `src/agent/executor.ts`
- Contains: Query wrapper, error handling, budget tracking
- Depends on: Claude Agent SDK, governance, logging
- Used by: Skills and coordinator for all Claude interactions

**Integration Layer:**
- Purpose: External service communication
- Location: `src/integrations/{clickup,xero,dataforseo,scraperapi}/`
- Contains: API clients, webhook handlers, type definitions
- Depends on: External SDKs, database
- Used by: Skills for real-world operations

**Data Layer:**
- Purpose: Persistence and state management
- Location: `src/db/{connection,init,migrations,repositories}`
- Contains: SQLite database, schema migrations, query builders
- Depends on: better-sqlite3, filesystem
- Used by: All modules for entity persistence

**Governance Layer:**
- Purpose: Safety, compliance, and operational controls
- Location: `src/governance/{logger,pii-redactor,rate-limiter,circuit-breaker,control-plane}`
- Contains: Logging, PII redaction, rate limiting, anomaly detection, kill switches
- Depends on: Database, logging infrastructure
- Used by: All modules (injected at entry points)

**HTTP Server (Entry Point):**
- Purpose: Request routing and webhook handling
- Location: `src/index.ts`
- Contains: Route handlers, shutdown logic, banner
- Depends on: All other layers
- Used by: Fly.io/external load balancers

## Data Flow

**User Message Workflow:**

1. Incoming message arrives via webhook or HTTP endpoint
2. Message routed to coordinator for classification
3. Coordinator calls Haiku (cheap) to classify task type, complexity, required tools
4. Coordinator selects appropriate skill based on classification
5. Coordinator selects execution model (Sonnet/Opus) based on complexity + risk level
6. Skill executes with selected model using Agent SDK
7. Skill calls tools and integrations as needed
8. Governance layer intercepts: rate limits, detects anomalies, redacts PII
9. Results persisted to database via repositories
10. User notified via Telegram or integration webhook

**Task Processor Loop:**

1. `startTaskLoop()` spawns background processor (if `ENABLE_TASK_PROCESSOR=true`)
2. Processor polls database at interval (default: 5000ms)
3. Fetches pending tasks with `processNextTask()`
4. Routes task through coordinator → skill → executor
5. Updates task status in database
6. Sends notifications to Telegram if configured
7. Loops until `stopTaskLoop()` called

**State Management:**

- User/org state: Database tables (contacts, organizations, leads, invoices, proposals)
- Agent state: AgentConfig, AgentRun tables with results, token counts, decisions
- Governance state: Rate limit buckets, circuit breaker states, anomaly records
- Transient state: In-memory during execution (messages, tool calls)

## Key Abstractions

**Task Classification:**
- Purpose: Determine which skill handles a task
- Examples: `src/agent/coordinator.ts` line 22-39 (CLASSIFIER_PROMPT)
- Pattern: Haiku classifies to one of {rd_scout, gatekeeper, ops_officer, general}

**Model Tiering:**
- Purpose: Cost-effective model selection
- Examples: `src/agent/models.ts` (MODELS, selectModel())
- Pattern: Simple→Haiku, Standard→Sonnet, Complex→Opus; critical risk always Opus

**Skill Registry:**
- Purpose: Centralized skill definitions and metadata
- Examples: `src/skills/registry.ts`, `src/skills/{skill}/index.ts`
- Pattern: Each skill exports handler and definition; registry maps SkillType → handler

**Repository Pattern:**
- Purpose: Database query abstraction
- Examples: `src/db/repositories/{approvals,invoices,tasks,suppliers}.ts`
- Pattern: One repo per entity type; methods for find, create, update, delete

**Channel Adapter:**
- Purpose: Unified interface for external communication channels
- Examples: `personal-assistant/src/lib/channels/{gmail,outlook,imessage}.ts`
- Pattern: pull() fetches inbound, send() sends outbound, isAvailable() checks auth

## Entry Points

**Main HTTP Server:**
- Location: `src/index.ts` (main())
- Triggers: Node process start
- Responsibilities: Initialize database, start task processor, handle HTTP requests

**Task Processing Loop:**
- Location: `src/agent/processor.ts` (startTaskLoop)
- Triggers: If ENABLE_TASK_PROCESSOR=true at startup
- Responsibilities: Poll database, route tasks, execute, persist results

**Telegram Webhook:**
- Location: `src/telegram/index.ts` (handleTelegramWebhook)
- Triggers: POST /telegram/* from Telegram
- Responsibilities: Parse Telegram updates, dispatch to coordinator, send replies

**ClickUp Webhook:**
- Location: `src/integrations/clickup/index.ts` (handleClickUpWebhook)
- Triggers: POST /clickup/webhook from ClickUp
- Responsibilities: Parse task payload, route to skill, update ClickUp task

**Health Check:**
- Location: `src/api/health.ts` (healthCheck)
- Triggers: GET /health from load balancer
- Responsibilities: Check database, integrations, governance status

## Error Handling

**Strategy:** Layered error containment with fallback behavior.

**Patterns:**

**Governance-level (innermost):** Rate limit exceeded → return error before execution. Anomaly detected → escalate or kill switch.

**Agent-level:** Model timeout → return partial result. Tool call fails → retry or fallback to "unable to complete".

**Skill-level:** Database query fails → return error in result. External API timeout → queue for retry.

**HTTP-level (outermost):** Unhandled exception → log error, return 500, don't crash server.

**Implementation:** Try-catch blocks at skill boundaries; async error handlers in request processing; safe logging (PII redacted) to prevent credential leaks.

## Cross-Cutting Concerns

**Logging:** `createSafeLogger()` wraps all console output. Redacts PII using configured patterns (emails, phone, SSN patterns). Levels: info, warn, error, debug.

**Validation:** Input validation at HTTP endpoint, task payload parsing. Zod schemas for structured types (InvoiceSchema, etc.). Type-safe coordinator prompts.

**Authentication:** External integrations use environment variables (ANTHROPIC_API_KEY, CLICKUP_API_TOKEN, etc.). Supabase auth for personal-assistant dashboard. No credentials in code.

**Rate Limiting:** Per-organization limits configured in governance. Tracks API calls, tool executions. Escalates to alerts when approaching limits.

**Audit Trail:** AgentRun table records every task execution: inputs, outputs, tools called, tokens used, confidence scores, routing decisions, approval status.

---

*Architecture analysis: 2026-02-19*
