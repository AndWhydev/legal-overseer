---
phase: 29
slug: seo-tender-scheduled-monitoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/roles/growth/ -x` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/roles/growth/ -x`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 0 | SEO-03 | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 0 | SEO-04 | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 0 | TNDR-03 | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | ❌ W0 | ⬜ pending |
| 29-01-04 | 01 | 0 | TNDR-04 | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | ❌ W0 | ⬜ pending |
| 29-01-05 | 01 | 1 | INT-01 | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | Partial | ⬜ pending |
| 29-01-06 | 01 | 1 | INT-02 | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/roles/growth/__tests__/growth-role.test.ts` — stubs for SEO-03, SEO-04, TNDR-03, TNDR-04, INT-02
- [ ] Extend `src/lib/roles/__tests__/role-registration.test.ts` — verify growth role is registered
- [ ] DB migration to extend role_type CHECK constraint if one exists

*Existing infrastructure covers test framework — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cron invocation triggers growth role on 5-min tick | SEO-03/TNDR-03 | Requires live Vercel cron | Deploy, wait for cron, check logs |
| Notification delivery via real channels | SEO-04/TNDR-04 | Requires live notification infra | Trigger alert condition, verify in-app + email |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
