# Phase 35: Proactive Workflows & Standing Orders - Research

**Researched:** 2026-03-28
**Domain:** Workflow automation, NL rule parsing, cross-role orchestration, UI dashboard
**Confidence:** HIGH

## Summary

Phase 35 builds the "proactive brain" layer on top of BitBit's existing role system, standing orders, and workflow executor. The project already has substantial infrastructure: a `workflow-executor.ts` with multi-step execution, `standing-orders.ts` with CRUD/matching/prompt-injection, 5 domain roles with `workflowsToStart` in `RoleEvaluation`, and a cron-based role tick scheduler. The gap is: (1) users cannot define workflow rules in natural language through the UI, (2) standing orders are passive directives (injected into prompts) rather than active triggers that fire workflows, (3) there is no cross-role orchestration mechanism -- workflows are scoped to a single role, and (4) there is no workflow management dashboard.

The core architectural challenge is bridging NL intent ("When a new lead comes in, research their company and draft an intro email") to a structured workflow definition that the existing `startWorkflow()` can execute. This requires an LLM-powered rule parser that decomposes natural language into trigger + condition + action sequences, mapping each action to existing tool groups or role capabilities.

**Primary recommendation:** Extend the existing `standing_orders` table with trigger/action columns to become "workflow rules," add a `workflow_rules` table for the structured parsed representation, build an LLM-powered NL-to-workflow parser, wire event-driven triggers into channel triage and role ticks, and create a workflow dashboard tab using existing Shadcn UI patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRKF-01 | Natural language workflow rules -- users define automation rules in plain English | NL parser using Claude Haiku for rule decomposition; extends existing standing_orders pattern with trigger/condition/action structure |
| WRKF-02 | Multi-step sequences -- workflows chain multiple actions with conditional branching | Existing `workflow-executor.ts` already supports multi-step with conditions, delays, and step results; extend with branch evaluation |
| WRKF-03 | Cross-role orchestration -- workflows can invoke tools from any role | Existing `TOOL_GROUPS` registry + `executeAgentTool` provides tool access; add `WorkflowToolBridge` that resolves tool handlers across roles |
| WRKF-04 | Workflow dashboard -- UI for viewing, creating, editing, pausing, and monitoring workflows | New dashboard tab using existing Shadcn UI components; extends settings-automations pattern with workflow-specific views |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | 2.x (existing) | DB access for workflow_rules, role_workflows tables | Already used everywhere, RLS policies in place |
| @anthropic-ai/sdk | 0.33+ (existing) | NL rule parsing via Haiku model | Already used for classification, plan generation |
| React 19 + Next.js 16 | existing | Dashboard UI | Existing stack |
| Shadcn UI (@coss/ui preset) | existing | UI components | Project convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x (existing) | Validate parsed workflow rule structure | Schema validation for LLM output |
| @tabler/icons-react | existing | Dashboard icons | Consistent with other tabs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LLM rule parsing | Regex/keyword parsing | NL flexibility vs. determinism -- LLM is correct choice for "plain English" requirement |
| New workflow_rules table | Extend standing_orders | Standing orders are passive directives; workflows need trigger/action structure -- separate table is cleaner |
| Real-time event bus | Cron-based polling | Event bus adds complexity; existing 5-min role tick + channel triage hooks cover triggers adequately |

**Installation:**
No new dependencies required. All infrastructure already present in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/lib/workflows/
  workflow-rule-parser.ts     # NL -> structured rule (LLM-powered)
  workflow-rule-types.ts      # WorkflowRule, Trigger, Action types
  workflow-rule-engine.ts     # Evaluates triggers, starts workflows
  workflow-tool-bridge.ts     # Cross-role tool resolution
  workflow-templates.ts       # Pre-built workflow templates for UI
  __tests__/
    workflow-rule-parser.test.ts
    workflow-rule-engine.test.ts

src/components/dashboard/tabs/
  workflows-tab.tsx           # Main workflow dashboard tab

src/app/api/workflows/
  route.ts                    # CRUD for workflow rules
  [id]/route.ts              # Individual workflow rule operations
  [id]/runs/route.ts         # Workflow run history
```

### Pattern 1: NL Rule Parser (WRKF-01)
**What:** LLM decomposes natural language into structured `WorkflowRule` with trigger, conditions, and action steps.
**When to use:** When user creates or edits a workflow rule via chat or dashboard.
**Example:**
```typescript
// Source: project pattern from classifier.ts and planner.ts
interface WorkflowRule {
  id: string
  org_id: string
  name: string                    // Auto-generated or user-provided
  description: string             // Original NL input
  trigger: WorkflowTrigger
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  enabled: boolean
  created_by: string
  created_at: string
  updated_at: string
}

interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'condition'
  // Event triggers: 'new_lead', 'new_message', 'invoice_overdue', 'channel_message', etc.
  event?: string
  // Schedule triggers: cron expression or interval
  schedule?: { cron?: string; interval_seconds?: number }
  // Condition triggers: evaluated on each role tick
  condition?: { field: string; operator: string; value: unknown }
}

interface WorkflowAction {
  step_id: string
  name: string
  tool_group: ToolGroup           // Maps to existing TOOL_GROUPS
  tool_name: string               // Specific tool within group
  parameters: Record<string, unknown>
  delay_seconds?: number
  condition?: string              // NL condition for conditional branching
  on_failure?: 'skip' | 'abort' | 'retry'
}

async function parseWorkflowRule(
  naturalLanguage: string,
  orgContext: { roles: RoleType[]; tools: string[] },
): Promise<WorkflowRule> {
  // Use Haiku for fast, cheap parsing
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-20250414',
    max_tokens: 1024,
    system: RULE_PARSER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: naturalLanguage }],
  })
  // Parse and validate with zod schema
  return WorkflowRuleSchema.parse(JSON.parse(extractJSON(response)))
}
```

### Pattern 2: Event-Driven Trigger Integration (WRKF-01, WRKF-02)
**What:** Workflow triggers are evaluated at two integration points: (1) channel triage for message events, (2) role ticks for schedule/condition triggers.
**When to use:** Every time a message is triaged or a role tick fires.
**Example:**
```typescript
// In channel-triage.ts, after classification:
import { evaluateEventTriggers } from '@/lib/workflows/workflow-rule-engine'

// After message processing, fire any matching workflow triggers
await evaluateEventTriggers(supabase, orgId, {
  event: 'new_message',
  data: {
    channel: msg.channel,
    sender: msg.sender,
    category: classification.category,
    significance: classification.significance,
    contactId: resolvedContact?.id,
  }
})

// In role-runtime.ts, after evaluation:
// Check schedule/condition triggers
await evaluateScheduledTriggers(supabase, roleConfig.org_id)
```

### Pattern 3: Cross-Role Tool Bridge (WRKF-03)
**What:** A bridge that resolves tool handlers from any role/tool group, regardless of which role initiated the workflow.
**When to use:** When a workflow step needs to invoke a tool from a different domain than the triggering role.
**Example:**
```typescript
// Source: existing pattern from tools.ts TOOL_GROUPS registry
import { getAgentTools } from '@/lib/agent/tools'
import { executeAgentTool } from '@/lib/agent/engine/tool-executor'

interface WorkflowToolBridge {
  /** Resolve a tool handler by group + name, regardless of role */
  resolveTool(toolGroup: ToolGroup, toolName: string): ToolHandler | null
  /** Execute a tool with workflow context (org, supabase, budget) */
  executeTool(
    toolGroup: ToolGroup,
    toolName: string,
    params: Record<string, unknown>,
    ctx: WorkflowStepContext,
  ): Promise<WorkflowStepResult>
}

// Reuse existing tool handlers from getAgentTools() + tool group handlers
// All tool groups already exported: channel, superpower, code, invoice, ad, seo, tender, content, builder
```

### Pattern 4: Workflow Dashboard (WRKF-04)
**What:** Dashboard tab with 3 views: (1) active rules list, (2) rule editor with NL input, (3) run history/monitoring.
**When to use:** New tab in SPA shell, registered in spa-shell.tsx and topbar-configs.tsx.
**Example:**
```typescript
// Follows existing tab patterns (e.g., approvals-tab.tsx, costs-tab.tsx)
// Uses existing Shadcn components: Card, Badge, Switch, Button, Dialog
// NL input uses existing chat-like textarea pattern
```

### Anti-Patterns to Avoid
- **Hand-rolling an event bus:** The cron tick + channel triage hooks are sufficient trigger points. A real event bus (Redis pub/sub, etc.) adds operational complexity with no benefit at current scale.
- **Workflow definitions in code:** Users define workflows in NL; the system stores structured rules in the DB. No need for code-defined workflow templates beyond a few starter examples.
- **Bypassing the autonomy gate:** Workflow-triggered actions MUST still route through the existing autonomy gate (observer/copilot/autopilot). Workflows do not get special privileges.
- **One workflow = one role:** Cross-role is the point. A workflow triggered by a new lead (sales) should be able to draft an email (comms) and create a task (core). Use the tool bridge, not role-scoped execution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-step workflow execution | Custom state machine | Existing `workflow-executor.ts` | Already handles steps, delays, conditions, failure, resume |
| Standing order matching | New rule evaluator | Existing `matchOrdersToContext()` | Already does AND-logic condition matching |
| Tool execution across roles | Custom tool dispatcher | Existing `getAgentTools()` + `executeAgentTool()` | All tool groups already registered and gated |
| Approval routing | Custom approval flow | Existing `routeThroughAutonomyGate()` + `createApproval()` | Autonomy gate handles observer/copilot/autopilot routing |
| Activity logging | Custom workflow log | Existing `role_activity` table + `logWorkflowActivity()` | Workflow executor already logs to this table |
| Cost guarding | Custom budget check | Existing `canProceed()` + `canRoleProceed()` | Already enforces org + role budgets |
| NL understanding | Regex pattern matching | Claude Haiku API call | NL requirement demands LLM; Haiku is fast + cheap |
| Cron scheduling | New scheduler | Existing role tick cron | 5-min tick already checks `next_step_at` on active workflows |

**Key insight:** The existing infrastructure (workflow executor, role runtime, tool groups, autonomy gate, standing orders) handles 70% of the plumbing. Phase 35 is primarily about: (1) the NL-to-structure parsing layer, (2) wiring event triggers, (3) cross-role tool bridge, and (4) the dashboard UI.

## Common Pitfalls

### Pitfall 1: LLM Output Parsing Failures
**What goes wrong:** Haiku returns malformed JSON or hallucinates tool names not in the registry.
**Why it happens:** NL is ambiguous; LLM doesn't know available tools without being told.
**How to avoid:** Include available tool groups and tool names in the system prompt. Use zod validation with fallback to a "manual review" state. Include a `confidence` field in parsed output -- low confidence rules require user confirmation before activation.
**Warning signs:** Parse errors in logs, rules stuck in "draft" state.

### Pitfall 2: Infinite Workflow Loops
**What goes wrong:** A workflow triggered by "new message" sends a message, which triggers the workflow again.
**Why it happens:** No loop detection in trigger evaluation.
**How to avoid:** Add `triggered_by_workflow` flag to workflow-generated actions. Triggers should skip messages/events that originated from workflow execution. Track workflow execution IDs in event metadata.
**Warning signs:** Rapid workflow execution count increase, budget exhaustion.

### Pitfall 3: Cross-Role Budget Exhaustion
**What goes wrong:** A workflow invokes tools from multiple roles, but only the triggering role's budget is checked.
**Why it happens:** Workflow steps execute under the triggering role's config.
**How to avoid:** Each tool execution through the bridge should check the org-level budget (`canProceed`) rather than role-level only. Alternatively, create a "workflow" budget pool separate from role budgets.
**Warning signs:** Org daily budget hit unexpectedly, role budgets untouched.

### Pitfall 4: Trigger Evaluation Performance
**What goes wrong:** Evaluating all workflow rules on every channel triage message adds latency.
**Why it happens:** Linear scan of all rules per message.
**How to avoid:** Pre-index triggers by event type. Only load rules matching the current event type. Cache active rules in memory with a 5-minute TTL (matching role tick interval).
**Warning signs:** Channel triage latency increase (currently must be under 10s).

### Pitfall 5: Standing Orders vs Workflow Rules Confusion
**What goes wrong:** Two separate systems for "user-defined rules" with overlapping scope.
**Why it happens:** Standing orders exist as passive directives; workflow rules are active triggers.
**How to avoid:** Clear UX separation: standing orders are "always follow these guidelines" (injected into prompts), workflow rules are "when X happens, do Y" (trigger actions). The settings-automations page manages both but in separate sections. Standing orders remain in the `standing_orders` table; workflow rules go in a new `workflow_rules` table.
**Warning signs:** Users create standing orders expecting them to trigger actions.

## Code Examples

Verified patterns from the existing codebase:

### Existing Workflow Start Pattern (from finance-role.ts)
```typescript
// Source: personal-assistant/src/lib/roles/finance/finance-role.ts
const wfDef = createCollectionWorkflow(invoice)
workflowsToStart.push(wfDef)

// WorkflowDefinition structure (from role-registry.ts):
{
  workflowType: 'collection_reminder',
  steps: [
    { stepId: 'gentle_reminder', name: 'Send Gentle Reminder' },
    { stepId: 'firm_reminder', name: 'Send Firm Reminder' },
    { stepId: 'final_notice', name: 'Send Final Notice' },
  ],
  context: { invoiceId, contactName, total, currency, daysOverdue },
}
```

### Existing Standing Order Injection (from prompt-builder.ts)
```typescript
// Source: personal-assistant/src/lib/agent/prompt-builder.ts:371-391
const standingOrders = await getActiveOrders(supabase, orgId).catch(() => [])
// Formatted and included in system prompt:
// ${formatOrdersForPrompt(standingOrders)}
```

### Existing Standing Order Context Matching (from channel-triage.ts)
```typescript
// Source: personal-assistant/src/lib/agent/channel-triage.ts:571
let activeOrders: StandingOrder[] = []
activeOrders = await getActiveOrders(supabase, orgId)
// Matched against message context using matchOrdersToContext()
```

### Existing Role Tick Workflow Resume (from role-runtime.ts)
```typescript
// Source: personal-assistant/src/lib/roles/role-runtime.ts:389-404
const readyWorkflows = await getReadyWorkflows(supabase, roleConfig.id)
for (const wf of readyWorkflows) {
  const wfStepDefs = impl.getWorkflowStepDefs?.(wf.workflow_type) ?? []
  if (wfStepDefs.length > 0) {
    await resumeWorkflow(supabase, wf, roleConfig, wfStepDefs)
  }
}
```

### Existing Tool Group Registry (from tools.ts)
```typescript
// Source: personal-assistant/src/lib/agent/tools.ts:36-43
export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms' |
  'agentic' | 'ads' | 'seo' | 'tenders' | 'content' | 'builder'

// Each group has definitions + handlers:
// channelToolDefinitions, channelToolHandlers
// invoiceToolDefinition, handleGenerateInvoice
// adToolDefinitions, adToolHandlers
// etc.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Standing orders as passive text in prompts | Standing orders + active workflow rules with triggers | Phase 35 | Users get "if this then that" automation |
| Role-scoped workflows (finance only does finance) | Cross-role workflow orchestration via tool bridge | Phase 35 | Workflows chain across domains |
| Code-defined workflow types only | NL-defined custom workflows stored in DB | Phase 35 | Users create automation without code |
| No workflow visibility | Dashboard with rule list, run history, monitoring | Phase 35 | Users manage and debug workflows |

**Current state of existing infrastructure:**
- `standing_orders` table: 7 columns (id, org_id, created_by, directive, category, is_active, conditions) -- passive directives only
- `role_workflows` table: 13 columns -- fully functional multi-step executor
- `workflow-executor.ts`: 498 lines -- start, resume, cancel, get-ready, step execution with conditions/delays
- `role-runtime.ts`: 495 lines -- tick execution with workflow resume + start from evaluation
- 5 domain roles registered, all return `workflowsToStart` from evaluate()
- Standing orders API: GET/POST/DELETE at `/api/settings/standing-orders`

## Open Questions

1. **Workflow Rule Complexity Limit**
   - What we know: Users define rules in NL; LLM parses them into structured definitions
   - What's unclear: Should there be a max number of steps per workflow? A max number of active rules per org?
   - Recommendation: Start with 10-step limit per workflow, 25 active rules per org. These are soft limits enforced in the parser.

2. **Event Taxonomy**
   - What we know: Triggers need event types like 'new_lead', 'new_message', 'invoice_overdue'
   - What's unclear: Complete event taxonomy -- which events does the system currently emit?
   - Recommendation: Start with the events that naturally occur at existing integration points: `new_message` (channel triage), `new_lead` (lead swarm), `invoice_overdue` (finance role), `invoice_paid` (webhook), `new_contact` (entity resolution), `schedule` (cron). Expand incrementally.

3. **Workflow Rule Versioning**
   - What we know: Users will edit rules after creation
   - What's unclear: Should edits create a new version or update in place?
   - Recommendation: Update in place for v1. Active workflow runs keep a snapshot of the rule at start time (already stored in `role_workflows.context`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run --reporter=verbose` |
| Full suite command | `cd personal-assistant && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRKF-01 | NL rule parsing decomposes to trigger+conditions+actions | unit | `cd personal-assistant && npx vitest run src/lib/workflows/__tests__/workflow-rule-parser.test.ts -x` | Wave 0 |
| WRKF-01 | Parsed rules validate against zod schema | unit | `cd personal-assistant && npx vitest run src/lib/workflows/__tests__/workflow-rule-parser.test.ts -x` | Wave 0 |
| WRKF-02 | Multi-step workflow executes in sequence with conditions | unit | `cd personal-assistant && npx vitest run src/lib/workflows/__tests__/workflow-rule-engine.test.ts -x` | Wave 0 |
| WRKF-02 | Conditional branching skips/includes steps based on prior results | unit | `cd personal-assistant && npx vitest run src/lib/workflows/__tests__/workflow-rule-engine.test.ts -x` | Wave 0 |
| WRKF-03 | Cross-role tool resolution finds tools from any tool group | unit | `cd personal-assistant && npx vitest run src/lib/workflows/__tests__/workflow-tool-bridge.test.ts -x` | Wave 0 |
| WRKF-03 | Workflow budget check uses org-level guard | unit | `cd personal-assistant && npx vitest run src/lib/workflows/__tests__/workflow-tool-bridge.test.ts -x` | Wave 0 |
| WRKF-04 | Workflow CRUD API returns correct responses | unit | `cd personal-assistant && npx vitest run src/app/api/workflows/__tests__/route.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/workflows/ -x`
- **Per wave merge:** `cd personal-assistant && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/workflows/__tests__/workflow-rule-parser.test.ts` -- covers WRKF-01
- [ ] `src/lib/workflows/__tests__/workflow-rule-engine.test.ts` -- covers WRKF-02
- [ ] `src/lib/workflows/__tests__/workflow-tool-bridge.test.ts` -- covers WRKF-03
- [ ] `src/app/api/workflows/__tests__/route.test.ts` -- covers WRKF-04
- [ ] Framework install: none needed (Vitest already configured)

## Database Schema

### New Table: `workflow_rules`
```sql
CREATE TABLE workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,           -- Original NL input
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('event', 'schedule', 'condition')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_rules_org_enabled ON workflow_rules(org_id, enabled);
CREATE INDEX idx_workflow_rules_trigger ON workflow_rules(org_id, trigger_type) WHERE enabled = true;

ALTER TABLE workflow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_rules_org ON workflow_rules
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY workflow_rules_service ON workflow_rules
  FOR ALL USING (auth.role() = 'service_role');
```

### Extend `role_workflows` for user-defined workflows
```sql
-- Add workflow_rule_id to link user-defined rule to its workflow runs
ALTER TABLE role_workflows ADD COLUMN IF NOT EXISTS workflow_rule_id UUID REFERENCES workflow_rules(id);
CREATE INDEX idx_role_workflows_rule ON role_workflows(workflow_rule_id) WHERE workflow_rule_id IS NOT NULL;
```

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `workflow-executor.ts` (498 lines, full multi-step executor)
- Codebase analysis: `standing-orders.ts` (216 lines, CRUD + matching + prompt injection)
- Codebase analysis: `role-runtime.ts` (495 lines, tick execution with workflow start/resume)
- Codebase analysis: `role-registry.ts` (108 lines, RoleEvaluation with workflowsToStart)
- Codebase analysis: `channel-triage.ts` (standing order integration point)
- Codebase analysis: `tools.ts` (tool group registry with 11 groups)
- Codebase analysis: `autonomy-gate.ts` (observer/copilot/autopilot routing)
- Codebase analysis: `action-dispatcher.ts` (gate -> execute/queue/log)
- DB schema: `092_role_engine_tables.sql` (role_configs, role_states, role_workflows, role_activity)
- DB schema: `088_standing_orders.sql` (standing_orders table)

### Secondary (MEDIUM confidence)
- Existing workflow patterns: finance collection workflow, comms escalation workflow, sales nurture/onboarding workflows
- Existing trigger patterns: channel triage event hooks, role tick scheduling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- builds directly on existing workflow executor, role runtime, tool groups
- Pitfalls: HIGH -- derived from deep analysis of existing integration points and known patterns
- NL parsing: MEDIUM -- LLM output reliability requires validation layer (zod schema + confidence scoring)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- all patterns verified against current codebase)
