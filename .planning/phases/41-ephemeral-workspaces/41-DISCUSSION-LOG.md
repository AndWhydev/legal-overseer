# Phase 41: Ephemeral Workspaces - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 41-ephemeral-workspaces
**Areas discussed:** Compute provider choice, Workspace capabilities, Resource limits & lifecycle, Output delivery

---

## Compute Provider Choice

### Q1: Compute provider?

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel Sandbox | Managed Firecracker microVMs, already on Vercel. | |
| E2B (Code Interpreter) | Managed sandboxes for AI agents. Per-session pricing. | |
| Fly.io Firecracker self-hosted | Full control, more ops burden. | |
| You decide | Research and pick best fit. | ✓ |

**User's choice:** You decide
**Notes:** Provider-first philosophy carries from Phase 40.

---

## Workspace Capabilities

### Q2: What should workspaces be able to do?

| Option | Description | Selected |
|--------|-------------|----------|
| Full dev environment | Node, Python, shell, packages, network. Build anything. | ✓ |
| Sandboxed code runner | Node/Python only, no packages, no network. | |
| You decide | Pick based on use cases. | |

**User's choice:** Full dev environment
**Notes:** None

---

## Resource Limits & Lifecycle

### Q3: How long should a workspace live?

| Option | Description | Selected |
|--------|-------------|----------|
| Task-scoped (auto-destroy on completion) | Simplest, cheapest. | |
| Session-scoped (persist for follow-ups) | Better UX, more expensive. | |
| You decide | Pick based on cost/usage. | |

**User's choice:** Other -- Extended discussion about persistence needs:
- Code/projects need to persist beyond the session (GitHub repos)
- Logins/sessions should persist so 2FA doesn't trigger every time
- Environment state (installed packages, configs) should be recoverable
- Artifacts should be embeddable in the webpage
- Tie into GitHub for sustainable native workflow

**Notes:** User wants workspace outputs to survive workspace destruction. Storage and auth persistence are separate from compute lifecycle.

### Q4: For workspace outputs, should BitBit auto-push to GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub repos per project | Create/update repos. Native git workflow. | |
| Supabase Storage | Store as files. Simpler, no version control. | |
| You decide | Pick most sustainable strategy. | |

**User's choice:** Other -- "We might want to embed these as artifacts into the webpage. If GitHub could do that, especially if BitBit knows it can upload to user's connected GitHub."
**Notes:** Dual approach: embeddable artifacts in chat + optional GitHub push for connected accounts. Claude's discretion on implementation.

---

## Output Delivery

### Q5: How should workspace results surface in chat?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline artifacts | Rich rendering in chat -- code, tables, charts. Like Claude artifacts. | ✓ |
| Summary + download link | Description + link. Simpler. | |
| You decide | Pick based on UI capability. | |

**User's choice:** Inline artifacts
**Notes:** None

---

## Claude's Discretion

- Compute provider selection
- Workspace lifecycle design
- GitHub integration workflow
- Artifact rendering system
- Async task integration
- Cost circuit breakers

## Deferred Ideas

- Persistent session profiles per org (cross-cutting with Phase 40 browser auth)
- Agentic 2FA completion via message bridges (spans browser + workspace)
