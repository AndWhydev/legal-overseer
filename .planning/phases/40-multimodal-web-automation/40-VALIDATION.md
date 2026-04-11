---
phase: 40
slug: multimodal-web-automation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/browser/` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~15 seconds (browser module only), ~120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/browser/`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | CUA-01 | unit | `npx vitest run src/lib/agent/tools/__tests__/browser-tools.test.ts` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | CUA-02 | unit | `npx vitest run src/lib/browser/__tests__/stagehand-client.test.ts` | ❌ W0 | ⬜ pending |
| 40-02-01 | 02 | 1 | CUA-04, CUA-11 | unit | `npx vitest run src/lib/browser/__tests__/domain-gate.test.ts` | ❌ W0 | ⬜ pending |
| 40-02-02 | 02 | 1 | CUA-08 | unit | `npx vitest run src/lib/browser/__tests__/credential-injector.test.ts` | ❌ W0 | ⬜ pending |
| 40-02-03 | 02 | 1 | CUA-10 | unit | `npx vitest run src/lib/browser/__tests__/cost-monitor.test.ts` | ❌ W0 | ⬜ pending |
| 40-03-01 | 03 | 2 | CUA-03, CUA-05 | unit | `npx vitest run src/lib/browser/__tests__/browser-task.test.ts` | ❌ W0 | ⬜ pending |
| 40-03-02 | 03 | 2 | CUA-06 | unit | `npx vitest run src/lib/browser/__tests__/browser-task.test.ts` | ❌ W0 | ⬜ pending |
| 40-04-01 | 04 | 2 | CUA-07, CUA-09 | unit | `npx vitest run src/lib/browser/__tests__/browser-task.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `personal-assistant/src/lib/browser/__tests__/stagehand-client.test.ts` — stubs for CUA-02
- [ ] `personal-assistant/src/lib/browser/__tests__/domain-gate.test.ts` — stubs for CUA-04, CUA-11
- [ ] `personal-assistant/src/lib/browser/__tests__/credential-injector.test.ts` — stubs for CUA-08
- [ ] `personal-assistant/src/lib/browser/__tests__/cost-monitor.test.ts` — stubs for CUA-10
- [ ] `personal-assistant/src/lib/browser/__tests__/browser-task.test.ts` — stubs for CUA-03, CUA-05, CUA-06, CUA-07, CUA-09
- [ ] `personal-assistant/src/lib/agent/tools/__tests__/browser-tools.test.ts` — stubs for CUA-01
- [ ] `@browserbasehq/stagehand` — npm dependency installed

*Existing infrastructure covers test framework (vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real site navigation | CUA-02 | Requires live Browserbase session with API key | Create Browserbase session, navigate to httpbin.org, verify act/extract work |
| Session recording evidence | CUA-07 | Requires Browserbase dashboard access | Run browser task, verify session URL returns video playback |
| CAPTCHA handling | CUA-09 | Requires sites with CAPTCHAs | Navigate to a CAPTCHA-protected site, verify Browserbase handles it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
