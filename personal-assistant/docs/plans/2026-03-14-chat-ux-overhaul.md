# BitBit Chat UX Overhaul — Plan

**Date**: 2026-03-14
**Status**: Executing
**Goal**: Transform BitBit's chat from basic message bubbles into a premium AI-native conversational interface with personality, transparency, and cross-platform continuity.

---

## Workstreams

### WS1: BitBit Personality & Response Style (Prompt Engineering)
**Owner**: Personality Agent
**Files**: `prompt-builder.ts`, `response-guard.ts`

Tasks:
- [ ] T1.1: Update BITBIT_IDENTITY_PREAMBLE with refined personality directives
  - No em-dashes (use commas, semicolons, or sentence breaks instead)
  - Concise and informative over verbose (respect user's time)
  - Proactive, busy personality — acts like a sharp colleague who's already two steps ahead
  - Natural Claude-like tone (not robotic ChatGPT filler)
  - Never use "Here's...", "Certainly!", "Of course!", "Great question!"
  - Lead with the answer, not preamble
  - Personality of someone who cares deeply but is efficient
- [ ] T1.2: Add response style instructions to system prompt
  - Prefer bullet points and structured output for multi-item responses
  - Use bold sparingly for key terms, not for emphasis
  - Short paragraphs (2-3 sentences max)
  - When citing sources/data, be specific (not "some studies show")
- [ ] T1.3: Add em-dash stripping to response-guard.ts as post-processing
- [ ] T1.4: Test personality with sample conversations (Dribbble example as benchmark)

### WS2: Chat UI — AI Elements Integration (Frontend)
**Owner**: UI Agent
**Files**: `chat-interface.tsx`, `message-bubble.tsx`, `tool-call-card.tsx`, `thought-pipeline.tsx`

Tasks:
- [ ] T2.1: Integrate `<Reasoning>` component for thinking/extended thinking display
  - Replace current loading dots with collapsible reasoning panel
  - Show duration, auto-collapse when thinking ends
  - Glassmorphic styling adaptation
- [ ] T2.2: Integrate `<ChainOfThought>` for multi-step agent reasoning
  - Wire to plan stages from Haiku planner
  - Each stage becomes a ChainOfThought step with status indicators
  - Search results embedded when web tools are used
- [ ] T2.3: Integrate `<InlineCitation>` for source references
  - Parse citation markers [1], [2] from AI responses
  - Map to source objects (URLs, titles, descriptions)
  - Hover cards with source preview
- [ ] T2.4: Integrate `<Confirmation>` for tool approval
  - Wire to existing approval queue system
  - Show tool name, parameters, description before execution
  - Approve/reject buttons with animated state transitions
- [ ] T2.5: Integrate `<Checkpoint>` for conversation dividers
  - Auto-insert on topic shifts or session boundaries
  - Manual checkpoint creation via UI button
  - Restore-to-checkpoint functionality
- [ ] T2.6: Adapt all AI element components to BitBit glassmorphic design system
  - Override default shadcn styles with inline React.CSSProperties
  - Match existing chat bubble aesthetics

### WS3: Tool Call Animation Polish (Frontend)
**Owner**: Animation Agent
**Files**: `thought-pipeline.tsx`, `tool-call-card.tsx`, new: `tool-call-stream.tsx`

Tasks:
- [ ] T3.1: Redesign tool call spawn animation
  - Smooth staggered entrance (not two tools popping in simultaneously)
  - Spring physics for natural motion
  - Progressive disclosure: tool name first, then parameters, then result
- [ ] T3.2: Thinking indicator redesign
  - Replace up/down shimmer with premium pulsing brain/sparkle animation
  - Don't show tool calls until they actually execute
  - Skeleton state while waiting, then crossfade to actual content
- [ ] T3.3: Tool call cards — premium treatment
  - Glassmorphic card with subtle border animation
  - Expand/collapse with spring physics
  - Status transitions: pending → executing → complete/error
  - Icon + label + duration badge
- [ ] T3.4: Integration with ChainOfThought steps
  - Tool calls appear inline within reasoning chain steps
  - Smooth handoff between reasoning and tool execution states

### WS4: Engine Upgrades — Extended Thinking & Citations (Backend)
**Owner**: Engine Agent
**Files**: `engine.ts`, `chat/route.ts`, `unified-pipeline.ts`

Tasks:
- [ ] T4.1: Enable extended thinking in engine.ts
  - Add `thinking` parameter to Anthropic API calls for synthesis-tier
  - Stream `thinking` content blocks as `thinking_delta` SSE events
  - Set budget_tokens based on model purpose (4K classify, 8K converse, 16K synthesis)
- [ ] T4.2: Add citation extraction pipeline
  - Parse URL references from context assembly
  - Attach source metadata to streamed responses
  - Emit `citation` SSE events with source objects
- [ ] T4.3: Add checkpoint SSE events
  - Emit `checkpoint` event at conversation milestones
  - Include message index and auto-generated label
- [ ] T4.4: Stream plan stages as chain-of-thought steps
  - Enrich `plan` events with step descriptions
  - Include search result summaries when web tools return

### WS5: Cross-Platform Conversation Continuity (Architecture)
**Owner**: Continuity Agent
**Files**: `unified-pipeline.ts`, new: `conversation-sync.ts`

Tasks:
- [ ] T5.1: Checkpoint data model
  - Add `conversation_checkpoints` table (migration)
  - Fields: id, thread_id, message_index, label, created_at
  - RLS policies for org + user access
- [ ] T5.2: Checkpoint API endpoints
  - POST /api/conversations/:threadId/checkpoints — create checkpoint
  - GET /api/conversations/:threadId/checkpoints — list checkpoints
  - POST /api/conversations/:threadId/restore — restore to checkpoint
- [ ] T5.3: Session divider logic
  - Detect session boundaries (>30min gap, device change, topic shift)
  - Auto-insert visual dividers in conversation history
  - Persist dividers as metadata on conversation_messages
- [ ] T5.4: Conversation continuity across devices
  - Thread resolution by user ID (not session)
  - Last-active thread auto-resume on login
  - "Continue where you left off" UX

---

## Dependencies

- WS1 (personality) is independent — can start immediately
- WS2 depends on AI elements being installed (done) and WS4 for backend events
- WS3 is independent frontend work
- WS4 is backend prerequisite for WS2
- WS5 is independent architecture work

## Execution Order

Wave 1 (parallel): WS1 + WS3 + WS4 + WS5
Wave 2 (after WS4): WS2 (needs backend events to wire up)
