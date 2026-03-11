---
phase: quick-1-sota-tool-engine
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/lib/agent/tools.ts
  - personal-assistant/src/lib/agent/tools/superpower-tools.ts
  - personal-assistant/src/lib/agent/tools/channel-tools.ts
  - personal-assistant/src/lib/agent/engine.ts
  - personal-assistant/src/lib/agent/planner.ts
autonomous: true
requirements: [SOTA-01, SOTA-02, SOTA-03]

must_haves:
  truths:
    - "Every tool definition has a `group` field for future Tool RAG categorization"
    - "Tool results returned to the LLM include contextual JIT instructions guiding behavior"
    - "Tool descriptions follow Anthropic best practices — human-readable, non-overlapping, with clear boundaries"
  artifacts:
    - path: "personal-assistant/src/lib/agent/tools.ts"
      provides: "ToolGroup type, group field on all core tool definitions, getToolsByGroup(), JIT instruction map"
      exports: ["ToolGroup", "TOOL_GROUPS", "getToolsByGroup"]
    - path: "personal-assistant/src/lib/agent/tools/superpower-tools.ts"
      provides: "group field on web_search, fetch_url, send_email, send_sms + improved descriptions"
    - path: "personal-assistant/src/lib/agent/tools/channel-tools.ts"
      provides: "group field on sync_channels, search_messages, get_upcoming, create_reminder, schedule_event + improved descriptions"
    - path: "personal-assistant/src/lib/agent/engine.ts"
      provides: "JIT instruction wrapping in tool result content before sending back to LLM"
    - path: "personal-assistant/src/lib/agent/planner.ts"
      provides: "Updated TOOL_LABEL_MAP entries for any renamed/added tools"
  key_links:
    - from: "personal-assistant/src/lib/agent/engine.ts"
      to: "personal-assistant/src/lib/agent/tools.ts"
      via: "getJITInstruction(toolName) called after executeAgentTool"
      pattern: "getJITInstruction"
    - from: "personal-assistant/src/lib/agent/tools.ts"
      to: "personal-assistant/src/lib/agent/tools/superpower-tools.ts"
      via: "spread into allHandlers and getAgentTools()"
      pattern: "superpowerToolDefinitions"
    - from: "personal-assistant/src/lib/agent/tools.ts"
      to: "personal-assistant/src/lib/agent/tools/channel-tools.ts"
      via: "spread into allHandlers and getAgentTools()"
      pattern: "channelToolDefinitions"
---

<objective>
Implement three SOTA tool engine optimizations based on research from RAG-MCP paper, Shopify JIT pattern, and Anthropic tool writing guidelines.

Purpose: Improve agent tool selection accuracy and response quality by (1) adding group metadata for future pgvector Tool RAG, (2) injecting contextual JIT instructions into tool results so the LLM gets guidance at the moment it matters most, and (3) sharpening tool descriptions to eliminate overlap and ambiguity.

Output: Modified tool registry with group metadata, JIT instruction injection in engine loop, and improved tool descriptions across all 20 tools.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/lib/agent/tools.ts
@personal-assistant/src/lib/agent/tools/superpower-tools.ts
@personal-assistant/src/lib/agent/tools/channel-tools.ts
@personal-assistant/src/lib/agent/engine.ts
@personal-assistant/src/lib/agent/planner.ts
@personal-assistant/src/lib/agent/prompt-builder.ts

<interfaces>
<!-- Key types and contracts the executor needs. -->

From tools.ts:
```typescript
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  queued?: boolean
  approvalId?: string
}

export type AgentToolHandler = (
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
) => Promise<ToolResult>

export function getAgentTools(): Anthropic.Tool[]  // returns [...toolDefinitions, ...channelToolDefinitions, ...superpowerToolDefinitions]

export async function executeAgentTool(name, input, orgId, supabase, options?): Promise<ToolResult>
```

From engine.ts (tool result → LLM, line ~418-427):
```typescript
toolResults.push({
  type: 'tool_result',
  tool_use_id: tool.id,
  content: result.queued
    ? `Action queued for approval (ID: ${result.approvalId})...`
    : result.success
      ? JSON.stringify(result.data)
      : `Error: ${result.error}`,
  is_error: !result.success && !result.queued,
})
```
This is the exact injection point for JIT instructions — wrap the `content` string.

From Anthropic.Tool type:
```typescript
interface Tool {
  name: string
  description: string
  input_schema: { type: 'object', properties: Record<string, unknown>, required?: string[] }
  // NOTE: `group` is NOT part of Anthropic.Tool — store it alongside as extended metadata
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add tool group metadata + ToolGroup type + optimize all 20 tool descriptions</name>
  <files>
    personal-assistant/src/lib/agent/tools.ts,
    personal-assistant/src/lib/agent/tools/superpower-tools.ts,
    personal-assistant/src/lib/agent/tools/channel-tools.ts,
    personal-assistant/src/lib/agent/planner.ts
  </files>
  <action>
**1. Define ToolGroup type and metadata in tools.ts:**

Add a `ToolGroup` type and a `TOOL_GROUPS` metadata map at the top of tools.ts:

```typescript
export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms'

export interface ToolGroupMeta {
  id: ToolGroup
  label: string
  description: string
  tools: string[]
}

export const TOOL_GROUPS: Record<ToolGroup, ToolGroupMeta> = {
  core: {
    id: 'core',
    label: 'Core Operations',
    description: 'Task management, contacts, activity logging, and creator tools',
    tools: ['create_task', 'update_task', 'search_tasks', 'search_contacts', 'get_contact', 'log_activity', 'compose_creator_notification_mockup'],
  },
  memory: {
    id: 'memory',
    label: 'Memory & Knowledge',
    description: 'Store and recall learned preferences, patterns, and context',
    tools: ['search_memory', 'add_memory'],
  },
  channel: {
    id: 'channel',
    label: 'Channel Integration',
    description: 'Sync, search, and interact with communication channels (Gmail, Calendar, etc.)',
    tools: ['sync_channels', 'search_messages', 'get_upcoming', 'create_reminder', 'schedule_event'],
  },
  web: {
    id: 'web',
    label: 'Web & Research',
    description: 'Search the web and fetch URL content for research',
    tools: ['web_search', 'fetch_url'],
  },
  comms: {
    id: 'comms',
    label: 'Outbound Communications',
    description: 'Send emails and SMS messages on behalf of the user',
    tools: ['send_email', 'send_sms'],
  },
}
```

Add a `getToolsByGroup(group: ToolGroup)` function that filters `getAgentTools()` by the group's tool list.

Also add a `TOOL_GROUP_MAP` (Record<string, ToolGroup>) derived from TOOL_GROUPS for quick lookup: `{ create_task: 'core', web_search: 'web', ... }`. Export it — the engine needs it.

**2. Optimize tool descriptions across all 3 files following Anthropic guidelines:**

Rewrite each tool's `description` to be:
- Human-readable sentences (not terse fragments)
- Include WHEN to use the tool (positive trigger)
- Include WHEN NOT to use the tool (negative boundary) where overlap risk exists
- No jargon in descriptions — write as if explaining to a smart person who's never seen the codebase

Specific rewrites (apply these, don't invent different ones):

**tools.ts (core):**
- `create_task`: "Create a new task on the kanban board. Use when the user wants to add a task, todo, or action item. Always include priority based on context. If a specific contact is mentioned, resolve them with search_contacts first to get their ID. Do NOT use this for reminders or calendar events — use create_reminder or schedule_event instead."
- `update_task`: "Update an existing task's title, description, status, priority, or column. Use when the user wants to change, move, complete, or archive a task. Requires the task_id — use search_tasks first if you don't have it."
- `search_tasks`: "Search tasks on the kanban board by keyword, status, or priority. Returns matching tasks with their IDs. Use this to find tasks before updating them, or to answer questions about what's on the board."
- `search_contacts`: "Find contacts by name, alias, email, or phone number. Uses fuzzy entity resolution across all known aliases. Always use this before referencing a contact in other tools to get their correct ID."
- `get_contact`: "Load a contact's full profile including communication history, relationships, financial signals, active tasks, and deadlines. Use after search_contacts when you need deep context about a specific person. Do NOT use this for simple lookups — search_contacts is faster."
- `log_activity`: "Record an action to the activity feed for transparency. Log significant actions like emails sent, tasks created from channel messages, or research completed. Do NOT log routine tool calls — only meaningful business actions."
- `compose_creator_notification_mockup`: Keep existing description (niche tool, no overlap risk).
- `search_memory`: "Search stored knowledge entries for previously learned patterns, preferences, and context. Use when the user references a past preference or when you need to recall how something was handled before."
- `add_memory`: "Store a new knowledge entry to remember across sessions. Use for user preferences, recurring patterns, domain knowledge, and important context. Choose the most specific category. Do NOT store ephemeral information like today's weather or one-time requests."

**superpower-tools.ts (web + comms):**
- `web_search`: "Search the web for current, real-time information using Brave Search. Use when the user asks about recent events, needs research, or when your training data may be outdated. Write specific search queries — include names, dates, and context for better results. Do NOT use for information you already have from memory or context."
- `fetch_url`: "Fetch and extract readable text from a URL. Use when the user shares a link or when web_search returns a result that needs deeper reading. Handles HTML (extracts article text), JSON (returns raw), and plain text. Do NOT use for private/authenticated URLs — they will fail."
- `send_email`: "Send an email via Resend on behalf of the user. IMPORTANT: Always confirm the recipient, subject, and body with the user before sending. Supports plain text and HTML. Do NOT send without explicit user approval."
- `send_sms`: "Send an SMS text message via Telnyx. IMPORTANT: Always confirm the recipient and message with the user before sending. Use E.164 phone format (e.g. +61400123456). Messages over 160 chars are split into segments. Do NOT send without explicit user approval."

**channel-tools.ts (channel):**
- `sync_channels`: "Pull new messages from all connected channels (Gmail, Outlook, iMessage, Calendar, Reminders) and create tasks from actionable items. Use when the user says 'check my messages', 'sync channels', or 'what's new'. Defaults to last 24 hours."
- `search_messages`: "Search across all channel messages by keyword, sender, or channel type. Searches subject and body text. Use when the user asks about a specific email, message, or conversation. Only searches the last 7 days of cached messages."
- `get_upcoming`: "List upcoming calendar events and due reminders within a specified number of days. Use when the user asks about their schedule, upcoming meetings, or what's due. Includes overdue items. Default: 7 days ahead."
- `create_reminder`: "Create an Apple Reminder item. Use when the user explicitly asks to set a reminder. Requires macOS. Do NOT use for tasks — use create_task for work items on the kanban board."
- `schedule_event`: "Create a calendar event on Apple Calendar. Use when the user wants to schedule a meeting, appointment, or block time. Requires macOS. Requires at least a title and start time."

**3. Update planner.ts TOOL_LABEL_MAP:**
Ensure all 20 tool names have entries. Currently missing: `web_search`, `fetch_url`, `get_upcoming`, `create_reminder`, `schedule_event`. Add:
- `web_search`: `{ label: 'Searching web', sublabel: 'RESEARCHING', icon: '🌐' }`
- `fetch_url`: `{ label: 'Reading page', sublabel: 'FETCHING', icon: '📄' }`
- `get_upcoming`: `{ label: 'Checking schedule', sublabel: 'LOADING', icon: '📅' }`
- `create_reminder`: `{ label: 'Setting reminder', sublabel: 'CREATING', icon: '⏰' }`
- `schedule_event`: `{ label: 'Scheduling event', sublabel: 'CREATING', icon: '📅' }`
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>All 20 tool definitions have optimized descriptions following Anthropic guidelines. ToolGroup type exported. TOOL_GROUPS and TOOL_GROUP_MAP exported from tools.ts. getToolsByGroup() function works. TOOL_LABEL_MAP in planner.ts covers all 20 tools. Zero new TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 2: Implement JIT instruction injection in engine.ts tool result loop</name>
  <files>
    personal-assistant/src/lib/agent/tools.ts,
    personal-assistant/src/lib/agent/engine.ts
  </files>
  <action>
**1. Define JIT instruction map in tools.ts:**

Add and export a `JIT_INSTRUCTIONS` map (Record<string, string>) that provides contextual instructions to append to tool results. These instructions are injected INTO the tool_result content so the LLM reads them at the exact moment it processes the result — this is the Shopify "Death by 1000 Instructions" fix (moving guidance from system prompt to point-of-use).

```typescript
export const JIT_INSTRUCTIONS: Record<string, string> = {
  // Web & Research
  web_search: 'Use these search results to answer the user\'s question. Cite sources with URLs when relevant. If results are insufficient, refine your search query and try again.',
  fetch_url: 'Use the extracted page content to answer the user\'s question. Summarize key points rather than dumping raw text. Note if the content was truncated.',

  // Contacts
  search_contacts: 'Use the matched contact(s) to proceed with the user\'s request. If multiple matches exist, ask the user to clarify which one. Use the contact ID for subsequent tool calls.',
  get_contact: 'Use this contact profile to provide informed, contextual responses. Reference their recent activity, relationships, and financial signals when relevant. Do not recite the entire profile back.',

  // Tasks
  create_task: 'Task created successfully. Confirm the task title and column to the user. If they mentioned a deadline or contact, remind them if those weren\'t included.',
  update_task: 'Task updated. Briefly confirm what changed. If the task was moved to Done, ask if there are follow-up actions.',
  search_tasks: 'Present the matching tasks concisely. If the user is looking for a specific task to update, confirm which one before proceeding.',

  // Memory
  search_memory: 'Use recalled memories to inform your response. Do not quote memory entries verbatim — integrate the knowledge naturally.',
  add_memory: 'Memory stored. Do not announce this to the user unless they explicitly asked you to remember something.',

  // Channels
  sync_channels: 'Summarize what was found across channels. Highlight actionable items (emails needing replies, overdue reminders). Don\'t list every message.',
  search_messages: 'Present the most relevant messages first. Include sender, date, and a brief snippet. If the user is looking for something specific, highlight the best match.',
  get_upcoming: 'Present the schedule in chronological order. Highlight overdue items and conflicts. Group by day if spanning multiple days.',
  create_reminder: 'Reminder created. Confirm the title, list, and due date to the user.',
  schedule_event: 'Event scheduled. Confirm the title, date/time, and location to the user.',

  // Comms
  send_email: 'Email sent successfully. Confirm the recipient and subject to the user. Suggest logging this action if it\'s business-relevant.',
  send_sms: 'SMS sent successfully. Confirm the recipient to the user. Note if the message was split into multiple segments.',

  // Activity & Creative
  log_activity: 'Activity logged. Continue with the user\'s request — do not announce that you logged an action.',
  compose_creator_notification_mockup: 'Mockup generated. Present the key details and ask if the user wants to adjust any parameters.',
}
```

Also export a helper:
```typescript
export function getJITInstruction(toolName: string): string | undefined {
  return JIT_INSTRUCTIONS[toolName]
}
```

**2. Inject JIT instructions in engine.ts tool result loop:**

In engine.ts, find the `toolResults.push()` block (~line 418-427) inside the tool execution loop. Modify the `content` field to append JIT instructions when the tool succeeds:

Change from:
```typescript
content: result.queued
  ? `Action queued for approval (ID: ${result.approvalId})...`
  : result.success
    ? JSON.stringify(result.data)
    : `Error: ${result.error}`,
```

To:
```typescript
content: result.queued
  ? `Action queued for approval (ID: ${result.approvalId}). Confidence: ${((result.data as any)?.confidence * 100 || 0).toFixed(0)}%`
  : result.success
    ? (() => {
        const data = JSON.stringify(result.data)
        const jit = getJITInstruction(tool.name)
        return jit ? `${data}\n\n---\n${jit}` : data
      })()
    : `Error: ${result.error}`,
```

Import `getJITInstruction` from `./tools` at the top of engine.ts (add to existing import line).

The `\n\n---\n` separator ensures the LLM can visually distinguish data from instructions. The JIT instruction is only appended on success — errors don't get instructions.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>JIT_INSTRUCTIONS map covers all 20 tools. getJITInstruction() exported from tools.ts. engine.ts injects JIT instructions into successful tool_result content with --- separator. Queued and error results unchanged. Zero TypeScript errors. Build passes.</done>
</task>

<task type="auto">
  <name>Task 3: Verify build + run quick smoke test</name>
  <files>personal-assistant/src/lib/agent/tools.ts</files>
  <action>
Run the full Next.js production build to ensure no regressions. Then write a quick inline verification:

1. `cd personal-assistant && npm run build` — must pass with zero errors
2. Verify all exports work by checking the built output:
   - `getToolsByGroup` is exported
   - `TOOL_GROUPS` is exported
   - `TOOL_GROUP_MAP` is exported
   - `JIT_INSTRUCTIONS` is exported
   - `getJITInstruction` is exported
3. Verify tool count: `getAgentTools()` should still return exactly 20 tools (9 core + 4 superpower + 5 channel + 2 memory = 20)
4. Verify no tools are missing from JIT_INSTRUCTIONS — every tool name in getAgentTools() should have a JIT instruction entry
5. Verify no tools are missing from TOOL_GROUP_MAP — every tool name should map to a group
6. Verify TOOL_LABEL_MAP in planner.ts has entries for all 20 tools

If build fails due to ignoreBuildErrors being removed (per 18-03 decision), check for pre-existing type errors vs new ones. Only new errors from this change need fixing.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit --pretty 2>&1 | tail -5</automated>
  </verify>
  <done>Production build passes. All 20 tools have: group metadata in TOOL_GROUP_MAP, JIT instruction in JIT_INSTRUCTIONS, label in TOOL_LABEL_MAP, and optimized description. getToolsByGroup() returns correct subset for each group. No regressions.</done>
</task>

</tasks>

<verification>
1. `cd personal-assistant && npx tsc --noEmit` — zero new type errors
2. `cd personal-assistant && npm run build` — production build passes
3. Manual check: grep for all tool names in JIT_INSTRUCTIONS, TOOL_GROUP_MAP, TOOL_LABEL_MAP — all 20 present in each
4. Manual check: engine.ts tool result content includes `---\n` JIT separator for successful results
</verification>

<success_criteria>
- All 20 tool definitions have improved, non-overlapping descriptions with clear when-to-use and when-not-to-use guidance
- ToolGroup type with 5 groups (core, memory, channel, web, comms) exported from tools.ts
- TOOL_GROUPS metadata map and TOOL_GROUP_MAP lookup exported
- getToolsByGroup() function returns correct tool subsets
- JIT_INSTRUCTIONS map covers all 20 tools with contextual post-result guidance
- engine.ts injects JIT instructions into tool_result content on success
- TOOL_LABEL_MAP in planner.ts covers all 20 tools
- TypeScript compilation passes, production build passes
- No behavior changes to existing tool execution — only metadata additions and result wrapping
</success_criteria>

<output>
After completion, create `.planning/quick/1-sota-tool-engine-optimizations-jit-instr/1-01-SUMMARY.md`
</output>
