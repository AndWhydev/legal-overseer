# Pitfalls Research: v1.3 Agent Roles & Autonomy Engine

## P1: Roles That Don't Actually Do Anything (The Demo Trap)

**What happens**: You build a "Finance Role" that surfaces insights on a dashboard but doesn't actually send invoices, chase payments, or take action. It becomes a notification engine, not an operator.

**Why it happens**: Building the analysis is easier than building the execution. Teams ship the "brain" without the "hands."

**Prevention**: Every role must ship with at least 3 autonomous actions, not just insights. Finance must send invoices and reminders, not just flag them. Comms must draft and send responses, not just classify messages. Define the actions FIRST, then build the analysis that triggers them.

**Phase impact**: Each role phase must include action execution, not just analysis. Verification must test end-to-end action, not just "role identified the issue."

## P2: Autonomy Levels That Are Really Just Feature Flags

**What happens**: Observer/Co-pilot/Autopilot becomes a boolean that gates a queue. The underlying role behavior doesn't change — same analysis, same actions, just different gating. Observer becomes useless because it only shows what would have happened.

**Why it happens**: Gating is the easy part. Adapting role behavior per autonomy level is the hard part.

**Prevention**: Each autonomy level should produce different outputs:
- Observer: Insights + recommendations on dashboard (role explains what it would do and why)
- Co-pilot: Draft actions with context, one-tap approve (role prepares everything, user just decides)
- Autopilot: Actions execute, summary logged, user sees results (role explains what it did)

The output format and communication style changes, not just the gate.

**Phase impact**: Role Engine foundation phase must define the output contract per autonomy level before building any role.

## P3: Cost Explosion from Always-On Roles

**What happens**: 3 roles × 5-minute ticks × Opus calls = $150+/day in API costs. Each tick loads context, calls LLM to evaluate, decides nothing has changed, logs the result.

**Why it happens**: Roles "think" too often about too much. Every tick is a full LLM evaluation.

**Prevention**:
- **Tiered tick frequency**: Not every role needs 5-minute ticks. Finance: daily. Comms: on new messages only. Sales: on new leads + daily review.
- **Haiku pre-screen**: Before an Opus evaluation, Haiku checks "has anything changed since last tick?" If not, skip. Cost: $0.001 instead of $0.15.
- **Event-driven over polling**: Roles should primarily react to events (new message, invoice paid), not poll on schedule. Scheduled ticks are for periodic reviews (daily/weekly), not real-time monitoring.
- **Budget caps per role per day**: Hard limits on API spend per role.

**Phase impact**: Role Engine foundation MUST include cost guards. Define budget per role tier before building any role.

## P4: State Corruption from Concurrent Execution

**What happens**: A cron tick and an event trigger activate the same role simultaneously. Both load state, both modify it, one overwrites the other. Role loses track of what it was doing.

**Why it happens**: Serverless + event-driven = concurrent invocations. No built-in mutex.

**Prevention**:
- **Postgres advisory locks**: `SELECT pg_try_advisory_lock(role_config_id)` at start of role execution. If locked, skip this tick.
- **Optimistic concurrency**: `role_states` has `version` column, UPDATE with WHERE version = expected. Retry on conflict.
- **Queue, don't execute**: Events insert into `role_events` queue. Role tick processes queue sequentially. Never execute from event handler directly.

**Phase impact**: Role Engine foundation must include concurrency control. Test with simultaneous triggers.

## P5: Memory That Grows Without Bound

**What happens**: Role memory accumulates facts without pruning. After 3 months, each role tick loads 50KB of context, burning tokens on irrelevant historical data.

**Why it happens**: Everything seems worth remembering when you're building the system. "Payment pattern for every client" sounds useful until you have 200 clients.

**Prevention**:
- **Memory budget per role**: Max N memories, ranked by relevance and recency.
- **Decay + prune**: Memories have confidence that decays. Below threshold = archived, not loaded.
- **Structured over free-text**: Role memory is JSONB with known schema, not free-text semantic memory. Finance tracks `{client_id, avg_payment_days, last_invoice_date}`, not "Sezer usually pays in about a week."
- **Load selectively**: Role tick specifies what it needs ("clients with overdue invoices"), not "load all my memory."

**Phase impact**: Memory schema must be designed per role during role phase, not as a generic system.

## P6: Dashboard Overload

**What happens**: 3 roles each producing activity feeds, insights, alerts, and recommendations. Dashboard becomes a wall of notifications. User stops looking at it.

**Why it happens**: Each role team builds their dashboard section independently. Nobody owns the unified experience.

**Prevention**:
- **Single priority-sorted feed**: All role activity in one stream, sorted by importance, not by role.
- **Aggressive summarization**: "Finance: 3 invoices sent, 1 overdue reminder, cash flow healthy" — not 5 separate cards.
- **Default to quiet**: Observer roles show weekly summaries. Co-pilot shows only pending approvals. Autopilot shows daily recap.
- **The "what needs my attention" view**: One screen that answers "what do I need to do right now?" with items from all roles combined.

**Phase impact**: Dashboard phase should come AFTER at least 2 roles are built, so the unified experience can be designed with real data.

## P7: Subsumption Breaks Existing Agents

**What happens**: Finance Role "subsumes" invoice agent. But the invoice agent had 15 edge cases handled. Finance Role reimplements invoicing from scratch, loses edge cases, breaks production.

**Why it happens**: "Subsume" sounds like "replace." It should mean "wrap and extend."

**Prevention**:
- **Wrap, don't rewrite**: Finance Role calls existing invoice agent as a sub-agent. It doesn't rewrite invoice logic.
- **Existing agent tests must pass**: If invoice agent had tests, Finance Role must pass all of them.
- **Incremental transfer**: Start with Finance Role coordinating existing invoice agent. Then gradually move logic into role only where it adds value.

**Phase impact**: First role implementation must explicitly use existing agents as sub-components. Verification must run existing agent tests.

## P8: Autonomy Without Audit Trail

**What happens**: Autopilot sends an invoice with wrong amount. User asks "why did it send that?" No audit trail. User loses trust. Switches everything to Observer. Defeat.

**Why it happens**: Execution logging is an afterthought. The action executes but the reasoning isn't recorded.

**Prevention**:
- **Every action logs its reasoning chain**: Why the role decided to act, what context it used, what confidence it had.
- **Reversibility metadata**: "This invoice can be voided. This email cannot be unsent."
- **Confidence + autonomy logged together**: "Acted autonomously (Autopilot mode, confidence 0.94, Finance role)"

**Phase impact**: Role Engine foundation must define the audit log schema. Every role action writes to it. Non-negotiable.

## P9: Intelligence Layer Without Enough Data

**What happens**: Revenue Radar says "You should upsell SEO to Maya" but Andy only has 3 months of data with 4 clients. The insight is based on insufficient signal.

**Why it happens**: Business intelligence needs volume. 4 clients with 8 invoices isn't enough for pattern recognition.

**Prevention**:
- **Minimum data thresholds**: Each intelligence metric has a minimum data requirement. Below it, show "gathering data" instead of unreliable insights.
- **Start with simple, deterministic metrics**: "Sezer's invoice is 14 days overdue" (fact) before "Sezer is a churn risk" (prediction).
- **Grow sophistication with data volume**: Week 1 = facts. Month 1 = trends. Month 3 = predictions.

**Phase impact**: Intelligence layer should have tiered output based on data availability. Don't fake insights.

## Cost Model

| Component | Estimated Monthly Cost (1 org, moderate usage) |
|---|---|
| Role ticks (Haiku pre-screen) | $2-5/mo |
| Role execution (Sonnet) | $10-20/mo |
| Complex analysis (Opus) | $5-15/mo |
| BI computation (Postgres) | $0 (within Supabase plan) |
| Additional Fly.io compute | $0 (within existing allocation) |
| **Total incremental** | **$17-40/mo per org** |

The key cost lever is **Haiku pre-screening**. Without it, costs could be 5-10x higher.
