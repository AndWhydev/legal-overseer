---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/composio/mcp-client.ts
  - src/lib/composio/mcp-session.ts
  - src/lib/composio/mcp-tool-cache.ts
  - src/lib/composio/index.ts
  - src/lib/agent/engine/taor-loop.ts
  - src/lib/agent/engine/tool-executor.ts
  - src/lib/agent/tools.ts
  - src/lib/agent/planner.ts
  - src/app/api/connections/catalog/route.ts
  - src/app/api/connections/catalog/search/route.ts
  - src/lib/agent/tools/composio-tools.ts
  - src/lib/composio/__tests__/mcp-client.test.ts
  - src/lib/composio/__tests__/mcp-session.test.ts
  - src/lib/composio/__tests__/mcp-integration.test.ts
autonomous: true
requirements: [MCP-01, MCP-02, MCP-03]

must_haves:
  truths:
    - "When COMPOSIO_MCP_ENABLED=1, agent discovers and uses Composio app tools via MCP protocol without per-app code"
    - "Tool discovery is cached per-org with TTL, avoiding redundant MCP listTools calls"
    - "MCP tool calls are dispatched via MCP client while BitBit native tools use existing executeAgentTool"
    - "When COMPOSIO_MCP_ENABLED is unset or Composio MCP is unreachable, T039 meta-tools remain functional as fallback"
    - "Dynamic app catalog API returns browsable apps from Composio with search"
    - "Agent can suggest connecting new apps via composio_connect_app tool"
  artifacts:
    - path: "src/lib/composio/mcp-client.ts"
      provides: "HTTP MCP client implementing MCPClientLike for Composio endpoints"
      exports: ["ComposioMCPClient"]
    - path: "src/lib/composio/mcp-session.ts"
      provides: "Per-org session lifecycle with tool caching"
      exports: ["getOrCreateMCPSession", "invalidateMCPSession", "isMCPEnabled", "MCPSession"]
    - path: "src/lib/composio/mcp-tool-cache.ts"
      provides: "In-memory TTL cache for tool lists per org"
      exports: ["MCPToolCache"]
    - path: "src/app/api/connections/catalog/route.ts"
      provides: "GET handler for browsing available Composio apps"
    - path: "src/app/api/connections/catalog/search/route.ts"
      provides: "GET handler for searching Composio apps by name"
    - path: "src/lib/composio/__tests__/mcp-client.test.ts"
      provides: "Unit tests for MCP client tool conversion and result transformation"
    - path: "src/lib/composio/__tests__/mcp-session.test.ts"
      provides: "Unit tests for session lifecycle, caching, and fallback behavior"
  key_links:
    - from: "src/lib/composio/mcp-session.ts"
      to: "src/lib/composio/mcp-client.ts"
      via: "getOrCreateMCPSession creates ComposioMCPClient and caches tools"
      pattern: "new ComposioMCPClient"
    - from: "src/lib/agent/engine/taor-loop.ts"
      to: "src/lib/composio/mcp-session.ts"
      via: "Pre-flight step 4 calls getOrCreateMCPSession to merge MCP tools"
      pattern: "getOrCreateMCPSession"
    - from: "src/lib/agent/engine/tool-executor.ts"
      to: "src/lib/composio/mcp-session.ts"
      via: "Tool dispatch checks mcpSession.toolNames before calling MCP client vs executeAgentTool"
      pattern: "mcpSession.*callTool"
---

<objective>
Build the full MCP-native connections framework: MCP client + session manager (Option B: client-side resolution), dynamic app catalog API routes, and self-provisioning agent tool. Feature flagged behind COMPOSIO_MCP_ENABLED=1.

Purpose: Eliminate per-app code — any Composio-connected app becomes instantly usable by the agent via MCP tool discovery. Enables 1000+ app integrations with zero BitBit code per app.

Output: MCP client, session manager, tool cache, TAOR engine integration, catalog API routes, composio_connect_app agent tool, comprehensive tests.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@conductor/tracks/T039/mcp-native-framework.md
@src/lib/composio/client.ts
@src/lib/composio/index.ts
@src/lib/agent/tools.ts
@src/lib/agent/tools/composio-tools.ts
@src/lib/agent/engine/taor-loop.ts
@src/lib/agent/engine/tool-executor.ts
@src/lib/agent/planner.ts

<interfaces>
<!-- Key types and contracts the executor needs. -->

From node_modules/@anthropic-ai/sdk/helpers/beta/mcp.d.ts:
```typescript
export interface MCPToolLike {
    name: string;
    description?: string | undefined;
    inputSchema: {
        type: 'object';
        properties?: Record<string, unknown> | null | undefined;
        required?: string[] | readonly string[] | null | undefined;
        [key: string]: unknown;
    };
}

export interface MCPCallToolResultLike {
    content: MCPToolResultContentLike[];
    structuredContent?: object | undefined;
    isError?: boolean | undefined;
}

export interface MCPClientLike {
    callTool(params: {
        name: string;
        arguments?: Record<string, unknown>;
    }): Promise<MCPCallToolResultLike>;
}
```

From src/lib/agent/tools.ts (line 46):
```typescript
export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms' | 'agentic' | 'ads' | 'seo' | 'tenders' | 'content' | 'builder' | 'creative' | 'composio'
```

From src/lib/agent/tools.ts (line 1020):
```typescript
export function getAgentTools(groups?: ToolGroup[]): Anthropic.Tool[]
```

From src/lib/agent/tools.ts (line 1047):
```typescript
export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
  options?: ExecuteToolOptions
): Promise<ToolResult>
```

From src/lib/agent/planner.ts (line 13):
```typescript
const VALID_TOOL_GROUPS = new Set<ToolGroup>(['core', 'memory', 'channel', 'web', 'comms', 'agentic', 'creative', 'composio'])
```

Composio MCP URL pattern:
```
https://backend.composio.dev/v3/mcp/{serverId}?user_id={orgId}
```

Environment variables:
```
COMPOSIO_API_KEY=ak_...                 # Existing
COMPOSIO_MCP_ENABLED=1                  # New — feature flag
COMPOSIO_MCP_SERVER_ID=srv_...          # New — Composio MCP server config ID
COMPOSIO_MCP_CACHE_TTL=300              # New — Tool cache TTL in seconds (default 5min)
COMPOSIO_MCP_MAX_TOOLS=50              # New — Max tools per session
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: MCP client, session manager, and tool cache with tests</name>
  <files>
    src/lib/composio/mcp-client.ts
    src/lib/composio/mcp-session.ts
    src/lib/composio/mcp-tool-cache.ts
    src/lib/composio/index.ts
    src/lib/composio/__tests__/mcp-client.test.ts
    src/lib/composio/__tests__/mcp-session.test.ts
  </files>
  <behavior>
    - ComposioMCPClient.listTools() fetches tools from Composio MCP endpoint via HTTP POST (JSON-RPC), converts MCPToolLike[] to Anthropic.Tool[]
    - ComposioMCPClient.callTool() dispatches tool call via HTTP POST (JSON-RPC), returns MCPCallToolResultLike
    - ComposioMCPClient handles HTTP errors (500, 429, timeout) with clear error messages
    - ComposioMCPClient transforms MCP text content results into string ToolResult format
    - MCPToolCache stores per-org tool lists with configurable TTL (default 5min from COMPOSIO_MCP_CACHE_TTL)
    - MCPToolCache.get() returns null on miss or expired entry
    - MCPToolCache.set() stores tools with expiry timestamp
    - MCPToolCache.invalidate(orgId) removes specific org's cache
    - getOrCreateMCPSession(orgId) returns cached session if valid, else creates new MCP client, lists tools, caches, returns MCPSession
    - invalidateMCPSession(orgId) clears cache entry
    - isMCPEnabled() returns true only when COMPOSIO_MCP_ENABLED=1 AND COMPOSIO_API_KEY AND COMPOSIO_MCP_SERVER_ID are all set
    - When MCP endpoint unreachable, getOrCreateMCPSession returns null (graceful degradation, does not throw)
    - Tool count capped at COMPOSIO_MCP_MAX_TOOLS (default 50) to prevent context bloat
  </behavior>
  <action>
    **mcp-tool-cache.ts**: Create `MCPToolCache` class with a `Map<string, { tools: Anthropic.Tool[]; toolNames: Set<string>; expires: number }>`. Methods: `get(orgId)`, `set(orgId, tools)`, `invalidate(orgId)`, `clear()`. TTL from `parseInt(process.env.COMPOSIO_MCP_CACHE_TTL || '300') * 1000`. Export singleton instance.

    **mcp-client.ts**: Create `ComposioMCPClient` implementing `MCPClientLike`. Constructor takes `url: string` and `headers: Record<string, string>`. Implements the MCP JSON-RPC protocol over HTTP:
    - `listTools()`: POST to the MCP URL with JSON-RPC method `tools/list`. Parse response, map each tool from MCPToolLike to `Anthropic.Tool` format (name, description, input_schema with type cast). Return the array.
    - `callTool(params)`: POST with JSON-RPC method `tools/call`, body `{ name, arguments }`. Return MCPCallToolResultLike.
    - `transformResult(result: MCPCallToolResultLike)`: Convert MCP content array to a ToolResult-compatible string. For text content, join text. For errors (isError), return error string.
    - Use standard `fetch` with 10s timeout via AbortController. Handle 429 (rate limit — throw retryable error), 500+ (throw with status), network errors (throw with message).
    - Headers: `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`.

    **mcp-session.ts**: Define `MCPSession` interface: `{ orgId, mcpUrl, client: ComposioMCPClient, tools: Anthropic.Tool[], toolNames: Set<string>, connectedApps: string[], createdAt, expiresAt }`. Functions:
    - `isMCPEnabled()`: check all 3 env vars present AND COMPOSIO_MCP_ENABLED === '1'.
    - `getMCPUrl(orgId)`: build `https://backend.composio.dev/v3/mcp/${COMPOSIO_MCP_SERVER_ID}?user_id=${orgId}`.
    - `getOrCreateMCPSession(orgId)`: Check cache first. On miss, create client, call listTools(), cap at MAX_TOOLS, build Anthropic.Tool[] array, cache in MCPToolCache, return MCPSession. Wrap in try/catch — on ANY error, log warning and return null.
    - `invalidateMCPSession(orgId)`: clear cache.
    - `callMCPTool(session, name, args)`: Delegate to session.client.callTool, transform result to ToolResult format. Handle errors gracefully.

    **index.ts**: Add exports: `getOrCreateMCPSession`, `invalidateMCPSession`, `isMCPEnabled`, `callMCPTool`, `MCPToolCache` from the new files. Keep all existing exports.

    **Tests**: Use vitest with `vi.fn()` mocks for fetch. No real network calls.
    - mcp-client.test.ts: Test listTools conversion (MCPToolLike[] to Anthropic.Tool[]), callTool dispatch, error handling (500, 429, timeout, network error), result transformation (text content, error content, mixed content).
    - mcp-session.test.ts: Test isMCPEnabled() with various env combos, session creation, cache hit/miss/expiry, invalidation, graceful null return on MCP failure, MAX_TOOLS cap.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx vitest run src/lib/composio/__tests__/mcp-client.test.ts src/lib/composio/__tests__/mcp-session.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - ComposioMCPClient can list and call tools via HTTP JSON-RPC
    - MCPToolCache provides TTL-based per-org caching
    - getOrCreateMCPSession returns cached or fresh sessions, null on failure
    - isMCPEnabled gate checks all required env vars
    - All tests pass with mocked fetch
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TAOR engine integration — MCP tool merging and dispatch</name>
  <files>
    src/lib/agent/engine/taor-loop.ts
    src/lib/agent/engine/tool-executor.ts
    src/lib/agent/tools.ts
    src/lib/agent/planner.ts
    src/lib/composio/__tests__/mcp-integration.test.ts
  </files>
  <behavior>
    - When COMPOSIO_MCP_ENABLED=1, TAOR pre-flight merges MCP tools with native tools (deduplicated)
    - MCP tool names are tracked in a Set passed to tool-executor
    - tool-executor dispatches MCP-named tools via callMCPTool instead of executeAgentTool
    - MCP tool results are formatted as Anthropic.ToolResultBlockParam like native tools
    - When isMCPEnabled() is false, zero changes to existing flow (feature flag off = no-op)
    - When MCP session returns null (endpoint down), TAOR falls back to native tools only (T039 meta-tools still work)
    - ToolGroup type includes 'mcp' as a new group for planner awareness (but MCP tools bypass group filtering)
    - Planner VALID_TOOL_GROUPS updated to include 'mcp'
  </behavior>
  <action>
    **taor-loop.ts changes** (surgical, preserve existing logic):

    1. Add import at top: `import { getOrCreateMCPSession, isMCPEnabled, type MCPSession } from '@/lib/composio/mcp-session'`

    2. After tool selection (after the existing `let tools = ...` block around line 205-210), add MCP tool merging:
    ```typescript
    // ── 4c. MCP tool discovery: merge Composio MCP tools if enabled ──
    let mcpSession: MCPSession | null = null
    if (isMCPEnabled()) {
      mcpSession = await getOrCreateMCPSession(config.orgId)
      if (mcpSession) {
        // Merge MCP tools, skip any whose names clash with native tools
        const nativeNames = new Set(tools.map(t => t.name))
        const newMcpTools = mcpSession.tools.filter(t => !nativeNames.has(t.name))
        tools = [...tools, ...newMcpTools]
        toolNames = tools.map(t => t.name)
        logger.info('[engine] MCP tools merged', {
          mcpToolCount: newMcpTools.length,
          totalTools: tools.length,
          orgId: config.orgId,
        })
      }
    }
    ```

    3. Pass `mcpSession` to `executeToolBatchStreaming` — add it as a new parameter after `activeRole`.

    **tool-executor.ts changes**:

    1. Add import: `import { callMCPTool, type MCPSession } from '@/lib/composio/mcp-session'`

    2. Add `mcpSession: MCPSession | null` parameter to `executeToolBatchStreaming` signature.

    3. In the tool execution loop (around line 384-394), before the `executeAgentTool` call, check if the tool name is in `mcpSession?.toolNames`:
    ```typescript
    : mcpSession?.toolNames.has(tool.name)
      ? callMCPTool(mcpSession, tool.name, tool.input as Record<string, unknown>)
      : executeAgentTool(tool.name, tool.input as Record<string, unknown>, config.orgId, config.supabase, execOptions)
    ```
    This slots into the existing ternary chain (budget blocked → execution cap → MCP tool → native tool).

    **tools.ts changes**:
    - Add `'mcp'` to the `ToolGroup` type union (line 46). This is for planner awareness — it does not need a TOOL_GROUPS entry since MCP tools bypass group filtering.

    **planner.ts changes**:
    - Add `'mcp'` to `VALID_TOOL_GROUPS` set (line 13).

    **Integration test** (mcp-integration.test.ts):
    - Mock isMCPEnabled to return true
    - Mock getOrCreateMCPSession to return a session with 3 test tools
    - Verify tool merging produces combined array with no duplicates
    - Verify MCP tool dispatch routes through callMCPTool (not executeAgentTool)
    - Verify when isMCPEnabled returns false, no MCP code paths execute
    - Verify when getOrCreateMCPSession returns null, native tools used as fallback
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx vitest run src/lib/composio/__tests__/mcp-integration.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - TAOR loop merges MCP tools when feature flag is on
    - Tool executor dispatches MCP tools via callMCPTool
    - Feature flag off = zero behavioral change to existing engine
    - MCP endpoint failure = graceful fallback to native tools
    - Integration tests cover merge, dispatch, fallback, and no-op paths
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Dynamic app catalog API + self-provisioning agent tool</name>
  <files>
    src/app/api/connections/catalog/route.ts
    src/app/api/connections/catalog/search/route.ts
    src/lib/agent/tools/composio-tools.ts
    src/lib/composio/__tests__/mcp-catalog.test.ts
  </files>
  <behavior>
    - GET /api/connections/catalog returns list of available Composio apps with { id, name, description, category, logo, authScheme, connected, actionCount }
    - GET /api/connections/catalog?category=crm filters by category
    - GET /api/connections/catalog/search?q=gmail returns matching apps by name/description
    - Both routes require authenticated user (Supabase auth check), return 401 otherwise
    - Both routes return 503 when Composio is unavailable
    - composio_connect_app tool definition added: accepts { app_name, redirect_url? }, initiates Composio OAuth for the user's org
    - composio_connect_app handler calls existing initiateConnection from composio/auth.ts, returns the OAuth URL for the user
    - Existing 3 composio meta-tools (composio_list_apps, composio_list_actions, composio_execute) remain unchanged as T039 fallback
  </behavior>
  <action>
    **catalog/route.ts**: Create GET handler.
    - Auth: Use `createRouteHandlerClient` from Supabase to get session. 401 if no session.
    - Get org_id from user's profile (query `profiles` table for `active_org_id`).
    - Use Composio SDK: `getComposioClient()` to list available apps. The Composio SDK has `composio.apps.list()` or similar — call it to get the app catalog.
    - For each app, check if the user's org has an active connection (query `listConnectedAccounts(orgId)` and match by toolkit name).
    - Set `connected: true/false` accordingly.
    - Support optional `category` query param for filtering.
    - Return JSON array of `AppCatalogEntry` objects.
    - Wrap in try/catch — on Composio error, return 503 with error message.

    **catalog/search/route.ts**: Create GET handler.
    - Auth: same as above.
    - Accept `q` query param (required, 400 if missing).
    - Use Composio SDK to search/filter apps by name matching query (case-insensitive).
    - Return filtered `AppCatalogEntry[]`.

    **composio-tools.ts additions**:
    - Add `composio_connect_app` to `composioToolDefinitions` array:
      ```
      name: 'composio_connect_app'
      description: 'Initiate a connection to a third-party app for the user. Returns an OAuth URL the user should visit to authorize access. Use this when the user asks to connect a new app or when you discover they need an app that isn\'t connected yet.'
      input_schema: { app_name: string (required), redirect_url: string (optional, default: dashboard connections page) }
      ```
    - Add `composio_connect_app` handler to `composioToolHandlers`:
      - Validate app_name is provided
      - Check isComposioEnabled()
      - Call `initiateConnection(orgId, appName, redirectUrl)` from existing `@/lib/composio/auth`
      - Return `{ success: true, data: { oauth_url, message: 'Ask the user to visit this URL to connect their {app_name} account.' } }`
      - On error, return descriptive error

    **mcp-catalog.test.ts**: Unit tests for catalog routes and connect tool.
    - Mock Composio client and Supabase
    - Test catalog route returns app list with connected status
    - Test category filter
    - Test search route with query matching
    - Test auth rejection (no session → 401)
    - Test Composio unavailable → 503
    - Test composio_connect_app handler returns OAuth URL
    - Test composio_connect_app with missing app_name → error
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx vitest run src/lib/composio/__tests__/mcp-catalog.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - GET /api/connections/catalog returns dynamic Composio app list with connection status
    - GET /api/connections/catalog/search?q= filters by name
    - composio_connect_app agent tool initiates OAuth for any Composio app
    - All routes authenticated and handle Composio failures gracefully
    - Tests pass for all routes and the new agent tool
  </done>
</task>

</tasks>

<verification>
Run full test suite to confirm no regressions:
```bash
cd /home/claude/bitbit/personal-assistant && npx vitest run src/lib/composio/__tests__/ --reporter=verbose
```

Verify TypeScript compilation:
```bash
cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30
```

Verify feature flag isolation (existing tests still pass with MCP disabled):
```bash
cd /home/claude/bitbit/personal-assistant && npx vitest run src/lib/agent/ --reporter=verbose 2>&1 | tail -20
```
</verification>

<success_criteria>
- All MCP client, session, integration, and catalog tests pass
- TypeScript compiles without errors
- When COMPOSIO_MCP_ENABLED=1: agent discovers tools via MCP, dispatches via MCP client
- When COMPOSIO_MCP_ENABLED unset: zero behavioral change, T039 meta-tools work
- When MCP endpoint unreachable: graceful fallback to native tools
- Catalog API routes return dynamic Composio app data
- Agent can initiate OAuth for any Composio app via composio_connect_app tool
- Existing agent tests pass (no regressions)
</success_criteria>

<output>
After completion, create `.planning/quick/3-full-mcp-native-connections-framework-en/3-SUMMARY.md`
</output>
