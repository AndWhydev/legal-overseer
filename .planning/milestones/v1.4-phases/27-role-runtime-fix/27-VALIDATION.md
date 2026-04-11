---
phase: 27
slug: role-runtime-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/roles/__tests__/ -x`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 0 | SC-1, SC-2 | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | No -- Wave 0 | ⬜ pending |
| 27-02-01 | 02 | 1 | SC-1 | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | ✅ W0 | ⬜ pending |
| 27-02-02 | 02 | 1 | SC-2 | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | ✅ W0 | ⬜ pending |
| 27-02-03 | 02 | 1 | SC-3 | smoke | `grep "revenue-intelligence" personal-assistant/vercel.json` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/roles/__tests__/role-registration.test.ts` — stubs for SC-1, SC-2: verifies side-effect imports populate the registry for all three role types (finance, comms, sales)
- [ ] Smoke test: verify `vercel.json` contains `revenue-intelligence` path

*Existing infrastructure covers framework setup — Vitest already configured.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
