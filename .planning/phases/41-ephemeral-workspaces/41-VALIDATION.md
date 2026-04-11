---
phase: 41
slug: ephemeral-workspaces
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/workspaces/` |
| **Full suite command** | `cd personal-assistant && npm run test` |
| **Estimated runtime** | ~15 seconds (workspace tests only) |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/workspaces/`
- **After every plan wave:** Run `cd personal-assistant && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | WKSP-01 | unit | `npx vitest run src/lib/workspaces/__tests__/workspace-tool.test.ts` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 1 | WKSP-02 | unit | `npx vitest run src/lib/workspaces/__tests__/e2b-provider.test.ts` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 1 | WKSP-03 | unit | `npx vitest run src/lib/workspaces/__tests__/workspace-exec.test.ts` | ❌ W0 | ⬜ pending |
| 41-02-02 | 02 | 1 | WKSP-04 | unit | `npx vitest run src/lib/workspaces/__tests__/workspace-exec.test.ts` | ❌ W0 | ⬜ pending |
| 41-03-01 | 03 | 1 | WKSP-05 | unit | `npx vitest run src/lib/workspaces/__tests__/lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| 41-03-02 | 03 | 1 | WKSP-06 | unit | `npx vitest run src/lib/workspaces/__tests__/output-delivery.test.ts` | ❌ W0 | ⬜ pending |
| 41-04-01 | 04 | 2 | WKSP-07 | integration | `npx vitest run src/lib/workspaces/__tests__/isolation.test.ts` | ❌ W0 | ⬜ pending |
| 41-04-02 | 04 | 2 | WKSP-08 | unit | `npx vitest run src/lib/workspaces/__tests__/resource-limits.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/workspaces/__tests__/workspace-tool.test.ts` — stubs for WKSP-01
- [ ] `src/lib/workspaces/__tests__/e2b-provider.test.ts` — stubs for WKSP-02
- [ ] `src/lib/workspaces/__tests__/workspace-exec.test.ts` — stubs for WKSP-03, WKSP-04
- [ ] `src/lib/workspaces/__tests__/lifecycle.test.ts` — stubs for WKSP-05
- [ ] `src/lib/workspaces/__tests__/output-delivery.test.ts` — stubs for WKSP-06
- [ ] `src/lib/workspaces/__tests__/isolation.test.ts` — stubs for WKSP-07
- [ ] `src/lib/workspaces/__tests__/resource-limits.test.ts` — stubs for WKSP-08
- [ ] E2B SDK mock fixture (`src/lib/workspaces/__tests__/fixtures/e2b-mock.ts`)

*Existing test infrastructure (vitest, Supabase test helpers) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2B sandbox actually starts and executes code | WKSP-02 | Requires real E2B API call | Run integration test with E2B_API_KEY set; verify sandbox provisions and `runCode` returns output |
| Network isolation between tenants | WKSP-07 | Requires two concurrent sandboxes | Spawn two sandboxes for different orgs; verify sandbox A cannot access sandbox B's filesystem or network |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
