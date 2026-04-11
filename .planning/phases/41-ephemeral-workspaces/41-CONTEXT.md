# Phase 41: Ephemeral Workspaces - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

BitBit spawns isolated compute environments to install dependencies, write scripts, and execute arbitrary code -- building the tools it needs at runtime. Workspaces are full dev environments (Node, Python, shell, package installation, network access). Results surface as inline artifacts in chat and optionally persist to GitHub.

</domain>

<decisions>
## Implementation Decisions

### Compute Provider Choice
- **D-01:** Provider choice is Claude's discretion. Research must evaluate: Vercel Sandbox (GA, Firecracker microVMs, already on Vercel), E2B (built for AI agents), Fly.io Firecracker self-hosted, or other managed options. Provider-first philosophy -- minimize custom infrastructure.

### Workspace Capabilities
- **D-02:** Full dev environment -- Node, Python, shell scripts, package installation (npm/pip), file system, and network access for API calls. BitBit can build anything at runtime.
- **D-03:** Network isolation between tenants (WKSP-07) handled at provider level, not custom. Workspaces can make outbound API calls but cannot access other tenants' resources.

### Resource Limits & Lifecycle
- **D-04:** Lifecycle strategy is Claude's discretion. Consider the tradeoff between task-scoped (cheapest, simplest) and session-scoped (better UX for follow-ups).
- **D-05:** Code/project persistence: workspace-generated outputs should persist beyond the ephemeral session. Two paths: (a) embedded artifacts viewable in chat, and (b) optionally pushed to user's connected GitHub account. Claude's discretion on implementation.
- **D-06:** Resource limits (CPU, memory, disk) enforced at provider/infrastructure level, not application code.

### Output Delivery
- **D-07:** Workspace results rendered as rich inline artifacts in chat -- code blocks, data tables, file previews, charts. Like Claude's artifacts. BitBit describes what it built and shows the result.
- **D-08:** Artifacts can optionally be pushed to user's connected GitHub if they've linked their account. BitBit knows about the connection and offers to persist.

### Claude's Discretion
- Compute provider selection
- Workspace lifecycle (task-scoped vs session-scoped vs hybrid)
- GitHub integration design (repo creation, push workflow, pull-on-resume)
- Artifact rendering system in chat UI
- How workspace tasks integrate with the async task engine from Phase 39
- Cost circuit breaker thresholds for compute time

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior Phase Context
- `.planning/phases/38-fiduciary-memory/38-CONTEXT.md` -- Conversational intelligence, no separate UIs
- `.planning/phases/39-async-task-infrastructure/39-CONTEXT.md` -- Async task lifecycle, inline chat progress, NL cancellation
- `.planning/phases/40-multimodal-web-automation/40-CONTEXT.md` -- Provider-first philosophy, lean on managed infra

### Agent Engine
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` -- TAOR loop where `spawn_ephemeral_workspace` integrates
- `personal-assistant/src/lib/agent/engine/tool-executor.ts` -- Tool dispatch integration point

### Existing Infrastructure
- Fly.io Machines API: Already used for bridge provisioning, pattern for compute if self-hosted
- Supabase Storage: Already used for file attachments (v1.4), could store workspace outputs

### Requirements
- `.planning/REQUIREMENTS.md` -- WKSP-01 through WKSP-08

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Fly.io Machines API provisioning: Existing pattern for spinning up compute
- Supabase Storage + signed URLs: Already wired for file attachments, reusable for workspace output storage
- Async task engine (Phase 39): Workspace jobs run as async tasks with same lifecycle

### Established Patterns
- Phase 39 async task lifecycle: Workspace tasks dispatched/tracked as async tasks
- Phase 40 provider-first: Choose managed sandbox over custom container management
- File attachment system (v1.4): Upload, signed URLs, inline previews -- pattern for workspace artifacts

### Integration Points
- TAOR loop tool dispatch: `spawn_ephemeral_workspace` as a new tool
- Async task engine: Workspace jobs dispatched as async tasks
- Chat UI: Artifacts rendered inline (new capability needed)
- GitHub API: Optional push-to-repo for code persistence
- ContextAssembler: Workspace results fed back into conversation context

</code_context>

<specifics>
## Specific Ideas

- Inline artifacts in chat: Like Claude's artifacts -- code blocks, tables, previews embedded in the conversation
- GitHub persistence: BitBit creates/updates repos on connected GitHub account when user wants to keep generated code
- Session/auth persistence across workspace sessions is a cross-cutting concern with Phase 40 (browser auth) -- credential injection handles auth, but persistent sessions (cookies, logged-in state) may need a separate solution
- Agentic 2FA completion: BitBit can read user's messages via existing bridges to complete 2FA challenges -- this is a capability that works across browser and workspace scenarios
- Embeddable artifacts on the webpage: workspace outputs viewable directly in the dashboard, not just as file downloads

</specifics>

<deferred>
## Deferred Ideas

- **Persistent session profiles per org**: Keeping logged-in state (cookies, sessions) across workspace invocations so 2FA doesn't trigger every time. Cross-cutting concern with Phase 40 browser auth. May need its own phase or be folded into Phase 40/42 planning.
- **Agentic 2FA completion**: BitBit reading user's messages to complete 2FA challenges. A capability that spans browser and workspace phases -- may be best addressed in Phase 42 (Tool Priority Chain) or as a cross-cutting concern.

</deferred>

---

*Phase: 41-ephemeral-workspaces*
*Context gathered: 2026-04-08*
