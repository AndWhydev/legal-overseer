# BitBit Overseer Roadmap

Repurposing your existing BitBit infrastructure into a personal multi project Claude Code overseer.

---

## What you already have (verified from the zip)

The repo contains a complete, production grade orchestrator at `src/` (not the `personal-assistant/` Next.js app, which is the product BitBit sells). This standalone overseer already includes:

**The agent loop** in `src/agent/`
A coordinator that classifies incoming tasks with Haiku, routes them to skills, and executes them with the right model tier (Haiku, Sonnet, or Opus). A task processor runs on a polling loop, picks pending tasks from SQLite, and updates state with results. It is already using `@anthropic-ai/claude-agent-sdk`.

**The governance layer** in `src/governance/`
A control plane with a kill switch that lives outside agent control, rate limiting per risk level, anomaly detection (rate and sequence based), circuit breakers, a PII redactor, and an audit logger. This is the safety scaffolding you would otherwise spend weeks building.

**The skills registry** in `src/skills/`
Three working skills (R&D Scout, Gatekeeper, Ops Officer) with their own system prompts, allowed tools, model tier defaults, and budget guardrails. New skills slot in by adding a definition to `SKILL_REGISTRY`.

**The escalation channel** in `src/telegram/`
A full Telegram bot with approval keyboards, callback handlers for approve/reject decisions, command handlers (`/briefing`, `/status`, `/tasks`, `/emergency`), and a webhook endpoint. This is the "ping you when stuck" channel, already wired.

**The briefing system** in `src/briefing/`
A daily aggregator that pulls task stats, skill outputs, circuit breaker states, and control plane health into a unified report, scheduled via cron, and delivered to Telegram at 8am by default.

**Persistent state** in `src/db/`
SQLite with migrations for tasks, decision traces, trust scores, approvals, audit logs, and a key value store.

**The Forge / Conductor patterns** in `.forge/` and `conductor/`
A phase based execution log proving the system has already run dozens of multi step autonomous workstreams end to end, with PLAN, RESULT, and VERIFICATION artifacts per phase.

---

## What it does NOT yet do for your use case

The current overseer was built to run business operations for CheekyGlo (a beauty brand) plus the BitBit personal assistant product. To repurpose it for orchestrating your dev projects, four things need adapting:

1. **No concept of a "project directory" as a first class entity.** Tasks reference a `skill_id` but not a working directory or repo path.
2. **No `claude -p` dispatch.** The agent SDK is wired, but calls Claude directly rather than shelling out to headless Claude Code per project.
3. **Skills are hardcoded to CheekyGlo verticals** (Alibaba scanning, invoice processing, content QA). The orchestration scaffolding is reusable; the skill prompts are not.
4. **Escalation is configured for a customer**, not for you as a developer/CTO overseeing multiple builds.

---

## The roadmap

Six stages. Each stage produces something usable on its own.

---

### Stage 1: Project Registry (1 to 2 days)

Add the missing concept: a project as a first class entity the overseer knows about.

**Database migration** at `src/db/migrations/007_projects.ts`
Tables: `projects` (id, name, path, claude_md_path, status, priority, created_at), and `project_tasks` (extends the existing `tasks` table with a `project_id` foreign key).

**Repository** at `src/db/repositories/projects.ts`
CRUD plus `getActiveProjects()`, `getProjectByPath()`, and `getNextProjectNeedingAttention()` (ordered by priority and last activity).

**Seed your projects** via a one off script: `scripts/register-projects.ts` that walks a parent directory, finds every folder containing a `CLAUDE.md`, and registers them.

**Deliverable:** `npm run projects:list` shows every project the overseer knows about. No execution yet.

---

### Stage 2: Claude Code Worker Skill (2 to 3 days)

Add a new skill type that dispatches headless Claude Code into a project directory.

**New skill** at `src/skills/claude-code-worker/`
A skill definition where the "tool" is `claude -p` invoked via Node `child_process.spawn`, with the project's directory as cwd, the project's `CLAUDE.md` automatically loaded, and stdout streamed back into the task's `output_json`.

**Wire into the coordinator**
Add `claude_code_worker` to the classifier prompt at `src/agent/coordinator.ts:43`. Any task tagged for a project path routes here instead of to the CheekyGlo skills.

**Permission scoping**
Use Claude Code's `--allowedTools` and `--dangerously-skip-permissions=false` flags to scope each worker to its own project directory only. The existing governance layer already handles the risk classification; just plug into it.

**Cost guards**
The `MODEL_COSTS` map in `src/agent/models.ts` and the `maxBudgetUsd` per skill in `SKILL_REGISTRY` are already there. Set conservative budgets per project from the start.

**Deliverable:** Manually create a task pointing at one project. The overseer dispatches a headless Claude Code worker, it runs, output streams back into the task record, results are logged. One project, end to end.

---

### Stage 3: The Overseer Loop (2 days)

Right now the processor in `src/agent/processor.ts` reactively pulls pending tasks. For multi project overseeing you want it to *proactively decide what to work on next*.

**New loop** at `src/agent/overseer-loop.ts`
Runs every 5 to 15 minutes. For each active project: checks git status (any unstaged changes? failing tests?), reads the project's `STATE.md` or equivalent, asks Opus "what should the worker for this project do in the next cycle, if anything?" and either creates a new task or moves on.

**Opus as the brain, Sonnet as the hands**
Already supported by the model tier system. The overseer loop runs on Opus (judgement calls). The workers run on Sonnet (execution). Override per project via the project registry if needed.

**Persistent decisions**
Use the existing `decisionTraces` repository at `src/db/repositories/decisionTraces.ts` to log every overseer decision. This becomes the training data for the self update loop in Stage 5.

**Deliverable:** Start the overseer, walk away. It picks the most important project, dispatches a worker, picks the next project, repeats. You watch it from Telegram.

---

### Stage 4: Escalation, Configured for You (1 day)

The Telegram bot is already built. It just needs pointing at you and tuning for development decisions rather than invoice approvals.

**Update keyboards** at `src/telegram/keyboards.ts`
Add buttons for the kinds of choices a CTO actually makes: "approve approach", "review diff", "skip this project", "abort task", "increase budget", "switch model tier".

**New callback handlers** at `src/telegram/callbacks/`
One per new decision type. Each one updates the relevant project or task record and unblocks the worker.

**Configure your chat id**
Set `ADMIN_CHAT_ID` and `TELEGRAM_BOT_TOKEN` in `.env`. Done.

**Deliverable:** When a worker hits a blocker, you get a Telegram message with the context and tappable buttons. You decide, it continues.

---

### Stage 5: Memory and Self Update (3 to 5 days)

The killer feature. The overseer learns from every project cycle and updates its own playbook.

**Borrow from `personal-assistant/src/lib/memory-palace/`**
That subsystem already has sleep consolidation, spreading activation, neural decay, pattern detection, and pricing intelligence. It's overkill for our needs but the core retrieval/storage primitives are excellent. Copy `memory-writer.ts`, `memory-search.ts`, `consolidation-pipeline.ts` into a new module at `src/memory/`.

**Lessons learned table**
A new SQLite table where the overseer writes: "I tried X on project Y, outcome was Z, here's what I learned". After each task completes, an Opus call generates the lesson.

**Retrieval at task start**
Before dispatching a worker, the overseer queries memory for "what have I learned that's relevant to this project and task". Injects the top 3 to 5 lessons into the worker's prompt.

**Living playbook**
A markdown file per project at `projects/<name>/PLAYBOOK.md` that the overseer rewrites weekly based on accumulated lessons. Workers read it on every cycle.

**Decision pattern recognition**
The `anomaly-detector.ts` in governance already does sequence anomaly detection. Reuse it to detect "you've escalated this kind of question 5 times in a row and given the same answer". Auto promote that into the playbook so it stops asking.

**Deliverable:** Week 2 onwards, the overseer gets visibly smarter. Fewer escalations. Better task selection. Workers receive richer context.

---

### Stage 6: The CTO Dashboard (2 to 3 days)

Optional but nice. A local web UI to see everything at a glance.

**Reuse the personal assistant**
The `personal-assistant/` Next.js app already has dashboards, an inbox view, a kanban board, an approvals queue, and an activity timeline. Strip the BitBit branding, point its data layer at the overseer's SQLite database, and you have a CTO dashboard for free.

**Per project view**
Tabs for each project. Status, current task, recent activity, lessons learned, escalation history, cost spent this week.

**The "fleet view"**
A single screen showing all projects at once, colour coded by health: green (progressing), amber (waiting on you), red (blocked or failing). One glance tells you where to focus.

**Deliverable:** Open `localhost:3000`, see your AI dev team's status, approve things, reprioritise, intervene where needed.

---

## Suggested order if you want results fastest

If you want maximum signal in minimum time, do Stages 1, 2, and 4 first. That gets you to "I can sit on the couch and approve Claude Code dispatches across multiple projects from my phone" in under a week. Stage 3 adds true autonomy. Stages 5 and 6 make it world class.

---

## What we are NOT building

A few things we explicitly skip because you already have them or don't need them yet:

- We're not building memory from scratch. The personal assistant's memory palace is more sophisticated than what you'd build in a month.
- We're not building governance. The control plane, kill switch, rate limiter, and anomaly detector are done.
- We're not building escalation infrastructure. The Telegram bot is done.
- We're not building a database. SQLite with migrations is done.
- We're not migrating away from your tech. The existing stack (Node, TypeScript, SQLite, Telegram, Anthropic SDK) is exactly right for this use case.

---

## Risks and unknowns

**The `src/` tree may have rotted since you last touched it.** First task on Stage 1 is `npm install && npm run build` to confirm everything still compiles. If not, an afternoon of dependency updates.

**Claude Code on Windows is still painful.** WSL2 remains a hard prerequisite for running workers cleanly. The overseer process itself runs fine in WSL.

**Cost runway.** With 10+ projects each getting one worker cycle per hour on Sonnet plus an Opus overseer call, plan for $10 to $30 per active development day at full tilt. The cost guard at `src/agent/models.ts` already enforces per task budgets; set a daily total budget too in Stage 2.

**Loop runaway.** The biggest real risk. Mitigated by the existing circuit breakers, plus a hard max iterations per task per day setting (add to project registry in Stage 1).

---

## First three things to do, in order

1. Extract the zip into WSL2. Run `npm install` at the root and inside `src/`. Confirm it still builds.
2. Read your own `.forge-backup/state.json` to see how far the original autonomous execution got. There may be unfinished phases worth resuming or salvaging.
3. Start Stage 1. The project registry migration is maybe 30 lines of SQL and 50 lines of TypeScript. It's the lowest risk way to confirm the system is still alive and to start making it yours.
