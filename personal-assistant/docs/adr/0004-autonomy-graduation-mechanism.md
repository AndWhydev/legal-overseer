# ADR-0004: Autonomy Graduation Mechanism for Tool Promotion

## Status

Accepted

## Context

BitBit's tools have static autonomy levels (L4_silent through L1_approve). High-stakes tools like send_email are fixed at L2_propose, meaning every email requires explicit user approval via the approval queue. This is safe but creates friction as the user builds trust with the system.

The confidence calibrator already runs nightly and adjusts routing thresholds based on outcome data. The question: how should individual tools graduate to higher autonomy levels?

## Decision

Implement automatic **autonomy graduation** where tools promote from L2_propose to L3_notify when they accumulate 20+ approved outcomes with 95%+ approval rate over the last 30 days.

### Mechanism

1. Nightly calibration cron checks per-tool approval rates in `action_outcomes`
2. Tools matching graduation criteria get promoted via `organisations.settings.autonomy_overrides`
3. `getAutonomyLevel()` checks org overrides first, so the promotion takes effect immediately
4. **Safety cap**: Tools can only graduate to L3_notify (act + notify user), never L4_silent

### Graduation Candidates

Only high-impact L2 tools: `send_email`, `send_gmail`, `send_outlook`, `send_sms`

## Rationale

- **Data-driven trust**: The system proves it makes good decisions before gaining autonomy
- **Per-org**: Different users may have different trust levels
- **Reversible**: An admin can remove the override to demote a tool back to L2
- **L3 ceiling**: Email sending always notifies the user, even when autonomous. L4 (silent) would be unsafe for external communications.
- **20 samples / 95% rate**: Borrowed from the calibrator's own thresholds (MIN_SAMPLES_PER_BAND=20, ACT_APPROVAL_RATE=0.95)

## Consequences

### Positive
- BitBit becomes more autonomous over time without code changes
- User friction decreases as trust is established
- Graduation is transparent (logged, visible in org settings)

### Negative
- Seeded data could trigger premature graduation (mitigated: only organic outcomes from real tool executions, seeded data uses threshold_source='seed')
- A run of approved low-quality emails could graduate the tool (mitigated: was_correct flag provides secondary quality signal)
- Users may not realize the system graduated (mitigated: L3 always notifies)
