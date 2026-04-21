---
phase: 46
slug: anomaly-active-learning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | personal-assistant/vitest.config.ts |
| **Quick run command** | `cd personal-assistant && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd personal-assistant && npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd personal-assistant && npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | ANOM-01 | — | N/A | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | ANOM-05 | — | N/A | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 1 | ANOM-02, ANOM-03 | — | Alert budget enforced | unit | `npx vitest run src/lib/brain/__tests__/brain-alerts.test.ts` | ❌ W0 | ⬜ pending |
| 46-02-02 | 02 | 1 | ANOM-04 | — | N/A | unit | `npx vitest run src/lib/brain/__tests__/brain-alerts.test.ts` | ❌ W0 | ⬜ pending |
| 46-03-01 | 03 | 2 | LEARN-01, LEARN-02 | — | N/A | unit | `npx vitest run src/lib/agent/__tests__/confidence-router.test.ts` | ❌ W0 | ⬜ pending |
| 46-03-02 | 03 | 2 | LEARN-03 | — | N/A | integration | `npx vitest run src/lib/brain/__tests__/clarification-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 46-04-01 | 04 | 2 | LEARN-04 | — | N/A | unit | `npx vitest run src/lib/brain/__tests__/learning-prompts.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/brain/__tests__/anomaly-detector.test.ts` — stubs for ANOM-01, ANOM-05
- [ ] `src/lib/brain/__tests__/brain-alerts.test.ts` — stubs for ANOM-02, ANOM-03, ANOM-04
- [ ] `src/lib/agent/__tests__/confidence-router.test.ts` — extend for LEARN-01, LEARN-02
- [ ] `src/lib/brain/__tests__/clarification-pipeline.test.ts` — stubs for LEARN-03
- [ ] `src/lib/brain/__tests__/learning-prompts.test.ts` — stubs for LEARN-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alert renders in connected messaging channel | ANOM-02 | Requires live channel connection | Send anomaly alert, verify receipt on user's connected channel |
| Clarifying question appears naturally in conversation | LEARN-02 | Requires subjective quality assessment | Review 3 clarifying questions for natural phrasing |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
