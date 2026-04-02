# BitBit x AI SDK Agents: Pattern Integration Map

**Generated**: 2 April 2026
**Source**: 108 patterns from aisdkagents.com (premium), cross-referenced against BitBit codebase (1,378 source files, ~200 API routes)

---

## Executive Summary

BitBit has the `ai` package v6.0.116 installed but uses it in exactly **1 file** (a type import). The entire AI infrastructure runs on raw `@anthropic-ai/sdk` with a custom SSE protocol, manual tool-calling loop (TAOR engine), and 2,090-line chat component.

There are **11 AI SDK UI components already built** in `src/components/ai-elements/` but **only 2 are used** (shimmer, inline-citation). The other 9 (Confirmation, Reasoning, Plan, Task, Suggestion, Checkpoint, FileTree, Terminal, CodeBlock) sit unused.

This map identifies where each of the 108 scraped patterns fits into BitBit, organised by migration phase.

---

## Phase 1: Drop-In Wins (No Architecture Change)

These patterns can be integrated immediately alongside the existing Anthropic SDK code. They fill gaps or improve existing features without touching the core chat/agent pipeline.

### 1.1 Activate Unused AI Elements Already In Codebase

| BitBit Component | Pattern Source | What It Does | Where to Use |
|---|---|---|---|
| `ai-elements/confirmation.tsx` | `ai-chat-agent-tool-approval` | Tool approval with state machine (streaming→requested→responded) | Replace `InlineApprovalCard` in chat-interface.tsx AND `approval-card.tsx` in dashboard |
| `ai-elements/reasoning.tsx` | `ai-elements-reasoning-chat` | Collapsible reasoning chain with duration tracking | Replace ~200 lines of inline reasoning JSX in chat-interface.tsx |
| `ai-elements/plan.tsx` | `ai-elements-plan` | Execution plan visualisation with streaming state | Replace `ThoughtPipeline` component + handle plan/plan_stage_update events |
| `ai-elements/suggestion.tsx` | `ai-elements-sources-chat` | Scrollable suggestion pills | Replace `FollowUpChips` component |
| `ai-elements/checkpoint.tsx` | N/A (already built) | Conversation checkpoint markers | Wire into checkpoint SSE events (currently received but discarded) |
| `ai-elements/task.tsx` | `ai-elements-task-demo` | Task card with file tree | Use in tool_result rendering for file/search operations |

**Estimated effort**: 2-3 days. These components already exist in the codebase.

### 1.2 Tool API Patterns (Server-Side, Alongside Existing Tools)

| Pattern | Slug | Where It Fits in BitBit | Value |
|---|---|---|---|
| Tool API Context | `tool-api-context` | Add tenant/org context to every tool call (currently manual in tool-executor.ts) | ★★★★★ |
| Tool Call Repair | `tool-api-tool-call-repair` | Auto-repair malformed tool calls from LLM (currently fails hard) | ★★★★☆ |
| Tool Input Lifecycle Hooks | `tool-api-input-lifecycle-hooks` | Pre/post hooks for tool inputs (validation, logging, transformation) | ★★★★☆ |
| Preliminary Tool Results | `tool-api-preliminary-tool-results` | Show "searching..." progress before tool completes (already have tool_progress events) | ★★★☆☆ |
| Dynamic Tool | `tool-api-dynamic-tool` | Generate tool schemas dynamically (like BitBit's deferred-loader.ts) | ★★★☆☆ |

### 1.3 Web/Search Tools (Drop Into Existing Tool Groups)

| Pattern | Slug | BitBit Target | Notes |
|---|---|---|---|
| Exa Web Search | `tool-websearch-exa` / `tool-websearch-exa-2` | Replace/augment `superpower-tools.ts` web_search | More structured search results with citations |
| Claude Web Search | `tool-websearch-claude` | Add as alternative search provider | Native Claude web search grounding |
| Firecrawl Scrape | `tool-websearch-firecrawl` | Replace `fetch_url` / `browse_website` tools | Better scraping with JS rendering |
| Cheerio Scraper | `cheerio-scraper` | Lightweight alternative to Firecrawl | Free, no API key needed |
| Jina Scraper | `jina-scraper` | Advanced scraping with proxy rotation | For sites that block scrapers |
| Markdown.new Scraper | `markdown-new-scraper` | Free web-to-markdown via Cloudflare | Zero-cost option |
| PDF Analysis | `ai-pdf-ingest` | Enhance meeting upload + attachment processing | Already have PDF parse but no AI analysis |

### 1.4 Structured Output Patterns

| Pattern | Slug | BitBit Target | Notes |
|---|---|---|---|
| Generate Object (OpenAI) | `basics-generate-object-openai` | Replace manual JSON parsing in `structured-output.ts` | Type-safe with Zod schemas |
| Generate Object (Claude) | `basics-generate-object-claude` | Same, using Anthropic provider | Direct replacement |
| Generate Object (Google) | `basics-generate-object-google` | Add Gemini as fallback provider | Provider diversification |
| Stream Object | `basics-stream-object` | Stream lead qualification, invoice data, contact enrichment | New capability |
| Structured Agent Output: Choice | `agent-api-structured-agent-output-choice` | Agent decides between predefined actions | Tool routing improvement |
| Structured Agent Output: Array | `agent-api-structured-agent-output-array` | Agent returns list of items (leads, tasks, etc.) | Batch processing |

---

## Phase 2: Background AI Call Migration (Medium Effort, High Count)

Migrate the 20+ files using `new Anthropic()` + `client.messages.create()` to `generateText()` / `generateObject()` from the AI SDK. Each is a self-contained change.

### Files to Migrate

| File | Current Usage | AI SDK Replacement | Pattern Reference |
|---|---|---|---|
| `lib/memory/memory-consolidator.ts` | messages.create for memory extraction | generateObject() with Zod schema | `basics-generate-object-claude` |
| `lib/memory/conversation-compressor.ts` | messages.create for summarisation | generateText() | `basics-generate-text` |
| `lib/memory/thread-archiver.ts` | messages.create for archive summary | generateText() | `basics-generate-text` |
| `lib/intelligence/reflexion.ts` | messages.create for self-reflection | generateText() with system prompt | `ai-chat-agent-evaluator-optimizer-pattern` |
| `lib/intelligence/ingest-enrichment.ts` | messages.create for data enrichment | generateObject() | `ai-sdk-enrich-form` |
| `lib/agent/planner.ts` | Haiku for plan generation | generateObject() with plan schema | `agent-hil-plan` |
| `lib/agent/classifier.ts` | messages.create for classification | generateObject() with enum schema | `ai-agents-routing` |
| `lib/agent/sentiment.ts` | messages.create for sentiment | generateObject() | `basics-generate-object-claude` |
| `lib/agent/ad-script-gen.ts` | messages.create for ad copy | generateText() | `basics-generate-text` |
| `lib/agent/client-comms.ts` | messages.create for draft comms | generateText() | `basics-generate-text` |
| `lib/agent/daily-digest.ts` | messages.create for digest | generateText() | `basics-generate-text` |
| `lib/workflows/workflow-rule-parser.ts` | messages.create for NL->rule parsing | generateObject() with rule schema | `ai-agents-routing` |
| `lib/swarm/coordinator.ts` | 3x messages.create for routing/negotiation/synthesis | generateText() x3 | `ai-chat-agent-orchestrater-pattern` |
| `lib/swarm/participants.ts` | Per-agent messages.create | generateText() with tools | `sub-agent-orchestrator` |
| `lib/meetings/ai-extraction.ts` | messages.create for meeting extraction | generateObject() | `basics-generate-object-claude` |
| `lib/meetings/followup-drafter.ts` | messages.create for follow-up drafts | generateText() | `basics-generate-text` |
| `lib/creator-studio/generation.ts` | messages.create for content generation | generateText() / streamText() | `basics-stream-text` |
| `lib/builder/generator.ts` | messages.create for website generation | generateText() | `basics-generate-text` |
| `lib/onboarding/opus-synthesis.ts` | messages.create for deep synthesis | generateText() with extended thinking | `basics-generate-text` |
| `app/api/ai/text/route.ts` | Streaming text response | streamText() + toDataStreamResponse() | `basics-stream-text` |
| `app/api/ai/voice/route.ts` | Voice processing | generateText() | `basics-generate-text` |

**Estimated effort**: 1-2 days per file, total ~2 weeks. Each is independent.
**Benefits**: Provider-agnostic (can switch to OpenAI/Google), structured outputs, middleware support, telemetry.

---

## Phase 3: Agent Pattern Upgrades (Architecture Enhancement)

### 3.1 Multi-Step Tool Pattern → Enhance TAOR Loop

| Pattern | `ai-chat-agent-multi-step-tool-pattern` |
|---|---|
| **What it does** | Agent with stepCountIs() + hasToolCall() stop conditions, multiple tool types (web search, analysis, decision, news search), structured answer via provideAnswer tool |
| **BitBit mapping** | The TAOR loop already does this manually with a 50-iteration ceiling. Adopt AI SDK's `maxSteps` + `stepCountIs()` as a cleaner alternative to the manual loop |
| **Key adoption** | `stepCountIs(MAX_AGENT_STEPS)` replaces the manual iteration counter; `hasToolCall("provide_answer")` replaces the manual "done" detection |

### 3.2 Orchestrator-Worker Pattern → Upgrade Swarm System

| Pattern | `ai-chat-agent-orchestrater-pattern` |
|---|---|
| **What it does** | Coordinator agent delegates to specialist worker agents, aggregates results |
| **BitBit mapping** | Direct replacement for `swarm/coordinator.ts` + `swarm/participants.ts`. The pattern uses Agent() with sub-agent spawning |
| **Key file** | `wdk-workflows-orchestrator-worfklow` provides the WDK (Workflow Development Kit) version with durable execution |

### 3.3 Evaluator-Optimizer Pattern → Enhance Reflexion System

| Pattern | `ai-chat-agent-evaluator-optimizer-pattern` |
|---|---|
| **What it does** | Two agents: evaluator scores output quality, optimizer iterates until quality threshold met |
| **BitBit mapping** | Replace `intelligence/reflexion.ts` with proper eval-optimize loop. Apply to: ad script generation, proposal drafting, content creation |
| **Benefit** | Automated quality improvement before showing results to user |

### 3.4 Routing Pattern → Enhance Agent Classifier

| Pattern | `ai-agents-routing` |
|---|---|
| **What it does** | Routes messages to specialised agents based on classification |
| **BitBit mapping** | Replace `agent/classifier.ts` with AI SDK routing pattern. Maps cleanly to existing model registry (haiku/sonnet/opus routing) |

### 3.5 Parallel Processing → Enhance Swarm Steps

| Pattern | `ai-agents-parallel-processing` |
|---|---|
| **What it does** | Run multiple AI tasks concurrently, aggregate results |
| **BitBit mapping** | Swarm executor already does `Promise.allSettled` for parallel steps. This pattern adds structured parallel execution with proper error handling |

### 3.6 Human-in-the-Loop Patterns → Unify Approval System

| Pattern | Slug | BitBit Target |
|---|---|---|
| HIL Tool Approval | `ai-chat-agent-tool-approval` | **Unify the THREE separate approval implementations** into one pattern: inline chat approval, standalone queue, and the unused ai-elements/confirmation.tsx |
| HIL Inquire Multiple Choice | `ai-human-in-the-loop-inquire-multiple-choice` | Let agent ask user to choose between options mid-conversation |
| HIL Inquire Text | `ai-human-in-the-loop-inquire-text` | Let agent request free-text input mid-tool-execution |
| HIL Plan Builder | `agent-hil-plan` | Show execution plan, get user approval before executing |
| HIL Agentic Context Builder | `ai-human-in-the-loop-agentic-context-builder` | Onboarding: agent asks questions, builds context progressively |

### 3.7 Workflow Patterns (WDK) → Upgrade Workflow Engine

| Pattern | Slug | BitBit Target |
|---|---|---|
| Sequential Workflow | `wdk-workflows-sequential-worfklow` | Replace `workflow-rule-engine.ts` sequential execution |
| Parallel Workflow | `wdk-workflows-parallel-worfklow` | Add parallel step support to workflows |
| Routing Workflow | `wdk-workflows-routing-worfklow` | Conditional routing in workflow chains |
| Evaluator Workflow | `wdk-workflows-evaluator-workflow` | Quality-gated workflow steps |
| Orchestrator Workflow | `wdk-workflows-orchestrator-worfklow` | Complex multi-agent workflow orchestration |

---

## Phase 4: Core Chat Migration (Highest Impact, Highest Risk)

### 4.1 Backend: TAOR Loop → AI SDK streamText + Agent

**Current**: `src/lib/agent/engine/taor-loop.ts` (643 lines)
- Raw `@anthropic-ai/sdk` with `client.messages.stream()`
- Manual 50-iteration loop
- Custom SSE event protocol (25+ event types)
- Plan stages, tool RAG, deferred loading, compaction, circuit breaker

**Target**: AI SDK `streamText()` with `maxSteps` or `Agent()` class
- `@ai-sdk/anthropic` provider
- `maxSteps: 50` replaces manual loop
- `tool()` definitions replace manual tool schemas
- `onStepFinish` callback for plan stage tracking
- `toDataStreamResponse()` replaces custom SSE

**Patterns to adopt**:
- `ai-chat-agent-multi-step-tool-pattern` (core Agent + tools)
- `tool-api-context` (tenant context injection)
- `tool-api-tool-call-repair` (self-healing tool calls)
- `tool-api-input-lifecycle-hooks` (pre/post hooks)

**Preservation requirements** (custom features that must survive migration):
- ✅ Plan generation (Haiku side-channel) → `onStepFinish` + parallel plan call
- ✅ Tool RAG filtering → Pre-filter tools before passing to `streamText`
- ✅ Deferred tool loading → Dynamic tool schemas via `tool-api-dynamic-tool` pattern
- ✅ Context assembly (4-tier) → Pass assembled context as `system` prompt
- ✅ Compaction handling → Monitor token count, re-summarise history
- ✅ Circuit breaker → AI SDK middleware or wrap in try/catch
- ✅ Cost guard → Check before calling, use `onStepFinish` for running costs
- ✅ Confidence routing → Post-tool-call hook to route to approval queue
- ✅ Response guard (leak detection, humanisation) → AI SDK middleware

### 4.2 Frontend: Manual SSE → useChat Hook

**Current**: `src/components/chat/chat-interface.tsx` (2,090 lines)
- Manual `fetch()` + `ReadableStream` reader
- Custom SSE event parsing (switch/case on 25+ event types)
- Custom `useSmoothStream` hook for animation
- Manual message state management with `useState<Message[]>`
- Manual tool call tracking
- Manual abort controller management

**Target**: AI SDK `useChat()` from `@ai-sdk/react`
- Automatic message state management
- Built-in streaming with proper abort handling
- `toolInvocations` on messages for tool lifecycle
- `addToolResult()` for client-side tool approval
- `experimental_throttle` for smooth streaming
- `onToolCall` callback for client-side tool handling

**Patterns to adopt**:
- `examples-chat-base-clone` (reference useChat implementation)
- `ai-chat-agent-tool-approval` (tool approval via addToolResult)
- `ai-elements-reasoning-chat` (reasoning display)
- `ai-elements-sources-chat` (citation rendering)
- `ai-elements-inline-citation` (inline citations)

**What can be removed** (~500 lines):
- Manual SSE parser
- Manual abort controller
- Manual message buffer
- Manual stale request detection
- Manual streaming state machine
- Custom smooth stream buffer (replaced by experimental_throttle)

---

## Phase 5: Full Feature Examples to Port

These are complete multi-feature agents from the pattern library that map to BitBit business features.

| Pattern | Slug | BitBit Feature | What It Adds |
|---|---|---|---|
| Competitor Research Agent | `example-agent-competitor` | Lead discovery (`/agent/leads/discover`) | Multi-tool research with structured output, citations, scoring |
| Data Analysis Agent | `example-agent-data-analysis` | Revenue intelligence (`/revenue/*`) | Data ingestion, chart generation, insight extraction |
| SEO Audit Agent | `example-agent-seo-audit` | SEO tools (`seo-tools.ts`) | Full-page audit with scoring, recommendations |
| A11y Audit Agent | `example-agent-a11y-audit` | Builder (`builder-tools.ts`) | Accessibility audit for generated websites |
| Branding Agent | `example-agent-branding` | Creator Studio | Brand colour, typography, logo generation |
| Reddit Validation | `example-agent-reddit-validation` | Lead qualification | Social proof validation for prospects |
| Form Generator | `examples-form-generator` | Onboarding | AI-driven form generation for client intake |
| Marketing Plan Agent | `agent-usecase-marketing-plan-implement` | Creator Studio + Ads | Full marketing plan generation and execution |
| Brand Strategy Wizard | `levee-brand-strategy` | Onboarding + Creator Studio | Multi-stage brand strategy wizard |

---

## Phase 6: UI Component Patterns

### JSON Render Patterns (New Capabilities)

| Pattern | Slug | BitBit Use Case |
|---|---|---|
| JSON Render Shadcn | `json-render-shadcn` | Agent generates UI components dynamically |
| JSON Render PDF | `json-render-pdf` | Agent generates PDF reports/invoices (replace jsPDF) |
| JSON Render Image | `json-render-image` | Agent generates social media images |
| JSON Render Email | `json-render-email` | Agent generates HTML emails (for campaigns) |
| Firecrawl Brand PDF | `firecrawl-brand-pdf` | Generate branded PDF reports from web data |

### Marketing UI Components (For Landing/Public Pages)

| Pattern | Slug | BitBit Page |
|---|---|---|
| Feature Grid | `marketing-feature-grid-1` | `/pricing`, homepage |
| Bento Layout | `marketing-bento-1` | Homepage feature showcase |
| Model Comparison | `marketing-model-comparison-2` | Pricing comparison table |
| Integration Showcase | `marketing-integrations-1` | `/connections` page |
| ROI Calculator | `marketing-calculator-agent-roi` | `/pricing` or `/demo` |
| Changelog | `marketing-changelog-1` | Product changelog page |

---

## Migration Priority Recommendation

```
WEEK 1-2:  Phase 1 (activate unused AI elements, tool API patterns)
WEEK 2-4:  Phase 2 (migrate 20+ background AI calls to generateText/generateObject)
WEEK 4-6:  Phase 3 (agent patterns: routing, eval-optimizer, HIL unification)
WEEK 6-8:  Phase 3 continued (workflow WDK patterns, swarm upgrades)
WEEK 8-12: Phase 4 (core chat migration: TAOR loop + chat frontend)
ONGOING:   Phase 5-6 (port full agent examples, add new capabilities)
```

### Quick Wins This Week

1. **Wire up `ai-elements/confirmation.tsx`** to replace `InlineApprovalCard` (it's already built!)
2. **Wire up `ai-elements/reasoning.tsx`** to replace inline reasoning chain (~200 lines removed)
3. **Wire up `ai-elements/plan.tsx`** to handle plan/plan_stage_update events (currently discarded)
4. **Add `@ai-sdk/anthropic`** provider package
5. **Migrate `app/api/ai/text/route.ts`** to use `streamText()` (simplest streaming migration)

---

## Appendix: Pattern-to-File Mapping

All 108 patterns with their local source at `~/aisdkagents-patterns/<slug>/`.
Full pattern inventory report at `~/aisdkagents-patterns/PATTERN_INVENTORY_REPORT.md`.
Searchable index at `~/aisdkagents-patterns/index.json`.
