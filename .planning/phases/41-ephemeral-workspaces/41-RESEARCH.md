# Phase 41: Ephemeral Workspaces - Research

**Researched:** 2026-04-08
**Mode:** Ecosystem
**Confidence:** HIGH -- well-explored problem space with production-ready managed options

## Standard Stack

**Recommendation: E2B (Code Interpreter SDK) as primary provider.**

| Component | Choice | Why |
|-----------|--------|-----|
| Sandbox runtime | E2B Code Interpreter | Purpose-built for AI agents, sub-2s cold start, Node+Python+shell, persistent filesystem per session |
| SDK | `@e2b/code-interpreter` | TypeScript-first, async/await, streaming stdout/stderr |
| Workspace state | Supabase `workspaces` table | Track workspace sessions, map to async tasks, store output metadata |
| Output storage | Supabase Storage (existing) | Already wired for file attachments (v1.4), signed URLs, inline previews |
| Artifact rendering | Chat inline artifacts | New component: code blocks, file previews, data tables rendered in conversation |
| GitHub persistence | `@octokit/rest` | Optional push-to-repo for generated code (user's connected GitHub account) |

## Architecture Patterns

### Provider Evaluation Summary

#### E2B (RECOMMENDED)
- **What it is:** Managed Firecracker microVMs purpose-built for AI code execution
- **Cold start:** ~1-2 seconds (pre-warmed pools)
- **Environment:** Full Linux sandbox -- Node 20+, Python 3.11+, bash, apt/pip/npm install, filesystem, outbound network
- **SDK:** `@e2b/code-interpreter` -- TypeScript SDK with `Sandbox.create()`, `sandbox.runCode()`, `sandbox.filesystem.*`, `sandbox.process.start()`
- **Session model:** Sandbox persists between calls within a session (stateful). Default 5 min timeout, configurable up to 24h.
- **Pricing:** Per-sandbox-second billing. ~$0.0001/sec for base tier. Cost-effective for task-scoped workspaces.
- **Isolation:** Full Firecracker microVM per sandbox -- hardware-level isolation between tenants
- **Output:** Streaming stdout/stderr, file download via `sandbox.downloadFile()`, base64 artifacts for charts/images
- **Custom templates:** Can pre-bake Docker images with common dependencies (e.g., pandas, playwright) for faster startup

**Why E2B over Fly.io self-hosted:**
1. No container image management -- E2B maintains the base images
2. No orchestration code for lifecycle/cleanup -- SDK handles it
3. Sub-2s start vs 5-10s for Fly.io Machine provisioning
4. No zombie VM risk -- auto-destroy is built into the platform
5. Per-second billing vs per-hour Fly.io Machine billing
6. No need to manage a Fly.io app specifically for workspaces

**Why E2B over Vercel Sandbox:**
1. Vercel Sandbox is optimized for short-lived code evaluation, not long-running dev sessions
2. E2B has explicit support for persistent filesystem, package installation, and multi-step workflows
3. E2B SDK is more mature for agentic patterns (streaming, filesystem ops, process management)
4. Vercel Sandbox is tightly coupled to the Vercel platform -- E2B is standalone

#### Fly.io Machines (VIABLE FALLBACK)
- Already have `FlyMachinesClient` in codebase (`src/lib/bridges/fly-machines.ts`)
- Would require: custom Docker image, exec API integration, cleanup cron, monitoring
- Advantage: No new vendor dependency, reuses existing infrastructure patterns
- Disadvantage: 5-10s cold start, custom lifecycle management, need to handle zombie VMs manually
- **Use when:** E2B has an outage, or workspace needs exceed E2B limits (GPU, large disk, etc.)

#### Vercel Sandbox (NOT RECOMMENDED for this use case)
- Designed for ephemeral code evaluation in Vercel Functions context
- Limited session persistence -- optimized for request-response, not multi-step agent workflows
- Good for: quick code eval, preview rendering. Not ideal for: full dev environments with package install + stateful sessions.

### Integration Architecture

```
TAOR Loop
  ├── spawn_ephemeral_workspace (new tool)
  │     ├── Creates Supabase workspace record (pending)
  │     ├── E2B Sandbox.create() with template + resource limits
  │     ├── Updates record (running, sandbox_id)
  │     └── Returns workspace_id to TAOR loop
  │
  ├── workspace_exec (new tool)
  │     ├── Looks up active workspace by workspace_id
  │     ├── sandbox.runCode(code, {language}) -- streaming
  │     ├── Captures stdout/stderr/result
  │     └── Returns output to TAOR loop (feeds into next iteration)
  │
  ├── workspace_upload / workspace_download (new tools)
  │     ├── sandbox.uploadFile() / sandbox.downloadFile()
  │     └── Store outputs in Supabase Storage with signed URLs
  │
  └── workspace_destroy (new tool)
        ├── sandbox.close()
        └── Updates Supabase record (completed), archives outputs
```

### Workspace Lifecycle

**Recommendation: Task-scoped with session extension.**

1. **Spawn:** TAOR loop calls `spawn_ephemeral_workspace` when it needs compute
2. **Active:** Sandbox lives for the duration of the task. Multiple `workspace_exec` calls within a single TAOR execution
3. **Extend:** If user asks follow-up questions about workspace output, the sandbox stays alive (session-scoped extension)
4. **Timeout:** Default 5 minutes idle timeout. E2B handles this natively. Configurable per-task.
5. **Destroy:** Explicit `workspace_destroy` or auto-timeout. Supabase record marked `completed`.
6. **Cost circuit breaker:** Track cumulative sandbox-seconds per org per day. Kill workspace if daily limit exceeded (configurable, default $2/day).

### Async Task Integration

Workspace jobs integrate with Phase 39's async task engine:

1. `spawn_ephemeral_workspace` dispatches as an async task (pending → running → completed/failed)
2. Workspace progress streams to chat via Phase 39's Supabase Realtime progress channel
3. NL cancellation ("stop that script") triggers `workspace_destroy` via the same cancellation path
4. Workspace outputs become task execution evidence (stored alongside the task record)

### Output Delivery Pattern

**Inline artifacts in chat** (like Claude's artifacts):

1. **Code blocks:** Syntax-highlighted with language tag. Generated scripts shown inline.
2. **Data tables:** Structured output (CSV, JSON arrays) rendered as tables.
3. **File previews:** Images (charts, screenshots) displayed inline via Supabase Storage signed URLs.
4. **Download links:** Large files (zips, datasets) as download links rather than inline.
5. **Execution logs:** Collapsible stdout/stderr blocks for debugging.

**Implementation approach:**
- New `WorkspaceArtifact` type in chat message schema
- Artifacts embedded in assistant message content (similar to tool_result rendering)
- Frontend component renders artifact type-specific views
- Stored in Supabase `workspace_artifacts` table with foreign key to workspace

### GitHub Integration

**Optional push-to-repo flow:**

1. User has connected GitHub account (existing OAuth connection in connections table)
2. BitBit offers: "Want me to push this to a repo?"
3. Uses `@octokit/rest` to: create repo (if new), create/update files, commit, push
4. Alternative: create a Gist for quick sharing
5. Connection check: `connections.get('github')` -- if not connected, prompt to connect

## Don't Hand-Roll

| Problem | Use Instead | Why |
|---------|-------------|-----|
| Sandbox VM management | E2B SDK | Handles provisioning, cleanup, isolation, resource limits |
| Zombie VM detection | E2B auto-destroy + timeout | Platform handles lifecycle natively |
| Code execution sandboxing | E2B runCode() | Handles process isolation, timeout, OOM |
| File transfer to/from sandbox | E2B filesystem API | `uploadFile()`, `downloadFile()`, `listFiles()` |
| Network isolation | E2B Firecracker | Hardware-level isolation per sandbox |
| Resource limits (CPU/mem) | E2B sandbox config | Pass limits at creation time |
| Base image management | E2B templates | Pre-bake custom images with dependencies |

## Common Pitfalls

### 1. Workspace output too large for chat context
**Problem:** Agent runs a query that returns 100K rows, tries to put it all in the conversation.
**Solution:** Truncate inline output to 12K chars (match existing `MAX_TOOL_RESULT_CHARS`). Store full output in Supabase Storage. Include download link in truncated response.

### 2. Sandbox timeout during long-running operations
**Problem:** Package installation (e.g., `pip install pandas numpy scipy`) takes 30+ seconds, sandbox times out.
**Solution:** Use E2B custom templates with common packages pre-installed. For on-demand installs, extend timeout for install commands specifically.

### 3. Cost runaway from idle sandboxes
**Problem:** Agent spawns workspace, gets distracted by other tools, sandbox sits idle burning seconds.
**Solution:** E2B's built-in idle timeout (default 5 min). Plus: application-level cost circuit breaker per org/day. Log sandbox-seconds to Supabase for billing visibility.

### 4. Stateful execution context lost between TAOR iterations
**Problem:** Agent installs packages in iteration 1, tries to use them in iteration 3, but workspace was destroyed between iterations.
**Solution:** Workspace persists across TAOR iterations within the same conversation turn. The `workspace_id` is stored in the TAOR context so subsequent tool calls reuse the same sandbox.

### 5. Conflating workspace tool with existing execute_code tool
**Problem:** `execute_code` (existing) runs JS in-process against BitBit SDK. `workspace_exec` runs arbitrary code in an isolated VM. Agent or developer confuses which to use.
**Solution:** Clear tool descriptions. `execute_code` = "query BitBit data using the SDK". `workspace_exec` = "run arbitrary code in an isolated environment". The TAOR planner stage should route appropriately.

### 6. Missing cleanup on error paths
**Problem:** If workspace_exec throws, the sandbox leaks (stays running, burning cost).
**Solution:** E2B auto-destroy handles this. Additionally: register sandbox cleanup in a `finally` block on the tool handler. Supabase cron job sweeps orphaned `running` records older than 30 minutes.

## Code Examples

### E2B Sandbox Creation
```typescript
import { Sandbox } from '@e2b/code-interpreter'

const sandbox = await Sandbox.create({
  // Optional: custom template with pre-installed packages
  // template: 'bitbit-workspace-v1',
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  metadata: {
    orgId: config.orgId,
    taskId: taskId,
  },
})

// Execute code
const result = await sandbox.runCode('print("Hello from workspace")', {
  language: 'python',
  onStdout: (data) => streamToChat(data),
  onStderr: (data) => streamToChat(data),
})

// Result contains: { text, results, error, logs }
```

### Tool Definition Pattern
```typescript
export const workspaceToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'spawn_ephemeral_workspace',
    description: 'Create an isolated compute environment with Node, Python, and shell access. Use when you need to install packages, write scripts, process data, or execute code that goes beyond the BitBit SDK.',
    input_schema: {
      type: 'object',
      properties: {
        purpose: {
          type: 'string',
          description: 'Brief description of what the workspace will be used for',
        },
        template: {
          type: 'string',
          enum: ['default', 'data-science', 'web-dev'],
          description: 'Pre-configured environment template (optional)',
        },
      },
      required: ['purpose'],
    },
  },
  {
    name: 'workspace_exec',
    description: 'Execute code in an active workspace. Supports Python, JavaScript/Node, and shell commands. The workspace maintains state between calls -- installed packages and created files persist.',
    input_schema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        code: { type: 'string', description: 'Code to execute' },
        language: {
          type: 'string',
          enum: ['python', 'javascript', 'shell'],
          description: 'Execution language',
        },
      },
      required: ['workspace_id', 'code', 'language'],
    },
  },
]
```

### Supabase Schema Pattern
```sql
create table workspace_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  task_id uuid references async_tasks(id),
  sandbox_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'timeout')),
  purpose text,
  template text default 'default',
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_seconds numeric default 0,
  cost_usd numeric default 0,
  created_at timestamptz default now()
);

-- RLS: org-scoped access
alter table workspace_sessions enable row level security;
create policy "org_access" on workspace_sessions
  using (org_id = auth.jwt() ->> 'org_id');

create table workspace_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace_sessions(id),
  artifact_type text not null
    check (artifact_type in ('code', 'file', 'image', 'data_table', 'log')),
  name text not null,
  content text, -- inline content for small artifacts
  storage_path text, -- Supabase Storage path for large artifacts
  mime_type text,
  size_bytes integer,
  created_at timestamptz default now()
);
```

### Cost Circuit Breaker Pattern
```typescript
async function checkWorkspaceBudget(
  supabase: SupabaseClient,
  orgId: string,
  dailyLimitUsd: number = 2.0,
): Promise<{ allowed: boolean; usedToday: number }> {
  const { data } = await supabase
    .from('workspace_sessions')
    .select('cost_usd')
    .eq('org_id', orgId)
    .gte('started_at', new Date(Date.now() - 86400000).toISOString())

  const usedToday = (data || []).reduce((sum, r) => sum + Number(r.cost_usd), 0)
  return { allowed: usedToday < dailyLimitUsd, usedToday }
}
```

## Validation Architecture

### Testable Claims

1. **E2B cold start < 3s:** Measurable via `Sandbox.create()` timing in integration test
2. **Stateful execution:** Install package in call 1, use it in call 2 -- same sandbox
3. **Auto-destroy on timeout:** Create sandbox, don't interact, verify it's gone after timeout
4. **Output delivery:** Execute code producing stdout, verify it reaches chat via Realtime
5. **Cost tracking:** Run workspace, verify `workspace_sessions.cost_usd` is populated
6. **Network isolation:** Sandbox cannot reach internal Supabase/Fly resources (only public internet)
7. **Concurrent workspaces:** Two different orgs spawn workspaces simultaneously, verify isolation

### Integration Test Approach

- E2B provides a test/free tier -- integration tests can use real sandboxes
- Mock E2B SDK for unit tests (sandbox creation, code execution, file operations)
- Supabase test schema for workspace_sessions and workspace_artifacts tables

## Open Questions (Low Risk)

1. **E2B template strategy:** Start with default template, measure package install latency, build custom template if common installs exceed 10s. Low risk -- can iterate post-launch.
2. **GitHub integration scope:** MVP = create Gist. Full repo push in follow-up. Low risk -- clearly scoped.
3. **Artifact rendering component:** New React component needed for inline artifacts. Design decisions deferred to UI implementation -- functional pattern is clear.

---

## RESEARCH COMPLETE

**Summary:** E2B Code Interpreter is the recommended provider for ephemeral workspaces. It's purpose-built for AI agent code execution, offers sub-2s cold starts, full dev environments (Node/Python/shell), and handles lifecycle/isolation/cleanup at the platform level. The existing Fly.io Machines pattern serves as a viable fallback. Integration follows the established tool dispatch pattern (TAOR loop -> tool handler -> provider SDK). Outputs surface as inline artifacts in chat and optionally persist to GitHub.
