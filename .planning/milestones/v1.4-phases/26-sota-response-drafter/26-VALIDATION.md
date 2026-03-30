---
phase: 26
slug: sota-response-drafter
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | DRAFT-01 | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "includes entity briefing"` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | DRAFT-03 | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "uses same infrastructure"` | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 1 | DRAFT-04 | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "confidence scoring"` | ❌ W0 | ⬜ pending |
| 26-01-04 | 01 | 1 | DRAFT-05 | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "standing orders"` | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 2 | DRAFT-02 | integration | `npx vitest run src/lib/agent/__tests__/draft-quality-eval.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/agent/__tests__/draft-context-assembler.test.ts` — stubs for DRAFT-01, DRAFT-03, DRAFT-04, DRAFT-05
- [ ] `src/lib/agent/__tests__/draft-quality-eval.test.ts` — stubs for DRAFT-02 (blind comparison harness)
- [ ] Test fixtures: 10-20 real (incoming, actual_reply) pairs from channel_messages

*Existing vitest infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Draft tone matches user's voice | DRAFT-05 | Subjective quality assessment | Compare 5 drafts against user's actual replies for same contact; verify tone consistency |
| Blind comparison quality | DRAFT-02 | Requires human judgment on draft quality | Present 10 (draft, actual) pairs blind; rate which reads more naturally |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
