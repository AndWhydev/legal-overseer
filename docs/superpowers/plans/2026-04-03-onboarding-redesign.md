# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-stage onboarding wizard with a conversational experience where BitBit narrates what it learns in real-time, reveals an interactive knowledge graph, and transitions seamlessly into a fully populated dashboard.

**Architecture:** A Haiku narration layer sits between the existing onboarding pipeline (crawl → Opus synthesis → ingestion) and the frontend. It transforms raw pipeline events into natural BitBit-voice chat messages streamed over SSE. The frontend is a full-screen chat at `/onboard` using shadcn/ui + animate-ui. When the world model completes, an interactive d3-force knowledge graph renders inline. On completion, dashboard chrome animates in around the chat.

**Tech Stack:** Next.js 16, React 19, shadcn/ui, animate-ui, d3-force, SSE (EventSource), Fly.io worker, Haiku (narration), Opus (synthesis), Supabase

**Spec:** `docs/superpowers/specs/2026-04-03-onboarding-redesign-design.md`

---

## File Structure

### New files

```
personal-assistant/src/components/onboarding/
  onboarding-chat.tsx          — Full-screen chat UI with SSE consumer
  connection-card.tsx          — Floating OAuth card overlay
  chat-bubble.tsx              — Individual chat message component
  chat-input.tsx               — User input bar for corrections/replies
  world-graph.tsx              — d3-force knowledge graph canvas renderer
  graph-detail-panel.tsx       — Side panel for node details + inline editing
  graph-types.ts               — Node, Edge, GraphData type definitions
  use-onboarding-stream.ts     — React hook for SSE connection + state management
  use-graph-simulation.ts      — React hook for d3-force simulation lifecycle

personal-assistant/src/app/(auth)/onboard/
  page.tsx                     — Complete rewrite: mounts OnboardingChat + DashboardShell

personal-assistant/src/app/api/onboarding/conversation/
  route.ts                     — Vercel proxy: forwards SSE from Fly.io worker to client

personal-assistant/src/lib/onboarding/
  narration.ts                 — Haiku narration layer: pipeline event → BitBit message
  narration.test.ts            — Tests for narration generation
  stream-types.ts              — SSE event type definitions shared between server + client
  agent-activator.ts           — Auto-activate agents based on world model
  agent-activator.test.ts      — Tests for agent activation logic

deployments/fly/src/
  onboarding-handler.ts        — SSE endpoint: runs pipeline + Haiku narration
  onboarding-handler.test.ts   — Tests for the SSE handler
```

### Modified files

```
deployments/fly/src/worker.ts                     — Add route for /api/onboarding/conversation
personal-assistant/src/lib/onboarding/state.ts     — Update routing logic for new flow
personal-assistant/src/lib/onboarding/index.ts     — Update barrel exports
personal-assistant/src/middleware.ts                — Ensure /onboard route passes through
```

### Removed (deprecated, not deleted yet)

```
personal-assistant/src/components/onboarding/aurora-character.tsx
personal-assistant/src/components/onboarding/sky-video-backdrop.tsx
personal-assistant/src/components/onboarding/stage-progress.tsx
personal-assistant/src/components/onboarding/agent-recommendations.tsx
personal-assistant/src/components/onboarding/first-run-guide.tsx
personal-assistant/src/lib/onboarding/first-run-discovery.ts
personal-assistant/src/lib/onboarding/welcome-conversation.ts
personal-assistant/src/lib/onboarding/beta-flow.ts
```

---

## Task 1: SSE Event Types + Graph Types

**Files:**
- Create: `personal-assistant/src/lib/onboarding/stream-types.ts`
- Create: `personal-assistant/src/components/onboarding/graph-types.ts`

These are the shared contracts that every other task depends on.

- [ ] **Step 1: Create SSE event types**

```typescript
// personal-assistant/src/lib/onboarding/stream-types.ts

export type OnboardingStreamEvent =
  | { type: 'narration'; message: string; id: string }
  | { type: 'discovery'; category: 'contact' | 'project' | 'financial'; data: DiscoveryItem }
  | { type: 'progress'; phase: string; percent: number }
  | { type: 'reveal'; worldModel: RevealWorldModel; stats: RevealStats }
  | { type: 'agents'; activated: string[]; reasons: Record<string, string> }
  | { type: 'complete'; threadId: string }
  | { type: 'error'; message: string; recoverable: boolean }

export interface DiscoveryItem {
  name: string
  detail: string // e.g. "47 messages · client" or "$700 pending"
}

export interface RevealStats {
  totalMessages: number
  peopleFound: number
  projectsFound: number
  financialsFound: number
  channelsScanned: string[]
  durationMs: number
}

export interface RevealWorldModel {
  user: { name: string; emails: string[]; businessName: string; role: string }
  people: RevealPerson[]
  projects: RevealProject[]
  financials: RevealFinancial[]
}

export interface RevealPerson {
  id: string
  name: string
  company: string
  role: string
  relationship: 'client' | 'colleague' | 'vendor' | 'personal' | 'employer' | 'unknown'
  messageCount: number
  frequency: 'daily' | 'weekly' | 'monthly' | 'rare'
  lastInteraction: string
  outstandingItems: string[]
  emails: string[]
}

export interface RevealProject {
  id: string
  name: string
  status: 'active' | 'stalled' | 'completed'
  people: string[]
  urls: string[]
  description: string
  deadlines: string[]
}

export interface RevealFinancial {
  id: string
  type: 'receivable' | 'payable' | 'subscription'
  entity: string
  amount: string
  currency: string
  dueDate: string
  status: string
}

export interface UserReply {
  message: string
  timestamp: number
}
```

- [ ] **Step 2: Create graph types**

```typescript
// personal-assistant/src/components/onboarding/graph-types.ts

export type GraphNodeType = 'user' | 'person' | 'project' | 'financial'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  sublabel: string
  size: number // radius in px, computed from data
  color: string // border color based on type
  data: Record<string, unknown> // full entity data for detail panel
  // d3-force simulation fields (mutated by d3)
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null // pinned position
  fy?: number | null
}

export interface GraphEdge {
  source: string // node id
  target: string // node id
  type: 'contacted' | 'works-on' | 'owes' | 'shared-project'
  strength: number // 0-1, affects edge opacity
  dashed: boolean
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const NODE_COLORS: Record<GraphNodeType, string> = {
  user: 'rgba(255, 255, 255, 0.4)',
  person: 'rgba(34, 197, 94, 0.5)',
  project: 'rgba(59, 130, 246, 0.5)',
  financial: 'rgba(234, 179, 8, 0.5)',
}

export const NODE_BASE_SIZES: Record<GraphNodeType, number> = {
  user: 32,
  person: 18,
  project: 16,
  financial: 14,
}
```

- [ ] **Step 3: Commit**

```bash
git add personal-assistant/src/lib/onboarding/stream-types.ts personal-assistant/src/components/onboarding/graph-types.ts
git commit -m "feat(onboarding): add SSE event types and knowledge graph types"
```

---

## Task 2: Haiku Narration Layer

**Files:**
- Create: `personal-assistant/src/lib/onboarding/narration.ts`
- Create: `personal-assistant/src/lib/onboarding/narration.test.ts`

The narration layer transforms raw pipeline events + user replies into natural BitBit-voice chat messages using Haiku.

- [ ] **Step 1: Write the failing test**

```typescript
// personal-assistant/src/lib/onboarding/narration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateNarration, type NarrationContext } from './narration'

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Found someone interesting in your inbox.' }],
      }),
    },
  })),
}))

describe('generateNarration', () => {
  const baseContext: NarrationContext = {
    conversationHistory: [],
    userCorrections: [],
    currentPhase: 'crawling',
  }

  it('generates narration for a contact discovery event', async () => {
    const result = await generateNarration(
      { type: 'contact_found', name: 'Steve West', messageCount: 47, relationship: 'client' },
      baseContext,
    )
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
    expect(result.length).toBeLessThan(500) // Concise, not a novel
  })

  it('generates narration for crawl progress', async () => {
    const result = await generateNarration(
      { type: 'crawl_progress', channel: 'gmail', messagesFound: 142 },
      baseContext,
    )
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('generates narration for synthesis start', async () => {
    const result = await generateNarration(
      { type: 'synthesis_start', totalMessages: 347, channels: ['gmail', 'calendar'] },
      { ...baseContext, currentPhase: 'synthesizing' },
    )
    expect(result).toBeTruthy()
  })

  it('incorporates user corrections into context', async () => {
    const result = await generateNarration(
      { type: 'contact_found', name: 'Maya', messageCount: 12, relationship: 'unknown' },
      {
        ...baseContext,
        userCorrections: [{ original: 'Steve West', correction: "He's my biggest client" }],
        conversationHistory: [
          { role: 'assistant' as const, content: 'Found Steve West — 47 messages.' },
          { role: 'user' as const, content: "He's my biggest client" },
        ],
      },
    )
    expect(result).toBeTruthy()
  })

  it('generates reveal narration', async () => {
    const result = await generateNarration(
      { type: 'reveal', peopleCount: 23, projectCount: 4, financialTotal: '$1,200' },
      { ...baseContext, currentPhase: 'complete' },
    )
    expect(result).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal-assistant && npx vitest run src/lib/onboarding/narration.test.ts --reporter=verbose`
Expected: FAIL — module `./narration` not found

- [ ] **Step 3: Implement the narration layer**

```typescript
// personal-assistant/src/lib/onboarding/narration.ts
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger'

export interface NarrationContext {
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  userCorrections: Array<{ original: string; correction: string }>
  currentPhase: 'crawling' | 'synthesizing' | 'ingesting' | 'complete'
}

export type PipelineEvent =
  | { type: 'crawl_start' }
  | { type: 'crawl_progress'; channel: string; messagesFound: number }
  | { type: 'contact_found'; name: string; messageCount: number; relationship: string }
  | { type: 'project_found'; name: string; people: string[] }
  | { type: 'financial_found'; entity: string; amount: string; type: string }
  | { type: 'synthesis_start'; totalMessages: number; channels: string[] }
  | { type: 'synthesis_progress'; detail: string }
  | { type: 'ingestion_start' }
  | { type: 'reveal'; peopleCount: number; projectCount: number; financialTotal: string }
  | { type: 'agents_activated'; agents: string[] }

const NARRATION_SYSTEM_PROMPT = `You are BitBit, narrating what you're discovering as you read through a new user's email and messages for the first time. This is onboarding — you're building your understanding of their world.

Voice rules:
- Use collective pronouns: "we've got", "our", not "you have", "your"
- Be warm, direct, concise — 1-2 sentences max per message
- Sound like a smart colleague reading through their inbox, noting things out loud
- When you find people, mention them by name and what you notice about them
- When you find money, be specific about amounts
- Never ask what to do next. Never say "anything else?" Just narrate what you see.
- Never mention AI, models, algorithms, or technical processes
- If the user corrected something, acknowledge it naturally and move on

You're generating ONE chat message based on the pipeline event provided. Keep it short and natural.`

export async function generateNarration(
  event: PipelineEvent,
  context: NarrationContext,
): Promise<string> {
  const client = new Anthropic()

  const messages: Anthropic.MessageParam[] = [
    // Include recent conversation for continuity (last 6 messages max)
    ...context.conversationHistory.slice(-6).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: `[SYSTEM: Generate the next narration message for this pipeline event. Do NOT address the user directly or ask questions unless the event is a contact_found with relationship "unknown". Keep it to 1-2 sentences.]

Event: ${JSON.stringify(event)}
Phase: ${context.currentPhase}
${context.userCorrections.length > 0 ? `User corrections so far: ${JSON.stringify(context.userCorrections)}` : ''}`,
    },
  ]

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: NARRATION_SYSTEM_PROMPT,
      messages,
    })

    const text = response.content.find(b => b.type === 'text')
    return text?.type === 'text' ? text.text : 'Still reading...'
  } catch (err) {
    logger.warn('[narration] Haiku call failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    return getFallbackNarration(event)
  }
}

function getFallbackNarration(event: PipelineEvent): string {
  switch (event.type) {
    case 'crawl_start': return 'Connected. Reading through your history...'
    case 'crawl_progress': return `Scanning ${event.channel}... found ${event.messagesFound} messages.`
    case 'contact_found': return `Found ${event.name} — ${event.messageCount} messages.`
    case 'project_found': return `Spotted a project: ${event.name}.`
    case 'financial_found': return `${event.entity}: ${event.amount} (${event.type}).`
    case 'synthesis_start': return `Starting to piece things together from ${event.totalMessages} messages...`
    case 'synthesis_progress': return event.detail
    case 'ingestion_start': return 'Populating your world...'
    case 'reveal': return `Here's your world as I see it. ${event.peopleCount} people, ${event.projectCount} projects, ${event.financialTotal} outstanding.`
    case 'agents_activated': return `Set up ${event.agents.join(', ')} based on what I see. Adjust anytime.`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal-assistant && npx vitest run src/lib/onboarding/narration.test.ts --reporter=verbose`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add personal-assistant/src/lib/onboarding/narration.ts personal-assistant/src/lib/onboarding/narration.test.ts
git commit -m "feat(onboarding): Haiku narration layer for pipeline events"
```

---

## Task 3: Agent Auto-Activator

**Files:**
- Create: `personal-assistant/src/lib/onboarding/agent-activator.ts`
- Create: `personal-assistant/src/lib/onboarding/agent-activator.test.ts`

Decides which agents to activate based on the world model content.

- [ ] **Step 1: Write the failing test**

```typescript
// personal-assistant/src/lib/onboarding/agent-activator.test.ts
import { describe, it, expect } from 'vitest'
import { determineAgents } from './agent-activator'
import type { RevealWorldModel } from './stream-types'

describe('determineAgents', () => {
  const baseModel: RevealWorldModel = {
    user: { name: 'Tor', emails: ['tor@test.com'], businessName: 'Torkay', role: 'owner' },
    people: [],
    projects: [],
    financials: [],
  }

  it('activates Comms for any user with contacts', () => {
    const model: RevealWorldModel = {
      ...baseModel,
      people: [{ id: '1', name: 'Steve', company: '', role: '', relationship: 'client', messageCount: 10, frequency: 'weekly', lastInteraction: '', outstandingItems: [], emails: [] }],
    }
    const result = determineAgents(model)
    expect(result.activated).toContain('comms')
    expect(result.reasons.comms).toBeTruthy()
  })

  it('activates Finance when financials exist', () => {
    const model: RevealWorldModel = {
      ...baseModel,
      financials: [{ id: '1', type: 'receivable', entity: 'Steve', amount: '$700', currency: 'AUD', dueDate: '2026-04-15', status: 'pending' }],
    }
    const result = determineAgents(model)
    expect(result.activated).toContain('finance')
  })

  it('activates Sales when multiple clients exist', () => {
    const model: RevealWorldModel = {
      ...baseModel,
      people: [
        { id: '1', name: 'Steve', company: '', role: '', relationship: 'client', messageCount: 10, frequency: 'weekly', lastInteraction: '', outstandingItems: [], emails: [] },
        { id: '2', name: 'Maya', company: '', role: '', relationship: 'client', messageCount: 5, frequency: 'monthly', lastInteraction: '', outstandingItems: [], emails: [] },
      ],
    }
    const result = determineAgents(model)
    expect(result.activated).toContain('sales')
  })

  it('returns empty for empty world model', () => {
    const result = determineAgents(baseModel)
    expect(result.activated).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal-assistant && npx vitest run src/lib/onboarding/agent-activator.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement agent activator**

```typescript
// personal-assistant/src/lib/onboarding/agent-activator.ts
import type { RevealWorldModel } from './stream-types'

export interface AgentActivationResult {
  activated: string[]
  reasons: Record<string, string>
}

export function determineAgents(model: RevealWorldModel): AgentActivationResult {
  const activated: string[] = []
  const reasons: Record<string, string> = {}

  // Comms: any contacts found
  if (model.people.length > 0) {
    activated.push('comms')
    reasons.comms = `${model.people.length} contacts to keep track of`
  }

  // Finance: any financial items
  if (model.financials.length > 0) {
    const totalItems = model.financials.length
    const receivables = model.financials.filter(f => f.type === 'receivable')
    activated.push('finance')
    reasons.finance = receivables.length > 0
      ? `${receivables.length} outstanding receivable${receivables.length > 1 ? 's' : ''} to track`
      : `${totalItems} financial item${totalItems > 1 ? 's' : ''} found`
  }

  // Sales: 2+ clients
  const clients = model.people.filter(p => p.relationship === 'client')
  if (clients.length >= 2) {
    activated.push('sales')
    reasons.sales = `${clients.length} active clients in the pipeline`
  }

  return { activated, reasons }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal-assistant && npx vitest run src/lib/onboarding/agent-activator.test.ts --reporter=verbose`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add personal-assistant/src/lib/onboarding/agent-activator.ts personal-assistant/src/lib/onboarding/agent-activator.test.ts
git commit -m "feat(onboarding): agent auto-activator based on world model"
```

---

## Task 4: Fly.io Worker — Onboarding SSE Handler

**Files:**
- Create: `deployments/fly/src/onboarding-handler.ts`
- Modify: `deployments/fly/src/worker.ts`

The SSE endpoint that runs the pipeline, feeds events to Haiku, and streams narration to the client. This is the backend heart of the new onboarding.

- [ ] **Step 1: Create the onboarding handler**

```typescript
// deployments/fly/src/onboarding-handler.ts
import { IncomingMessage, ServerResponse } from 'node:http'

/**
 * POST /api/onboarding/conversation
 *
 * Runs the full onboarding pipeline and streams narration events via SSE.
 * The pipeline phases:
 *   1. crawlAllChannels() — bulk fetch from connected channels
 *   2. Haiku narration — transforms each raw event into a BitBit voice message
 *   3. synthesizeWorldModel() — Opus synthesis of the full corpus
 *   4. ingestWorldModel() — populates contacts, graph, memories
 *   5. determineAgents() — auto-activate agents
 *   6. Stream the reveal with full world model
 *   7. Persist conversation thread
 *
 * SSE format: each event is `data: {json}\n\n`
 * Client connects via EventSource.
 */

interface OnboardingRequest {
  userId: string
  orgId: string
  accessToken: string // Supabase access token for RLS
}

// Note: The actual implementation will import from the personal-assistant package.
// For now, the worker will make HTTP calls to the Vercel app's internal APIs
// to run pipeline functions, or we can bundle the pipeline code into the worker.
//
// The simpler approach: the Vercel API route at /api/onboarding/conversation
// runs the pipeline directly (with maxDuration: 300) and streams SSE.
// If 300s is insufficient, we move to the Fly.io worker.
//
// Starting with the Vercel route approach since the pipeline code lives in
// personal-assistant and importing it into the Fly worker would require
// significant bundling changes.

export async function handleOnboardingConversation(
  req: IncomingMessage,
  res: ServerResponse,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  // Parse request body
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString()) as OnboardingRequest

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  const sendEvent = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  let eventId = 0
  const nextId = () => String(++eventId)

  try {
    // The pipeline functions need a Supabase client with the user's context.
    // Create one using the service role key (worker has it) but scoped to the org.
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Import pipeline modules
    // Note: These imports assume the worker has access to the personal-assistant
    // source. In practice, we'll either:
    // a) Bundle these into the worker build, or
    // b) Run the pipeline via the Vercel route instead
    //
    // For now, this handler serves as the contract. The actual execution
    // path will be decided during implementation based on bundling feasibility.

    sendEvent({ type: 'narration', message: 'Connected. Reading through your history...', id: nextId() })

    // Phase 1: Crawl
    sendEvent({ type: 'progress', phase: 'crawling', percent: 0 })

    // ... pipeline execution will be wired in during implementation
    // The key contract: this handler streams OnboardingStreamEvent objects

    sendEvent({ type: 'complete', threadId: 'placeholder' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendEvent({ type: 'error', message, recoverable: true })
  } finally {
    res.end()
  }
}

/**
 * POST /api/onboarding/conversation/reply
 *
 * Accepts user messages during onboarding conversation.
 * Stores them for the narration layer to incorporate.
 */
export async function handleOnboardingReply(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const { message } = JSON.parse(Buffer.concat(chunks).toString()) as { message: string }

  // Store the reply in a shared state that the pipeline loop reads.
  // In practice this will be an in-memory queue or a Supabase row
  // that the pipeline checks between narration events.
  pendingReplies.push({ message, timestamp: Date.now() })

  const headers = { 'Content-Type': 'application/json' }
  res.writeHead(200, headers)
  res.end(JSON.stringify({ ok: true }))
}

// In-memory reply queue (per-process, fine for single-user onboarding)
const pendingReplies: Array<{ message: string; timestamp: number }> = []

export function drainReplies(): Array<{ message: string; timestamp: number }> {
  return pendingReplies.splice(0)
}
```

- [ ] **Step 2: Add routes to worker.ts**

Open `deployments/fly/src/worker.ts` and add the new route handlers. Find the route matching section in the `createServer` callback:

```typescript
// Add these imports at the top of worker.ts
import { handleOnboardingConversation, handleOnboardingReply } from "./onboarding-handler.js";

// Add these routes in the createServer callback, before the 404 fallback:
    } else if (method === "POST" && url.pathname === "/api/onboarding/conversation") {
      await handleOnboardingConversation(req, res, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else if (method === "POST" && url.pathname === "/api/onboarding/conversation/reply") {
      await handleOnboardingReply(req, res);
    } else {
```

- [ ] **Step 3: Commit**

```bash
git add deployments/fly/src/onboarding-handler.ts deployments/fly/src/worker.ts
git commit -m "feat(worker): onboarding conversation SSE endpoint on Fly.io"
```

---

## Task 5: Vercel Proxy Route

**Files:**
- Create: `personal-assistant/src/app/api/onboarding/conversation/route.ts`

Proxies the SSE stream from the Fly.io worker to the browser, forwarding auth.

- [ ] **Step 1: Create the proxy route**

```typescript
// personal-assistant/src/app/api/onboarding/conversation/route.ts
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const WORKER_URL = process.env.WORKER_CALLBACK_URL || 'https://bitbit-workers.fly.dev'
const WORKER_AUTH = process.env.WORKER_AUTH_TOKEN || ''

/**
 * POST /api/onboarding/conversation
 *
 * Proxies to the Fly.io worker's onboarding SSE endpoint.
 * Authenticates the user and forwards their org context.
 *
 * Returns an SSE stream that the client consumes via EventSource.
 */
export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return new Response(JSON.stringify({ error: 'No org found' }), { status: 400 })
  }

  logger.info('[api/onboarding/conversation] Starting SSE proxy', {
    userId: user.id,
    orgId: profile.org_id,
  })

  try {
    const workerRes = await fetch(`${WORKER_URL}/api/onboarding/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WORKER_AUTH}`,
      },
      body: JSON.stringify({
        userId: user.id,
        orgId: profile.org_id,
      }),
    })

    if (!workerRes.ok || !workerRes.body) {
      const text = await workerRes.text()
      logger.error('[api/onboarding/conversation] Worker error', { status: workerRes.status, text })
      return new Response(JSON.stringify({ error: 'Worker unavailable' }), { status: 502 })
    }

    // Stream the worker's SSE response directly to the client
    return new Response(workerRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[api/onboarding/conversation] Proxy failed', { error })
    return new Response(JSON.stringify({ error }), { status: 500 })
  }
}
```

- [ ] **Step 2: Create the reply proxy route**

```typescript
// personal-assistant/src/app/api/onboarding/conversation/reply/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WORKER_URL = process.env.WORKER_CALLBACK_URL || 'https://bitbit-workers.fly.dev'
const WORKER_AUTH = process.env.WORKER_AUTH_TOKEN || ''

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { message: string }

  const workerRes = await fetch(`${WORKER_URL}/api/onboarding/conversation/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WORKER_AUTH}`,
    },
    body: JSON.stringify({ message: body.message }),
  })

  if (!workerRes.ok) {
    return NextResponse.json({ error: 'Worker unavailable' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add personal-assistant/src/app/api/onboarding/conversation/route.ts personal-assistant/src/app/api/onboarding/conversation/reply/route.ts
git commit -m "feat(onboarding): Vercel proxy route for SSE stream + replies"
```

---

## Task 6: useOnboardingStream Hook

**Files:**
- Create: `personal-assistant/src/components/onboarding/use-onboarding-stream.ts`

React hook that connects to the SSE endpoint, manages chat state, and handles user replies.

- [ ] **Step 1: Create the hook**

```typescript
// personal-assistant/src/components/onboarding/use-onboarding-stream.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { OnboardingStreamEvent, RevealWorldModel, RevealStats } from '@/lib/onboarding/stream-types'

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: number
}

export interface OnboardingStreamState {
  messages: ChatMessage[]
  phase: 'idle' | 'connecting' | 'crawling' | 'synthesizing' | 'ingesting' | 'reveal' | 'complete' | 'error'
  progress: number // 0-100
  worldModel: RevealWorldModel | null
  stats: RevealStats | null
  activatedAgents: { activated: string[]; reasons: Record<string, string> } | null
  threadId: string | null
  error: string | null
}

export function useOnboardingStream() {
  const [state, setState] = useState<OnboardingStreamState>({
    messages: [],
    phase: 'idle',
    progress: 0,
    worldModel: null,
    stats: null,
    activatedAgents: null,
    threadId: null,
    error: null,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const messageIdCounter = useRef(0)

  const addMessage = useCallback((role: 'assistant' | 'user', content: string, id?: string) => {
    const msgId = id || `msg-${++messageIdCounter.current}`
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { id: msgId, role, content, timestamp: Date.now() }],
    }))
  }, [])

  const startStream = useCallback(async () => {
    setState(prev => ({ ...prev, phase: 'connecting' }))

    try {
      const res = await fetch('/api/onboarding/conversation', { method: 'POST' })

      if (!res.ok || !res.body) {
        setState(prev => ({ ...prev, phase: 'error', error: 'Could not start onboarding' }))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      setState(prev => ({ ...prev, phase: 'crawling' }))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue

          try {
            const event = JSON.parse(json) as OnboardingStreamEvent

            switch (event.type) {
              case 'narration':
                addMessage('assistant', event.message, event.id)
                break
              case 'progress':
                setState(prev => ({
                  ...prev,
                  phase: event.phase as OnboardingStreamState['phase'],
                  progress: event.percent,
                }))
                break
              case 'reveal':
                setState(prev => ({
                  ...prev,
                  phase: 'reveal',
                  worldModel: event.worldModel,
                  stats: event.stats,
                }))
                break
              case 'agents':
                setState(prev => ({
                  ...prev,
                  activatedAgents: { activated: event.activated, reasons: event.reasons },
                }))
                break
              case 'complete':
                setState(prev => ({ ...prev, phase: 'complete', threadId: event.threadId }))
                break
              case 'error':
                setState(prev => ({ ...prev, phase: 'error', error: event.message }))
                break
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Connection lost',
      }))
    }
  }, [addMessage])

  const sendReply = useCallback(async (message: string) => {
    addMessage('user', message)

    try {
      await fetch('/api/onboarding/conversation/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
    } catch {
      // Reply delivery failure is non-blocking — narration continues
    }
  }, [addMessage])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  return {
    ...state,
    startStream,
    sendReply,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-assistant/src/components/onboarding/use-onboarding-stream.ts
git commit -m "feat(onboarding): useOnboardingStream hook for SSE chat state"
```

---

## Task 7: Chat UI Components

**Files:**
- Create: `personal-assistant/src/components/onboarding/chat-bubble.tsx`
- Create: `personal-assistant/src/components/onboarding/chat-input.tsx`
- Create: `personal-assistant/src/components/onboarding/connection-card.tsx`

The visual chat components using shadcn/ui.

- [ ] **Step 1: Create chat bubble**

```typescript
// personal-assistant/src/components/onboarding/chat-bubble.tsx
'use client'

import { motion } from 'motion/react'
import type { ChatMessage } from './use-onboarding-stream'

interface ChatBubbleProps {
  message: ChatMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {message.content}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Create chat input**

```typescript
// personal-assistant/src/components/onboarding/chat-input.tsx
'use client'

import { useState, useCallback, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ArrowUp } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled, placeholder = 'Type a reply...' }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="flex items-center gap-2 p-4 border-t bg-background">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        variant="default"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Create connection card**

```typescript
// personal-assistant/src/components/onboarding/connection-card.tsx
'use client'

import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Calendar } from 'lucide-react'

interface ConnectionCardProps {
  visible: boolean
  onConnect: (provider: string) => void
}

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail', icon: Mail, oauthPath: '/api/channels/oauth/gmail' },
  { id: 'outlook', label: 'Outlook', icon: Mail, oauthPath: '/api/channels/oauth/outlook' },
  { id: 'google-calendar', label: 'Calendar', icon: Calendar, oauthPath: '/api/channels/oauth/google-calendar' },
]

export function ConnectionCard({ visible, onConnect }: ConnectionCardProps) {
  const handleConnect = (provider: typeof PROVIDERS[number]) => {
    // Set return URL cookie so OAuth callback returns to /onboard
    document.cookie = 'bb-onboarding-active=1; path=/; max-age=3600; SameSite=Lax'
    onConnect(provider.id)
    window.location.href = `${provider.oauthPath}?return=/onboard`
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-24 right-6 z-50"
        >
          <Card className="w-72 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Connect an account</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {PROVIDERS.map(provider => (
                <Button
                  key={provider.id}
                  variant="outline"
                  className="justify-start gap-3 h-11"
                  onClick={() => handleConnect(provider)}
                >
                  <provider.icon className="h-4 w-4" />
                  {provider.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add personal-assistant/src/components/onboarding/chat-bubble.tsx personal-assistant/src/components/onboarding/chat-input.tsx personal-assistant/src/components/onboarding/connection-card.tsx
git commit -m "feat(onboarding): chat bubble, input, and connection card components"
```

---

## Task 8: Knowledge Graph — d3-force Hook + Canvas Renderer

**Files:**
- Create: `personal-assistant/src/components/onboarding/use-graph-simulation.ts`
- Create: `personal-assistant/src/components/onboarding/world-graph.tsx`

The interactive knowledge graph with force-directed layout.

- [ ] **Step 1: Install d3-force**

Run: `cd personal-assistant && npm install d3-force && npm install -D @types/d3-force`

- [ ] **Step 2: Create the simulation hook**

```typescript
// personal-assistant/src/components/onboarding/use-graph-simulation.ts
'use client'

import { useEffect, useRef, useCallback } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import type { GraphNode, GraphEdge } from './graph-types'

interface SimulationNode extends GraphNode, SimulationNodeDatum {}
interface SimulationLink extends SimulationLinkDatum<SimulationNode> {
  type: GraphEdge['type']
  strength: number
  dashed: boolean
}

export function useGraphSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  onTick: (nodes: SimulationNode[], links: SimulationLink[]) => void,
) {
  const simRef = useRef<Simulation<SimulationNode, SimulationLink> | null>(null)
  const nodesRef = useRef<SimulationNode[]>([])
  const linksRef = useRef<SimulationLink[]>([])

  useEffect(() => {
    // Create simulation nodes (copy to avoid mutating props)
    const simNodes: SimulationNode[] = nodes.map(n => ({ ...n }))
    const simLinks: SimulationLink[] = edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      strength: e.strength,
      dashed: e.dashed,
    }))

    // Pin the center "user" node
    const userNode = simNodes.find(n => n.type === 'user')
    if (userNode) {
      userNode.fx = width / 2
      userNode.fy = height / 2
    }

    nodesRef.current = simNodes
    linksRef.current = simLinks

    const sim = forceSimulation<SimulationNode>(simNodes)
      .force('link', forceLink<SimulationNode, SimulationLink>(simLinks)
        .id(d => d.id)
        .distance(120)
        .strength(0.3))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimulationNode>().radius(d => d.size + 8))
      .on('tick', () => onTick(nodesRef.current, linksRef.current))

    simRef.current = sim

    return () => {
      sim.stop()
    }
  }, [nodes, edges, width, height, onTick])

  const dragNode = useCallback((nodeId: string, x: number, y: number) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node) {
      node.fx = x
      node.fy = y
      simRef.current?.alpha(0.3).restart()
    }
  }, [])

  const releaseNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node && node.type !== 'user') {
      node.fx = null
      node.fy = null
    }
  }, [])

  return { dragNode, releaseNode }
}
```

- [ ] **Step 3: Create the graph canvas renderer**

```typescript
// personal-assistant/src/components/onboarding/world-graph.tsx
'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { useGraphSimulation } from './use-graph-simulation'
import { GraphDetailPanel } from './graph-detail-panel'
import { NODE_COLORS, type GraphNode, type GraphEdge, type GraphData } from './graph-types'
import type { RevealWorldModel } from '@/lib/onboarding/stream-types'

interface WorldGraphProps {
  worldModel: RevealWorldModel
  stats: { totalMessages: number; peopleFound: number; projectsFound: number; financialsFound: number }
  onCorrection?: (nodeId: string, field: string, value: string) => void
}

function buildGraphData(model: RevealWorldModel): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Center node
  nodes.push({
    id: 'user',
    type: 'user',
    label: model.user.name || 'You',
    sublabel: model.user.businessName || '',
    size: 32,
    color: NODE_COLORS.user,
    data: model.user,
  })

  // People
  for (const person of model.people) {
    const size = Math.min(26, Math.max(12, 10 + Math.log2(person.messageCount + 1) * 4))
    nodes.push({
      id: person.id,
      type: 'person',
      label: person.name,
      sublabel: `${person.messageCount} msgs`,
      size,
      color: NODE_COLORS.person,
      data: person,
    })
    if (person.frequency !== 'rare') {
      edges.push({
        source: 'user',
        target: person.id,
        type: 'contacted',
        strength: person.frequency === 'daily' ? 1 : person.frequency === 'weekly' ? 0.7 : 0.4,
        dashed: false,
      })
    }
  }

  // Projects
  for (const project of model.projects) {
    const pId = `proj-${project.id}`
    nodes.push({
      id: pId,
      type: 'project',
      label: project.name,
      sublabel: project.status,
      size: 16,
      color: NODE_COLORS.project,
      data: project,
    })
    // Link people to projects
    for (const personName of project.people) {
      const personNode = nodes.find(n => n.type === 'person' && n.label.toLowerCase() === personName.toLowerCase())
      if (personNode) {
        edges.push({
          source: personNode.id,
          target: pId,
          type: 'works-on',
          strength: 0.5,
          dashed: false,
        })
      }
    }
  }

  // Financials
  for (const fin of model.financials) {
    const fId = `fin-${fin.id}`
    nodes.push({
      id: fId,
      type: 'financial',
      label: `${fin.amount}`,
      sublabel: fin.entity,
      size: 14,
      color: NODE_COLORS.financial,
      data: fin,
    })
    // Link to matching person
    const personNode = nodes.find(n =>
      n.type === 'person' &&
      (n.label.toLowerCase().includes(fin.entity.toLowerCase()) ||
       fin.entity.toLowerCase().includes(n.label.toLowerCase()))
    )
    if (personNode) {
      edges.push({
        source: personNode.id,
        target: fId,
        type: 'owes',
        strength: 0.6,
        dashed: false,
      })
    }
  }

  return { nodes, edges }
}

export function WorldGraph({ worldModel, stats, onCorrection }: WorldGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 })

  const graphData = buildGraphData(worldModel)

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Canvas rendering callback
  const handleTick = useCallback((nodes: GraphNode[], links: Array<{ source: unknown; target: unknown; strength: number; dashed: boolean }>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, dimensions.width, dimensions.height)

    // Draw edges
    for (const link of links) {
      const source = link.source as GraphNode
      const target = link.target as GraphNode
      if (source.x == null || source.y == null || target.x == null || target.y == null) continue
      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.strokeStyle = `rgba(255, 255, 255, ${link.strength * 0.12})`
      ctx.lineWidth = 1
      if (link.dashed) ctx.setLineDash([4, 4])
      else ctx.setLineDash([])
      ctx.stroke()
    }

    // Draw nodes
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue
      const isSelected = selectedNode?.id === node.id

      // Circle for people and user, rounded rect for project/financial
      ctx.beginPath()
      if (node.type === 'project' || node.type === 'financial') {
        const w = node.size * 3
        const h = node.size * 1.5
        const r = 6
        const x = node.x - w / 2
        const y = node.y - h / 2
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + w, y, x + w, y + h, r)
        ctx.arcTo(x + w, y + h, x, y + h, r)
        ctx.arcTo(x, y + h, x, y, r)
        ctx.arcTo(x, y, x + w, y, r)
      } else {
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2)
      }
      ctx.fillStyle = '#09090b'
      ctx.fill()
      ctx.strokeStyle = isSelected ? node.color.replace('0.5', '0.9') : node.color
      ctx.lineWidth = isSelected ? 2 : 1.5
      ctx.stroke()

      // Label
      ctx.fillStyle = '#fafafa'
      ctx.font = `${Math.max(9, node.size * 0.55)}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.label, node.x, node.y - 2)

      // Sublabel
      if (node.sublabel) {
        ctx.fillStyle = '#71717a'
        ctx.font = `${Math.max(7, node.size * 0.4)}px Inter, system-ui, sans-serif`
        ctx.fillText(node.sublabel, node.x, node.y + node.size * 0.45)
      }
    }
  }, [dimensions, selectedNode])

  const { dragNode, releaseNode } = useGraphSimulation(
    graphData.nodes,
    graphData.edges,
    dimensions.width,
    dimensions.height,
    handleTick,
  )

  // Click handler: find nearest node
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    let closest: GraphNode | null = null
    let closestDist = Infinity

    for (const node of graphData.nodes) {
      if (node.x == null || node.y == null) continue
      const dist = Math.hypot(node.x - x, node.y - y)
      if (dist < node.size + 8 && dist < closestDist) {
        closest = node
        closestDist = dist
      }
    }

    setSelectedNode(closest)
  }, [graphData.nodes])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex gap-0 w-full rounded-xl border bg-card overflow-hidden"
      style={{ height: 420 }}
    >
      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1 relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair"
          style={{ width: '100%', height: '100%' }}
        />
        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.4 }}
          className="absolute bottom-3 left-3 right-3 flex justify-center gap-6 text-xs text-muted-foreground"
        >
          <span>{stats.peopleFound} people</span>
          <span>{stats.projectsFound} projects</span>
          <span>{stats.financialsFound} financials</span>
          <span>{stats.totalMessages} messages scanned</span>
        </motion.div>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <GraphDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onCorrection={onCorrection}
        />
      )}
    </motion.div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add personal-assistant/src/components/onboarding/use-graph-simulation.ts personal-assistant/src/components/onboarding/world-graph.tsx
git commit -m "feat(onboarding): d3-force knowledge graph with canvas renderer"
```

---

## Task 9: Graph Detail Panel

**Files:**
- Create: `personal-assistant/src/components/onboarding/graph-detail-panel.tsx`

The side panel that shows full details for a selected graph node, with inline editing.

- [ ] **Step 1: Create the detail panel**

```typescript
// personal-assistant/src/components/onboarding/graph-detail-panel.tsx
'use client'

import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { GraphNode } from './graph-types'
import type { RevealPerson, RevealProject, RevealFinancial } from '@/lib/onboarding/stream-types'

interface GraphDetailPanelProps {
  node: GraphNode
  onClose: () => void
  onCorrection?: (nodeId: string, field: string, value: string) => void
}

export function GraphDetailPanel({ node, onClose, onCorrection }: GraphDetailPanelProps) {
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="border-l bg-background overflow-y-auto"
    >
      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Badge variant="outline" className="mb-2 text-xs capitalize">
              {node.type}
            </Badge>
            <h3 className="text-sm font-medium">{node.label}</h3>
            {node.sublabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{node.sublabel}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator />

        {/* Type-specific content */}
        {node.type === 'person' && <PersonDetail data={node.data as unknown as RevealPerson} />}
        {node.type === 'project' && <ProjectDetail data={node.data as unknown as RevealProject} />}
        {node.type === 'financial' && <FinancialDetail data={node.data as unknown as RevealFinancial} />}
        {node.type === 'user' && <UserDetail data={node.data as Record<string, unknown>} />}
      </div>
    </motion.div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  )
}

function PersonDetail({ data }: { data: RevealPerson }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Company" value={data.company} />
      <DetailRow label="Role" value={data.role} />
      <DetailRow label="Relationship" value={data.relationship} />
      <DetailRow label="Messages" value={String(data.messageCount)} />
      <DetailRow label="Frequency" value={data.frequency} />
      <DetailRow label="Last contact" value={data.lastInteraction} />
      {data.emails.length > 0 && (
        <DetailRow label="Email" value={data.emails[0]} />
      )}
      {data.outstandingItems.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Outstanding</div>
            {data.outstandingItems.map((item, i) => (
              <div key={i} className="text-sm text-muted-foreground mt-1">• {item}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProjectDetail({ data }: { data: RevealProject }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Status" value={data.status} />
      <DetailRow label="Description" value={data.description} />
      {data.people.length > 0 && (
        <DetailRow label="People" value={data.people.join(', ')} />
      )}
      {data.urls.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">URLs</div>
          {data.urls.map((url, i) => (
            <div key={i} className="text-sm text-blue-400 mt-0.5 break-all">{url}</div>
          ))}
        </div>
      )}
      {data.deadlines.length > 0 && (
        <DetailRow label="Deadlines" value={data.deadlines.join(', ')} />
      )}
    </div>
  )
}

function FinancialDetail({ data }: { data: RevealFinancial }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Type" value={data.type} />
      <DetailRow label="Entity" value={data.entity} />
      <DetailRow label="Amount" value={`${data.amount} ${data.currency}`} />
      <DetailRow label="Due date" value={data.dueDate} />
      <DetailRow label="Status" value={data.status} />
    </div>
  )
}

function UserDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Name" value={data.name as string} />
      <DetailRow label="Business" value={data.businessName as string} />
      <DetailRow label="Role" value={data.role as string} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-assistant/src/components/onboarding/graph-detail-panel.tsx
git commit -m "feat(onboarding): knowledge graph detail panel with inline data"
```

---

## Task 10: OnboardingChat — Main Container

**Files:**
- Create: `personal-assistant/src/components/onboarding/onboarding-chat.tsx`

The full-screen chat that orchestrates everything: SSE stream, chat bubbles, connection card, knowledge graph reveal.

- [ ] **Step 1: Create the main chat component**

```typescript
// personal-assistant/src/components/onboarding/onboarding-chat.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChatBubble } from './chat-bubble'
import { ChatInput } from './chat-input'
import { ConnectionCard } from './connection-card'
import { WorldGraph } from './world-graph'
import { useOnboardingStream } from './use-onboarding-stream'
import { motion, AnimatePresence } from 'motion/react'
import { Loader2 } from 'lucide-react'

interface OnboardingChatProps {
  hasConnection: boolean
  onComplete: (threadId: string) => void
}

export function OnboardingChat({ hasConnection, onComplete }: OnboardingChatProps) {
  const {
    messages,
    phase,
    worldModel,
    stats,
    activatedAgents,
    threadId,
    error,
    startStream,
    sendReply,
  } = useOnboardingStream()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showConnectionCard, setShowConnectionCard] = useState(!hasConnection)
  const [streamStarted, setStreamStarted] = useState(false)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, worldModel])

  // Start stream once connected
  useEffect(() => {
    if (hasConnection && !streamStarted) {
      setStreamStarted(true)
      setShowConnectionCard(false)
      void startStream()
    }
  }, [hasConnection, streamStarted, startStream])

  // Notify parent on completion
  useEffect(() => {
    if (phase === 'complete' && threadId) {
      // Short delay so user sees the final state
      const timer = setTimeout(() => onComplete(threadId), 500)
      return () => clearTimeout(timer)
    }
  }, [phase, threadId, onComplete])

  const isInputEnabled = phase === 'crawling' || phase === 'synthesizing' || phase === 'reveal'

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat messages */}
      <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {/* Initial greeting (before stream starts) */}
          {!streamStarted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[80%]">
                Hey — I'm BitBit. Give me access to your email and I'll figure out the rest.
              </div>
            </motion.div>
          )}

          {/* Stream messages */}
          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {/* Loading indicator during active phases */}
          {(phase === 'crawling' || phase === 'synthesizing' || phase === 'ingesting') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {phase === 'crawling' && 'Reading...'}
                  {phase === 'synthesizing' && 'Putting it together...'}
                  {phase === 'ingesting' && 'Setting things up...'}
                </span>
              </div>
            </motion.div>
          )}

          {/* Knowledge graph reveal */}
          <AnimatePresence>
            {worldModel && stats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="my-4"
              >
                <WorldGraph
                  worldModel={worldModel}
                  stats={stats}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Agent activation message */}
          {activatedAgents && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[80%]">
                Set up {activatedAgents.activated.join(', ')} based on what I see. Adjust anytime.
              </div>
            </motion.div>
          )}

          {/* "Let's go" button */}
          {phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center my-6"
            >
              <Button
                size="lg"
                onClick={() => threadId && onComplete(threadId)}
                className="px-8"
              >
                Let's go
              </Button>
            </motion.div>
          )}

          {/* Error state */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm max-w-[80%]">
                {error}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 block"
                  onClick={() => {
                    setStreamStarted(false)
                    void startStream()
                  }}
                >
                  Try again
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Chat input */}
      <ChatInput
        onSend={sendReply}
        disabled={!isInputEnabled}
        placeholder={
          phase === 'reveal' ? 'Tap a node to explore, or type to correct anything...'
            : isInputEnabled ? 'Type a reply...'
            : undefined
        }
      />

      {/* Floating connection card */}
      <ConnectionCard
        visible={showConnectionCard}
        onConnect={() => {}} // OAuth redirect handles everything
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-assistant/src/components/onboarding/onboarding-chat.tsx
git commit -m "feat(onboarding): OnboardingChat container with stream, graph, and connection card"
```

---

## Task 11: Rewrite /onboard Page + Dashboard Transition

**Files:**
- Rewrite: `personal-assistant/src/app/(auth)/onboard/page.tsx`
- Modify: `personal-assistant/src/lib/onboarding/state.ts`
- Modify: `personal-assistant/src/lib/onboarding/index.ts`

The page component that mounts OnboardingChat in full-screen mode, then reveals dashboard chrome on completion.

- [ ] **Step 1: Rewrite the onboard page**

```typescript
// personal-assistant/src/app/(auth)/onboard/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { motion, AnimatePresence } from 'motion/react'
import { OnboardingChat } from '@/components/onboarding/onboarding-chat'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'
import { hasCompletedFirstRunOnboarding, getWorkspaceId } from '@/lib/onboarding/state'
import { trackOnboardingEvent } from '@/lib/onboarding/analytics'

type PageState = 'loading' | 'onboarding' | 'transitioning'

export default function OnboardPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>('loading')
  const [hasConnection, setHasConnection] = useState(false)

  // Bootstrap: check auth, redirect if already onboarded, detect OAuth return
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    async function bootstrap() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await loadOnboardingProfile(supabase as never, user.id)

      if (hasCompletedFirstRunOnboarding(profile)) {
        router.replace('/dashboard')
        return
      }

      // Check if user has any connected channels
      const workspaceId = getWorkspaceId(profile)
      if (workspaceId) {
        const { data: connections } = await supabase
          .from('channel_connections')
          .select('channel_type')
          .eq('org_id', workspaceId)
          .eq('status', 'connected')
          .limit(1)

        if (connections && connections.length > 0) {
          setHasConnection(true)
        }
      }

      // Detect OAuth return
      const params = new URLSearchParams(window.location.search)
      const justConnected = params.get('connected')
      if (justConnected) {
        setHasConnection(true)
        window.history.replaceState({}, '', '/onboard')
      }

      trackOnboardingEvent('onboarding_started')
      setState('onboarding')
    }

    void bootstrap()
  }, [router])

  const handleComplete = useCallback(async (threadId: string) => {
    setState('transitioning')
    trackOnboardingEvent('onboarding_completed')

    // Mark onboarding as complete
    await fetch('/api/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_completed: true, onboarding_stage: 'complete' }),
    }).catch(() => {})

    // Transition delay for animation
    await new Promise(resolve => setTimeout(resolve, 1500))

    router.replace(`/dashboard?tab=chat&conversation=${threadId}`)
  }, [router])

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-background">
        <p className="text-sm text-muted-foreground">One moment...</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background relative">
      {/* Full-screen chat */}
      <AnimatePresence>
        {state === 'onboarding' && (
          <motion.div
            className="fixed inset-0 z-50"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <OnboardingChat
              hasConnection={hasConnection}
              onComplete={handleComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transition state */}
      {state === 'transitioning' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-background"
        >
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground"
          >
            Setting up your dashboard...
          </motion.p>
        </motion.div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update barrel exports**

Open `personal-assistant/src/lib/onboarding/index.ts` and add the new exports:

```typescript
// Add to existing exports in index.ts:
export type { OnboardingStreamEvent, RevealWorldModel, RevealStats, UserReply } from './stream-types'
export { generateNarration } from './narration'
export type { NarrationContext, PipelineEvent } from './narration'
export { determineAgents } from './agent-activator'
export type { AgentActivationResult } from './agent-activator'
```

- [ ] **Step 3: Commit**

```bash
git add personal-assistant/src/app/'(auth)'/onboard/page.tsx personal-assistant/src/lib/onboarding/index.ts
git commit -m "feat(onboarding): rewrite /onboard page with conversational chat + dashboard transition"
```

---

## Task 12: Wire Pipeline into Fly.io Handler

**Files:**
- Modify: `deployments/fly/src/onboarding-handler.ts`

This is the integration task — connecting the real pipeline (crawl → Opus → ingestion) to the SSE handler with Haiku narration in between. This task will require the most judgement from the implementer since it bridges the pipeline code (which lives in `personal-assistant/`) with the worker (which lives in `deployments/fly/`).

- [ ] **Step 1: Determine bundling approach**

The pipeline code (`intelligence-crawl.ts`, `opus-synthesis.ts`, `world-model-ingester.ts`, `onboarding-pipeline.ts`, `narration.ts`, `agent-activator.ts`) lives in the `personal-assistant` package. The Fly.io worker is a separate build.

**Option A (recommended):** Run the pipeline from a Vercel API route instead of the Fly.io worker. Use `maxDuration: 300` (5 minutes). The SSE stream serves directly from Vercel. This avoids bundling issues entirely. If 300s proves insufficient, migrate to Option B later.

**Option B:** Bundle the pipeline code into the Fly.io worker's build. This requires updating the worker's `tsconfig.json` and build process to include the `personal-assistant/src/lib/` modules.

Check if 300s is sufficient: the crawl takes ~30s, Opus synthesis ~2-3min, ingestion ~30s. Total: ~3-4 min. 300s should work for most users.

If choosing Option A, move the SSE handler logic from `deployments/fly/src/onboarding-handler.ts` into the Vercel route at `personal-assistant/src/app/api/onboarding/conversation/route.ts`, replacing the proxy with the actual pipeline execution.

- [ ] **Step 2: Implement the full pipeline SSE handler**

Update the chosen endpoint (Vercel route or Fly handler) to:

1. Create a Supabase client with the user's auth context
2. Call `crawlAllChannels()` — after each channel completes, call `generateNarration()` with the crawl event and stream the result
3. Check `drainReplies()` between narration events to incorporate user messages
4. Call `synthesizeWorldModel()` — stream progress narration before and after
5. Call `ingestWorldModel()` — stream ingestion progress
6. Call `determineAgents()` — stream agent activation event
7. Map `WorldModel` to `RevealWorldModel` (adding `id` fields from ingestion results)
8. Stream the `reveal` event with full world model
9. Save conversation to `conversation_threads` + `conversation_messages`
10. Stream the `complete` event with thread ID

This step requires reading the existing pipeline code and wiring it together. The implementer should read `onboarding-pipeline.ts` as a reference for the execution flow but build the SSE version as a new function rather than trying to adapt the async generator.

- [ ] **Step 3: Test end-to-end**

Run the dev server (`npm run dev` in personal-assistant), navigate to `/onboard`, connect Gmail via OAuth, and verify:
- BitBit's first message appears immediately
- Connection card appears and dissolves after OAuth
- Narration messages stream in during crawl
- Knowledge graph renders after synthesis
- "Let's go" button appears
- Clicking it transitions to the dashboard with data populated

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(onboarding): wire pipeline into SSE handler with Haiku narration"
```

---

## Task 13: Clean Up Deprecated Components

**Files:**
- Remove imports of old onboarding components from the new page
- Keep old files in the codebase but remove them from the barrel export

- [ ] **Step 1: Remove old exports from index.ts**

Remove `runBetaOnboarding`, `BetaOnboardingInput`, `ChannelSetup`, `OnboardingResult` exports from `personal-assistant/src/lib/onboarding/index.ts` if they're no longer imported anywhere.

Run: `cd personal-assistant && grep -rn 'runBetaOnboarding\|BetaOnboardingInput' src/ --include='*.ts' --include='*.tsx' | grep -v index.ts | grep -v beta-flow.ts`

If no results, remove those exports from `index.ts`.

- [ ] **Step 2: Verify no broken imports**

Run: `cd personal-assistant && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors related to onboarding imports.

- [ ] **Step 3: Run existing tests**

Run: `cd personal-assistant && npx vitest run src/lib/onboarding/ --reporter=verbose`
Expected: Existing tests still pass (state.test.ts, profile.test.ts, first-run-discovery.test.ts, welcome-conversation.test.ts).

- [ ] **Step 4: Commit**

```bash
git add personal-assistant/src/lib/onboarding/index.ts
git commit -m "chore(onboarding): clean up deprecated exports"
```

---

## Summary

| Task | What it builds | Dependencies |
|------|---------------|--------------|
| 1 | SSE event types + graph types | None |
| 2 | Haiku narration layer | Task 1 (stream-types) |
| 3 | Agent auto-activator | Task 1 (stream-types) |
| 4 | Fly.io SSE handler | Task 1, 2 |
| 5 | Vercel proxy route | Task 4 |
| 6 | useOnboardingStream hook | Task 1 |
| 7 | Chat UI components (bubble, input, card) | None |
| 8 | Knowledge graph (d3-force + canvas) | Task 1, 9 |
| 9 | Graph detail panel | Task 1 |
| 10 | OnboardingChat container | Task 6, 7, 8 |
| 11 | /onboard page rewrite + transition | Task 10 |
| 12 | Wire real pipeline into handler | Task 2, 3, 4 |
| 13 | Clean up deprecated components | Task 11 |

**Parallelizable:** Tasks 1-3 can run in parallel. Tasks 6-7 can run in parallel. Tasks 8-9 can run in parallel.
