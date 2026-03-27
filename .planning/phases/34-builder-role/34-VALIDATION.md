---
phase: 34
slug: builder-role
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (unit) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/roles/builder/ -x` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/roles/builder/ -x`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 0 | BUILD-01 | unit | `npx vitest run src/lib/roles/builder/__tests__/builder-role.test.ts -x` | W0 | pending |
| 34-01-02 | 01 | 1 | BUILD-01 | unit | `npx vitest run src/lib/roles/builder/__tests__/site-generator.test.ts -x` | W0 | pending |
| 34-02-01 | 02 | 1 | BUILD-02 | unit | `npx vitest run src/lib/roles/builder/__tests__/preview-sandbox.test.ts -x` | W0 | pending |
| 34-03-01 | 03 | 2 | BUILD-03 | unit | `npx vitest run src/lib/roles/builder/__tests__/deploy.test.ts -x` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/roles/builder/__tests__/builder-role.test.ts` -- role registration, evaluate, hasChanges
- [ ] `src/lib/roles/builder/__tests__/site-generator.test.ts` -- HTML/CSS generation from prompt
- [ ] `src/lib/roles/builder/__tests__/preview-sandbox.test.ts` -- iframe sandbox security
- [ ] `src/lib/roles/builder/__tests__/deploy.test.ts` -- Vercel API deployment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated site looks correct visually | BUILD-01 | Visual quality check | Generate a "plumber landing page", open preview, verify layout |
| Elementor export imports correctly | BUILD-01 | Requires live WordPress | Export JSON, import in Elementor, verify sections render |
| Preview sandbox prevents escape | BUILD-02 | Security review | Try script injection in generated code, verify sandbox blocks |
| Deployed site is accessible | BUILD-03 | Requires live deployment | Deploy, visit URL, verify loads correctly |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
