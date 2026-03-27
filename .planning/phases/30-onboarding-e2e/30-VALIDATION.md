---
phase: 30
slug: onboarding-e2e
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 30 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 (E2E) + Vitest 4.0.18 (unit) |
| **Config file** | `playwright.config.ts` (E2E), `vitest.config.ts` (unit) |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/onboarding/ --reporter=verbose` |
| **Full suite command** | `cd personal-assistant && npx playwright test e2e/onboarding.spec.ts e2e/empty-states.spec.ts --reporter=list` |
| **Estimated runtime** | ~15 seconds (unit), ~30 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/onboarding/ --reporter=verbose && npx tsc --noEmit 2>&1 | head -30`
- **After every plan wave:** Run `cd personal-assistant && npx playwright test e2e/onboarding.spec.ts e2e/empty-states.spec.ts --reporter=list`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-00 | 01 | 0 | ONBD-02, ONBD-05 | unit | `npx vitest run src/lib/onboarding/first-run-discovery.test.ts src/lib/onboarding/welcome-conversation.test.ts --reporter=verbose` | Created in Task 0 | ⬜ pending |
| 30-01-01 | 01 | 1 | ONBD-01 | unit+tsc | `npx vitest run src/lib/onboarding/state.test.ts --reporter=verbose && npx tsc --noEmit 2>&1 \| head -30` | Yes (state.test.ts) | ⬜ pending |
| 30-01-02 | 01 | 1 | ONBD-01, ONBD-04 | E2E | `npx playwright test e2e/onboarding.spec.ts -g "progress persistence" --reporter=list` | Rewrite in Task 2 | ⬜ pending |
| 30-02-01 | 02 | 1 | ONBD-03 | E2E | `npx playwright test e2e/empty-states.spec.ts --reporter=list` | Created in Task 2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `e2e/onboarding.spec.ts` -- REWRITE: update assertions for current page copy, add API route mocks for discovery/welcome/preferences (Plan 01 Task 2)
- [x] `src/lib/onboarding/first-run-discovery.test.ts` -- unit tests for discovery pipeline (ONBD-02) (Plan 01 Task 0)
- [x] `src/lib/onboarding/welcome-conversation.test.ts` -- unit tests for welcome message generation (ONBD-05) (Plan 01 Task 0)
- [x] `e2e/empty-states.spec.ts` -- Playwright smoke test for empty state rendering (ONBD-03) (Plan 02 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Empty states render correctly on ALL tabs (visual check) | ONBD-03 | Automated test covers 1 tab; full visual sweep requires manual | Load each dashboard tab with empty data, verify EmptyState shows with correct icon/copy |
| Welcome conversation feels natural | ONBD-05 | Tone/quality check | Complete onboarding, verify welcome message references real data |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
