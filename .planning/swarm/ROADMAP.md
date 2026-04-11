# Agent Swarm — Roadmap

## Phase 26: Swarm Schema & Core Types
**Goal**: Database tables, TypeScript types, and SwarmParticipant interface
**Requirements**: SWM-01, SWM-02, SWM-04, SWM-05, SWM-12
**Deliverables**:
- Migration 140: swarm_definitions, swarm_runs, swarm_steps, swarm_messages, swarm_templates
- TypeScript types for all swarm entities
- SwarmParticipant interface
- RLS policies on all tables

## Phase 27: Swarm Execution Engine
**Goal**: Execute swarm definitions with parallel/sequential/conditional steps
**Requirements**: SWM-03, SWM-06, SWM-08, SWM-11
**Deliverables**:
- Swarm coordinator (spawn, step progression, cost tracking)
- Step executors (parallel, sequential, conditional)
- Conflict resolution via Sonnet escalation
- Rollback engine
- Message bus integration

## Phase 28: Templates & NL Triggers
**Goal**: Pre-built templates and natural language swarm activation
**Requirements**: SWM-02, SWM-07, SWM-09
**Deliverables**:
- 3 templates: Pitch Prep, Client Onboard, End-of-Month
- Haiku coordinator: intent → template → params → spawn
- API routes: /api/swarm/

## Phase 29: Swarm Dashboard
**Goal**: Real-time swarm monitoring UI
**Requirements**: SWM-10
**Deliverables**:
- Swarm list view with status cards
- Swarm detail view with step timeline
- Real-time updates via Supabase subscriptions
- Cost breakdown per swarm
