---
phase: 22-comms-role
plan: 02
subsystem: comms
tags: [follow-up-tracker, relationship-monitor, tone-adaptation, engagement-drops, sla-thresholds]

# Dependency graph
requires:
  - phase: 22-comms-role
    provides: "Comms role evaluate() and CommsState from plan 22-01"
  - phase: 20-role-engine-foundation
    provides: "RoleInsight, RoleAction interfaces for surfacing findings"
provides:
  - "Follow-up tracker detecting unanswered threads with configurable SLA thresholds"
  - "Relationship monitor with per-client communication frequency analysis and engagement drop detection"
  - "Tone adapter learning client communication style and adapting draft responses"
  - "Integration into comms evaluate() for follow-up, relationship, and client health checks"
affects: [22-03, comms-role-evaluate, role-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SLA-based urgency scoring with configurable thresholds per priority level", "Baseline comparison for engagement drop detection (50% threshold)", "Heuristic tone analysis: formality scoring, verbosity by average length, greeting/sign-off pattern detection"]

key-files:
  created:
    - "personal-assistant/src/lib/roles/comms/follow-up-tracker.ts"
    - "personal-assistant/src/lib/roles/comms/relationship-monitor.ts"
    - "personal-assistant/src/lib/roles/comms/tone-adapter.ts"
  modified:
    - "personal-assistant/src/lib/roles/comms/comms-role.ts"

key-decisions:
  - "Default SLA thresholds: critical 2h, high 8h, medium 24h, low 72h"
  - "Follow-up tracker uses entity_timeline message_sent events to determine if a thread has been answered"
  - "Relationship monitor uses 4-week lookback for frequency analysis; health thresholds: active >= 1 msg/week, cooling >= 0.25 msg/week, dormant below"
  - "Engagement drop detection requires 50% decrease and baseline >= 0.5 msgs/week to flag"
  - "Silent contacts (in baselines but not in current data) flagged as 100% drop with dormant status"
  - "Tone learning requires minimum 3 messages from contact; analyzes formality indicators (dear/sincerely vs hey/cheers), verbosity by avg body length, greeting/sign-off patterns"
  - "Tone adaptation: casual removes Dear/Kind regards, formal removes Hey/Cheers; concise removes filler phrases when draft > 300 chars"
  - "Client health insights integrated via computeClientHealth() from intelligence layer"

patterns-established:
  - "SLAThresholds interface with per-urgency hour thresholds"
  - "UnansweredThread interface with contactId, topic, channel, hoursWaiting, urgency, suggestedAction"
  - "CommunicationFrequency / EngagementDrop / CommsHealthStatus types for relationship monitoring"
  - "ToneProfile interface: formality (formal/neutral/casual), verbosity (concise/moderate/verbose), preferredGreeting, preferredSignOff, samplePhrases"
  - "ToneAdaptation interface returning originalDraft, adaptedDraft, profileApplied, adaptations list"
  - "Characteristic phrase extraction: sentences appearing in 2+ messages, capped at 5"

requirements-completed: []

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 22 Plan 02: Follow-Up Tracking + Relationship Monitoring Summary

**Follow-up tracker with SLA-based urgency scoring, per-client communication frequency monitoring with engagement drop detection, and heuristic tone learning/adaptation for draft responses**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 4

## Accomplishments
- Follow-up tracker (follow-up-tracker.ts) with detectUnansweredThreads() querying channel_messages and entity_timeline to find unanswered inbound threads exceeding SLA thresholds
- Urgency scoring combining message priority and hours waiting against configurable SLA thresholds (critical: 2h, high: 8h, medium: 24h, low: 72h)
- Results sorted by urgency (critical first) then by hours waiting (longest first)
- Relationship monitor (relationship-monitor.ts) with monitorCommunicationFrequency() analyzing 4-week message history, grouping by contact, calculating messages-per-week rate and health status
- Engagement drop detection via detectEngagementDrops() comparing current rates against stored baselines, flagging 50%+ decreases and completely silent contacts
- Tone adapter (tone-adapter.ts) with learnClientTone() analyzing formality (formal indicators like "dear"/"sincerely" vs casual indicators like "hey"/"cheers"), verbosity (by average body length), greeting/sign-off patterns, and characteristic phrases
- adaptDraft() transforming draft responses to match contact style: casualizing/formalizing greetings and sign-offs, removing filler phrases for concise contacts
- Integration into comms evaluate(): follow-up check surfaces overdue threads as draft_response actions (copilot/autopilot) or insights (observer), relationship monitoring flags engagement drops, client health insights via computeClientHealth()

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: 22-comms-role*
*Completed: 2026-03-26*
