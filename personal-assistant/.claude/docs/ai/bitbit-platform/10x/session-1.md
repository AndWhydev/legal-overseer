# 10x Analysis: BitBit Platform
Session 1 | Date: 2026-03-29

## Current Value

BitBit is an agentic AI operations platform for solo operators and small agencies. It handles inbox triage, lead scoring, invoicing, task management, meetings, and agent workflows. The backend intelligence is 3 months ahead of the frontend — Revenue Radar, Client Health, Cash Flow Prophet, Capacity Oracle, Memory Palace, 23 cron jobs, and 5 role personas all exist but are NEVER surfaced in the UI.

## The Question

What would make BitBit 10x more valuable? The answer: **surface what already exists**.

---

## Massive Opportunities

### M1. Wire Intelligence to Dashboard (2-3 days)
**What**: Replace hardcoded KPI cards ($47.82, 1,284, 3,485, 99.7%) with real data from `bi_snapshots`, revenue health hooks, and agent run stats.
**Why 10x**: Users currently see a beautiful dashboard with fake numbers. Real intelligence data makes it a command center.
**Unlocks**: Revenue forecasting, churn prediction, capacity planning — all already computed, just not displayed.
**Effort**: Low — data hooks exist (`useRevenueHealth`, `useClientScores`), just need wiring.
**Score**: 🔥 Must do

### M2. Generative UI for Agent Tool Calls (5-7 days)
**What**: Replace plain text/JSON tool results in chat with rich interactive components using Tool UI widgets + prompt-kit's `tool`/`steps` components.
**Why 10x**: Tool calls are BitBit's core value — they're how the AI acts. Currently rendered as walls of text. Rich UI makes them actionable.
**Libraries**: Tool UI (widget-renderer), prompt-kit (tool, steps, chain-of-thought), AI Elements (tool, confirmation)
**Top 5 tools to upgrade**: `find_messages` → message list card, `search_contacts` → contact cards, `generate_invoice` → invoice preview with approve, `create_task` → task card, `get_upcoming` → event list
**Score**: 🔥 Must do

### M3. Push-First Activity Stream (3-5 days)
**What**: Replace passive dashboard with a real-time activity stream. Agent actions, email arrivals, lead movements, invoice payments — all pushed live.
**Why 10x**: Users shouldn't have to check each page. The stream tells them what happened and what needs attention.
**Libraries**: GAIA UI notification-card, AI Elements confirmation/task/checkpoint
**Score**: 🔥 Must do

### M4. assistant-ui Chat Runtime Migration (2-3 weeks)
**What**: Replace the 2,292-line monolithic chat-interface.tsx with assistant-ui's composable runtime.
**Why 10x**: Unlocks message editing, branch picking, multi-thread management, tool UI composition, streaming improvements — all free from the framework.
**Risk**: VoicePill, avatar emotions, artifact panel need preservation as custom components.
**Approach**: Phase 1 — new chat surfaces (builder, embedded). Phase 2 — evaluate main chat.
**Score**: 👍 Strong

---

## Medium Opportunities

### D1. Thinking/Reasoning Visualization
**What**: Show users when BitBit is thinking and expose reasoning traces.
**Libraries**: prompt-kit `thinking-bar` + `chain-of-thought`, AI Elements `reasoning`, taki-ui `reasoning`
**Impact**: Builds trust. Users see the AI is working, not stuck.
**Score**: 🔥 Must do

### D2. Rich Citations and Sources
**What**: When BitBit cites RAG results, show source pills with hover previews.
**Libraries**: prompt-kit `source`, AI Elements `sources` + `inline-citation`
**Impact**: Credibility. Users can verify AI claims.
**Score**: 👍 Strong

### D3. Code Block & Terminal Rendering
**What**: Better code/terminal output for builder role and agent debugging.
**Libraries**: AI Elements `code-block` (Shiki), `terminal` (ANSI), `file-tree`, `stack-trace`, `test-results`
**Impact**: Developer users get proper tooling UI.
**Score**: 👍 Strong

### D4. shadcn-hooks Cleanup
**What**: Replace 30+ raw addEventListener calls, 10+ clipboard implementations, 3+ hand-rolled debounces with battle-tested hooks.
**Libraries**: shadcn-hooks — `use-debounce`, `use-clipboard`, `use-event-listener`, `use-click-away`, `use-is-match-media`
**Impact**: Code quality, fewer bugs, smaller surface area.
**Score**: 👍 Strong

### D5. Plan/Task/Checkpoint Components
**What**: Structured plan display for multi-step agent workflows.
**Libraries**: AI Elements `plan` + `task` + `checkpoint`, taki-ui equivalents
**Impact**: Users see what the agent is doing step by step, not just the final result.
**Score**: 👍 Strong

---

## Small Gems

### S1. Feedback Bar on AI Responses
**What**: Thumbs up/down on every AI message for quality tracking.
**Library**: prompt-kit `feedback-bar`
**Effort**: 30 minutes
**Score**: 🔥 Must do

### S2. Suggestion Chips
**What**: Clickable follow-up prompts after AI responses.
**Library**: AI Elements `suggestion` (zero deps)
**Effort**: 30 minutes
**Score**: 🔥 Must do

### S3. Text Shimmer for Loading States
**What**: Animated shimmer text while AI is generating.
**Library**: AI Elements `shimmer` (already installed), prompt-kit `text-shimmer`
**Effort**: 15 minutes to wire in
**Score**: 🔥 Must do

### S4. Streaming Markdown with Block Memoization
**What**: Per-block memoized markdown rendering that doesn't re-render already-rendered blocks during streaming.
**Library**: prompt-kit `markdown` component
**Effort**: 1 hour swap
**Score**: 👍 Strong

### S5. Web Preview for Builder Role
**What**: Iframe preview with navigation for website builds.
**Library**: AI Elements `web-preview`
**Effort**: 2 hours
**Score**: 👍 Strong

### S6. Document Visibility Hook
**What**: Pause realtime subscriptions and animations when tab is hidden.
**Library**: shadcn-hooks `use-document-visibility`
**Effort**: 1 hour
**Score**: 👍 Strong

---

## Library-to-Feature Mapping

| Library | Install | Best Components for BitBit |
|---------|---------|---------------------------|
| **assistant-ui** | `npm i @assistant-ui/react @assistant-ui/react-ai-sdk` | Thread, Composer, Tool renderers, ThreadList, BranchPicker |
| **Tool UI** | `npx shadcn@latest add https://ui.inference.sh/r/widgets.json` | widget-renderer (declarative JSON→UI), markdown, code-block |
| **prompt-kit** | `npx shadcn@latest add "https://prompt-kit.com/c/[name].json"` | thinking-bar, chain-of-thought, tool, steps, source, feedback-bar, loader |
| **AI Elements** | `npx shadcn@latest add @ai-elements/[name]` | code-block, terminal, file-tree, plan, task, checkpoint, suggestion, web-preview, stack-trace, test-results |
| **shadcn-hooks** | `npx shadcn@latest add @shadcnhooks/[name]` | use-debounce, use-clipboard, use-event-listener, use-click-away, use-is-match-media |
| **taki-ui** | Cherry-pick source, swap React Aria→Radix | tool, reasoning, chain-of-thought, artifact, sources, branch, plan |
| **GAIA UI** | `npx shadcn@latest add @heygaia/[name]` | notification-card, todo-item, workflow-card, goal-card (when available) |

---

## Recommended Priority

### Do Now (This Week)
1. **Wire intelligence to dashboard** — replace hardcoded KPIs with real data
2. **Install prompt-kit components** — thinking-bar, chain-of-thought, tool, steps, source, feedback-bar
3. **Install shadcn-hooks** — use-debounce, use-clipboard, use-event-listener, use-click-away
4. **Install AI Elements** — code-block, terminal, file-tree, suggestion, plan, task
5. **Install Tool UI widgets** — widget-renderer for declarative tool UIs

### Do Next (Next 2 Weeks)
1. **Generative UI for top 5 tools** — wire widget-renderer to tool call results
2. **Push-first activity stream** — real-time feed with inline approvals
3. **Thinking/reasoning visualization** — wire thinking-bar to TAOR engine
4. **assistant-ui Phase 1** — use for builder dashboard chat and embedded assistants

### Explore (Month 2)
1. **assistant-ui Phase 2** — evaluate main chat migration
2. **GAIA UI components** — when notification-card and todo-item become available in registry
3. **Web preview for builder** — iframe preview panel

---

## Questions

### Answered
- **Q**: Can we use assistant-ui with Anthropic SDK? **A**: Yes, via ExternalStoreRuntime adapter or AI SDK's @ai-sdk/anthropic provider. BitBit already has `ai@6.0.116` installed.
- **Q**: Do AI Elements require Vercel AI SDK at runtime? **A**: No — components use `import type` only. Types can be aliased.
- **Q**: Can taki-ui components work with our Radix-based shadcn? **A**: Not directly (React Aria primitives), but AI element source code can be adapted with 1:1 Radix swaps.

### Blockers
- **Q**: Should the main chat migrate to assistant-ui or stay custom? (Need user validation after Phase 1)
- **Q**: Which GAIA UI components are actually available in their registry? (Most return empty — may need to wait or build our own)

## Next Steps
- [ ] Install the 5 immediate libraries (prompt-kit, shadcn-hooks, AI Elements additions, Tool UI widgets)
- [ ] Wire dashboard KPIs to real intelligence data
- [ ] Build tool result widget schemas for top 5 agent tools
- [ ] Set up assistant-ui for builder dashboard chat
- [ ] Validate the activity stream concept with real Supabase realtime data
