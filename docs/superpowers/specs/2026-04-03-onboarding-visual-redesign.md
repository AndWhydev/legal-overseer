# Onboarding Visual Redesign — Use Chat Design System

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Replace onboarding's bespoke chat components with the real chat page design system

---

## Problem

The onboarding chat (`/onboard`) has its own primitive components:
- `ChatBubble` — plain rounded divs with no markdown, no BitBit branding, no feedback buttons
- `ChatInput` (onboarding) — basic `<Input>` + icon button, no textarea, no attachment/voice icons

The dashboard chat page uses a polished design system:
- `MessageBubble` — Streamdown markdown rendering, syntax-highlighted code blocks, thumbs up/down feedback, copy button, regenerate, edit
- `BitBitHeader` — icon mark + pixel wordmark above assistant messages
- `ChatInput` (chat) — rounded pill textarea with `chat-surface` styling
- `bb-chat__*` CSS classes — consistent spacing, typography, message lane width

The onboarding should look identical to the dashboard chat.

## Changes

### 1. Rewrite `OnboardingChat` to use chat design system

**File:** `personal-assistant/src/components/onboarding/onboarding-chat.tsx`

Replace bespoke components with chat page equivalents:

- Use `bb-chat` CSS class on the outer container
- Use `bb-chat__messages` + `bb-chat__msg-list` for the message scroll area
- Render `BitBitHeader` (from `components/chat/chat-interface.tsx` — extract to shared) above each assistant message group
- Render messages via `MessageBubble` (from `components/chat/message-bubble.tsx`)
- Render input via `ChatInput` (from `components/chat/chat-input.tsx`)
- Keep onboarding-specific elements inline: `ConnectionCard`, `WorldGraph`, phase indicator, "Let's go" button

**Type adaptation:** The onboarding stream produces `ChatMessage { id, role, content, timestamp: number }`. `MessageBubble` expects `Message { id, role, content, timestamp: Date }`. Map at the boundary in `OnboardingChat`:
```ts
const adapted = { ...msg, timestamp: new Date(msg.timestamp) }
```

No feedback/regenerate/edit callbacks — pass `undefined` to disable those features during onboarding. Copy stays (it's always available).

### 2. Extract `BitBitHeader` to shared location

**Currently:** Defined as a local function inside `chat-interface.tsx` (line 155).
**Move to:** `components/chat/bitbit-header.tsx` as a named export.

This way both the chat interface and onboarding can import it.

### 3. Delete dead onboarding components

These files are not imported anywhere outside themselves:

| File | Reason |
|------|--------|
| `components/onboarding/chat-bubble.tsx` | Replaced by `MessageBubble` |
| `components/onboarding/chat-input.tsx` | Replaced by chat's `ChatInput` |
| `components/onboarding/aurora-character.tsx` | Old wizard mascot, unused |
| `components/onboarding/aurora-character.test.tsx` | Test for above |
| `components/onboarding/sky-video-backdrop.tsx` | Old wizard backdrop, unused |
| `components/onboarding/sky-video-backdrop.test.tsx` | Test for above |
| `components/onboarding/stage-progress.tsx` | Old wizard progress bar, unused |
| `components/onboarding/stage-progress.test.tsx` | Test for above |
| `components/onboarding/agent-recommendations.tsx` | Old wizard agent picker, unused |

### 4. Keep these (still used by dashboard/API)

| File | Used by |
|------|---------|
| `first-run-guide.tsx` | `spa-shell.tsx`, connections-tab, contacts-tab |
| `help-tooltip.tsx` | `first-run-guide.tsx` |
| `welcome-conversation.ts` | `api/chat/welcome/route.ts` |
| `first-run-discovery.ts` | `api/onboarding/discovery/route.ts` |
| `beta-flow.ts` | `api/onboarding/route.ts` |

## What the result looks like

After the change, the onboarding chat at `/onboard` will render:

1. **Assistant messages** — `BitBitHeader` (icon + "BitBit" wordmark) above each assistant message block, then `MessageBubble` with full markdown rendering. Feedback buttons (thumbs) + copy below each message.
2. **User messages** — Right-aligned pill with `bb-chat__bubble--user` styling.
3. **Input** — The same rounded pill textarea from the chat page (`chat-surface` background, placeholder "Message BitBit...").
4. **Onboarding-specific** — Connection card overlay, world graph inline, phase shimmer, "Let's go" CTA — all rendered within the `bb-chat__msg-list` lane.

## Non-goals

- No changes to the SSE pipeline, API routes, or backend
- No changes to `WorldGraph`, `GraphDetailPanel`, or `ConnectionCard`
- No changes to `use-onboarding-stream` hook (except minor type mapping)
- Not adding full chat features (artifacts, command palette, threads) to onboarding
