# Swarm Orchestration Requirements

## SWM-01: Swarm Definition Schema
**Priority**: P0
Define the data model for swarm templates and instances. A swarm definition is a DAG of steps, each assigned to an agent role with typed input/output contracts. Templates are stored in DB (not hardcoded) for runtime creation.

**Acceptance**:
- `swarm_templates` table stores reusable swarm definitions with JSON DAG schema
- `swarm_runs` table tracks execution instances with status, cost, timing
- `swarm_steps` table tracks individual step execution within a swarm run
- `swarm_messages` table provides inter-agent message bus
- All tables have RLS scoped to `org_id`
- Step types: `parallel`, `sequential`, `conditional`

## SWM-02: Swarm Coordinator (Haiku Planner)
**Priority**: P0
Haiku-powered coordinator that classifies natural language triggers into swarm templates, fills parameters from context, and spawns agent teams. Only escalates to Sonnet/Opus for actual execution.

**Acceptance**:
- Natural language input resolves to correct template (e.g., "Prepare pitch for Thomson" -> pitch-prep template)
- Haiku extracts parameters from context (client name, project, etc.)
- Coordinator builds execution plan from template DAG
- Cost tracking: coordinator uses classification-tier model only

## SWM-03: Execution Engine
**Priority**: P0
Engine that executes swarm DAGs with parallel/sequential step handling, inter-agent communication, and atomic rollback.

**Acceptance**:
- Parallel steps execute via Promise.allSettled
- Sequential steps chain with output->input mapping
- Conditional steps evaluate predicates on prior step outputs
- Postgres advisory locks prevent duplicate swarm execution
- Each step logs reversible actions for rollback
- Failed swarm triggers rollback of all completed steps

## SWM-04: Inter-Agent Message Bus
**Priority**: P0
Agents within a swarm share findings via a message bus. Finance tells Sales "this client has outstanding invoices" before Sales sends a proposal.

**Acceptance**:
- `swarm_messages` table with NOTIFY trigger for real-time updates
- Agents can publish findings, warnings, blockers to the bus
- Downstream agents receive relevant upstream findings in their context
- Message types: `finding`, `warning`, `blocker`, `handoff`, `completion`

## SWM-05: Agent Negotiation
**Priority**: P1
Agents can push back on swarm tasks. Finance: "We're overcommitted this month" -> Sales adjusts timeline. Conflict resolution via priority weighting.

**Acceptance**:
- Agents can return `negotiation` result type with counter-proposal
- Coordinator evaluates negotiations and resolves conflicts
- Priority weighting determines which agent's position wins
- Escalation to Sonnet when negotiation cannot be resolved by rules

## SWM-06: Swarm Templates (3+)
**Priority**: P0
Pre-defined swarm patterns for common operations.

**Acceptance**:
- **Pitch Prep**: Sales gathers history, Finance pulls payment data, Comms drafts outreach
- **Client Onboarding**: Setup project, create contacts, draft welcome email, schedule kickoff
- **End-of-Month**: Generate outstanding invoices, compile hours, produce revenue report
- Templates stored in `swarm_templates` table
- Templates can be created/modified at runtime

## SWM-07: Swarm Dashboard
**Priority**: P1
Visual dashboard showing active swarms with per-agent status and execution timeline.

**Acceptance**:
- Tab in dashboard showing active/completed/failed swarms
- Per-swarm detail view with step timeline
- Agent status indicators (pending, running, complete, failed, negotiating)
- Cost breakdown per swarm
- Glassmorphic design matching existing BitBit aesthetic

## SWM-08: Swarm API Routes
**Priority**: P0
REST API for swarm management.

**Acceptance**:
- POST `/api/swarm/trigger` - Natural language trigger or template selection
- GET `/api/swarm/runs` - List swarm runs with filtering
- GET `/api/swarm/runs/[id]` - Get swarm run detail with steps and messages
- POST `/api/swarm/runs/[id]/rollback` - Rollback a swarm run
- GET `/api/swarm/templates` - List available templates
- POST `/api/swarm/templates` - Create custom template

## SWM-09: Cost Optimization
**Priority**: P1
Swarm coordinator uses Haiku for planning. Per-swarm cost aggregation.

**Acceptance**:
- Coordinator planning uses `classification` model tier (Haiku)
- Agent execution uses appropriate tier per step complexity
- Per-swarm total cost tracked in `swarm_runs.total_cost`
- Per-step cost tracked in `swarm_steps.cost_estimate`

## SWM-10: Learning & Reinforcement
**Priority**: P2
Swarms that produce good outcomes have patterns reinforced.

**Acceptance**:
- Outcome scoring on swarm completion (success/partial/failed)
- Template effectiveness tracking (success rate, avg duration, avg cost)
- Templates with high success rates prioritized in matching
