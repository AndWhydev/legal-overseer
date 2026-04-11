# Agent Swarm — Requirements

## SWM-01: Swarm Definition Schema
Define swarms as JSON DAGs with agents, task graphs, and input/output contracts. Support parallel, sequential, and conditional step types.

## SWM-02: Swarm Templates
Store reusable swarm patterns in DB (`swarm_templates` table). Ship 3+ templates: Pitch Prep, Client Onboard, End-of-Month. Templates are runtime-creatable, not hardcoded.

## SWM-03: Swarm Execution Engine
Execute swarm definitions: spawn participants, manage step progression (parallel/sequential/conditional), handle failures, track cost per-swarm.

## SWM-04: Inter-Agent Message Bus
Agents within a swarm communicate findings via `swarm_messages` table with Supabase NOTIFY triggers for real-time updates.

## SWM-05: SwarmParticipant Interface
Each agent in a swarm implements `execute(context, findings) → SwarmResult`. Reuses existing role/agent infrastructure.

## SWM-06: Conflict Resolution & Negotiation
When agents disagree (e.g., Finance says "overcommitted" vs Sales says "pursue"), coordinator escalates to Sonnet with both perspectives for resolution.

## SWM-07: Coordinator Pattern
Haiku classifies intent → selects template → fills params → spawns agents. Cost-optimized: Haiku plans, Sonnet/Opus executes.

## SWM-08: Rollback & Reversibility
Each swarm step logs reversible actions. On failure, replay actions in reverse to undo partial work.

## SWM-09: Natural Language Triggers
"Onboard Acme Corp" or "Prepare for Thomson pitch" → auto-select template and fill parameters from context.

## SWM-10: Swarm Progress Dashboard
Live view of active swarms: step status, agent outputs, timeline, cost breakdown. Real-time updates via Supabase subscriptions.

## SWM-11: Cost Aggregation
Per-swarm cost tracking aggregated from individual agent runs. Budget guards prevent runaway swarms.

## SWM-12: Concurrency Control
Postgres advisory locks prevent duplicate swarm execution. Concurrent swarms for different orgs run independently.
