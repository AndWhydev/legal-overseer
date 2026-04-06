# BitBit Migration: AI SDK v6 + AI Gateway

## Status: APPROVED

**Decision**: Adopt AI SDK v6 + AI Gateway as foundation. NO Mastra — BitBit's novel architecture (Memory Palace, sleep consolidation, skill belts, Tool RAG, complexity-gated thinking) is the competitive edge and must not be flattened into off-the-shelf abstractions.

---

## Principle

AI SDK v6 provides low-level primitives that don't constrain novel architecture.
AI Gateway provides model routing infrastructure.
BitBit provides the SOTA intelligence layer on top.

---

## Current State (~2,000 LOC custom orchestration)

| Module | LOC | Status |
|--------|-----|--------|
| TAOR Loop | 850 | Replace core with ToolLoopAgent, keep hooks |
| Memory Palace | 300+ | KEEP (novel — no framework equivalent) |
| Context Assembly | 200+ | Simplify via prepareStep hook |
| Tool RAG + Deferred Loader | 172 | KEEP (solves 100+ tool context problem) |
| Skills Registry + RAG | 186 | KEEP (unique to BitBit) |
| Planner | 150+ | KEEP (Haiku pre-flight cost optimization) |
| Swarm Coordinator | 150+ | KEEP (custom multi-agent with capability boundaries) |
| Model Registry | 67 | DELETE (AI Gateway replaces) |
| Provider | 19 | DELETE (AI Gateway replaces) |

---

## What Changes

### DELETE (~90 LOC)
- `model-registry.ts` — AI Gateway strings replace purpose-based routing
- `provider.ts` — No explicit provider setup needed

### REPLACE (~500 LOC net reduction)
- TAOR loop async generator → AI SDK v6 `ToolLoopAgent`
  - `prepareStep` → context assembly + skill injection
  - `onStepFinish` → reflection, correction detection, memory corroboration
  - `onFinish` → plan persistence, lesson promotion
  - `experimental_context` → shared state across steps
  - `stopWhen` → replaces iteration safety ceiling
- Planner JSON parsing → `Output.object({ schema: PlanOutputSchema })`
- Tool definitions → AI SDK v6 `tool()` with `inputSchema` (not `parameters`)
- Streaming → AI SDK stream primitives

### KEEP (BitBit's novel SOTA contributions)
- Memory Palace (7 types, decay, confidence, consolidation)
- Sleep consolidation (6-stage cognitive pipeline)
- Skill Belt System (deferred loading, RAG selection, role scoping)
- Tool RAG + deferred loading (100+ tool context optimization)
- Planner pre-flight (Haiku complexity gating)
- Swarm coordinator + capability boundaries
- Correction feedback loops (memory penalty/corroboration)
- Complexity-gated extended thinking

---

## Migration Phases

### Phase 0: Foundation Swap
**Scope**: Swap model calls to AI Gateway, zero behavior change
**Changes**:
- All model calls use AI Gateway strings: `'anthropic/claude-sonnet-4-5'`
- Delete model-registry.ts, provider.ts
- Planner uses `Output.object()` for structured output
- Tool definitions updated to v6 format (`inputSchema`)
**Risk**: Low

### Phase 1: TAOR → ToolLoopAgent
**Scope**: Replace custom async generator with AI SDK agent
**Changes**:
- Create ToolLoopAgent with BitBit's hooks wired in
- prepareStep: run planner, Tool RAG, Skill RAG, context assembly
- onStepFinish: reflection, correction detection
- onFinish: plan persistence, memory corroboration
- Feature flag for A/B testing old vs new
**Risk**: High (mitigated by feature flag)

### Phase 2: Tools + Skills Completion
**Scope**: Add image gen tools, port remaining skills, audit
- Image generation via AI SDK `tool()` (fal.ai or similar)
- Port remaining Inferen skills
- Quality audit on all skills
**Risk**: Low

### Phase 3: Evaluate Vercel Workflows
**Scope**: Determine if durable execution improves sleep consolidation
- Test `'use workflow'` / `'use step'` for consolidation stages
- Evaluate DurableAgent for long-running tasks
- Adopt only if it genuinely improves reliability
**Risk**: Low (evaluation only, no commitment)

### Phase 4: Cleanup + Observability
**Scope**: Remove dead code, add monitoring
- Delete replaced modules
- AI SDK DevTools for development
- AI Gateway dashboard for production monitoring
- OpenTelemetry tracing
- Performance benchmark
**Risk**: Low

---

## Package Changes

### Add
```json
{
  "@ai-sdk/gateway": "^1.x"
}
```

### Update
```json
{
  "ai": "^6.x" (AI SDK v6)
}
```

### Eventually Remove
```json
{
  "@anthropic-ai/sdk": "evaluate — may not be needed with AI Gateway"
}
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Model call boilerplate | 86 LOC | 0 (Gateway strings) |
| TAOR loop complexity | 850 LOC | ~350 LOC (ToolLoopAgent + hooks) |
| Structured output parsing | Manual JSON + regex fallback | `Output.object()` (zero parsing code) |
| Model switching | Code change + deploy | Change string |
| Observability | Manual logging | Gateway dashboard + DevTools + OTel |
| Novel architecture | Preserved | Preserved + better foundation |
