# Agent Development Guide

How to add a new agent to BitBit. Agents are autonomous workers that run on a schedule, process data, and optionally queue actions for approval.

---

## Architecture Overview

```
scheduler.ts (cron tick)
  -> checks agent_configs table (enabled, schedule)
  -> calls runXxxTick() for each due agent
  -> logs run to agent_runs table

Agent tick function:
  -> query data from Supabase
  -> process with AI (Anthropic) or business logic
  -> route actions through confidence router
  -> high confidence: auto-act
  -> medium confidence: queue for approval
  -> low confidence: escalate to owner
```

---

## Step 1: Create the Agent File

Create `personal-assistant/src/lib/agent/my-agent.ts`.

Every agent tick function follows this pattern:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MyAgentResult {
  processed: number
  created: number
  failed: number
}

/**
 * Main tick function. Called by the scheduler when this agent is due.
 * Must accept SupabaseClient as first param (DI pattern).
 */
export async function runMyAgentTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<MyAgentResult> {
  const result: MyAgentResult = { processed: 0, created: 0, failed: 0 }

  // 1. Query data to process
  const { data: items } = await supabase
    .from('my_table')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')

  if (!items?.length) return result

  for (const item of items) {
    result.processed++
    try {
      // 2. Process item (AI call, business logic, etc.)
      // 3. Write results back
      await supabase
        .from('my_table')
        .update({ status: 'processed' })
        .eq('id', item.id)
      result.created++
    } catch {
      result.failed++
    }
  }

  return result
}
```

Key rules:
- Always accept `SupabaseClient` as first parameter (dependency injection)
- Always scope queries by `org_id` (multi-tenant)
- Return a structured result object for logging
- Handle errors per-item, not per-batch

---

## Step 2: Register in Scheduler

Edit `personal-assistant/src/lib/agent/scheduler.ts`:

1. Import your tick function:
```typescript
import { runMyAgentTick } from './my-agent'
```

2. Add a dedup set:
```typescript
const processedMyAgentOrgs = new Set<string>()
```

3. Add the agent type handler in the main loop (after the existing `else if` chain):
```typescript
} else if (config.agent_type === 'my-agent') {
  if (processedMyAgentOrgs.has(config.org_id)) {
    results.push({
      agentType: config.agent_type,
      orgId: config.org_id,
      triggered: false,
      reason: 'already_running',
      lastRunAt: lastRunAt?.toISOString(),
    })
    continue
  }

  processedMyAgentOrgs.add(config.org_id)

  try {
    const myResult = await runMyAgentTick(supabase, config.org_id, config.id)
    outputSummary =
      `my-agent processed=${myResult.processed} created=${myResult.created} ` +
      `failed=${myResult.failed}`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    outputSummary = `my-agent error=${message}`
  }
}
```

4. Create the `agent_configs` row in Supabase for each org that should run this agent:
```sql
INSERT INTO agent_configs (org_id, agent_type, enabled, schedule)
VALUES (
  'your-org-id',
  'my-agent',
  true,
  '{"type": "interval", "interval_seconds": 300}'
);
```

Schedule types:
- `{ "type": "continuous" }` -- runs every tick
- `{ "type": "interval", "interval_seconds": 300 }` -- every 5 minutes
- `{ "type": "cron", "cron_expression": "0 9 * * 1-5" }` -- weekdays at 9am

---

## Step 3: Wire the Approval Flow

If your agent takes actions that need human approval, use the confidence router:

```typescript
import { routeAgentAction } from './confidence-router'
import { createApprovalItem } from './approval-queue'

// After computing a confidence score for an action:
const routing = routeAgentAction(confidence, agentConfig, orgSettings)

switch (routing.decision) {
  case 'act':
    // Confidence >= 0.85: execute automatically
    await executeAction(supabase, orgId, action)
    break

  case 'ask':
    // Confidence 0.55-0.85: queue for human approval
    await createApprovalItem(supabase, {
      org_id: orgId,
      agent_config_id: agentConfigId,
      action_type: 'my-action',
      action_payload: action,
      confidence_score: confidence,
      reasoning: routing.reasoning,
    })
    break

  case 'escalate':
    // Confidence < 0.55: notify owner immediately
    // Send WhatsApp/email alert
    break
}
```

---

## Step 4: Add an API Route (optional)

If the agent needs a manual trigger or dashboard API, add a route:

`personal-assistant/src/app/api/agent/my-agent/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runMyAgentTick } = await import('@/lib/agent/my-agent')
  const result = await runMyAgentTick(ctx.supabase, ctx.orgId, 'manual')
  return NextResponse.json(result)
}
```

---

## Step 5: Add a Dashboard Tab (optional)

Create `personal-assistant/src/components/dashboard/tabs/MyAgentTab.tsx` following existing tab patterns.

---

## Step 6: Add Tests

Create `personal-assistant/src/lib/agent/__tests__/my-agent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runMyAgentTick } from '../my-agent'
import { createMockSupabase } from '@/test-helpers/mock-supabase'

describe('my-agent', () => {
  it('processes pending items', async () => {
    const supabase = createMockSupabase({
      my_table: [
        { id: '1', org_id: 'org-1', status: 'pending' },
      ],
    })

    const result = await runMyAgentTick(supabase, 'org-1', 'config-1')

    expect(result.processed).toBe(1)
    expect(result.created).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('handles empty queue gracefully', async () => {
    const supabase = createMockSupabase({ my_table: [] })
    const result = await runMyAgentTick(supabase, 'org-1', 'config-1')
    expect(result.processed).toBe(0)
  })
})
```

Run tests:
```bash
cd personal-assistant && npx vitest run src/lib/agent/__tests__/my-agent.test.ts
```

---

## Existing Agents Reference

| Agent Type | File | Purpose |
|-----------|------|---------|
| `lead-swarm` | `lead-swarm.ts` | Qualify and score inbound leads |
| `invoice-flow` | `invoice-flow.ts` | Create, track, and chase invoices |
| `sentry` | `sentry.ts` | Monitor errors and uptime |
| `channel-triage` | `channel-triage.ts` | Classify and route incoming messages |
| `client-comms` | `client-comms.ts` | Draft client communications with voice matching |
| `proposal-bot` | `proposal-bot.ts` | Generate and follow up on proposals |
| `client-onboarding` | `client-onboarding.ts` | Automate new client setup |
| `ad-script-gen` | `ad-script-gen.ts` | Generate ad scripts for 4 platforms |
| `ai-search-optimizer` | `ai-search-optimizer.ts` | AI visibility audits and content optimization |
| `tender-hunter` | `tender-hunter.ts` | Scan government tender portals |
