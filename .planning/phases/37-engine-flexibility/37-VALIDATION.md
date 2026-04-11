---
phase: 37
slug: engine-flexibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | personal-assistant/vitest.config.ts |
| **Quick run command** | `cd personal-assistant && npx vitest run --reporter=verbose src/lib/agent/engine src/lib/agent/confidence-router src/lib/agent/cost-guard src/lib/context-assembly/token-budget-manager` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~15 seconds (targeted), ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick run command (engine + router + cost guard + budget tests)
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | ENGINE-01 | unit | `vitest run src/lib/agent/engine/taor-loop.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-02 | 01 | 1 | ENGINE-05 | regression | `vitest run src/lib/agent/engine` | ✅ | ⬜ pending |
| 37-02-01 | 02 | 1 | ENGINE-02 | unit | `vitest run src/lib/agent/confidence-router.test.ts` | ✅ | ⬜ pending |
| 37-02-02 | 02 | 1 | ENGINE-02 | unit | `vitest run src/lib/agent/__tests__/confidence-router.test.ts` | ✅ | ⬜ pending |
| 37-03-01 | 03 | 1 | ENGINE-03 | unit | `vitest run src/lib/agent/cost-guard.test.ts` | ✅ | ⬜ pending |
| 37-03-02 | 03 | 1 | ENGINE-03 | integration | `vitest run src/lib/roles/__tests__/role-engine.test.ts` | ✅ | ⬜ pending |
| 37-04-01 | 04 | 2 | ENGINE-04 | unit | `vitest run src/lib/context-assembly/token-budget-manager.test.ts` | ❌ W0 | ⬜ pending |
| 37-05-01 | 05 | 2 | ENGINE-05 | regression | `vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/agent/engine/__tests__/taor-loop-caps.test.ts` — stubs for ENGINE-01 (dynamic iteration caps)
- [ ] `src/lib/context-assembly/__tests__/token-budget-manager.test.ts` — stubs for ENGINE-04 (workspace tier)

*Existing test files cover ENGINE-02 (confidence-router.test.ts), ENGINE-03 (cost-guard.test.ts), ENGINE-05 (full regression suite).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Entity override dashboard UI | ENGINE-05 | UI rendering requires browser | Set override via Supabase, verify standard entity unchanged in dashboard |

*All core engine behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
