---
phase: 28
slug: intelligence-dashboard-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest, bundled with project) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/intelligence` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/intelligence`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 0 | INT-WIRE-01, INT-WIRE-03 | unit | `cd personal-assistant && npx vitest run src/components/roles/__tests__/intelligence-widgets.test.ts -x` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | INT-WIRE-01 | unit | `cd personal-assistant && npx vitest run src/components/roles/__tests__/intelligence-widgets.test.ts -x` | ❌ W0 | ⬜ pending |
| 28-01-03 | 01 | 1 | INT-WIRE-02 | unit | `cd personal-assistant && npx vitest run src/lib/intelligence/__tests__/intelligence.test.ts -x` | ✅ | ⬜ pending |
| 28-01-04 | 01 | 1 | INT-WIRE-03 | unit | `cd personal-assistant && npx vitest run src/components/roles/__tests__/intelligence-widgets.test.ts -x` | ❌ W0 | ⬜ pending |
| 28-01-05 | 01 | 1 | INT-WIRE-04 | manual | Manual: load dashboard with seeded BI data | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `personal-assistant/src/components/roles/__tests__/intelligence-widgets.test.ts` — stubs for INT-WIRE-01, INT-WIRE-03
- [ ] Mock `fetch` for parallel API call testing with individual success/failure scenarios

*Existing infrastructure: Backend intelligence tests already exist at `personal-assistant/src/lib/intelligence/__tests__/intelligence.test.ts`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Widget shows real data when gatheringData is false | INT-WIRE-04 | Requires seeded BI snapshot data in live dashboard | 1. Seed bi_snapshots via cron or manual insert 2. Load dashboard 3. Verify widgets show numeric values, not "Gathering data..." |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
