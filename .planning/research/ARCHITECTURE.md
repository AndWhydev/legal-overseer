# Architecture Patterns: v1.4 Media, Billing & Growth Roles

**Domain:** Agentic AI operations platform -- file attachments, subscription billing, growth agent tools
**Researched:** 2026-03-18
**Overall confidence:** HIGH (existing codebase thoroughly analyzed, patterns verified against official docs)

---

## 1. Current Architecture Summary

The system follows a well-defined pipeline architecture:

```
[Chat Route] -> [UnifiedConversationPipeline] -> [AgentEngine] -> [ToolExecution] -> [SSE Stream]
     |                    |                            |                  |
     v                    v                            v                  v
  Auth/RLS         Identity -> Thread ->          Context Assembly   Confidence Router ->
                   Store -> Engine ->              + Model Router    Approval Queue
                   Store -> PostProcess
```

**Key architectural facts from codebase analysis:**

- **Engine** (`engine.ts`): AsyncGenerator yielding `AgentEvent` types. Supports parallel tool execution, observation masking, plan stages, circuit breakers, convergence hints. Max 15 iterations per turn.
- **Pipeline** (`unified-pipeline.ts`): 7-step flow: identity resolution, thread resolution, store inbound, load history, run engine, store response, async post-processing.
- **Tools** (`tools.ts`): 6 tool groups (core, memory, channel, web, comms, agentic). Each tool is an `AgentToolHandler` function receiving `(input, orgId, supabase)`. Tool RAG selects 10 most relevant per turn.
- **Messages** are stored in `conversation_messages` with `role`, `content`, `tool_data`, `channel_metadata` (which already has an `attachments` array type).
- **Billing** already has: `plan-gates.ts` (4 plans: free/starter/growth/scale), `usage-metering.ts`, `trial-manager.ts`, `checkout.ts` (Stripe Checkout Sessions), `dunning.ts` (14-day sequence), and two webhook routes (one for payments at `/webhooks/stripe`, one for subscriptions at `/billing/webhook`).
- **Growth tools** already exist: `tender-hunter.ts` (700+ lines), `ad-script-gen.ts` (700+ lines), `ai-search-optimizer.ts` (800+ lines). All follow the same pattern: typed params, Supabase persistence, scheduler tick function.
- **Attachment processing** already exists: `attachment-processor.ts` (PDF/DOCX/TXT/CSV text extraction), `gmail-attachments.ts` (Gmail API download + process).

---

## 2. File Attachments Architecture

### 2.1 Current State

The `ChannelMetadata` type already defines an `attachments` array:
```typescript
// conversation/types.ts (existing)
export interface ChannelMetadata {
  externalId?: string
  subject?: string
  isVoiceNote?: boolean
  attachments?: Array<{
    type: string
    url: string
    name: string
  }>
}
```

The `attachment-processor.ts` already handles PDF, DOCX, TXT, CSV text extraction (up to 50KB per file, 100MB buffer cap). Gmail attachments flow through `gmail-attachments.ts` to download, extract text, and feed to RAG.

**What is missing:** User-initiated upload from web chat, Supabase Storage bucket, inline preview rendering, and wiring extracted text into the Anthropic API as multimodal content blocks.

### 2.2 Recommended Architecture: Upload Flow

```
[Frontend: Chat Input]
    |
    | File selected (Paperclip button)
    v
[API: /api/attachments/upload]
    |
    | 1. Auth check (Supabase session)
    | 2. Plan gate check (storage quota)
    | 3. Create signed upload URL (Supabase Storage)
    | 4. Insert `attachments` DB row (status: 'uploading')
    v
[Frontend: Direct upload to Supabase Storage via signed URL]
    |
    | 5. On success, PATCH /api/attachments/:id (status: 'ready')
    v
[Frontend: Submit message with attachment_ids]
    |
    v
[Chat Route: POST /api/agent/chat]
    |
    | 6. Load attachment records
    | 7. Build multimodal content blocks
    v
[UnifiedConversationPipeline]
    |
    | 8. Store message with channelMetadata.attachments
    | 9. Pass to engine with image/document content blocks
    v
[AgentEngine]
    |
    | 10. Claude sees image/PDF natively via content blocks
    v
[Post-process]
    |
    | 11. Fire-and-forget: extract text for RAG embedding
    | 12. Fire-and-forget: update storage usage metric
```

### 2.3 New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `attachments` table | Migration | `supabase/migrations/092_attachments.sql` | Tracks uploaded files: id, org_id, user_id, thread_id, filename, mime_type, size, storage_path, status, extracted_text, created_at |
| `chat-attachments` bucket | Supabase Storage | Config | Private bucket with RLS policies |
| `/api/attachments/upload` | API Route | `src/app/api/attachments/upload/route.ts` | Creates signed upload URL, inserts DB row |
| `/api/attachments/[id]` | API Route | `src/app/api/attachments/[id]/route.ts` | PATCH status, GET signed download URL |
| `attachment-service.ts` | Lib | `src/lib/attachments/attachment-service.ts` | Upload orchestration, text extraction dispatch, storage quota check |
| `useFileUpload` hook | Hook | `src/hooks/use-file-upload.ts` | Frontend upload state, progress, preview generation |
| `ChatAttachment` component | UI | `src/components/chat/chat-attachment.tsx` | Inline preview (image thumbnail, PDF icon, file details) |

### 2.4 Integration Points with Existing Components

**Chat route (`/api/agent/chat/route.ts`)** -- currently receives `{ message, threadId }`. Change to also accept `attachment_ids: string[]`. Before calling the pipeline, load attachment records from DB and build Anthropic content blocks.

**Unified pipeline (`unified-pipeline.ts`)** -- `InboundMessage` interface gains an optional `attachments` field. The pipeline passes these through to the engine as multimodal content blocks in the user message.

**Engine (`engine.ts`)** -- No changes needed. The engine already handles `Anthropic.MessageParam[]` with arbitrary content blocks. The caller constructs `{ role: 'user', content: [text_block, image_block, document_block] }`.

**Thread resolver (`thread-resolver.ts`)** -- `storeMessage()` already accepts `channelMetadata` with an `attachments` array. We populate this with `{ type, url, name }` from the upload records.

**Post-processing** -- Add attachment text extraction to the existing `postProcess()` method. Use `attachment-processor.ts` (already exists) to extract text, then `enqueueEmbedding()` (already exists) to feed it to Pinecone.

**Plan gates (`plan-gates.ts`)** -- Already has a `storage` gate action with per-plan limits (free=100MB, starter=500MB, growth=2GB, scale=unlimited). Already queries an `attachments` table for size sum. Just needs the table to exist.

### 2.5 Anthropic API Content Block Format

For images (inline preview + Claude analysis):
```typescript
{
  type: 'image',
  source: {
    type: 'url',
    url: signedDownloadUrl, // Supabase signed URL (1hr expiry)
  }
}
```

For PDFs (Claude native PDF support):
```typescript
{
  type: 'document',
  source: {
    type: 'base64',
    media_type: 'application/pdf',
    data: base64PdfContent, // For files under 32MB
  }
}
```

For text files (inject extracted text):
```typescript
{
  type: 'text',
  text: `[Attached file: ${filename}]\n\n${extractedText}`
}
```

### 2.6 Database Schema

```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  thread_id UUID REFERENCES conversation_threads(id),
  message_id UUID REFERENCES conversation_messages(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,  -- bytes
  storage_path TEXT NOT NULL,  -- bucket path: {org_id}/{thread_id}/{uuid}/{filename}
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'processing', 'failed', 'deleted')),
  extracted_text TEXT,  -- text extracted from PDF/DOCX/etc
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only access their own org's attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_org_read ON attachments FOR SELECT USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY attachments_org_insert ON attachments FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Index for storage quota queries
CREATE INDEX idx_attachments_org_size ON attachments (org_id) WHERE status != 'deleted';
```

---

## 3. Stripe Billing Architecture

### 3.1 Current State

Billing infrastructure is **substantially built** but has gaps:

**Already exists:**
- `plan-gates.ts`: 4 plan tiers with feature matrices (maxChannels, maxLeads, maxInvoicesPerMonth, agents list, boolean features)
- `checkout.ts`: Creates Stripe Checkout Sessions with ad-hoc prices, 14-day trial
- `trial-manager.ts`: Create trial, check trial status (active/grace/expired), convert trial
- `usage-metering.ts`: Track usage events (token_usage, agent_run, storage_mb), aggregate by period
- `dunning.ts`: 4-step dunning sequence (day 0, 1, 3, 7, 14 -> downgrade)
- Two webhook routes: `/webhooks/stripe` (payment events) and `/billing/webhook` (subscription events)
- `subscriptions` table with stripe_subscription_id, tier, plan, status, trial_ends_at

**Gaps to fill:**
1. Webhook route consolidation (currently two separate routes handling overlapping concerns)
2. Missing `customer.subscription.trial_will_end` handler (3-day warning)
3. No Stripe Customer Portal integration (self-service plan changes)
4. Plan gate enforcement at the tool execution layer (agent tools not gated)
5. Usage metering not wired into engine.ts `logAgentRun` flow
6. No pricing page / plan selection UI
7. Growth roles not reflected in plan feature gates

### 3.2 Recommended Architecture: Webhook Consolidation

Consolidate to a single webhook route at `/api/billing/webhook` that handles ALL Stripe events:

```
[Stripe Webhook]
    |
    v
[/api/billing/webhook/route.ts]
    |
    | 1. Verify signature (STRIPE_WEBHOOK_SECRET)
    | 2. Log to webhook_events table
    | 3. Dispatch by event type
    v
+----------------------------------------------+
| customer.subscription.created    -> upsert   |
| customer.subscription.updated    -> sync     |
| customer.subscription.deleted    -> cancel   |
| customer.subscription.trial_will_end -> warn |
| invoice.paid                     -> success  |
| invoice.payment_failed           -> dunning  |
| checkout.session.completed       -> activate |
+----------------------------------------------+
    |
    v
[billing/subscription-handler.ts]  -- Centralized subscription state machine
    |
    v
[Supabase: subscriptions table + organizations.plan]
```

### 3.3 New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `subscription-handler.ts` | Lib | `src/lib/billing/subscription-handler.ts` | Centralized subscription state machine: handle all lifecycle events |
| `billing-middleware.ts` | Middleware | `src/lib/billing/billing-middleware.ts` | Express-style middleware for plan gate checks on API routes |
| `useBilling` hook | Hook | `src/hooks/use-billing.ts` | Frontend: current plan, usage, trial status |
| Pricing page | Page | `src/app/(dashboard)/pricing/page.tsx` | Plan selection with Stripe Checkout redirect |
| Billing settings | Component | `src/components/settings/billing-settings.tsx` | Current plan, usage dashboard, Stripe Portal link |
| `092_subscriptions_v2.sql` | Migration | (or within attachments migration) | Add trial_will_end_notified, stripe_customer_id to subscriptions |

### 3.4 Integration Points with Existing Components

**Plan gates at tool execution** -- Modify `executeAgentTool()` in `tools.ts` to check plan gates before executing growth role tools. Add a `growth` gate action that checks if the org's plan includes the required agent:

```typescript
// Before executing tool handler:
const requiredAgent = TOOL_TO_AGENT_MAP[name]
if (requiredAgent) {
  const plan = await getOrgPlan(supabase, orgId)
  const features = getPlanFeatures(plan)
  if (!features.agents.includes('all') && !features.agents.includes(requiredAgent)) {
    return { success: false, error: `${name} requires the ${plan} plan or higher` }
  }
}
```

**Usage metering in engine** -- The engine already calls `logAgentRun()` with token counts. Wire `trackUsage()` into the existing run logger:

```typescript
// In run-logger.ts after logging:
trackUsage(supabase, orgId, 'token_usage', tokensIn + tokensOut).catch(() => {})
trackUsage(supabase, orgId, 'agent_run', 1).catch(() => {})
```

**Trial expiration cron** -- Add to existing `/api/cron/billing/route.ts`. Check all `trialing` subscriptions, send 3-day warning email, downgrade expired trials.

**Webhook deduplication** -- The existing `webhook_events` table with `external_event_id` provides idempotency. Check before processing.

### 3.5 Plan Feature Matrix (Updated for v1.4 Growth Roles)

```typescript
export const PLAN_FEATURES: Record<PlanName, PlanFeatures> = {
  free: {
    maxChannels: 1,
    maxLeads: 50,
    maxInvoicesPerMonth: 5,
    maxStorageMB: 100,
    agents: ['sentry'],
    growthRoles: [],           // NEW
    whatsapp: false,
    proposals: false,
    multiUser: false,
    fileAttachments: false,    // NEW
  },
  starter: {
    maxChannels: 3,
    maxLeads: 500,
    maxInvoicesPerMonth: 50,
    maxStorageMB: 500,
    agents: ['sentry', 'lead-swarm', 'invoice-flow'],
    growthRoles: [],
    whatsapp: true,
    proposals: false,
    multiUser: false,
    fileAttachments: true,
  },
  growth: {
    maxChannels: 10,
    maxLeads: 2000,
    maxInvoicesPerMonth: 200,
    maxStorageMB: 2000,
    agents: ['sentry', 'lead-swarm', 'invoice-flow', 'channel-triage', 'client-comms', 'proposal-bot'],
    growthRoles: ['seo', 'content', 'ad-script'],
    whatsapp: true,
    proposals: true,
    multiUser: true,
    maxUsers: 5,
    fileAttachments: true,
  },
  scale: {
    maxChannels: 99,
    maxLeads: 99999,
    maxInvoicesPerMonth: 9999,
    maxStorageMB: 99999,
    agents: ['all'],
    growthRoles: ['all'],      // includes builder, tender-hunter
    whatsapp: true,
    proposals: true,
    multiUser: true,
    maxUsers: 99,
    fileAttachments: true,
  },
}
```

---

## 4. Growth Roles Architecture

### 4.1 Current State

Three growth tools already have substantial implementations:
- **Tender Hunter** (`tender-hunter.ts`): 790 lines. Full pipeline: scrape -> filter -> extract requirements -> compliance check -> generate response -> score fit. Has scheduler tick.
- **Ad Script Generator** (`ad-script-gen.ts`): 710 lines. Multi-platform (Reels/TikTok/Shorts/Feed), hook templates, LLM-powered generation with Opus, A/B variations with Sonnet, storyboard generation. Has scheduler tick.
- **AI Search Optimizer** (`ai-search-optimizer.ts`): 822 lines. Visibility audit across 4 AI search sources, content generation, schema markup generation (5 types), visibility reports, change detection. Has scheduler tick.

**These are NOT yet wired as agent tools.** They exist as standalone libraries called from dedicated API routes (`/api/agent/tenders`, `/api/agent/ad-scripts`, `/api/agent/ai-search`). They need to be registered as tools in the tool system so the agent can invoke them conversationally.

### 4.2 Recommended Architecture: Role as Tool Group

Growth roles should follow the existing tool group pattern. Each role becomes a tool group registered in `TOOL_GROUPS`:

```typescript
// New tool groups in tools.ts
export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms' | 'agentic'
                      | 'seo' | 'content' | 'ads' | 'builder' | 'tenders'  // NEW

export const TOOL_GROUPS: Record<ToolGroup, ToolGroupMeta> = {
  // ... existing groups ...
  seo: {
    id: 'seo',
    label: 'SEO & AI Visibility',
    description: 'Audit AI search visibility, generate optimized content, create schema markup',
    tools: ['audit_visibility', 'generate_seo_content', 'generate_schema_markup', 'visibility_report'],
  },
  content: {
    id: 'content',
    label: 'Content & Social',
    description: 'Schedule social posts, generate blog content, manage content calendar',
    tools: ['schedule_post', 'generate_blog', 'content_calendar'],
  },
  ads: {
    id: 'ads',
    label: 'Ad Scripts',
    description: 'Generate video ad scripts for social platforms with storyboards',
    tools: ['generate_ad_scripts', 'list_ad_batches', 'adapt_script'],
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    description: 'Generate website pages, components, and landing pages from descriptions',
    tools: ['generate_page', 'preview_build'],
  },
  tenders: {
    id: 'tenders',
    label: 'Tender Hunter',
    description: 'Search government tenders, score fit, generate responses',
    tools: ['search_tenders', 'score_tender', 'generate_tender_response'],
  },
}
```

### 4.3 New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `tools/seo-tools.ts` | Agent tool | `src/lib/agent/tools/seo-tools.ts` | Wraps ai-search-optimizer as agent tools |
| `tools/ad-tools.ts` | Agent tool | `src/lib/agent/tools/ad-tools.ts` | Wraps ad-script-gen as agent tools |
| `tools/tender-tools.ts` | Agent tool | `src/lib/agent/tools/tender-tools.ts` | Wraps tender-hunter as agent tools |
| `tools/content-tools.ts` | Agent tool | `src/lib/agent/tools/content-tools.ts` | Social scheduling, blog generation (new) |
| `tools/builder-tools.ts` | Agent tool | `src/lib/agent/tools/builder-tools.ts` | Website/page generation (new, uses execute_code sandbox) |
| Growth role tool definitions | Config | In each tool file | Anthropic tool definitions with input schemas |
| Growth role handlers | Handlers | In each tool file | `AgentToolHandler` wrappers calling existing lib functions |

### 4.4 Integration Points with Existing Components

**Tool registration in tools.ts** -- Add growth tool definitions and handlers to `getAgentTools()` and `allHandlers`:

```typescript
// tools.ts - updated
import { seoToolDefinitions, seoToolHandlers } from './tools/seo-tools'
import { adToolDefinitions, adToolHandlers } from './tools/ad-tools'
import { tenderToolDefinitions, tenderToolHandlers } from './tools/tender-tools'

const allHandlers: Record<string, AgentToolHandler> = {
  ...handlers,
  ...channelToolHandlers,
  ...superpowerToolHandlers,
  ...codeExecutionToolHandlers,
  ...seoToolHandlers,      // NEW
  ...adToolHandlers,        // NEW
  ...tenderToolHandlers,    // NEW
  // ... existing invoice handlers ...
}

export function getAgentTools(groups?: ToolGroup[]): Anthropic.Tool[] {
  const allTools = [
    ...toolDefinitions,
    ...channelToolDefinitions,
    ...superpowerToolDefinitions,
    ...codeExecutionToolDefinitions,
    ...seoToolDefinitions,      // NEW
    ...adToolDefinitions,        // NEW
    ...tenderToolDefinitions,    // NEW
    invoiceToolDefinition,
    templateToolDefinition,
  ]
  // ... existing filter logic
}
```

**Plan-gated tool execution** -- Growth role tools must be gated by plan. The existing `executeAgentTool()` function is the single point to add this check. Map each growth tool to its required plan tier.

**Tool RAG (`tool-rag.ts`)** -- Already handles 10-tool filtering per turn. Growth role tools will be naturally filtered out unless the user's query matches their domain. The planner (`planner.ts`) selects tool groups, so growth queries like "audit my SEO" will activate the `seo` group.

**Scheduler integration** -- Growth roles with scheduler ticks (tender-hunter, ad-script-gen, ai-search-optimizer) already have `runXxxTick()` functions. Wire these into the existing `/api/cron/scheduler/route.ts` cron with plan-gated execution.

**Builder Role (New)** -- The builder role is the most complex growth role. It should leverage the existing `execute_code` tool infrastructure (code-execution.ts) with a specialized sandbox for HTML/CSS/JS generation. The code execution tool already runs in a sandboxed environment. The builder role just needs:
1. A tool definition that accepts a page description
2. A handler that constructs a prompt for code generation
3. Integration with the existing code execution sandbox for preview

**Content Role (New)** -- Requires integration with the Creator Studio (`src/lib/creator-studio/`). The existing `compose_creator_notification_mockup` tool provides a pattern. New content tools would call out to social APIs (defer to existing channel tools pattern) and use LLM generation for blog content.

### 4.5 v1.3 Role Engine Dependency

The Growth Roles have a dependency on the v1.3 Role Engine (persistent agents with domain ownership). However, the growth tools can be shipped as **chat-invokable tools first** (v1.4) and then promoted to **autonomous role agents** when v1.3's role engine is ready.

**Phase independence strategy:**
1. v1.4 ships growth tools as tool group definitions in the existing tool system
2. v1.3 role engine (when complete) registers these tools under persistent role agents
3. The tool implementations are identical -- only the invocation path changes (chat tool call vs. scheduled role agent tick)

This means v1.4 growth tools do NOT block on v1.3 completion.

---

## 5. Data Flow Changes

### 5.1 Chat Message Flow (Updated for Attachments)

```
BEFORE:
  POST { message: string, threadId?: string }

AFTER:
  POST { message: string, threadId?: string, attachmentIds?: string[] }
```

The chat route loads attachment records from the `attachments` table, generates signed download URLs from Supabase Storage, and constructs multimodal content blocks:

```typescript
// In chat route, before pipeline.handleMessage():
const contentBlocks: Anthropic.ContentBlockParam[] = [
  { type: 'text', text: processedMessage }
]

if (attachmentIds?.length) {
  const attachments = await loadAttachments(supabase, attachmentIds)
  for (const att of attachments) {
    if (att.mime_type.startsWith('image/')) {
      const { data: { signedUrl } } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(att.storage_path, 3600)
      contentBlocks.push({ type: 'image', source: { type: 'url', url: signedUrl } })
    } else if (att.mime_type === 'application/pdf') {
      const { data } = await supabase.storage
        .from('chat-attachments')
        .download(att.storage_path)
      const buffer = Buffer.from(await data.arrayBuffer())
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') }
      })
    } else if (att.extracted_text) {
      contentBlocks.push({
        type: 'text',
        text: `[Attached file: ${att.filename}]\n\n${att.extracted_text}`
      })
    }
  }
}

// Pass multimodal content to pipeline
pipeline.handleMessage(
  { content: processedMessage, channel: 'web', attachments: contentBlocks },
  config
)
```

### 5.2 Billing Event Flow (Updated)

```
[Stripe] --webhook--> [/api/billing/webhook]
                           |
                           v
                    [subscription-handler.ts]
                           |
              +------------+------------+
              |            |            |
              v            v            v
         [subscriptions   [organizations  [usage_events
          table]           .plan update]   table]
              |
              v
         [plan-gates.ts enforces at tool execution]
```

### 5.3 Growth Tool Invocation Flow

```
User: "Audit my SEO visibility for allwebbedup.com.au"
    |
    v
[Planner: selects 'seo' tool group]
    |
    v
[Engine: tool_use audit_visibility { domain: "allwebbedup.com.au", ... }]
    |
    v
[executeAgentTool]
    |-- Plan gate check: org plan includes 'seo' growth role?
    |-- Autonomy check: L4 for read-only audit
    v
[seoToolHandlers.audit_visibility]
    |-- Calls runVisibilityAudit() from ai-visibility-audit.ts
    |-- Returns structured result
    v
[Engine: synthesizes audit results into response]
```

---

## 6. Component Boundary Map

### 6.1 New vs Modified Components

| Component | Status | Changes |
|-----------|--------|---------|
| `conversation/types.ts` | MODIFY | Add `attachments` to `InboundMessage` |
| `conversation/unified-pipeline.ts` | MODIFY | Pass attachment content blocks to engine |
| `agent/tools.ts` | MODIFY | Add growth tool groups, plan-gated execution |
| `agent/engine.ts` | NO CHANGE | Already handles multimodal content blocks |
| `agent/planner.ts` | MODIFY | Add growth tool groups to planner vocabulary |
| `agent/tool-rag.ts` | NO CHANGE | Keyword filtering works for growth tools |
| `billing/plan-gates.ts` | MODIFY | Add `growthRoles`, `fileAttachments` features |
| `billing/checkout.ts` | MODIFY | Use pre-created Stripe Products/Prices |
| `billing/usage-metering.ts` | MODIFY | Wire into run-logger, add storage tracking |
| `app/api/agent/chat/route.ts` | MODIFY | Accept attachment_ids, build content blocks |
| `app/api/billing/webhook/route.ts` | REWRITE | Consolidate all Stripe events |
| `attachments/*` | NEW | Upload service, storage bucket config |
| `agent/tools/seo-tools.ts` | NEW | SEO agent tools wrapping existing lib |
| `agent/tools/ad-tools.ts` | NEW | Ad script agent tools wrapping existing lib |
| `agent/tools/tender-tools.ts` | NEW | Tender agent tools wrapping existing lib |
| `agent/tools/content-tools.ts` | NEW | Content/social scheduling tools |
| `agent/tools/builder-tools.ts` | NEW | Website generation tools |
| `hooks/use-file-upload.ts` | NEW | Frontend upload hook |
| `components/chat/chat-attachment.tsx` | NEW | Inline attachment preview |
| `app/(dashboard)/pricing/page.tsx` | NEW | Pricing/plan selection page |
| `components/settings/billing-settings.tsx` | NEW | Billing management UI |

### 6.2 Migration Sequence

```
092_attachments.sql
  - attachments table
  - RLS policies
  - Storage bucket creation (via Supabase dashboard or CLI)

093_billing_v2.sql
  - Add stripe_customer_id to organizations
  - Add growthRoles to plan feature checks
  - Add trial_will_end_notified boolean to subscriptions
  - Create usage_events table if not exists

094_growth_role_configs.sql
  - Seed agent_configs for growth roles (seo, content, ads, builder, tenders)
  - Add growth role tool names to tool_groups metadata
```

---

## 7. Patterns to Follow

### Pattern 1: Tool Group Registration (Existing)
**What:** Each domain gets a tool group with definitions + handlers, registered in the central tools.ts.
**Why:** The engine's tool RAG and planner already filter by groups. Growth tools slot in without engine changes.
**Example:** See `channel-tools.ts` -- exports `channelToolDefinitions` and `channelToolHandlers`, imported in `tools.ts`.

### Pattern 2: Fire-and-Forget Side Effects (Existing)
**What:** All non-critical operations (embedding, memory extraction, usage tracking) run as `.catch(() => {})` promises after the main response.
**Why:** Never block the user's chat response for bookkeeping.
**Apply to:** Storage usage tracking, attachment text extraction for RAG, billing usage metering.

### Pattern 3: Plan Gate as Middleware (New)
**What:** Check plan features before tool execution, not at the API route level.
**Why:** The tool execution layer (`executeAgentTool`) is the single chokepoint for all tool calls, whether from chat, scheduler, or webhook. Gating here covers all paths.
**Example:**
```typescript
// In executeAgentTool, before handler call:
const requiredPlan = TOOL_PLAN_REQUIREMENTS[name]
if (requiredPlan) {
  const allowed = await checkPlanGate(supabase, orgId, requiredPlan)
  if (!allowed) return { success: false, error: `Upgrade to ${requiredPlan} plan to use ${name}` }
}
```

### Pattern 4: Signed URL Upload (New for this project)
**What:** Frontend gets a signed upload URL from the server, uploads directly to Supabase Storage, then notifies the server of completion.
**Why:** Avoids Vercel's 4.5MB request body limit. Keeps file bytes off the API route entirely. Supabase Storage handles CDN/caching.

---

## 8. Anti-Patterns to Avoid

### Anti-Pattern 1: Proxying File Uploads Through API Routes
**What:** Accepting file uploads in the Next.js API route body.
**Why bad:** Vercel serverless has 4.5MB body limit. Large PDFs (common for business documents) will fail. Also increases API route duration and memory.
**Instead:** Use Supabase Storage signed upload URLs. Server only creates the URL and tracks the record.

### Anti-Pattern 2: Separate Webhook Routes Per Event Type
**What:** The current pattern of two webhook routes (`/webhooks/stripe` and `/billing/webhook`) handling overlapping Stripe events.
**Why bad:** Event handling is fragmented. Adding new events requires deciding which route to add them to. Risk of double-processing.
**Instead:** Single consolidated webhook route with a switch/case dispatcher.

### Anti-Pattern 3: Embedding Growth Role Logic in the Engine
**What:** Adding SEO/content/builder-specific logic inside `engine.ts`.
**Why bad:** The engine is domain-agnostic by design. It handles tool orchestration, not domain logic. Adding domain logic creates coupling and makes the engine harder to test.
**Instead:** Growth roles are pure tools. The engine calls them through the standard tool interface. Domain logic lives in the tool handler and underlying lib.

### Anti-Pattern 4: Base64 for Large Files in API Calls
**What:** Converting large attachments to base64 and embedding in the Anthropic API request.
**Why bad:** Base64 inflates size by 33%. A 30MB PDF becomes 40MB. Anthropic API has payload limits.
**Instead:** For images, use `source.type: 'url'` with signed URLs (Anthropic fetches directly). For PDFs under 10MB, base64 is fine. For larger PDFs, extract text and send as text content block.

### Anti-Pattern 5: Plan Gating at the Frontend Only
**What:** Only checking plan features in the UI (hiding buttons, disabling tools).
**Why bad:** Any API caller can bypass frontend gates. Users can craft direct API requests.
**Instead:** Gate at the tool execution layer (server-side). Frontend gates are UX sugar on top.

---

## 9. Scalability Considerations

| Concern | At 10 Users | At 100 Users | At 1000 Users |
|---------|-------------|--------------|---------------|
| File storage | Single Supabase Storage bucket, direct uploads | Same -- Supabase scales automatically | Consider CDN caching for frequently accessed files |
| Upload throughput | Signed URLs handle concurrent uploads natively | Same | Same -- uploads go direct to Supabase, not through API |
| Webhook processing | Single route, synchronous processing | Same | Consider webhook queue (pg_notify or Supabase Edge Function) for high volume |
| Usage metering | Direct insert per event | Same | Batch inserts with `usage_events` table partitioning |
| Growth tool compute | On-demand LLM calls per tool invocation | Cost guard limits daily spend per org | Per-role token budgets, queue-based execution for expensive operations |
| Plan gate checks | One DB query per tool execution (cached) | In-memory plan cache (TTL 60s) | Redis cache or Supabase realtime subscription for plan changes |

---

## 10. Build Order Recommendation

The three feature tracks have a clear dependency graph:

```
Phase 1: File Attachments (no dependencies on billing or growth)
  - DB migration + storage bucket
  - Upload API + signed URLs
  - Chat route modification
  - Frontend upload hook + preview component
  - Post-process: text extraction + RAG embedding

Phase 2: Billing Hardening (no dependency on attachments or growth)
  - Webhook consolidation
  - Subscription lifecycle handler
  - Plan gate enforcement at tool execution
  - Usage metering wiring
  - Pricing page + billing settings UI

Phase 3: Growth Role Tools (depends on Phase 2 for plan gating)
  - Tool wrapper files (seo-tools, ad-tools, tender-tools)
  - Tool group registration in tools.ts
  - Plan-gated tool execution
  - Content tools (new -- social scheduling)
  - Builder tools (new -- code generation sandbox)
```

**Phase ordering rationale:**
- Attachments first because they have zero dependencies and immediately improve the chat experience. Users expect to share files.
- Billing second because growth roles need plan gating to work correctly. Shipping growth tools without billing gates means free users get everything.
- Growth roles third because they depend on billing gates and also benefit from v1.3 role engine progress (though they are shippable without it as chat-invokable tools).

Within each phase, the specific sub-tasks are:

**Phase 1 (Attachments) sub-order:**
1. Migration + storage bucket config
2. Upload API route
3. Chat route accepts attachmentIds
4. Pipeline/engine wiring for multimodal content
5. Frontend Paperclip button + upload hook
6. Inline preview component
7. Post-process text extraction + RAG

**Phase 2 (Billing) sub-order:**
1. Webhook route consolidation
2. subscription-handler.ts with full lifecycle
3. Plan gate enforcement in executeAgentTool
4. Usage metering wiring in run-logger
5. Trial expiration cron handler
6. Pricing page
7. Billing settings component

**Phase 3 (Growth Roles) sub-order:**
1. seo-tools.ts (wraps existing ai-search-optimizer)
2. ad-tools.ts (wraps existing ad-script-gen)
3. tender-tools.ts (wraps existing tender-hunter)
4. Register all three in tools.ts + TOOL_GROUPS
5. content-tools.ts (new -- blog generation, social scheduling)
6. builder-tools.ts (new -- leverages execute_code sandbox)

---

## Sources

- Supabase Storage signed upload URLs: [Official Docs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
- Anthropic Files API and PDF support: [Claude API Docs](https://docs.anthropic.com/en/docs/build-with-claude/files), [PDF Support](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- Stripe subscription webhook events: [Stripe Docs](https://docs.stripe.com/billing/subscriptions/webhooks)
- Stripe subscription lifecycle: [How Subscriptions Work](https://docs.stripe.com/billing/subscriptions/overview)
- Codebase analysis: engine.ts, unified-pipeline.ts, tools.ts, plan-gates.ts, checkout.ts, trial-manager.ts, dunning.ts, tender-hunter.ts, ad-script-gen.ts, ai-search-optimizer.ts, attachment-processor.ts, gmail-attachments.ts, conversation/types.ts, thread-resolver.ts
