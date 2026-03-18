# Features Research: v1.3 Agent Roles & Autonomy Engine

## Competitive Landscape

### What Exists Today (March 2026)
- **OpenAI Frontier / Operator**: Task-executing agents, CUA-based, single-shot workflows. No persistent roles.
- **NVIDIA Agent Platform**: Enterprise-focused, multi-agent orchestration for manufacturing/logistics. Not SMB.
- **Relevance AI**: Multi-agent workflows with tool use. Template-based, not domain-owning.
- **Lindy.ai**: "AI employees" with triggers, actions, and memory. Closest competitor. Per-agent pricing.
- **AutoGPT / CrewAI**: Open-source multi-agent. Hallucination-prone, no production persistence.

### Gap in Market
Nobody is doing **domain-owning roles with user-controlled autonomy for SMBs**. Enterprise has it (ServiceNow, Salesforce Agentforce). Consumer has single-shot agents (ChatGPT, Claude). The middle — agency owners, freelancers, small teams — has nothing that acts as a persistent operator.

## Feature Categories

### Table Stakes (Must Have for v1.3)

**ROLE-01: Role Definition & Registration**
- Each role has: identity, domain, responsibilities, tools, memory, autonomy level
- Roles self-register like current agents but with persistent lifecycle
- Configure via dashboard: enable/disable roles, set autonomy level
- *Complexity*: Medium — extends existing agent registry pattern
- *Dependency*: Existing agent_configs table

**ROLE-02: Autonomy Spectrum (Observer / Co-pilot / Autopilot)**
- Observer: Role analyzes, surfaces insights, takes no action. Dashboard-only.
- Co-pilot: Role drafts actions, queues for approval. User approves/edits/rejects.
- Autopilot: Role acts autonomously. Escalates only on low confidence or novel situations.
- Per-role granularity: Finance on Autopilot, Sales on Co-pilot, Comms on Observer.
- *Complexity*: Medium — extends existing approval flow with mode switch
- *Dependency*: Existing confidence routing + approval queue

**ROLE-03: Role State Persistence**
- Each role maintains working memory across sessions (what it's tracking, what's pending, what it learned)
- State survives server restarts, deploys, cron cycles
- State is inspectable by user ("show me what Finance is tracking")
- *Complexity*: Medium — new tables + serialization
- *Dependency*: Supabase, existing semantic memory

**ROLE-04: Multi-Step Workflow Execution**
- Roles execute workflows that span multiple steps and potentially hours/days
- Example: Finance detects overdue invoice → waits 3 days → sends reminder → waits → escalates
- Steps are durable: if system restarts mid-workflow, it resumes from last checkpoint
- *Complexity*: High — needs durable execution pattern
- *Dependency*: Fly.io worker, task queue

**ROLE-05: Role Dashboard**
- Each role has a dashboard section: what it's doing, what it found, what needs attention
- Activity feed per role showing actions taken, pending, and escalated
- Autonomy controls inline (toggle Observer/Co-pilot/Autopilot)
- *Complexity*: Medium — new React components
- *Dependency*: Existing dashboard framework

### Differentiators (What Makes BitBit Win)

**INTEL-01: Revenue Radar**
- Identifies upsell opportunities from communication patterns and project history
- Detects stale clients (no activity in X weeks) and suggests re-engagement
- Compares current pricing against historical projects for same service type
- Surfaces "money left on the table" insights
- *Complexity*: High — needs cross-entity analysis, pattern recognition
- *Dependency*: Entity graph, invoice history, contact patterns

**INTEL-02: Client Health Score**
- Per-client health metric (0-100) computed from real signals
- Inputs: response time trends, message sentiment, project progress, payment timeliness
- Visual dashboard with trend lines and alerts
- *Complexity*: Medium-High — scoring algorithm + dashboard
- *Dependency*: Messages, invoices, projects, contacts data

**INTEL-03: Cash Flow Prophet**
- Forward-looking cash flow projection from known invoices, proposals, and recurring patterns
- Alerts when projected shortfall approaches
- Suggests actions: follow up on proposal, send invoice early, chase overdue payment
- *Complexity*: Medium — financial modeling on existing data
- *Dependency*: Invoices, proposals, recurring revenue data

**INTEL-04: Capacity Oracle**
- Workload model from active projects, tasks, and deadlines
- Warns when new work would overcommit
- Suggests optimal start dates for new projects based on current pipeline
- *Complexity*: Medium — scheduling algorithm on task data
- *Dependency*: Projects, tasks, kanban data

### First Roles

**FINANCE ROLE: Domain Owner for Money**
- Subsumes existing invoice agent + adds proactive behaviors
- Owns: invoicing, collections, cash flow monitoring, financial reporting
- Proactive: sends invoices on schedule, chases overdue, alerts on cash flow issues
- Learns: payment patterns per client, optimal invoice timing, amount accuracy

**COMMS ROLE: Domain Owner for Communication**
- Subsumes existing channel triage + adds relationship management
- Owns: message triage, response drafting, follow-up tracking, relationship health
- Proactive: drafts responses, flags overdue threads, maintains client relationships
- Learns: tone per client, response patterns, escalation triggers

**SALES ROLE: Domain Owner for Revenue Growth**
- New role, builds on lead swarm agent
- Owns: lead qualification, proposal generation, onboarding, nurture sequences
- Proactive: generates proposals from briefs, follows up on stale leads, onboards new clients
- Learns: what converts, optimal follow-up timing, pricing patterns

### Anti-Features (Don't Build These)

- **Role-to-role real-time chat**: Agents talking to each other in visible chat threads. Looks cool in demos, useless in practice. Roles should coordinate via shared state and events.
- **Granular permission matrix**: 50-setting configuration per role. Users won't configure it. The 3-level autonomy spectrum (Observer/Co-pilot/Autopilot) is sufficient.
- **Custom role builder**: Let users define their own roles. Premature — ship the 3 built-in roles first, learn from usage, then consider extensibility.
- **AI model selection per role**: Users don't care which model runs their Finance role. BitBit picks the right model based on task complexity.
