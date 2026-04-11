---
phase: 42
slug: tool-priority-chain
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/agent/engine/__tests__/tool-resolver --reporter=verbose` |
| **Full suite command** | `cd personal-assistant && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds (phase tests), ~45 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/agent/engine/__tests__/tool-resolver --reporter=verbose`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | CHAIN-03 | unit | `npx vitest run src/lib/agent/engine/__tests__/reliability-tracker.test.ts` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 1 | CHAIN-03 | unit | `npx vitest run src/lib/agent/engine/__tests__/reliability-tracker.test.ts` | ❌ W0 | ⬜ pending |
| 42-02-01 | 02 | 1 | CHAIN-01 | unit | `npx vitest run src/lib/agent/engine/__tests__/tool-resolver.test.ts` | ❌ W0 | ⬜ pending |
| 42-02-02 | 02 | 1 | CHAIN-02 | unit | `npx vitest run src/lib/agent/engine/__tests__/tool-resolver.test.ts` | ❌ W0 | ⬜ pending |
| 42-03-01 | 03 | 2 | CHAIN-04 | unit | `npx vitest run src/lib/agent/engine/__tests__/human-handoff.test.ts` | ❌ W0 | ⬜ pending |
| 42-03-02 | 03 | 2 | CHAIN-04 | integration | `npx vitest run src/lib/agent/engine/__tests__/human-handoff.test.ts` | ❌ W0 | ⬜ pending |
| 42-04-01 | 04 | 2 | CHAIN-01, CHAIN-03 | integration | `npx vitest run src/lib/agent/engine/__tests__/tier-feedback-loop.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `personal-assistant/src/lib/agent/engine/__tests__/reliability-tracker.test.ts` — stubs for CHAIN-03
- [ ] `personal-assistant/src/lib/agent/engine/__tests__/tool-resolver.test.ts` — stubs for CHAIN-01, CHAIN-02
- [ ] `personal-assistant/src/lib/agent/engine/__tests__/human-handoff.test.ts` — stubs for CHAIN-04
- [ ] `personal-assistant/src/lib/agent/engine/__tests__/tier-feedback-loop.test.ts` — stubs for CHAIN-01, CHAIN-03

*Existing vitest infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Model tier selection quality | CHAIN-01 | Requires LLM evaluation of prompt with reliability context | Send test prompt with reliability data, verify model selects expected tier |
| WhatsApp handoff notification delivery | CHAIN-04 | Requires WhatsApp channel connection | Trigger handoff, verify notification arrives on test WhatsApp |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
