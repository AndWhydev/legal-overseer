# Visual Thought Pipeline — Research & Architecture Notes

## Status: Research Complete, Ready to Plan & Implement

## What We Have

### Engine Event Lifecycle (fully audited)
```
User Message → Cost Guard → Model Routing → Context Assembly → API Stream → Tool Calls → Response
```

### Current Event Types (engine.ts)
- `thinking` — model routing reasoning (currently suppressed from UI)
- `content_delta` — streaming text tokens (working)
- `tool_call` — tool name + input JSON
- `tool_result` — tool output + success/fail
- `message` — complete response text
- `error` — error messages
- `cost_blocked` — budget exceeded
- `done` — terminal event with usage stats

### Data Available But Hidden From Frontend
1. **Cost Guard**: spentToday vs dailyLimit
2. **Model Routing**: tier (opus/sonnet/haiku), reasoning, trigger matches, word count heuristics
3. **Context Assembly**: resolved entities (up to 3), match confidence, relationships, timeline, financial signals, deadlines, memories
4. **Token Usage**: input/output per iteration, cost estimate
5. **Iteration Count**: current loop / max (8)
6. **Duration**: wall-clock time

### Existing UI Components (data-viz library)
- `ProcessPipeline` — horizontal stages with animated DataConnector lines
- `DataConnector` — animated flow dots between nodes (active/warning/error/idle)
- `GlowIndicator` — pulsing status dots
- `StatusBadge` — colored status pills with optional glow
- `MiniSparkline`, `MiniDonut`, `MiniGauge` — inline charts

## Proposed Architecture

### 1. New Engine Events to Add
```typescript
| { type: 'stage'; data: { stage: string; status: 'start' | 'done'; meta?: Record<string, unknown> } }
```
Stages: `cost_check`, `model_routing`, `context_assembly`, `api_streaming`, `tool_execution`

Each stage emits `start` + `done` with relevant metadata:
- `cost_check`: { allowed: true, spentToday, dailyLimit }
- `model_routing`: { tier, reasoning, triggers }
- `context_assembly`: { entitiesFound: number, entityNames: string[] }
- `api_streaming`: { model, maxTokens }
- `tool_execution`: { toolName, iteration }

### 2. Frontend Component: `<ThoughtPipeline />`
- Renders inline in chat, replacing the loading dots during processing
- Uses ProcessPipeline with dynamic stages that light up as events arrive
- Each stage: idle → active (glowing) → done (green checkmark)
- Collapses/fades when content_delta starts streaming
- Expandable on click to show detailed metadata

### 3. Implementation Plan
1. Add `stage` event type to engine.ts AgentEvent union
2. Yield stage start/done events at each step in runAgentChat()
3. Create `<ThoughtPipeline />` component using ProcessPipeline + GlowIndicator
4. Add `stage` case to chat-interface.tsx event switch
5. Show ThoughtPipeline during loading, collapse when streaming starts
6. Add expandable detail panel for each stage's metadata

### Key Files
- Engine: `personal-assistant/src/lib/agent/engine.ts`
- Frontend: `personal-assistant/src/components/chat/chat-interface.tsx`
- New component: `personal-assistant/src/components/chat/thought-pipeline.tsx`
- Existing viz: `personal-assistant/src/components/ui/data-viz/`

## Quick Fixes Already Shipped (this session)
- [x] Hidden "routing to sonnet" text from user
- [x] Fixed duplicate icon + loading dots alongside streaming text
- [x] Streaming token-by-token via messages.stream() + content_delta events
- [x] Instant exit transition on send (no animation delay)
- [x] Aura glow fades out when chat active
