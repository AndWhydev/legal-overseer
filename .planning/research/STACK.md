# Technology Stack: v2.0 Autonomous Execution

**Project:** BitBit v2.0
**Researched:** 2026-03-31
**Overall confidence:** HIGH (primary sources verified via official docs and npm registry)

## Executive Summary

v2.0 adds three capability layers to the existing stack: (1) browser automation via Anthropic's native Computer Use API + Playwright as the execution substrate, (2) durable async job orchestration via Trigger.dev v4, and (3) workflow learning persisted in Supabase + Pinecone. The approach is deliberately conservative -- Anthropic CUA is the brain, Playwright is the hands, Trigger.dev manages the clock, Supabase stores the memory. No new databases, no new cloud vendors beyond Trigger.dev (which can self-host on the existing Fly.io infra).

**Total new production dependencies: 2** (`playwright`, `@trigger.dev/sdk`)
**Total dependency updates: 1** (`@anthropic-ai/sdk` 0.74.0 -> ^0.80.0)
**Estimated additional infra cost: ~$10-15/month** (one beefier Fly.io machine for browser sessions)

---

## What Already Exists (DO NOT ADD)

| Capability | Already Have | Version | Relevant to v2.0 |
|-----------|-------------|---------|-------------------|
| Anthropic SDK | `@anthropic-ai/sdk` | 0.74.0 | CUA API via `client.beta.messages.create()` -- just needs version bump |
| Playwright (tests) | `@playwright/test` | ^1.58.2 (devDep) | Same engine powers CUA browser execution |
| Supabase client | `@supabase/supabase-js` | 2.95.3 | Storage for evidence screenshots, tables for workflow patterns |
| Pinecone | `@pinecone-database/pinecone` | ^7.1.0 | Semantic search over workflow patterns |
| Voyage embeddings | `voyageai` | ^0.2.1 | Embed workflow pattern descriptions |
| TAOR agent loop | `taor-loop.ts` | Custom | Already uses `client.beta.messages`, tool dispatch, circuit breakers |
| Tool executor | `tool-executor.ts` | Custom | Parallel tool dispatch with budget checks -- CUA becomes another tool |
| Fly.io workers | `bitbit-workers` | 2x shared-cpu-1x 1024MB | Existing compute -- add one CUA-dedicated machine |
| Supabase Storage | Built into SDK | 2.95.3 | Already has `chat-attachments` bucket -- add `cua-evidence` bucket |
| Approval flow | Confidence routing | Custom | Already gates high-risk actions -- CUA actions slot in naturally |

---

## Recommended New Stack Additions

### 1. Browser Automation: Anthropic Computer Use API + Playwright

#### Anthropic Computer Use API (no new package -- uses existing SDK)

| | |
|---|---|
| **Tool type** | `computer_20251124` |
| **Beta header** | `computer-use-2025-11-24` |
| **Models supported** | Claude Opus 4.6, Claude Sonnet 4.6, Claude Opus 4.5 |
| **Purpose** | Vision + action decision engine -- screenshots in, coordinate actions out |
| **Why this** | Already paying for Anthropic API. CUA is a tool type on the existing Messages API, not a separate service. The SDK's `client.beta.messages.create()` already works in the TAOR loop. Adding CUA means adding one tool definition (`{ type: "computer_20251124", name: "computer", display_width_px: 1024, display_height_px: 768 }`) and a handler that executes the returned actions via Playwright. |
| **Integration point** | New tool handler in `lib/agent/tools/browser-tools.ts`. The TAOR loop dispatches CUA tool calls to the Fly.io CUA worker via HTTP. |
| **Token overhead** | ~735 tokens per tool definition + ~466-499 tokens system prompt overhead + screenshot image tokens per iteration |
| **Confidence** | HIGH -- verified directly from Anthropic Computer Use docs |

**Key API shape (TypeScript):**
```typescript
const response = await client.beta.messages.create({
  model: "claude-sonnet-4-5-20250514", // Sonnet for cost; Opus for complex
  max_tokens: 4096,
  tools: [{
    type: "computer_20251124",
    name: "computer",
    display_width_px: 1024,
    display_height_px: 768,
  }],
  messages: [...],
  betas: ["computer-use-2025-11-24"],
})
```

**Actions available:** `screenshot`, `left_click`, `right_click`, `double_click`, `triple_click`, `type`, `key`, `scroll`, `mouse_move`, `left_click_drag`, `left_mouse_down`, `left_mouse_up`, `hold_key`, `wait`, `zoom` (Opus 4.6/Sonnet 4.6 only).

#### Playwright (new production dependency)

| | |
|---|---|
| **Package** | `playwright` |
| **Version** | `^1.58.2` |
| **Purpose** | Headless Chromium execution -- the hands that execute CUA's decisions |
| **Why this** | Already have `@playwright/test` as devDep, so the team knows the API. Playwright provides: `page.screenshot()` for CUA screenshot capture (returns Buffer, convert to base64), `page.mouse.click(x, y)` / `page.keyboard.type(text)` / `page.keyboard.press(key)` for CUA action execution, `page.goto(url)` for navigation. Official Docker images (`mcr.microsoft.com/playwright`) include all Chromium system deps. |
| **Why NOT Puppeteer** | Playwright is strictly superior: better async handling, better TypeScript types, cross-browser support, already in the project. |
| **Integration** | CUA worker on Fly.io: receives action from CUA API, maps to Playwright method, captures screenshot, returns to CUA for next decision. ~200 lines of bridge code. |
| **Confidence** | HIGH -- npm version verified (`1.58.2`), Docker image confirmed |

```bash
npm install playwright
```

**Note:** `@playwright/test` remains as devDep for E2E tests. `playwright` (without `/test`) is the runtime library -- smaller, no test runner overhead. Xvfb is NOT needed: Playwright's headless Chromium does not require X11 or a virtual framebuffer. The Anthropic reference demo uses Xvfb because it runs a full Linux desktop environment -- our approach uses Playwright's native headless mode which renders directly without a display server.

#### Architecture Decision: Why NOT Stagehand

Stagehand by Browserbase (v3.2.0, `@browserbasehq/stagehand`) was thoroughly evaluated and rejected:

| Factor | Anthropic CUA + Playwright | Stagehand |
|--------|---------------------------|-----------|
| AI decision layer | One (Anthropic) | Two (Stagehand's LLM + your LLM) |
| Cost per action | One API call | Two API calls ($0.002-0.02 per Stagehand action + your LLM call) |
| Cloud dependency | None (self-hosted Playwright) | Optimized for Browserbase cloud; local mode is a community fork |
| Vendor lock-in | None -- Playwright is MIT, CUA is standard API | Browserbase ecosystem ($300M valuation, lock-in incentive) |
| TypeScript | Full support | Full support |
| Vision capability | Full screenshot analysis | Text-based (accessibility tree), not vision |
| Already in stack | Yes (SDK + Playwright) | No (new dep + new vendor) |

**Verdict:** Stagehand solves "make browser automation easier with AI" -- but BitBit already HAS the AI (Anthropic CUA). Adding Stagehand puts a second AI layer between the agent's decision and the browser action, doubling cost and adding a conflicting reasoning engine.

#### Architecture Decision: Why NOT Playwright MCP

The `@playwright/mcp` server (by Microsoft) uses accessibility tree snapshots instead of screenshots. It is faster and cheaper but cannot handle:
- Arbitrary web UIs with non-standard ARIA (most business apps)
- Visual verification (did the invoice PDF render correctly?)
- CAPTCHAs or visual challenges
- Custom canvas-based applications

CUA's vision-based approach is intentionally chosen as a **universal fallback** -- it works on any website, regardless of accessibility quality. This is critical for a tool that needs to work with whatever SaaS apps BitBit's customers use.

### 2. Async Job Orchestration: Trigger.dev v4

| | |
|---|---|
| **Package** | `@trigger.dev/sdk` |
| **Version** | `^4.4.3` |
| **Purpose** | Durable background job orchestration with multi-step workflows, retries, and human-in-loop approval |
| **Why this** | Browser automation tasks are inherently long-running (30s-5min per task). They cannot execute in Vercel serverless functions (10s timeout on Hobby, 60s on Pro). They need retries, step-by-step durability (if step 3 fails, don't redo steps 1-2), and approval gates. Trigger.dev v4 provides all of this with TypeScript-native DX. |
| **Confidence** | HIGH -- v4 GA since Aug 2025, npm version verified (`4.4.3`), pricing verified |

```bash
npm install @trigger.dev/sdk@^4.4.3
```

#### Why Trigger.dev v4 Over Alternatives

| Criterion | Trigger.dev v4 | Inngest | BullMQ | Supabase pgmq | Temporal |
|-----------|----------------|---------|--------|----------------|----------|
| **TypeScript-native** | Yes | Yes | Yes | SQL-based | Yes |
| **Long-running tasks** | No timeout (minutes/hours) | Step-based timeouts | Manual process mgmt | 150s max (Edge Fn) | No timeout |
| **Self-hostable** | Yes (Docker/K8s, Apache 2.0) | No (proprietary engine) | Yes (needs Redis) | N/A (in Supabase) | Yes (needs cluster) |
| **Human-in-loop** | Waitpoint tokens (built-in) | Custom `waitForEvent` | Manual | No | Signals (built-in) |
| **AI agent features** | First-class (Vercel AI SDK) | Generic | Generic | No | Generic |
| **New infra required** | None (Docker on Fly.io) | Cloud account | Redis server | None | Temporal cluster |
| **Free tier** | $5/mo credit, 20 concurrent | 50k runs/mo | N/A (self-host) | N/A | N/A |
| **Operational burden** | Low (managed or simple Docker) | None (cloud only) | Medium (Redis ops) | None | High (cluster ops) |

**Why NOT BullMQ:** Requires Redis infrastructure. BitBit's ~$70/mo budget does not have room for managed Redis ($15-25/mo minimum), and self-hosting Redis on Fly.io adds operational burden for a solo developer.

**Why NOT Inngest:** Cannot self-host the orchestration engine (proprietary). Trigger.dev is Apache 2.0 and fully self-hostable on the existing Fly.io infrastructure.

**Why NOT Temporal:** Enterprise-grade orchestration engine requiring its own cluster (Temporal Server + Elasticsearch + Cassandra/MySQL). Massive operational overhead for a solo developer. Trigger.dev gives ~90% of Temporal's durability at ~10% of the complexity.

**Why NOT Supabase Queues (pgmq) alone:** Already available in Supabase, and good for simple fire-and-forget events (which BitBit already does for context writes). But pgmq is a **message queue**, not a **workflow orchestrator**. It has no retry policies, no step-based execution, no human-in-loop primitives, no long-running process management, no dashboard for monitoring running jobs. Use pgmq alongside Trigger.dev for simple event dispatch; use Trigger.dev for multi-step CUA workflows.

#### Trigger.dev Pricing (Verified from trigger.dev/pricing)

| Tier | Price | Included Credit | Concurrent | Good For |
|------|-------|----------------|------------|----------|
| Free | $0/mo | $5 credit | 20 runs | Development + light production |
| Hobby | $10/mo | $10 credit | 50 runs | Early production |
| Pro | $50/mo | $50 credit | 200+ runs | Scale |

**Compute cost:** $0.0000338/sec on Small 1x (default). A 2-minute browser task = $0.004. At 100 tasks/day = $0.40/day = ~$12/month compute.
**Run invocation:** $0.000025 per run ($0.25 per 10,000 runs). Negligible.

**Deployment strategy:** Start with Trigger.dev Cloud free tier (20 concurrent, $5/mo credit). This covers development and early production. Upgrade to Hobby ($10/mo) when hitting limits. Self-host on Fly.io only if needing >200 concurrent or cost optimization at scale. Trigger.dev maintains an official `triggerdotdev/fly.io` repo for Fly.io self-hosting.

#### Key v4 Features for v2.0

- **Waitpoint tokens:** Pause CUA execution until human approves (maps directly to BitBit's existing approval flow and confidence routing)
- **Process keep-alive:** Reuse browser process between runs (100-300ms warm start vs several seconds cold start)
- **Middleware system:** Inject org context, cost tracking, and audit logging around every task
- **OpenTelemetry:** Export traces to existing monitoring (Sentry integration)
- **Retry with backoff:** Automatic retry on browser automation failures with exponential backoff
- **Priority queues:** Prioritize high-value tasks over background learning

### 3. Screenshot / Evidence Capture (No New Dependencies)

| Technology | Source | Purpose |
|------------|--------|---------|
| `page.screenshot({ type: 'png' })` | Playwright (bundled) | Capture browser state as Buffer |
| `Buffer.toString('base64')` | Node.js built-in | Convert for CUA API consumption |
| `supabase.storage.from('cua-evidence').upload()` | Existing SDK | Persist evidence screenshots |
| `supabase.storage.from('cua-evidence').createSignedUrl()` | Existing SDK | Dashboard viewing of execution evidence |

**Screenshot workflow:**
1. Playwright captures screenshot -> `Buffer` (no file I/O)
2. Resize to CUA optimal resolution (1024x768 recommended, max 1568px longest edge)
3. Send as base64 image to Anthropic CUA for next action decision
4. Store in Supabase `cua-evidence` bucket for audit trail
5. Link to `execution_logs` table for dashboard evidence viewing

**Coordinate scaling (important):** The CUA API constrains images to max 1568px on longest edge (~1.15 megapixels). CUA returns coordinates in the downsampled image space. You must scale coordinates back up to the actual browser viewport before executing Playwright actions. Calculate scale factor: `Math.min(1.0, 1568/longEdge, Math.sqrt(1_150_000/totalPixels))`.

**Why NOT sharp for screenshots:** The existing STACK.md (v1.4) added `sharp` for chat thumbnail generation. For CUA screenshots, Playwright's built-in PNG/JPEG output is sufficient. Sharp is already available if compression is needed, but CUA works fine with direct Playwright PNG output.

### 4. Workflow Learning / Pattern Storage (No New Dependencies)

| Technology | Source | Purpose |
|------------|--------|---------|
| Supabase PostgreSQL | Existing | Store `workflow_patterns`, `execution_steps`, `execution_logs` tables |
| Pinecone | Existing (`@pinecone-database/pinecone`) | Semantic search over workflow pattern descriptions |
| Voyage-3.5 | Existing (`voyageai`) | Embed workflow pattern text for vector search |

**Architecture:** When a multi-step browser task succeeds:
1. Serialize execution trace: URL sequence, actions taken, verification results, timing
2. Store as `workflow_pattern` row in PostgreSQL (structured data)
3. Embed pattern description via Voyage-3.5 into Pinecone (same pipeline as existing `embedding_jobs`)
4. On future similar requests, ContextAssembler queries Pinecone for matching patterns
5. Retrieved pattern informs CUA's execution plan (replay/adapt known-good sequences)

This is NOT a new system -- it extends the existing semantic memory + Pinecone RAG pipeline with a new data type.

---

## Infrastructure Changes (Fly.io)

### New: Dedicated CUA Worker Machine

| Setting | Current Workers | CUA Worker (New) |
|---------|----------------|------------------|
| **App name** | `bitbit-workers` | `bitbit-cua-worker` |
| **Machine size** | `shared-cpu-1x` | `shared-cpu-2x` |
| **Memory** | 1024MB | 2048MB |
| **Count** | 2 machines | 1 machine |
| **Auto-stop** | `suspend` | `stop` (full stop, avoid stale browsers) |
| **Min machines** | 1 | 0 (scale to zero when idle) |
| **Concurrency** | 50 hard / 25 soft | 5 hard / 3 soft (limited by browser memory) |
| **Docker base** | Custom Node.js | `mcr.microsoft.com/playwright:v1.58.2-noble` |
| **Internal port** | 3000 | 3001 |

**Why a separate machine:** Chromium needs ~1-2GB RAM. The existing 1GB workers are too small to run headless Chrome alongside the Node.js process. Mixing browser automation with normal API workers risks OOM kills affecting all requests. A separate machine means browser crashes do not take down the main worker.

**Why scale-to-zero:** Browser automation is bursty -- might not run for hours, then 5 tasks in 10 minutes. Auto-start from stopped takes ~5-10 seconds (acceptable for background tasks), avoids paying for idle compute.

**Cost impact:** `shared-cpu-2x` with 2048MB on Fly.io is ~$10-15/month at ~50% utilization with auto-stop. Total infra: ~$80-85/month (up from ~$70).

### CUA Worker Fly.io Config

```toml
# fly.cua-worker.toml
app = "bitbit-cua-worker"
primary_region = "syd"

[build]
  dockerfile = "Dockerfile.cua"

[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"
  PLAYWRIGHT_BROWSERS_PATH = "/ms-playwright"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    hard_limit = 5
    soft_limit = 3

[[vm]]
  size = "shared-cpu-2x"
  memory = "2048mb"
  count = 1

[checks]
  [checks.health]
    port = 3001
    type = "http"
    interval = "30s"
    timeout = "10s"
    path = "/health"
```

### CUA Worker Dockerfile

```dockerfile
# Dockerfile.cua
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Only Chromium (skip Firefox/WebKit, saves ~400MB)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chromium

COPY package*.json ./
RUN npm ci --production

COPY dist/cua-worker/ ./

# Chromium container flags
ENV CHROMIUM_FLAGS="--disable-dev-shm-usage --disable-gpu --no-sandbox --disable-setuid-sandbox"

EXPOSE 3001
CMD ["node", "server.js"]
```

**Docker memory note:** Chromium uses `/dev/shm` for shared memory. Docker default is 64MB, causing crashes on complex pages. Use `--disable-dev-shm-usage` Chromium flag (forces `/tmp` instead of `/dev/shm`). Slight performance cost but eliminates the shared memory limit without needing Docker `--shm-size` config.

---

## Integration Architecture

### How CUA Connects to TAOR Loop

```
User message -> TAOR Loop -> model decides browser action needed
                              -> dispatches `browser_execute` tool call
                              -> HTTP POST to Fly.io CUA worker
                              -> CUA worker: Playwright browser + CUA screenshot loop
                              -> returns: {success, result, evidence_urls}
                              -> TAOR Loop processes result like any tool
```

The TAOR loop (`taor-loop.ts`) already has `client.beta.messages.create()`, `executeToolBatch()`, tool result processing with citations and action reflection. CUA becomes another tool in the existing `TOOL_ROLE_MAP`. The TAOR loop does not need to know about browsers -- it just dispatches a tool call and gets a result.

### How Trigger.dev Connects

```
TAOR Loop dispatches `browser_execute` tool
  -> Trigger.dev task created (durable, with retry policy)
    -> Task Step 1: Launch browser, navigate to URL
    -> Task Step 2: CUA screenshot-action loop (multiple iterations)
    -> [Waitpoint]: If high-risk action, pause for human approval
    -> Task Step 3: Verify completion, capture evidence
    -> Task Step 4: Store workflow pattern if successful
  -> Returns result to TAOR Loop
```

### Tool Priority Chain

```
1. Structured API check: Does BitBit have a native tool?
   -> YES: Use it (direct, fast, reliable). Done.
   -> NO: Continue.

2. Workflow pattern check: Have we done this before?
   -> YES: Retrieve pattern, use as CUA guidance. Go to step 3.

3. CUA browser automation: Open browser, execute task.
   -> Success: Verify, store pattern, return result.
   -> Low confidence / unknown form / high risk:
      -> Human handoff via waitpoint approval gate.
```

### How Workflow Learning Connects to Existing RAG

```
Successful CUA execution
  -> Serialize: {trigger, url_sequence, actions, verification, timing}
  -> INSERT INTO workflow_patterns
  -> Create embedding_job (existing pipeline)
  -> Voyage-3.5 embeds -> Pinecone upsert

Future similar request
  -> ContextAssembler queries Pinecone for matching patterns
  -> Retrieved pattern informs CUA system prompt
  -> CUA uses as guidance (not rigid replay)
```

---

## What NOT to Add

| Temptation | Why Avoid |
|------------|-----------|
| **Stagehand / Browserbase** | Adds second AI layer on top of CUA (double cost, conflicting reasoning). Browserbase cloud adds vendor lock-in. |
| **Browser Use** | Python-only. BitBit is TypeScript. |
| **Puppeteer** | Playwright already installed and strictly superior. |
| **Redis / BullMQ** | New infrastructure dependency for a solo developer. Trigger.dev eliminates the need. |
| **Temporal** | Enterprise cluster overhead. Trigger.dev provides 90% of the value at 10% complexity. |
| **Inngest** | Cannot self-host orchestration engine. Trigger.dev is Apache 2.0. |
| **Selenium / WebDriver** | Legacy. Playwright superseded years ago. |
| **Kubernetes** | Over-engineering for current scale. Fly.io machines are sufficient. |
| **Xvfb / virtual display** | Not needed. Playwright headless Chromium does not require X11. Only the Anthropic Python reference demo uses Xvfb (for full desktop environment). |
| **Browserless.io** | Self-hosted Playwright on Fly.io is simpler and cheaper for <5 concurrent sessions. |
| **Separate screenshot service** | Playwright `page.screenshot()` returns a Buffer directly. |
| **p-queue for concurrency** | Trigger.dev handles concurrency control natively via queue configuration. |

---

## Version Matrix

| Package | Current | Required for v2.0 | Action | Why |
|---------|---------|-------------------|--------|-----|
| `@anthropic-ai/sdk` | 0.74.0 | `^0.80.0` | **Update** | Latest CUA beta type improvements, `computer_20251124` support |
| `playwright` | not installed | `^1.58.2` | **Install** (production dep) | Runtime browser automation on Fly.io CUA worker |
| `@playwright/test` | ^1.58.2 (devDep) | ^1.58.2 (keep devDep) | No change | E2E tests unchanged |
| `@trigger.dev/sdk` | not installed | `^4.4.3` | **Install** | Durable async job orchestration |
| `@supabase/supabase-js` | 2.95.3 | 2.95.3 | No change | |
| `@pinecone-database/pinecone` | ^7.1.0 | ^7.1.0 | No change | |
| `voyageai` | ^0.2.1 | ^0.2.1 | No change | |

---

## Installation Summary

```bash
# New production dependencies (2 packages)
npm install playwright @trigger.dev/sdk@^4.4.3

# Update existing dependency
npm install @anthropic-ai/sdk@^0.80.0

# CUA worker Docker image only (not dashboard):
npx playwright install chromium
```

### Bundle Impact

| Package | Size | Client bundle? | Notes |
|---------|------|---------------|-------|
| `playwright` | ~3MB npm + ~300MB Chromium binary | No (server/worker only) | Chromium only in CUA worker Docker image |
| `@trigger.dev/sdk` | ~200KB | No (server only) | Task definitions are server-side |
| `@anthropic-ai/sdk` bump | ~0 (update) | No (server only) | Already server-only |

**Client bundle impact: Zero.** All additions are server-side only.

---

## Environment Variables (New)

```env
# CUA Worker (Fly.io secrets -- share existing keys)
ANTHROPIC_API_KEY=sk-...              # Already exists
SUPABASE_URL=https://...              # Already exists
SUPABASE_SERVICE_ROLE_KEY=...         # Already exists
CUA_WORKER_URL=https://bitbit-cua-worker.fly.dev  # New
CUA_WORKER_SECRET=...                 # New: shared secret for worker auth

# Trigger.dev (cloud mode)
TRIGGER_SECRET_KEY=tr_...             # New: from trigger.dev dashboard
TRIGGER_API_URL=https://api.trigger.dev  # Default cloud URL
```

---

## New Database Tables

```sql
-- Workflow patterns learned from successful executions
CREATE TABLE workflow_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_name text NOT NULL,
  trigger_description text NOT NULL,
  target_domain text,
  steps_json jsonb NOT NULL,
  success_count integer DEFAULT 1,
  failure_count integer DEFAULT 0,
  avg_duration_ms integer,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Execution logs for audit trail and evidence
CREATE TABLE execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id text,
  pattern_id uuid REFERENCES workflow_patterns(id),
  trigger_message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  steps_completed integer DEFAULT 0,
  total_steps integer,
  evidence_urls text[],
  result_summary text,
  error_details text,
  duration_ms integer,
  token_cost numeric(10,6),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Execution steps (granular, for replay and debugging)
CREATE TABLE execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES execution_logs(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  action_type text NOT NULL,
  action_details jsonb NOT NULL,
  screenshot_url text,
  duration_ms integer,
  success boolean,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Evidence storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cua-evidence', 'cua-evidence', false, 2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
);
```

---

## Sources

### Official Documentation (HIGH confidence)
- [Anthropic Computer Use Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- CUA API spec, beta headers, tool types, actions, TypeScript examples
- [Anthropic CUA Reference Demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo) -- Reference architecture
- [Playwright Docker](https://playwright.dev/docs/docker) -- Official Docker images and container configuration
- [Playwright Screenshots](https://playwright.dev/docs/screenshots) -- Buffer capture, base64 encoding, options
- [Trigger.dev v4 GA](https://trigger.dev/launchweek/2/trigger-v4-ga) -- v4 features, waitpoints, self-hosting
- [Trigger.dev Pricing](https://trigger.dev/pricing) -- Tier details, compute pricing
- [Trigger.dev Docker Self-Hosting](https://trigger.dev/docs/self-hosting/docker) -- Docker Compose setup
- [Trigger.dev Fly.io Repo](https://github.com/triggerdotdev/fly.io) -- Official Fly.io deployment template
- [Supabase Queues](https://supabase.com/docs/guides/queues) -- pgmq capabilities (evaluated, used alongside)

### npm Registry (HIGH confidence, verified 2026-03-31)
- `@anthropic-ai/sdk` latest: **0.80.0** (current in project: 0.74.0)
- `playwright` latest: **1.58.2**
- `@trigger.dev/sdk` latest: **4.4.3** (v4 GA)
- `@browserbasehq/stagehand` latest: **3.2.0** (evaluated and rejected)

### Web Research (MEDIUM confidence)
- [Agentic Browser Landscape 2026](https://nohacks.co/blog/agentic-browser-landscape-2026) -- Framework comparison
- [Stagehand vs Browser Use vs Playwright](https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026) -- Detailed comparison
- [Stagehand v3](https://www.browserbase.com/blog/stagehand-v3) -- Architecture evaluation
- [Stagehand GitHub](https://github.com/browserbase/stagehand) -- Local mode evaluation
- [Playwright on Fly.io](https://stephenhaney.com/2024/playwright-on-fly-io-with-bun/) -- Deployment patterns
- [Fly.io Chromium Memory](https://community.fly.io/t/chromium-takes-too-long-to-initialize/26571) -- Memory requirements
- [TypeScript Orchestration Guide](https://medium.com/@matthieumordrel/the-ultimate-guide-to-typescript-orchestration-temporal-vs-trigger-dev-vs-inngest-and-beyond-29e1147c8f2d) -- Queue comparison
- [Supabase Queues Blog](https://supabase.com/blog/supabase-queues) -- pgmq architecture
- [Playwright-Computer-Use Bridge](https://github.com/invariantlabs-ai/playwright-computer-use) -- CUA+Playwright reference (Python, architecture only)
- [Playwright Docker Production Guide](https://thomasbourimech.com/blog/en/playwright-chromium-docker-production/) -- Container configuration
