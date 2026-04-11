---
phase: 38
slug: fiduciary-memory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run --reporter=verbose src/lib/memory-palace/__tests__` |
| **Full suite command** | `cd personal-assistant && npm run test` |
| **Estimated runtime** | ~15 seconds (memory-palace suite), ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run --reporter=verbose src/lib/memory-palace/__tests__`
- **After every plan wave:** Run `cd personal-assistant && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | FIDUC-01 | unit | `npx vitest run src/lib/memory-palace/__tests__/types.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | FIDUC-01 | unit | `npx vitest run src/lib/memory-palace/__tests__/memory-writer.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-01 | 02 | 1 | FIDUC-02, FIDUC-03 | unit | `npx vitest run src/lib/memory-palace/__tests__/sleep-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-01 | 03 | 2 | FIDUC-04 | unit | `npx vitest run src/lib/context-assembly/__tests__/context-assembler.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-02 | 03 | 2 | FIDUC-04 | unit | `npx vitest run src/lib/memory-palace/__tests__/proactive-recall.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `personal-assistant/src/lib/memory-palace/__tests__/fiduciary-constraint.test.ts` — stubs for FIDUC-01, FIDUC-02, FIDUC-03
- [ ] `personal-assistant/src/lib/context-assembly/__tests__/fiduciary-priority.test.ts` — stubs for FIDUC-04

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Constraints surface naturally in conversation | FIDUC-04 | Requires LLM reasoning evaluation | Send test message mentioning entity with fiduciary constraint; verify BitBit references constraint in response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
