# Phase 51 — Deferred Items

## Out-of-scope test failures discovered during B2

### sms.test.ts — 5 failures, pre-existing (caused by A2 outbound guard)

**Introduced by:** commit `9e438770 feat(channels): A2 — outbound guard at every channel sender`

**Verified:** Failures reproduce on the B1 commit (`e5fad845`) with B2 changes stashed — so B2 did not cause them.

**Failures:**

- `SMS Adapter > sendSMS > should send message via Telnyx` — guard blocks `+61412345678` as non-allowlisted in test env.
- `SMS Adapter > sendSMS > should retry on rate limit` — same cause.
- `SMS Adapter > sendSMS > should format message for SMS` — mockFetch never called because guard short-circuits.
- `SMS Adapter > sendSMS > should handle API errors` — asserts error contains `'400'` but gets the guard block message.
- `SMS Adapter > sendSMS > should normalize phone number` — mockFetch never called.

**Why deferred:** Per Phase 51 executor guardrails for B1/B2, I cannot modify `sms.ts` or `guards.ts`. The fix belongs with whichever agent owns the A2 follow-up — tests need to either (a) allowlist their test recipient, or (b) mock the guard.

**Suggested fix (for A2 owner):** In `sms.test.ts`, call the guard's allowlist helper in `beforeEach`, or stub `outboundGuard` to pass-through for these tests.
