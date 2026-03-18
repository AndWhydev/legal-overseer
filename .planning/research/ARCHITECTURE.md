# Architecture Research: v1.3 Agent Roles & Autonomy Engine

## Current Architecture (Relevant Components)

```
[Vercel Serverless] ← Dashboard, API routes, SSE chat, cron triggers (30s timeout)
        ↕
[Supabase Mumbai] ← 24+ tables, RLS, Realtime, RPCs
        ↕
[Fly.io Sydney] ← Long-running workers: WhatsApp bridge, agent execution
        ↕
[Cloudflare Edge] ← 5-min cron poller, dispatches to Vercel/Fly.io
```

Key patterns:
- Agent registry with self-registration
- Confidence routing: act (>threshold) / ask (mid) / escalate (low)
- Approval queue: dashboard + WhatsApp Y/N
- Fire-and-forget for context writes
- DI: Supabase client passed as parameter
- Model tiering: Haiku classify → Sonnet execute → Opus complex

## New Architecture: Role Engine Layer

### Role Lifecycle

```
[Role Definition] → [Role Activation] → [Role Loop] → [Action Execution]
      ↓                    ↓                  ↓              ↓
  role_configs        role_states         role_tasks      approval_queue
  (what it does)    (current state)    (pending work)   (gated actions)
```

### Where Roles Run

**Roles are NOT long-running processes.** They are **activated by events** and execute within existing compute:

1. **Cron-triggered role ticks** (Cloudflare → Vercel/Fly.io):
   - Every 5 minutes: role tick fires for each active role
   - Role loads state from DB, evaluates what needs doing, executes or queues
   - Fits within existing cron infrastructure

2. **Event-triggered role activation** (Supabase Realtime → Fly.io):
   - New message arrives → Comms role activates
   - Invoice marked paid → Finance role activates
   - Lead form submitted → Sales role activates

3. **User-triggered role actions** (Dashboard → Vercel API):
   - User asks "what should I invoice this week?" → Finance role responds
   - User says "draft a proposal for the plumber" → Sales role executes

### Component Architecture

```
┌─────────────────────────────────────────────────┐
│                  ROLE ENGINE                      │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Finance  │  │  Comms   │  │  Sales   │       │
│  │  Role    │  │  Role    │  │  Role    │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │
│  ┌────┴──────────────┴──────────────┴────┐       │
│  │           ROLE RUNTIME                 │       │
│  │  - State loader/saver                  │       │
│  │  - Autonomy gate (Observer/Copilot/AP) │       │
│  │  - Workflow executor                   │       │
│  │  - Memory manager                      │       │
│  │  - Event dispatcher                    │       │
│  └────────────────────────────────────────┘       │
│                      ↕                             │
│  ┌────────────────────────────────────────┐       │
│  │        EXISTING AGENT ENGINE            │       │
│  │  - Tool use loop                        │       │
│  │  - LLM calls (Haiku/Sonnet/Opus)       │       │
│  │  - Confidence routing                   │       │
│  │  - Approval flow                        │       │
│  └────────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

### Autonomy Gate Architecture

The autonomy gate sits between role decision and action execution:

```
Role decides to act
        ↓
[Autonomy Gate] ← reads role's autonomy_level from org settings
        ↓
┌─ OBSERVER: Log insight to role_activity. No action. Surface on dashboard.
├─ CO-PILOT: Create draft action in approval_queue. Notify user.
└─ AUTOPILOT: Check confidence. High? Execute. Low? Route to approval.
```

**Key insight**: Autopilot doesn't mean "do everything." It means "do everything you're confident about." The existing confidence routing still applies — Autopilot just removes the approval gate for high-confidence actions.

### Data Architecture

**New Tables:**

```sql
-- Role definitions and configuration
role_configs (
  id, org_id, role_type, enabled, autonomy_level,
  config JSONB, -- role-specific settings
  created_at, updated_at
)

-- Persistent role state (working memory)
role_states (
  id, role_config_id, org_id,
  state JSONB, -- current FSM state + working data
  last_tick_at, next_tick_at,
  updated_at
)

-- Multi-step workflow tracking
role_workflows (
  id, role_config_id, org_id,
  workflow_type, status, -- pending/active/paused/completed/failed
  steps JSONB, -- [{step, status, result, completed_at}]
  current_step, context JSONB,
  started_at, completed_at
)

-- Role activity log (what the role did/found)
role_activity (
  id, role_config_id, org_id,
  activity_type, -- insight/action/escalation/learning
  summary, details JSONB,
  created_at
)

-- Business intelligence cache
bi_snapshots (
  id, org_id, metric_type, -- revenue_radar/client_health/cash_flow/capacity
  data JSONB, computed_at,
  expires_at
)
```

**Modified Tables:**
- `semantic_memories`: Add `role_id` column for role-attributed memories
- `agent_configs`: Add `role_type` column to link agents to roles
- `approval_queue`: Add `autonomy_mode` column to track which mode generated the action

### Build Order (Suggested)

1. **Phase 20: Role Engine Foundation** — role_configs, role_states, role runtime, autonomy gate
2. **Phase 21: Finance Role** — first role implementation, subsumes invoice agent, adds proactive behaviors
3. **Phase 22: Comms Role** — subsumes channel triage, adds drafting and relationship management
4. **Phase 23: Sales Role** — builds on lead swarm, adds proposals and onboarding
5. **Phase 24: Intelligence Layer** — Revenue Radar, Client Health, Cash Flow, Capacity
6. **Phase 25: Role Dashboard & Polish** — per-role UI, activity feeds, autonomy controls

### Integration Points

| Existing Component | How It Changes |
|---|---|
| Agent registry | Roles register as "role agents" with persistent lifecycle flag |
| Confidence routing | Unchanged — roles use it for action decisions |
| Approval queue | Gets `autonomy_mode` field, Co-pilot always queues, Autopilot only queues low-confidence |
| Channel relay | Emits events that trigger Comms role |
| Invoice agent | Becomes a sub-component of Finance role |
| Lead Swarm agent | Becomes a sub-component of Sales role |
| Channel triage | Becomes a sub-component of Comms role |
| Semantic memory | Gets role awareness via `role_id` column |
| Cron system | Gets role tick endpoint (5-min cycle for all active roles) |
| Dashboard | Gets role sections with activity feeds and autonomy controls |

### Compute Allocation

| Component | Runs On | Why |
|---|---|---|
| Role tick (periodic scan) | Fly.io worker | May exceed 30s for complex analysis |
| Event-triggered activation | Fly.io worker | Needs to chain multiple LLM calls |
| Role dashboard API | Vercel | Simple DB reads, fast |
| BI computation | Supabase RPC | Heavy SQL, let Postgres do it |
| Role chat interaction | Vercel SSE | Existing chat pattern |
