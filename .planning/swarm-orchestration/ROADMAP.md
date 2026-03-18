# Swarm Orchestration Roadmap

## Phase 26: Core Schema & Types (SWM-01)
- Database migration: swarm_templates, swarm_runs, swarm_steps, swarm_messages
- RLS policies for all tables
- TypeScript types and interfaces for swarm system
- Swarm definition JSON schema (DAG with typed steps)

## Phase 27: Execution Engine & Message Bus (SWM-03, SWM-04)
- SwarmExecutor: DAG walker with parallel/sequential/conditional step execution
- Inter-agent message bus with pub/sub
- Postgres advisory locks for execution safety
- Rollback engine for atomic undo
- Integration with existing agent engine (runAgentChat)

## Phase 28: Coordinator & Templates (SWM-02, SWM-06)
- Haiku-powered coordinator for NL trigger classification
- Parameter extraction from context
- 3 built-in templates: Pitch Prep, Client Onboarding, End-of-Month
- Template CRUD operations
- Seed templates for AWU org

## Phase 29: API & Dashboard (SWM-07, SWM-08, SWM-09)
- REST API routes under /api/swarm/
- Swarm dashboard tab with timeline visualization
- Agent negotiation basics (SWM-05)
- Cost tracking and optimization
- Module registry integration

## Phase 30: Polish & Learning (SWM-05, SWM-10)
- Full agent negotiation with conflict resolution
- Template learning/reinforcement
- Chat integration (trigger swarms from chat)
- TypeScript compilation verification
