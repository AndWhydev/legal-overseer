---
phase: 43
slug: infinite-delegation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-08
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd personal-assistant && npm run test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd personal-assistant && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | DELEG-01 | unit | `npx vitest run src/lib/agent/__tests__/delegation-mandate.test.ts` | ❌ W0 | ⬜ pending |
| 43-01-02 | 01 | 1 | DELEG-01 | migration | `supabase db reset --linked` | ❌ W0 | ⬜ pending |
| 43-02-01 | 02 | 1 | DELEG-02 | unit | `npx vitest run src/lib/agent/__tests__/confidence-router-delegation.test.ts` | ❌ W0 | ⬜ pending |
| 43-02-02 | 02 | 1 | DELEG-03 | unit | `npx vitest run src/lib/agent/__tests__/fiduciary-delegation.test.ts` | ❌ W0 | ⬜ pending |
| 43-03-01 | 03 | 1 | DELEG-04 | unit | `npx vitest run src/lib/memory-palace/__tests__/delegation-briefing.test.ts` | ❌ W0 | ⬜ pending |
| 43-04-01 | 04 | 2 | DELEG-05 | unit | `npx vitest run src/lib/agent/__tests__/delegation-nl.test.ts` | ❌ W0 | ⬜ pending |
| 43-04-02 | 04 | 2 | DELEG-05 | unit | `npx vitest run src/lib/agent/__tests__/delegation-revocation.test.ts` | ❌ W0 | ⬜ pending |
| 43-05-01 | 05 | 2 | DELEG-06 | unit | `npx vitest run src/lib/agent/__tests__/delegation-audit.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `personal-assistant/src/lib/agent/__tests__/delegation-mandate.test.ts` — stubs for DELEG-01
- [ ] `personal-assistant/src/lib/agent/__tests__/confidence-router-delegation.test.ts` — stubs for DELEG-02
- [ ] `personal-assistant/src/lib/agent/__tests__/fiduciary-delegation.test.ts` — stubs for DELEG-03
- [ ] `personal-assistant/src/lib/memory-palace/__tests__/delegation-briefing.test.ts` — stubs for DELEG-04
- [ ] `personal-assistant/src/lib/agent/__tests__/delegation-nl.test.ts` — stubs for DELEG-05 activation
- [ ] `personal-assistant/src/lib/agent/__tests__/delegation-revocation.test.ts` — stubs for DELEG-05 revocation
- [ ] `personal-assistant/src/lib/agent/__tests__/delegation-audit.test.ts` — stubs for DELEG-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NL activation in live chat | DELEG-05 | Requires real LLM inference for intent detection | Send "Take Steve off my hands" in WhatsApp, verify confirmation response |
| Morning Briefing delivery | DELEG-04 | Requires WhatsApp integration | Trigger sleep consolidation for org with delegated entity, verify WhatsApp message |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
