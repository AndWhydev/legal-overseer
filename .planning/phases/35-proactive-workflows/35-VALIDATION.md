---
phase: 35
slug: proactive-workflows
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (unit) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/workflows/ --reporter=verbose` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/workflows/ --reporter=verbose`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | WRKF-01 | unit | `npx vitest run src/lib/workflows/__tests__/rule-parser.test.ts` | W0 | pending |
| 35-01-02 | 01 | 1 | WRKF-02 | unit | `npx vitest run src/lib/workflows/__tests__/trigger-engine.test.ts` | W0 | pending |
| 35-02-01 | 02 | 2 | WRKF-03 | unit | `npx vitest run src/lib/workflows/__tests__/cross-role.test.ts` | W0 | pending |
| 35-03-01 | 03 | 2 | WRKF-04 | unit | `npx tsc --noEmit` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/workflows/__tests__/rule-parser.test.ts` -- NL to structured rule parsing
- [ ] `src/lib/workflows/__tests__/trigger-engine.test.ts` -- event trigger matching + execution
- [ ] `src/lib/workflows/__tests__/cross-role.test.ts` -- cross-role tool resolution

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NL rule parsing feels natural | WRKF-01 | LLM output quality | Try 5 natural language rules, verify parsed structure |
| Workflow dashboard UX | WRKF-04 | Visual check | Create/edit/pause workflows from dashboard |
| End-to-end workflow fires | WRKF-02 | Requires live triggers | Set rule "when email arrives, summarize it", send email, verify |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
