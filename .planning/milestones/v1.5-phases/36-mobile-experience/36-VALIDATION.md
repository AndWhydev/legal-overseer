---
phase: 36
slug: mobile-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (Expo default) + Vitest (backend) |
| **Config file** | `mobile/jest.config.js` (mobile), `personal-assistant/vitest.config.ts` (backend) |
| **Quick run command** | `cd mobile && npx expo run:ios --configuration Debug` |
| **Full suite command** | `cd mobile && npx jest && cd ../personal-assistant && npx vitest run src/lib/notifications/` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** TypeScript compile check
- **After every plan wave:** Full test suite
- **Before `/gsd:verify-work`:** Full suite + manual device test
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | MOB-01 | build | `cd mobile && npx expo export --platform ios` | N/A | pending |
| 36-02-01 | 02 | 2 | MOB-02 | unit | `npx vitest run src/lib/notifications/__tests__/push.test.ts` | W0 | pending |
| 36-02-02 | 02 | 2 | MOB-03 | build | `cd mobile && npx tsc --noEmit` | N/A | pending |
| 36-03-01 | 03 | 2 | MOB-04, MOB-05 | unit | `cd mobile && npx jest` | W0 | pending |

---

## Wave 0 Requirements

- [ ] `personal-assistant/src/lib/notifications/__tests__/push.test.ts` -- push dispatcher tests
- [ ] `mobile/__tests__/offline-queue.test.ts` -- offline mutation queue tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat works on device | MOB-01 | Requires real device/simulator | Open app, send message, verify streaming response |
| Push notification received | MOB-02 | Requires physical device + APNs | Trigger alert, verify notification appears |
| Voice input captures speech | MOB-03 | Requires device microphone | Tap mic, speak, verify transcription |
| Offline queue syncs | MOB-04 | Requires airplane mode toggle | Go offline, send messages, reconnect, verify delivery |
| Quick actions work | MOB-05 | Touch interaction | Swipe approval, tap reply, verify action completes |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity
- [ ] Wave 0 covers MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
