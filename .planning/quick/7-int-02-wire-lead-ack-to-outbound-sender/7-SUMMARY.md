---
phase: quick
plan: 7
subsystem: lead-acknowledgment
tags: [integration, email, lead-ack, resend, outbound]
dependency-graph:
  requires: [email-transport, lead-acknowledgment, whatsapp-channel]
  provides: [email-lead-ack-delivery]
  affects: [lead-swarm, approval-queue]
tech-stack:
  added: []
  patterns: [multi-channel-delivery, channel-set-routing]
key-files:
  created: []
  modified:
    - personal-assistant/src/lib/email/email-transport.ts
    - personal-assistant/src/lib/agent/lead-acknowledgment.ts
    - personal-assistant/src/lib/agent/lead-acknowledgment.test.ts
decisions:
  - "Email channels (gmail, email, outlook, mail) routed via Resend; WhatsApp via Meta Cloud API"
  - "sendLeadAckEmailToRecipient sends TO the lead (outbound), distinct from sendLeadAckEmail which notifies Andy (internal)"
  - "Channel routing uses Set lookup for O(1) email channel detection"
metrics:
  duration: 3min
  completed: 2026-03-12
---

# Quick Task 7: INT-02 Wire Lead Auto-Approve Ack to Outbound Email Sender

Email-channel lead acks now deliver via Resend using sendLeadAckEmailToRecipient, closing the INT-02 integration gap where attemptAckDelivery only supported WhatsApp and returned unsupported_channel for all email leads.

## What Changed

### Task 1: Added sendLeadAckEmailToRecipient to email-transport.ts (11e0fe93)

Added a new exported function `sendLeadAckEmailToRecipient(recipientEmail, draftBody, orgName?)` that sends the acknowledgment message directly TO the lead's email address via Resend. This is distinct from the existing `sendLeadAckEmail` which sends a notification to Andy about the lead. The new function returns the Resend message ID string on success or null on failure.

**Files modified:** `personal-assistant/src/lib/email/email-transport.ts`

### Task 2: Wired email channels into attemptAckDelivery + tests (4b2f0673)

Modified `attemptAckDelivery` in `lead-acknowledgment.ts` to route email-type channels (gmail, email, outlook, mail) through the new `sendLeadAckEmailToRecipient` function. The WhatsApp path remains unchanged. Added 4 new test cases covering:

- Email ack delivery success via approved gmail lead
- Email ack delivery failure when Resend returns null
- Auto-approve email lead within SLA delivers via email transport
- Auto-approve email lead records failure metadata when Resend fails

All 14 tests pass (7 original + 4 new email + 3 existing).

**Files modified:** `personal-assistant/src/lib/agent/lead-acknowledgment.ts`, `personal-assistant/src/lib/agent/lead-acknowledgment.test.ts`

## Decisions Made

1. **Channel routing via Set lookup:** Used `EMAIL_CHANNELS = new Set(['email', 'gmail', 'outlook', 'mail'])` for O(1) lookup instead of string comparison chain. Extensible for future email providers.

2. **Separate outbound function:** Created `sendLeadAckEmailToRecipient` as a distinct function rather than modifying `sendLeadAckEmail`, because they serve fundamentally different purposes (outbound to lead vs internal notification to owner).

3. **Channel set includes 'outlook' and 'mail':** Proactively included additional email channel identifiers that may appear from other ingestion sources, preventing future unsupported_channel failures.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx vitest run lead-acknowledgment` -- 14/14 tests pass
- `npx tsc --noEmit` -- zero errors
- Email leads no longer return `unsupported_channel` from attemptAckDelivery

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 11e0fe93 | Add sendLeadAckEmailToRecipient for outbound lead ack delivery via Resend |
| 2 | 4b2f0673 | Wire email channel delivery into attemptAckDelivery + add email ack tests |
