# Phase 40: Multimodal Web Automation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 40-multimodal-web-automation
**Areas discussed:** Browser engine choice, Vision execution loop, Security & isolation, Evidence & reporting

---

## Browser Engine Choice

### Q1: CUA + Playwright on Fly.io still the plan?

| Option | Description | Selected |
|--------|-------------|----------|
| CUA + Playwright on Fly.io | Self-hosted headless Chromium. Full control, ~$5-10/mo. | |
| Stagehand + Browserbase | Managed browser infra. Less custom code, per-session costs. | |
| Anthropic CUA API directly | Send screenshots, get actions. Playwright executes. Simplest. | |
| You decide | Claude evaluates tradeoffs. | ✓ |

**User's choice:** You decide
**Notes:** "This includes the research about how we're using visual model browsers right and not md agent context browsers." Research must evaluate vision-based vs accessibility-tree paradigms.

---

## Vision Execution Loop

### Q2: Confirmation before browser actions?

| Option | Description | Selected |
|--------|-------------|----------|
| Fully autonomous | Navigate and act without asking. Report results after. | ✓ |
| Confirm high-stakes only | Autonomous for reading, confirm for forms/payments/messages. | |
| You decide | Design based on autonomy levels system. | |

**User's choice:** Fully autonomous
**Notes:** Consistent with Phase 38 "pure intelligence" pattern.

### Q3: Self-healing when page layout changes?

| Option | Description | Selected |
|--------|-------------|----------|
| Vision model finds equivalents | Claude looks at screenshot and finds semantic equivalent. | |
| Vision + accessibility tree fallback | Try vision first, fall back to DOM parsing. | |
| You decide | Pick most reliable based on CUA research. | |

**User's choice:** Other -- "Shouldn't the provider have this infra in place? Or are we custom managing all of this stuff"
**Notes:** Provider should handle self-healing natively. Don't build custom self-healing on top.

---

## Security & Isolation

### Q4: Credential injection approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Composio integration | Managed auth service for OAuth flows and session injection. | |
| 1Password / vault injection | Pull from 1Password vault via op CLI. | |
| You decide | Research and pick most secure/practical. | |

**User's choice:** Other -- "Can we do both?"
**Notes:** Both Composio (primary) and 1Password (fallback) for maximum coverage.

### Q5: Domain allowlisting?

| Option | Description | Selected |
|--------|-------------|----------|
| Open by default | Navigate any site. Optional blocklist. | ✓ |
| Allowlist required | Must explicitly allow each domain. | |
| You decide | Pick based on security model. | |

**User's choice:** Open by default
**Notes:** Consistent with full autonomy.

---

## Evidence & Reporting

### Q6: Screenshot evidence handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Capture at key steps only | Before/after significant actions. Store for audit. | |
| Capture every step | Full replay capability. Higher storage. | |
| You decide | Balance evidence vs storage cost. | |

**User's choice:** Other -- "Wouldn't Browserbase have livestreaming? This is more infra we're taking on"
**Notes:** Lean on provider's built-in session recording rather than custom screenshot capture.

---

## Claude's Discretion

- Browser engine and provider selection
- Vision vs accessibility-tree paradigm
- Fly.io worker config (if self-hosted)
- Cost circuit breaker thresholds
- Async task integration design
- Pre-flight check design

## Deferred Ideas

None -- discussion stayed within phase scope
