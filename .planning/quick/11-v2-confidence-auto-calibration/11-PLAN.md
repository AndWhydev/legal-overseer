---
phase: Q11
plan: 01
type: quick-task
autonomous: true
---

# Quick Task 11: v2.0 Confidence Auto-Calibration

## Objective
Build confidence auto-calibration system that dynamically adjusts agent confidence thresholds based on user approve/reject patterns, enabling BitBit to earn more autonomy as it proves itself.

## Tasks

### Task 1: Database migration for action_outcomes table
- type: auto
- Create migration 064_action_outcomes.sql
- Table: action_outcomes (id, org_id, agent_type, action_type, confidence_score, was_approved, was_correct, created_at)
- Add calibrated_thresholds JSONB column to agent_configs
- Add indexes for efficient calibration queries

### Task 2: Confidence calibrator module
- type: auto
- Create personal-assistant/src/lib/intelligence/confidence-calibrator.ts
- recordActionOutcome(): logs outcomes to action_outcomes table
- calibrateThresholds(): analyzes last 30 days, calculates optimal thresholds by band
- Safety rails: act >= 0.70, ask >= 0.45, minimum 20 samples per band

### Task 3: Integration with confidence router
- type: auto
- Modify routeAgentAction to check calibrated thresholds before static ones
- New cascade: calibrated (if sufficient samples) > agent config > agent type > org > defaults
- Log threshold source in routing result

### Task 4: Calibration cron endpoint
- type: auto
- Create /api/cron/calibrate-confidence/route.ts
- Daily cron using withCronGuard
- Iterate orgs, recalculate thresholds for each agent type with 20+ outcomes
- Store calibrated thresholds in agent_configs.calibrated_thresholds

### Task 5: Wire approve/reject to outcome tracking
- type: auto
- In resolveApproval (approval-queue.ts): call recordActionOutcome on approve/reject
- In auto-executed actions (tools.ts): call recordActionOutcome with wasApproved: true

### Task 6: Calibration API endpoint
- type: auto
- GET /api/confidence/calibration: returns calibration status per agent for current org

### Task 7: Unit tests
- type: auto
- At least 6 tests covering threshold calculation, safety rails, edge cases

## Success Criteria
- Calibration system correctly computes thresholds from outcome data
- Safety rails prevent thresholds going dangerously low
- Cron endpoint runs daily to recalculate
- Approve/reject actions tracked as outcomes
- API exposes calibration status for trust dashboard
