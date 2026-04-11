---
phase: 23-sales-role
plan: 02
subsystem: roles/sales
tags: [sales, nurture, onboarding, workflows, multi-step-cadence]

# Dependency graph
requires:
  - phase: 23-sales-role
    provides: "salesRole skeleton, SalesState interface (plan 01)"
  - phase: 08-agent-runtime
    provides: "WorkflowDefinition, WorkflowStepDef, WorkflowStepContext, workflow-executor"
provides:
  - "checkStaleLeads() -- find qualified leads gone cold after N days"
  - "checkStaleProposals() -- find sent proposals not viewed after N days"
  - "createNurtureWorkflow() -- multi-step nurture cadence for leads or proposals"
  - "NURTURE_SCHEDULE -- configurable lead_nurture and proposal_nurture step cadences"
  - "checkNewConversions() -- detect accepted proposals without onboarding"
  - "createOnboardingWorkflow() -- 5-step onboarding workflow for converted leads"
  - "SalesState extensions: active_nurture_workflows, active_onboarding_workflows"
affects: [sales-role evaluate(), workflow-executor, approval-queue]

# Tech tracking
tech-stack:
  added: []
  patterns: [multi-step-workflow, nurture-cadence, conversion-detection, approval-gated-nurture]

key-files:
  created:
    - "personal-assistant/src/lib/roles/sales/lead-nurture.ts"
    - "personal-assistant/src/lib/roles/sales/client-onboarding.ts"
  modified:
    - "personal-assistant/src/lib/roles/sales/sales-role.ts"

key-decisions:
  - "Lead nurture 3-step cadence: gentle_checkin (d0), value_add (d7), final_outreach (d14)"
  - "Proposal nurture 3-step cadence: soft_follow_up (d0), case_study (d4), last_chance (d7)"
  - "Onboarding 5-step sequence: trigger_onboarding, welcome_email, kickoff_scheduling (d1), credential_request (d2), project_setup (d3)"
  - "Max 3 nurture attempts per lead, max 2 follow-ups per proposal before stopping"
  - "All nurture emails routed through approval queue with action_type nurture_email"
  - "Observer autonomy level produces insights only; copilot/autopilot starts workflows"
  - "Conversion detection checks both onboardings table and role_workflows for duplicates"
  - "Onboarding delegates to existing triggerOnboardingFromProposal() and runOnboardingTick()"

patterns-established:
  - "NURTURE_SCHEDULE const with stepId, name, delayDays per workflow type"
  - "StaleLead / StaleProposal interfaces for stale-detection query results"
  - "ConversionEvent interface: proposalId, proposalTitle, clientName, clientContactId, clientEmail, projectType, acceptedAt"
  - "Workflow step execution via createApproval() with context_snapshot for audit trail"
  - "Nurture attempt counter tracked in lead metadata.nurture_attempts JSONB field"
  - "getNurtureStepDefs() / getOnboardingStepDefs() returning WorkflowStepDef[] with delay and execute functions"

requirements-completed: [SALES-04, SALES-05, SALES-06]

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 23 Plan 02: Lead Nurture Cadence and Client Onboarding Workflows Summary

**Implemented multi-step nurture workflows for stale leads/proposals and automated client onboarding triggered by proposal acceptance.**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 3

## Accomplishments
- Built `lead-nurture.ts` with configurable stale-detection queries for leads (qualified/contacted, inactive N days) and proposals (sent, not viewed N days)
- Implemented `NURTURE_SCHEDULE` with 3-step lead nurture (gentle_checkin, value_add, final_outreach) and 3-step proposal nurture (soft_follow_up, case_study, last_chance)
- Created `createNurtureWorkflow()` producing `WorkflowDefinition` with typed context (targetType, targetId, contactName, contactEmail, score/title)
- Built `executeNurtureStep()` routing all nurture emails through approval queue with action_type `nurture_email`
- Implemented nurture attempt tracking via lead `metadata.nurture_attempts` JSONB field, capped at 3 attempts
- Built `client-onboarding.ts` with `checkNewConversions()` detecting accepted proposals lacking an onboarding record or role workflow
- Created `createOnboardingWorkflow()` with 5-step sequence: trigger_onboarding (d0), welcome_email (d0), kickoff_scheduling (d1), credential_request (d2), project_setup (d3)
- Onboarding step execution delegates to existing `triggerOnboardingFromProposal()` and `runOnboardingTick()` from `@/lib/agent/client-onboarding`
- Extended `SalesState` with `active_nurture_workflows`, `active_onboarding_workflows`, `last_nurture_scan_at`, `last_onboarding_check_at`
- Wired nurture and onboarding into `salesRole.evaluate()` as sections 3 and 4, with observer/copilot autonomy branching
- Implemented `getWorkflowStepDefs()` and `getWorkflowStepDef()` on salesRole for runtime workflow resumption

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: 23-sales-role*
*Completed: 2026-03-26*
