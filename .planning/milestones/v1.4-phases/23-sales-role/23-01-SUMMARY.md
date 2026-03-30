---
phase: 23-sales-role
plan: 01
subsystem: roles/sales
tags: [sales, lead-swarm, proposal-bot, role-engine, wrap-dont-rewrite]

# Dependency graph
requires:
  - phase: 08-agent-runtime
    provides: "role-registry, role-runtime, RoleImplementation interface"
  - phase: 11-lead-swarm-agent
    provides: "runLeadSwarmTick, LeadSwarmTickResult"
  - phase: 12-invoice-flow-agent
    provides: "proposal-bot tick, generateProposal, ProposalBrief"
provides:
  - "salesRole RoleImplementation registered via registerRole()"
  - "runWrappedLeadTick() -- lead swarm to role action/insight translation"
  - "runWrappedProposalTick() -- proposal bot to role action/insight translation"
  - "fetchPricingContext() -- historical pricing intelligence from invoices/proposals"
  - "generateProposalWithContext() -- enhanced proposal generation with median pricing baseline"
  - "SalesState interface for role_states.state JSONB"
affects: [role-registry, role-scheduler, role-runtime]

# Tech tracking
tech-stack:
  added: []
  patterns: [wrap-dont-rewrite, role-action-mapping, pricing-intelligence]

key-files:
  created:
    - "personal-assistant/src/lib/roles/sales/sales-role.ts"
    - "personal-assistant/src/lib/roles/sales/lead-wrapper.ts"
    - "personal-assistant/src/lib/roles/sales/proposal-generator.ts"
    - "personal-assistant/src/lib/roles/sales/index.ts"
  modified:
    - "personal-assistant/src/lib/roles/index.ts"

key-decisions:
  - "Wrap existing lead-swarm.ts and proposal-bot.ts via adapter layer -- no rewrites"
  - "SalesState typed interface for role_states.state JSONB with backward-compat optional fields"
  - "Pricing intelligence queries invoices (paid/sent/viewed) and proposals (accepted/sent/viewed) for historical median"
  - "Lead wrapper translates LeadSwarmTickResult into lead_created, lead_ack_sent actions and hot-lead insights"
  - "Proposal wrapper translates ProposalBotTickResult into proposal_processed, proposal_follow_up actions"
  - "30-minute tick interval, $4/day budget, copilot autonomy as defaults"

patterns-established:
  - "WrappedTickResult pattern: { actions: RoleAction[], insights: RoleInsight[], raw: T | null }"
  - "PricingContextItem: { projectType, clientName, amount, date, source } from historical data"
  - "getSalesState() type-safe accessor with null/default coalescing for all fields"
  - "Auto-registration via registerRole() at module scope, triggered by import in roles/index.ts"

requirements-completed: [SALES-01, SALES-02, SALES-03]

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 23 Plan 01: Sales Role Core -- Lead Wrapper, Proposal Generator, Role Registration Summary

**Implemented the sales domain role wrapping existing lead-swarm and proposal-bot agents into the role engine with pricing intelligence.**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 5

## Accomplishments
- Created `salesRole` RoleImplementation with `evaluate()`, `hasChanges()`, `defaultConfig()`, and `getWorkflowStepDefs()` methods
- Built `lead-wrapper.ts` adapter translating `LeadSwarmTickResult` into `RoleAction[]` and `RoleInsight[]` (lead_created, lead_ack_sent actions; hot-lead and failure insights)
- Built `proposal-generator.ts` adapter translating `ProposalBotTickResult` into role actions (proposal_processed, proposal_follow_up)
- Added `fetchPricingContext()` querying historical invoices and accepted proposals for pricing intelligence
- Added `generateProposalWithContext()` that uses historical median pricing as budget baseline when no budget specified
- Defined `SalesState` interface with typed fields: last tick timestamps, active workflow IDs, pricing_patterns, cumulative stats
- Created `getSalesState()` safe accessor with null coalescing for backward compat
- Implemented `hasChanges()` pre-screen checking: unprocessed messages, approved sales actions, new leads, accepted proposals, ready workflows
- Registered sales role in `roles/index.ts` alongside finance and comms
- Barrel export in `sales/index.ts` re-exporting all public types and functions

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: 23-sales-role*
*Completed: 2026-03-26*
