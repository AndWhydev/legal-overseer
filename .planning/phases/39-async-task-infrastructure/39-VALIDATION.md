---
phase: 39
slug: async-task-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | personal-assistant/vitest.config.ts |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/agent/tasks/` |
| **Full suite command** | `cd personal-assistant && npm run test` |
| **Estimated runtime** | ~30 seconds (task tests) / ~120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/agent/tasks/`
- **After every plan wave:** Run `cd personal-assistant && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | ASYNC-01 | unit | `npx vitest run src/lib/agent/tasks/__tests__/task-service.test.ts` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | ASYNC-01 | unit | `npx vitest run src/lib/agent/tasks/__tests__/fsm.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 1 | ASYNC-04, ASYNC-07 | unit | `npx vitest run src/lib/agent/tasks/__tests__/step-tracker.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 1 | ASYNC-05 | unit | `npx vitest run src/lib/agent/tasks/__tests__/heartbeat.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-03 | 02 | 1 | ASYNC-06 | unit | `npx vitest run src/lib/agent/tasks/__tests__/retry-policy.test.ts` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 2 | ASYNC-02 | integration | `npx vitest run src/lib/agent/tasks/__tests__/realtime-progress.test.ts` | ❌ W0 | ⬜ pending |
| 39-03-02 | 03 | 2 | ASYNC-03 | unit | `npx vitest run src/lib/agent/tasks/__tests__/cancellation.test.ts` | ❌ W0 | ⬜ pending |
| 39-04-01 | 04 | 2 | ASYNC-01 | integration | `npx vitest run src/lib/agent/tasks/__tests__/taor-integration.test.ts` | ❌ W0 | ⬜ pending |
| 39-05-01 | 05 | 3 | ASYNC-08 | integration | `npx vitest run src/app/api/tasks/__tests__/task-api.test.ts` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/lib/agent/tasks/__tests__/task-service.test.ts` -- stubs for ASYNC-01
- [ ] `src/lib/agent/tasks/__tests__/fsm.test.ts` -- FSM transition stubs
- [ ] `src/lib/agent/tasks/__tests__/step-tracker.test.ts` -- step tracking stubs
- [ ] `src/lib/agent/tasks/__tests__/heartbeat.test.ts` -- heartbeat stubs
- [ ] `src/lib/agent/tasks/__tests__/retry-policy.test.ts` -- retry policy stubs
- [ ] `src/lib/agent/tasks/__tests__/cancellation.test.ts` -- cancellation stubs
- [ ] `src/lib/agent/tasks/__tests__/realtime-progress.test.ts` -- realtime stubs

*Existing infrastructure covers vitest framework -- only test file stubs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat progress updates render live | ASYNC-02 | Requires browser rendering with Supabase Realtime | Open chat, trigger async task, verify progress messages appear inline |
| NL cancellation ("stop that") works | ASYNC-03 | Requires full TAOR loop with NL understanding | Send async task, then say "stop that", verify cancellation message |
| Orphan recovery after worker restart | ASYNC-05 | Requires simulating worker crash | Start task, kill worker process, wait 90s, verify task re-enters pending |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
