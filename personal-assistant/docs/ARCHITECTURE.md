# BitBit Architecture

BitBit is a personal AI operations platform that combines task management, contact intelligence, communication channel synthesis, and an agentic AI assistant into a unified productivity system.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 16 App Router                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Tasks    │  │ Channels │  │ Contacts │  │  Activity   │  │
│  │  (Kanban) │  │  (Sync)  │  │  (CRM)   │  │   (Feed)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬─────┘  │
│       │              │              │               │        │
│  ┌────┴──────────────┴──────────────┴───────────────┴─────┐  │
│  │              Supabase Realtime Subscriptions            │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┴───────────────────────────────┐  │
│  │                   API Routes (/api/*)                   │  │
│  │  /api/agent/chat  /api/tasks  /api/channels  /api/...  │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                    Agent Architecture                        │
│  ┌────────────┐  ┌───────┴──────┐  ┌──────────────────┐    │
│  │   Model     │  │   Agentic    │  │   Orchestrator   │    │
│  │   Router    │→ │   Loop       │  │   (Multi-Agent)  │    │
│  └────────────┘  │  (engine.ts)  │  └──────────────────┘    │
│                  └───────┬──────┘                            │
│                          │                                   │
│  ┌───────────────────────┴────────────────────────────────┐  │
│  │                   Tool System                           │  │
│  │  CRUD Tools (8)     │    Channel Tools (4)              │  │
│  │  create_task         │    sync_channels                 │  │
│  │  update_task         │    search_messages               │  │
│  │  search_tasks        │    create_reminder               │  │
│  │  search_contacts     │    schedule_event                │  │
│  │  get_contact         │                                  │  │
│  │  log_activity        │                                  │  │
│  │  search_memory       │                                  │  │
│  │  add_memory          │                                  │  │
│  └──────────────────────┴──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                Channel Synthesis Pipeline                     │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────┐ │
│  │  Gmail  │ │ Outlook │ │ iMessage │ │Calendar │ │Remind│ │
│  │ Adapter │ │ Adapter │ │ Adapter  │ │ Adapter │ │ders  │ │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬────┘ └──┬───┘ │
│       └───────────┴───────────┴─────────────┴─────────┘     │
│                           │                                  │
│  ┌────────────────────────┴───────────────────────────────┐  │
│  │              Synthesizer (classify → dedup → task)      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                    Supabase (Postgres)                        │
│  organizations │ profiles │ tasks │ kanban_columns │ contacts │
│  goals │ memory_entries │ activity_feed │ agent_sessions      │
└──────────────────────────────────────────────────────────────┘
```

## Data Model

### Supabase Schema

All tables are scoped by `org_id` for multi-tenant isolation.

#### `organizations`
Top-level entity. Each user belongs to one organization.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Organization ID |
| name | text | Organization name |
| slug | text (unique) | URL slug |
| plan | text | Subscription tier |
| settings | jsonb | Organization settings |

#### `profiles`
User profiles linked to Supabase Auth users.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK, FK → auth.users) | User ID |
| org_id | uuid (FK) | Organization |
| display_name | text | Display name |
| role | text | User role (admin, member) |
| preferences | jsonb | User preferences |

#### `kanban_columns`
Configurable task board columns.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Column ID |
| org_id | uuid (FK) | Organization |
| title | text | Column name (e.g., "To Do", "In Progress") |
| color | text | Display color |
| position | integer | Sort order |

#### `tasks`
Core task/todo items, organized on the kanban board.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Task ID |
| org_id | uuid (FK) | Organization |
| title | text | Task title |
| description | text | Detailed description |
| status | text | pending, in_progress, completed, archived |
| priority | text | critical, high, medium, low |
| column_id | uuid (FK) | Kanban column |
| position | integer | Sort order within column |
| assigned_to | uuid (FK) | Assigned user |
| metadata | jsonb | Tags, source info, etc. |
| created_at | timestamptz | Created timestamp |
| updated_at | timestamptz | Last modified |

#### `contacts`
CRM-style contact records with entity resolution.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Contact ID |
| org_id | uuid (FK) | Organization |
| slug | text | URL-safe identifier |
| name | text | Display name |
| type | text | client, personal, vendor, etc. |
| emails | text[] | Known email addresses |
| phones | text[] | Known phone numbers |
| aliases | text[] | Alternative names for entity resolution |
| profile_data | jsonb | Extended profile information |
| communication_patterns | jsonb | Tone, frequency, preferences |

#### `goals`
High-level objectives tracked over time.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Goal ID |
| org_id | uuid (FK) | Organization |
| description | text | Goal description |
| priority | text | high, medium, low |
| status | text | active, blocked, completed |
| target_date | date | Target completion date |

#### `memory_entries`
Persistent knowledge base for the AI agent.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Memory ID |
| org_id | uuid (FK) | Organization |
| category | text | preference, pattern, domain, contact, workflow |
| content | text | Memory content |
| confidence | float | Confidence score (0-1) |
| created_at | timestamptz | When learned |

#### `activity_feed`
Audit trail of all agent and user actions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Activity ID |
| org_id | uuid (FK) | Organization |
| action_type | text | task, email, agent, system, research |
| action | text | What was done |
| reasoning | text | Why it was done |
| result | text | Outcome |
| user_confirmed | boolean | Whether user approved |
| created_at | timestamptz | When it happened |

## Agent Architecture

### Model Router (`model-router.ts`)

The model router selects the appropriate Claude model tier based on message complexity, optimizing cost and latency.

```
User Message → routeToModel() → ModelTier → getModel() → ModelConfig
```

**Three tiers:**

| Tier | Model | Max Tokens | Use Case |
|------|-------|-----------|----------|
| `opus` | claude-opus-4 | 8192 | Complex reasoning, strategy, planning |
| `sonnet` | claude-sonnet-4 | 4096 | Standard CRUD, search, analysis |
| `haiku` | claude-haiku-4.5 | 2048 | Classification, triage, routing |

**Routing logic:**
1. Check for opus triggers (plan, strategy, analyze, compare, evaluate, etc.) — 2+ matches → opus
2. Check for haiku triggers (classify, categorize, yes/no, tag, filter) — 2+ matches → haiku
3. Heuristic checks: long multi-part messages → opus; short simple queries → sonnet
4. Default: sonnet (safest general-purpose choice)

The engine uses auto-routing when no explicit model is provided via `EngineConfig.model`.

### Agentic Loop (`engine.ts`)

The core execution loop implements a tool-use cycle with streaming SSE events.

```
                    ┌────────────────────────┐
                    │   User Message          │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   Model Router          │
                    │   (select tier)         │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
              ┌────►│   Claude API Call       │
              │     └───────────┬────────────┘
              │                 │
              │     ┌───────────▼────────────┐
              │     │   stop_reason?          │
              │     └───┬───────────────┬────┘
              │         │               │
              │    tool_use         end_turn
              │         │               │
              │     ┌───▼────┐    ┌─────▼─────┐
              │     │Execute │    │  Yield     │
              │     │ Tools  │    │ 'message'  │
              │     └───┬────┘    │ 'done'     │
              │         │         └────────────┘
              └─────────┘
              (max 8 iterations)
```

**Event types yielded:**
- `thinking` — Model routing info
- `tool_call` — Tool invocation details
- `tool_result` — Tool execution result
- `message` — Final text response
- `error` — Error information
- `done` — Completion with token usage

**Streaming:** The `/api/agent/chat` route wraps the async generator in an SSE `ReadableStream`, sending events as `data:` frames.

### Orchestrator (`orchestrator.ts`)

Multi-agent task coordination for complex workflows that require multiple sequential or dependent agent invocations.

```typescript
orchestrate({
  orgId: 'org-123',
  tasks: [
    { id: 'a', description: 'Research competitors' },
    { id: 'b', description: 'Draft comparison', dependsOn: ['a'] },
    { id: 'c', description: 'Create tasks from findings', dependsOn: ['b'] },
  ],
})
```

**Execution model (MVP):**
- Sequential execution respecting dependency graph
- Tasks without dependencies or with all dependencies met execute in order
- Circular dependencies are detected and reported as failures
- Each task runs a full agentic loop via `runAgentChat()`
- Results include output text and token usage per task

**Future (v2):** Parallel execution of independent tasks using `Promise.all()`.

### Tool System (`tools.ts` + `tools/channel-tools.ts`)

Extensible tool definitions following Anthropic's tool-use format.

**CRUD Tools (8):**
| Tool | Description |
|------|-------------|
| `create_task` | Create kanban task with priority and column |
| `update_task` | Modify task status, priority, column, description |
| `search_tasks` | Full-text search across tasks |
| `search_contacts` | Entity-resolved contact search (name, email, phone, alias) |
| `get_contact` | Full contact profile retrieval |
| `log_activity` | Write to activity audit trail |
| `search_memory` | Query knowledge base |
| `add_memory` | Store new knowledge entry |

**Channel Tools (4):**
| Tool | Description |
|------|-------------|
| `sync_channels` | Trigger full channel synthesis pipeline |
| `search_messages` | Cross-channel message search |
| `create_reminder` | macOS Apple Reminders via osascript |
| `schedule_event` | macOS Apple Calendar via osascript |

**Architecture:** Tool definitions and handlers are separated. `getAgentTools()` merges all definitions for Claude. `executeAgentTool()` dispatches by name to the correct handler, with error wrapping.

## Channel Synthesis Pipeline

### Adapter Pattern

Each communication channel implements the `ChannelAdapter` interface:

```typescript
interface ChannelAdapter {
  type: ChannelType          // 'gmail' | 'outlook' | 'imessage' | 'calendar' | 'reminders'
  name: string               // Display name
  description: string        // Human description
  icon: string               // Lucide icon name
  pull(config, since?) → ChannelMessage[]  // Fetch messages
  isAvailable() → boolean    // Platform check (e.g., macOS-only)
}
```

**Adapters:**
| Adapter | Platform | Data Source (Production) |
|---------|----------|------------------------|
| Gmail | All | Gmail API / MCP |
| Outlook | All | Microsoft Graph API |
| iMessage | macOS | ~/Library/Messages/chat.db |
| Calendar | macOS | Apple Calendar via osascript |
| Reminders | macOS | Apple Reminders via osascript |

All adapters currently return mock data for development. Production implementations will use real APIs.

### Message Classification

The synthesizer classifies every message:

```
Message → classifyMessage() → { isActionable: bool, priority: 'critical'|'high'|'medium'|'low' }
```

**Actionable keywords:** please, need, urgent, asap, deadline, action required, todo, follow up, review
**Priority mapping:**
- Critical: urgent, asap, critical
- High: important, deadline
- Medium: default
- Low: "when you get a chance", "low priority"

### Deduplication

Cross-channel deduplication prevents duplicate tasks when the same topic appears in multiple channels (e.g., email + iMessage about the same request).

**Key:** `${sender}:${subject.toLowerCase().trim()}`
**Strategy:** Keep most recent message per key.

### Task Creation

Actionable, deduplicated messages become tasks:
1. Check for existing tasks with matching subjects (prevent re-creation)
2. Assign priority based on message classification
3. Place in "To Do" column with metadata linking back to source channel/message

## Frontend Architecture

### Next.js 16 App Router

```
src/app/
├── (auth)/              # Auth group (login, callback)
├── api/                 # API routes
│   ├── agent/chat/      # SSE agent endpoint
│   ├── channels/        # Channel sync/status
│   ├── contacts/        # Contact CRUD
│   └── tasks/           # Task CRUD + reorder
├── dashboard/           # Protected dashboard pages
│   ├── activity/        # Activity feed
│   ├── channels/        # Channel management
│   ├── contacts/        # Contact directory
│   └── page.tsx         # Tasks (kanban board)
├── globals.css          # Tailwind v4 design tokens
└── layout.tsx           # Root layout with providers
```

### Supabase Realtime

The `useRealtime` hook subscribes to Postgres changes via Supabase Realtime:

```typescript
useRealtime({
  table: 'tasks',
  event: '*',
  filter: `org_id=eq.${orgId}`,
  onChange: (payload) => { /* update local state */ }
})
```

This enables live-updating UI without polling — when the agent creates a task via tool use, the kanban board updates instantly.

### Design System

- **Tailwind v4** with CSS custom properties for design tokens
- **Radix UI primitives** via shadcn/ui components (Button, Card, Dialog, etc.)
- **DnD Kit** for kanban drag-and-drop
- **Lucide React** for icons
- **Progress Ring** and **Streak Counter** for gamified productivity UX

## Integration Patterns

### How Channels Feed Into Tasks

```
Channel Adapters → pull() → ChannelMessage[]
                              │
                   classify() + dedup()
                              │
                    Actionable Messages
                              │
                   Supabase tasks.insert()
                              │
                   Realtime → Kanban Board
```

### How Agent Tools Modify Data

```
User Message → Agent Loop → Tool Call (e.g., create_task)
                              │
                   Tool Handler → Supabase CRUD
                              │
                   Realtime Subscription
                              │
                   UI Auto-Update
```

### How Realtime Updates Propagate

```
Supabase Postgres Change → Realtime Broadcast
                              │
                   useRealtime hook → onChange callback
                              │
                   React State Update → Re-render
```

## Product Tiers (Future)

### Personal Assistant (Current)
Individual productivity platform:
- Task kanban board
- Contact CRM with entity resolution
- Channel synthesis (Gmail, Outlook, iMessage, Calendar, Reminders)
- AI agent with model routing
- Memory/knowledge persistence
- Activity audit trail

### Business Agent
Team-focused extension:
- Multi-user organizations
- Slack/Teams channel integration
- Shared task boards with assignments
- Team activity feeds
- Role-based access control

### Operator Agent
Autonomous execution platform:
- Background task monitoring (Sentry-style watches)
- Scheduled channel syncs
- Automated email triage and response drafting
- Proactive notifications
- Multi-agent orchestration for complex workflows
- Webhook integrations for external triggers
