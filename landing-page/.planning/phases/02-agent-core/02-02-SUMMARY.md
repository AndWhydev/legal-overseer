---
phase: 02-agent-core
plan: 02
subsystem: api
tags: [claude, confidence-routing, policy-engine, message-intent]

# Dependency graph
requires:
  - phase: 02-agent-core/01
    provides: [agent endpoint, tool use loop, session tracking]
provides:
  - Policy-aware system prompt with sender-specific roles
  - Confidence extraction from Claude responses
  - Escalation trigger detection (legal/safety/chargeback)
  - Message intent classification (12 categories)
  - Sender-specific routing logic (xixi/allen queues)
affects: [02-agent-core/03, 03-conversation-interface]

# Tech tracking
tech-stack:
  added: []
  patterns: [confidence-extraction, escalation-triggers, intent-detection, sender-routing]

key-files:
  created:
    - lib/agent/prompt.ts
    - lib/agent/confidence.ts
    - lib/agent/routing.ts
  modified:
    - lib/agent/types.ts
    - app/api/agent/route.ts

key-decisions:
  - "Confidence extraction uses explicit patterns (Confidence: HIGH/MEDIUM/LOW) + implicit indicators"
  - "Escalation triggers checked BEFORE Claude call to catch obvious cases early"
  - "12 intent categories: wismo, return, complaint, safety_complaint, product_question, delivery_issue, stock_issue, shipping_exception, content_approval, wholesale, media_request, general"
  - "Auto-resolve only for customer WISMO + product questions with high confidence"

patterns-established:
  - "Sender-aware prompts: different instructions for customer/xixi/allen"
  - "Two-stage confidence: pre-check triggers + response extraction"
  - "Routing decision included in response for UI consumption"

issues-created: []

# Metrics
duration: 5min
completed: 2026-01-29
---

# Phase 02-02: Policy-Aware Decisions Summary

**Confidence extraction + escalation triggers + sender-specific routing for CheekyGlo policy compliance**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-29T11:02:45Z
- **Completed:** 2026-01-29T11:07:47Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

- Policy-aware system prompt builder with sender-specific roles (customer/xixi/allen)
- Confidence extraction that parses Claude responses for explicit and implicit indicators
- Escalation trigger detection for legal, safety, chargeback, fraud patterns
- Intent detection with 12 categories mapped from message patterns
- Routing logic that determines queue (xixi/allen/auto) and auto_resolve status

## Task Commits

Each task was committed atomically:

1. **Task 1: Create comprehensive system prompt** - `0498442` (feat)
2. **Task 2: Add confidence extraction and routing** - `76a3110` (feat)
3. **Task 3: Add sender-specific routing logic** - `2a6c50d` (feat)

**Plan metadata:** `0068f68` (docs: complete plan)

## Files Created/Modified

- `lib/agent/prompt.ts` - buildSystemPrompt(senderType) with policies, confidence guidance, response format
- `lib/agent/confidence.ts` - ConfidenceAssessment interface, extractConfidence(), checkEscalationTriggers()
- `lib/agent/routing.ts` - RoutingDecision interface, detectIntent(), determineRouting()
- `lib/agent/types.ts` - Added AgentRouting interface
- `app/api/agent/route.ts` - Integrated all modules, sender-aware prompts, confidence + routing in response

## Key Features

### Confidence Extraction
- **Explicit patterns:** "Confidence: HIGH (85%)", "MEDIUM confidence"
- **Implicit indicators:** "certain", "sure", "clearly" → HIGH; "possibly", "maybe" → MEDIUM; "uncertain", "unclear" → LOW
- **Default:** 70 (medium) if no indicators found

### Escalation Triggers (checked before Claude call)
| Pattern | Reason |
|---------|--------|
| legal, lawyer, sue | Legal threat |
| chargeback, dispute, bank | Payment dispute |
| allergic, injured, sick, reaction | Safety complaint |
| influencer contract | Influencer issue |
| ACCC, ombudsman | Regulatory complaint |
| scam, fraud, stolen | Fraud accusation |

### Intent Detection (12 categories)
- wismo, return, complaint, safety_complaint, product_question
- delivery_issue, stock_issue, shipping_exception
- content_approval, wholesale, media_request, general

### Routing Rules
| Sender | Intent | Confidence | Route |
|--------|--------|------------|-------|
| customer | wismo | >80 | auto_resolve |
| customer | product_question | >80 | auto_resolve |
| customer | return/complaint | any | xixi queue |
| customer | safety | any | xixi (ALWAYS escalate) |
| xixi | stock_issue | any | allen queue |
| allen | complaint | any | xixi queue |

## Decisions Made

- Confidence extraction uses regex patterns matching Claude's structured output format
- Escalation triggers run before Claude call to catch obvious cases immediately
- Auto-resolve limited to high-confidence WISMO and product questions only
- Safety complaints NEVER auto-resolve, always routed to Xixi

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Confidence extraction and routing fully functional
- Ready for Plan 03: Action Execution refinements
- After Phase 2: Conversation Interface will display routing decisions

---
*Phase: 02-agent-core*
*Completed: 2026-01-29*
