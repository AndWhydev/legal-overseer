---
phase: quick
plan: 7
type: integration-fix
autonomous: true
requirements: [LEAD-01]
---

# Quick Task 7: INT-02 Wire Lead Auto-Approve Ack to Outbound Email Sender

## Objective

Wire `attemptAckDelivery` in lead-acknowledgment.ts to actually deliver acknowledgment emails via Resend for email/gmail channel leads. Currently only WhatsApp is supported; all other channels return `unsupported_channel`, breaking the LEAD-01 sub-2-minute response SLA for email leads.

## Context

- `lead-acknowledgment.ts` has `attemptAckDelivery` which only handles `whatsapp` channel
- `email-transport.ts` has `sendLeadAckEmail` but it sends a notification TO Andy, not TO the lead
- Need a new outbound function that sends the ack draft TO the lead's email address
- Must respect approval-gated comms pattern (Quick Task 4): auto-approve creates approval record first, then delivers

## Tasks

### Task 1: Add outbound lead ack email sender to email-transport.ts
type="auto"

Add `sendLeadAckEmailToRecipient(recipientEmail, draftBody, orgName?)` to email-transport.ts that sends the acknowledgment message TO the lead via Resend. Returns the Resend message ID or null on failure.

**Done:** New exported function exists, sends to arbitrary recipient, returns message ID string or null.

### Task 2: Wire email channel into attemptAckDelivery + update tests
type="auto"

Modify `attemptAckDelivery` in lead-acknowledgment.ts to handle email/gmail channels by calling the new `sendLeadAckEmailToRecipient`. Update the test file with email delivery test cases (success + failure).

**Done:** `attemptAckDelivery` handles email/gmail channels, tests pass for both WhatsApp and email paths.

## Verification

- `npx vitest run lead-acknowledgment` passes with email delivery tests
- `npx tsc --noEmit` passes (or existing errors only)
- Email leads no longer return `unsupported_channel` from attemptAckDelivery

## Success Criteria

- Email-channel leads get their ack message delivered via Resend
- WhatsApp path unchanged
- Approval record still created before delivery (audit trail preserved)
- Tests cover email success, email failure, and missing-recipient cases
