# T039.2 — MCP-Native Connections Framework

## The Problem

T039 Phase 1-3 built a Composio integration with 15 hand-coded adapters, 11 transformers, action name constants, and 3 meta-tools. It works, but it's still per-app code. Adding app #16 means writing another transformer. And the agent can only use apps we've explicitly mapped.

The actual goal: **any app a user connects should be instantly usable by the agent, with zero BitBit code per app.**

## The Architecture

Three layers, each independently testable:

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Dynamic App Catalog (Dashboard UX)    │
│  Browse 1000+ apps, connect via Composio OAuth  │
│  No hardcoded provider list                     │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 2: MCP Session Manager                   │
│  Per-user Composio MCP endpoints                │
│  Tool discovery, scoping, caching               │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 1: MCP-Native TAOR Engine                │
│  Anthropic API mcp_servers parameter (beta)     │
│  OR: MCP client → Anthropic.Tool[] conversion   │
└─────────────────────────────────────────────────┘
```

## Layer 1: MCP-Native TAOR Engine

### Option A: Anthropic API native MCP (preferred)

The Anthropic API supports `mcp_servers` as a beta parameter. This means Claude resolves MCP tools server-side — we don't manage tool schemas at all.

```typescript
// In taor-loop.ts — streamConfig changes
const streamConfig = {
  model,
  max_tokens: maxTokens,
  system: fullSystemPrompt,
  tools,           // BitBit's native tools (core, memory, channel, etc.)
  messages,
  // NEW: Composio MCP endpoint — Claude discovers tools dynamically
  mcp_servers: mcpServers.length > 0 ? mcpServers : undefined,
  betas: mcpServers.length > 0 ? ['mcp-client-2025-04-04'] : undefined,
}
```

**Pros**: Zero tool management. Claude handles tool discovery, schema parsing, execution. We just pass the URL.
**Cons**: Beta API. Adds latency (Claude must connect to MCP server). Less control over tool filtering. Can't enforce plan gates or approval routing on MCP tools.

### Option B: MCP client-side resolution (fallback)

Use `@anthropic-ai/sdk/helpers/beta/mcp` (already in SDK 0.74.0) to:
1. Connect to Composio MCP endpoint at session start
2. List available tools → convert to `Anthropic.Tool[]`
3. Merge with BitBit native tools
4. Execute MCP tool calls via the MCP client

```typescript
import type { MCPToolLike, MCPClientLike } from '@anthropic-ai/sdk/helpers/beta/mcp'

// At session init
const mcpTools = await composioMcpClient.listTools()
const anthropicTools = mcpTools.map(t => ({
  name: t.name,
  description: t.description || '',
  input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
}))

// Merge into tool set
const allTools = [...getAgentTools(groups), ...anthropicTools]

// In executeAgentTool — dispatch MCP tools to MCP client
if (mcpToolNames.has(name)) {
  const result = await mcpClient.callTool({ name, arguments: input })
  return transformMCPResult(result)
}
```

**Pros**: Full control. Can enforce approval routing, plan gates, budgets on MCP tools. Works with existing tool executor. Can cache tool schemas.
**Cons**: More code. Must manage MCP client lifecycle in serverless.

### Recommendation: Option B first, migrate to A when beta stabilizes

Option B gives us control over approval routing and plan gates — critical for a product that sends emails and manages money on behalf of users. Option A is the endgame when the Anthropic beta matures.

## Layer 2: MCP Session Manager

Manages per-user Composio MCP sessions. Handles:
- Creating Composio MCP server configs
- Generating per-user MCP URLs
- Caching tool lists to avoid redundant discovery calls
- Scoping tools to what the user has connected

### New files

```
src/lib/composio/
  mcp-session.ts     — Per-user MCP session lifecycle
  mcp-client.ts      — HTTP MCP client for Composio endpoint
  mcp-tool-cache.ts  — Tool list caching (per-org, TTL-based)
```

### MCP Session Lifecycle

```typescript
// mcp-session.ts
interface MCPSession {
  orgId: string
  mcpUrl: string
  tools: Anthropic.Tool[]
  toolNames: Set<string>
  connectedApps: string[]
  createdAt: number
  expiresAt: number
}

const SESSION_TTL = 5 * 60 * 1000 // 5 min cache

// Get or create MCP session for an org
async function getOrCreateMCPSession(orgId: string): Promise<MCPSession>

// Invalidate when user connects/disconnects an app
async function invalidateMCPSession(orgId: string): Promise<void>
```

### MCP Client (HTTP transport)

Composio's MCP endpoint uses HTTP — works in serverless (no stdio, no persistent connections).

```typescript
// mcp-client.ts
class ComposioMCPClient implements MCPClientLike {
  constructor(private url: string, private headers: Record<string, string>)

  async listTools(): Promise<MCPToolLike[]>
  async callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<MCPCallToolResultLike>
}
```

### Tool Caching Strategy

Problem: listing 1000+ tools on every chat message is expensive.
Solution: cache per-org, invalidate on connect/disconnect.

```typescript
// mcp-tool-cache.ts
// In-memory cache with TTL (Vercel Fluid Compute reuses instances)
// Fallback: Vercel Runtime Cache or Supabase for cross-instance consistency
const cache = new Map<string, { tools: Anthropic.Tool[]; expires: number }>()
```

## Layer 3: Dynamic App Catalog

Replace the hardcoded `built-in-providers.ts` with a dynamic catalog fetched from Composio.

### API Routes

```
GET /api/connections/catalog              — Browse available apps (from Composio)
GET /api/connections/catalog/search?q=    — Search apps by name
GET /api/connections/catalog/[app]        — Get app details + auth requirements
POST /api/connections/composio/connect    — Initiate OAuth (already built in T039)
GET /api/connections/composio/callback    — OAuth callback (already built in T039)
```

### Dashboard UX

```
Connections Grid
├── Connected apps (from org_connections where transport='composio')
│   └── Each: status badge, last sync, disconnect button
├── "Add Connection" button
│   └── Opens catalog modal
│       ├── Search bar (instant filter)
│       ├── Category tabs (Communication, Productivity, Finance, Dev, CRM, ...)
│       └── App cards with "Connect" button → Composio OAuth
└── Custom bridges section (iMessage, WhatsApp, Android Messages)
    └── Unchanged — separate provisioning UX
```

### Catalog Data Shape

```typescript
interface AppCatalogEntry {
  id: string           // e.g., 'gmail', 'hubspot'
  name: string         // e.g., 'Gmail', 'HubSpot'
  description: string
  category: string     // e.g., 'communication', 'crm'
  logo: string         // URL to app icon
  authScheme: string   // 'oauth2', 'api_key', 'basic'
  connected: boolean   // true if user has active connection
  actionCount: number  // how many actions available
}
```

## Testing Strategy

### Unit Tests (no network)

1. **MCP tool conversion**: MCPToolLike → Anthropic.Tool[] mapping
2. **MCP result transformation**: MCP content → ToolResult
3. **Session caching**: TTL, invalidation, cache misses
4. **Tool scoping**: only connected app tools loaded
5. **Fallback behavior**: Composio unavailable → graceful degradation to T039 adapters

### Integration Tests (mock MCP server)

6. **Mock MCP server**: In-process HTTP server returning tool schemas
7. **Full tool lifecycle**: list tools → call tool → parse result
8. **Session lifecycle**: create → cache hit → invalidate → recreate
9. **Concurrent sessions**: multiple orgs, isolated tool sets

### E2E Tests (live Composio, test account)

10. **OAuth flow**: initiate → redirect → callback → connection stored
11. **Tool discovery**: connect Gmail → tools include GMAIL_*
12. **Tool execution**: call GMAIL_LIST_EMAILS → returns real data
13. **Disconnect**: remove connection → tools no longer available

### Resilience Tests

14. **Composio down**: MCP endpoint returns 500 → falls back to T039 adapters
15. **Partial failure**: one tool call fails → others succeed
16. **Rate limiting**: Composio returns 429 → backoff + retry
17. **Stale cache**: tool list changed → cache invalidated on next request

## Migration Path

### Phase 1: MCP client + tool resolution (the engine)
- Build `mcp-client.ts`, `mcp-session.ts`, `mcp-tool-cache.ts`
- Wire into TAOR loop: MCP tools merged with native tools
- MCP tool calls dispatched via MCP client, routed through `executeAgentTool` for approval/budget gates
- Feature flag: `COMPOSIO_MCP_ENABLED=1` (off by default)
- T039 meta-tools (`composio_execute` etc.) remain as fallback

### Phase 2: Dynamic app catalog (the dashboard)
- Build `/api/connections/catalog` routes
- Dynamic connections grid component
- Remove hardcoded `built-in-providers.ts` entries for Composio-capable apps
- Keep bridge providers (iMessage, WhatsApp, Android Messages) hardcoded

### Phase 3: Self-provisioning agent (the endgame)
- Agent can call `composio_connect_app` to initiate OAuth for user
- Agent can discover new apps: "I need to access your Jira — let me set that up"
- MCP server registration persisted in `org_connections.config`
- New MCP servers (beyond Composio) can be registered by the agent

### Phase 4: Anthropic native MCP (when beta graduates)
- Switch from Option B (client-side) to Option A (API-side)
- Remove MCP client code, just pass `mcp_servers` to API
- Keep approval routing via tool_use interceptors

## What T039 Phase 1-3 Becomes

T039's existing code isn't wasted — it becomes the **fallback layer**:

| Component | MCP-native role |
|---|---|
| `composio/client.ts` | Still used for Composio API calls (auth, catalog) |
| `composio/auth.ts` | Still used for OAuth initiation |
| `composio/adapter.ts` | Fallback when MCP is unavailable |
| `composio/mapping.ts` | Used for dashboard display mapping |
| `composio/triggers.ts` | Remains for webhook-based real-time events |
| `composio-tools.ts` (3 meta-tools) | Fallback when MCP is disabled |
| Webhook endpoint | Remains for Composio trigger events |

## Environment Variables

```bash
# Existing (T039)
COMPOSIO_API_KEY=ak_...

# New (MCP-native)
COMPOSIO_MCP_ENABLED=1              # Enable MCP tool resolution
COMPOSIO_MCP_SERVER_ID=srv_...      # Composio MCP server config ID
COMPOSIO_MCP_CACHE_TTL=300          # Tool cache TTL in seconds (default 5min)
COMPOSIO_MCP_MAX_TOOLS=50           # Max tools per session (context budget)
```

## Cost Impact

| Scenario | Current (T039) | MCP-native |
|---|---|---|
| Tool discovery | 0 (hardcoded) | 1 MCP listTools call per session (~50ms) |
| Tool execution | 1 Composio API call | 1 MCP callTool call (same backend) |
| Total per-session overhead | ~0ms | ~50-100ms (cached after first call) |
| Composio billing | Same tool call volume | Same tool call volume |
| Code maintenance | Per-app transformers | Zero per-app code |

## Files to Create/Modify

### New files (Layer 1 + 2)
```
src/lib/composio/mcp-client.ts        — HTTP MCP client for Composio
src/lib/composio/mcp-session.ts        — Per-user session lifecycle + caching
src/lib/composio/__tests__/mcp-client.test.ts
src/lib/composio/__tests__/mcp-session.test.ts
```

### Modified files
```
src/lib/agent/tools.ts                 — MCP tool merging + dispatch
src/lib/agent/engine/taor-loop.ts      — MCP session init in pre-flight
```

### New files (Layer 3)
```
src/app/api/connections/catalog/route.ts         — Browse app catalog
src/app/api/connections/catalog/search/route.ts  — Search apps
src/components/connections/app-catalog.tsx        — Dynamic catalog modal
```

## Success Criteria

- [ ] Agent can use any Composio-connected app's tools without per-app code in BitBit
- [ ] Tool discovery happens in <100ms (cached)
- [ ] Approval routing and plan gates work on MCP tools
- [ ] Dashboard shows dynamic app catalog, not hardcoded list
- [ ] Graceful fallback to T039 adapters when MCP unavailable
- [ ] 0 code changes needed to support a new Composio app
- [ ] Self-provisioning: agent can suggest connecting new apps
