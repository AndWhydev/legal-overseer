# Web Harness + Prompt Tuning + Engine Tweaks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give BitBit full web access (search, read, extract, crawl) with multi-provider fallback, rewrite the system prompt to match Claude Code's lean tool-guidance pattern, and uncap the engine's iteration limit so the agent can run until done.

**Architecture:** Four new agent tools backed by six providers (3 search, 3 read). Providers cascade on failure or missing API keys. System prompt rewritten: 3-line identity, tool usage map, dynamic context. Engine loop runs until the model stops calling tools (50-iteration safety breaker).

**Tech Stack:** Anthropic SDK (existing), Cheerio (new), Tavily/Serper/Exa/Jina REST APIs via fetch.

---

## 1. Web Tools

### 1.1 `web_search` — Multi-provider web search

**Purpose:** Search the web and return ranked results with snippets. Optionally returns an AI-synthesized answer (Tavily).

**Parameters:**
- `query` (string, required) — search query
- `max_results` (number, default 5, max 10) — number of results to return
- `search_depth` ("basic" | "advanced", default "basic") — Tavily-specific; advanced costs more credits but returns better results
- `provider` (string, optional) — force a specific provider ("tavily", "serper", "exa"). If omitted, uses fallback order.

**Returns:**
```typescript
{
  results: Array<{
    title: string
    url: string
    snippet: string
    score?: number
  }>
  answer?: string        // AI-synthesized answer (Tavily only)
  provider: string       // which provider served the response
  query: string          // echo back for reference
}
```

**Provider fallback order:**
1. Tavily (primary) — requires `TAVILY_API_KEY`
2. Serper.dev (fallback) — requires `SERPER_API_KEY`
3. Exa (fallback) — requires `EXA_API_KEY`

If no providers are configured, returns `{ success: false, error: "No search providers configured. Set TAVILY_API_KEY, SERPER_API_KEY, or EXA_API_KEY." }`.

**Tool description (what the model sees):**
> Search the web for current information. Returns ranked results with titles, URLs, and snippets. Use this when you need facts, data, news, or answers not in your training data or the user's stored context. For research tasks: search first, then use web_read on the most relevant results to get full page content before answering.

**Rate limiting:** Each paid provider has a configurable daily limit (env vars). When a provider is exhausted, the tool falls through to the next. Defaults: `TAVILY_DAILY_LIMIT=50`, `SERPER_DAILY_LIMIT=50`, `EXA_DAILY_LIMIT=30`.

### 1.2 `web_read` — Read a webpage as clean text

**Purpose:** Fetch a URL and return its content as clean markdown/text, optimized for LLM comprehension.

**Parameters:**
- `url` (string, required) — the URL to read
- `max_length` (number, default 20000) — max characters to return. Content beyond this is truncated.

**Returns:**
```typescript
{
  content: string       // clean markdown/text
  title?: string        // page title if available
  url: string           // the URL that was read
  provider: string      // which provider served the response
  truncated: boolean    // true if content was cut at max_length
}
```

**Provider fallback order:**
1. Jina Reader — GET `https://r.jina.ai/{url}`. Free, no key needed. Returns markdown. Handles PDFs and images.
2. markdown.new — GET `https://markdown.new/{url}`. Free, no key needed. 3-tier conversion pipeline.
3. Raw fetch + Cheerio — `fetch(url)` then strip HTML tags with Cheerio. Last resort, lowest quality.

**No rate limiting.** All providers are free/keyless.

**Tool description:**
> Read a webpage and return its content as clean text. Use after web_search to read full page content, or when the user gives you a URL. Returns markdown-formatted text. If the page is very long, content is truncated — ask for a specific section if needed.

### 1.3 `web_extract` — Extract structured data from HTML

**Purpose:** Fetch a URL and extract specific data using CSS selectors. Returns structured JSON.

**Parameters:**
- `url` (string, required) — the URL to extract from
- `selectors` (object, required) — map of field names to CSS selectors, e.g., `{ "title": "h1", "prices": ".price-tag", "emails": "a[href^='mailto:']" }`
- `multiple` (boolean, default true) — if true, return all matches per selector as arrays. If false, return first match only.

**Returns:**
```typescript
{
  data: Record<string, string | string[]>  // extracted fields
  url: string
}
```

**Implementation:** `fetch(url)` + Cheerio parsing. No external API. No rate limiting.

**Tool description:**
> Extract specific data from a webpage using CSS selectors. Use when you need structured information (prices, names, links, emails, table data) rather than reading the full page. Pass field names mapped to CSS selectors. Returns extracted data as JSON.

### 1.4 `web_crawl` — Crawl linked pages from a starting URL

**Purpose:** Starting from a URL, discover and read linked pages on the same domain. Returns content from multiple pages.

**Parameters:**
- `url` (string, required) — starting URL
- `max_pages` (number, default 5, max 10) — how many pages to read
- `pattern` (string, optional) — URL pattern filter (glob-style), e.g., "/docs/*" to only follow documentation links

**Returns:**
```typescript
{
  pages: Array<{
    url: string
    title?: string
    content: string
  }>
  total_found: number   // total same-domain links discovered (may exceed max_pages)
}
```

**Implementation:** Fetch starting page, extract same-domain `<a href>` links, filter by pattern if provided, read each page using the `web_read` provider cascade (Jina → markdown.new → raw fetch). Cap at `max_pages`.

**No rate limiting.** Uses free read providers. Capped at 10 pages per call.

**Tool description:**
> Crawl a website starting from a URL, following same-domain links. Use to read documentation sites, multi-page articles, or explore a site's structure. Returns content from up to 10 linked pages. Use the pattern parameter to filter which links to follow.

---

## 2. System Prompt Rewrite

### 2.1 New Prompt Structure

The system prompt is rewritten to follow Claude Code's pattern: lean identity, sharp tool guidance, dynamic context.

**Section 1 — Identity (static):**
```
You are BitBit, a personal AI that runs alongside your user's life and work.
You have access to their tasks, contacts, communications, schedule, memory,
and the open web. Use your tools to take action, not just answer questions.
```

**Section 2 — Tool Usage Guidance (static):**
```
## Using your tools
- When you need information you don't have → web_search, then web_read the top results
- When the user provides a URL → web_read to get its content
- When you need specific data from a page (prices, emails, lists) → web_extract with CSS selectors
- When you need to read a multi-page site or docs → web_crawl
- When the user mentions a person → search_contacts to resolve them
- When the user asks about schedule or reminders → get_upcoming
- When you take a significant action → log_activity
- You can call multiple tools in sequence. Search first, read pages, then answer.
- If a tool fails, try an alternative approach before giving up.
- For complex research: search → read top 2-3 results → follow promising links → synthesize with citations.
```

**Section 3 — Dynamic Context (from database):**
- Current date/time
- Kanban columns available
- Active goals
- Current tasks (top 30)
- Known contacts
- Recent activity (last 20)

**Section 4 — Entity Context (conditional):**
- Only injected when user message mentions a known contact
- Relationships, timeline, memories, cross-references (existing assembler.ts logic)

**Section 5 — Voice/Policies (conditional):**
- Only injected if deployment has voice/policy files
- Fix file path resolution for Vercel (use `process.cwd()` or env-based path instead of hardcoded `/home/claude/bitbit/`)

### 2.2 What Gets Removed

- The "Capabilities" bullet list (redundant with tool descriptions)
- The generic "Guidelines" section (replaced by tool usage guidance)
- `systemPromptSuffix` from industry packs (vague, adds no signal)
- Channel summary from filesystem cache (empty on Vercel)
- Calendar/reminders from filesystem cache (empty on Vercel)
- The `persona.name` and `persona.context` interpolation (replaced by fixed identity)

### 2.3 Existing Tool Description Rewrites

Every existing tool gets its description sharpened to the Claude Code pattern: **what it does + when to use it**. Examples:

| Tool | Current Description | New Description |
|------|-------------------|-----------------|
| `create_task` | "Create a new task on the kanban board. Use this when the user asks to add a task, todo, or action item." | "Create a task on the kanban board. Use when the user asks to add a task, todo, or action item. Set priority and column. Returns the created task." |
| `log_activity` | "Log an action to the activity feed for transparency and auditability." | "Log an action to the activity feed. Use after completing significant actions (sending emails, creating tasks, finishing research) so the user can see what you did." |
| `add_memory` | "Store a new memory/knowledge entry. Use to remember user preferences, patterns, and important context." | "Store a memory. Use when the user tells you a preference, pattern, or fact worth remembering across sessions. Don't store ephemeral task details." |
| `search_messages` | "Search across all channel messages by keyword, sender, or channel type." | "Search messages across all connected channels (Gmail, Outlook, iMessage). Use when the user asks about emails, messages, or communications." |

---

## 3. Engine Tweaks

### 3.1 Uncap Iteration Limit

**Current:** `maxIterations = config.maxIterations || 8`

**New:** `maxIterations = config.maxIterations || 50`

The model already stops when it reaches `stop_reason !== 'tool_use'`. The limit is only a safety circuit breaker for genuinely runaway loops. 50 is generous enough for deep research (search → read 5 pages → follow links → synthesize) while still preventing infinite loops.

### 3.2 Tool Execution Timeout

**Current:** No timeout on tool execution. A hanging HTTP request blocks the agent forever.

**New:** 30-second timeout per tool call. Implemented as `Promise.race` between the handler and a timeout rejection in `executeAgentTool`.

On timeout, return `{ success: false, error: "Tool timed out after 30 seconds" }` to the model so it can retry or try an alternative.

### 3.3 Token Budget Awareness

**Current:** No awareness of context window consumption.

**New:** Before each API call in the loop, estimate total tokens in the messages array (rough: total chars / 4). If estimated tokens exceed 80% of the model's context window (200k for Sonnet), yield a `thinking` event: "Context getting large, wrapping up" and add a system message nudging the model to finish.

Not a hard stop — just context pressure. The model can still make one more tool call if needed but will naturally wrap up.

---

## 4. Provider Implementation

### 4.1 Provider Interfaces

```typescript
// src/lib/web/provider-types.ts

interface SearchResult {
  title: string
  url: string
  snippet: string
  score?: number
}

interface SearchResponse {
  results: SearchResult[]
  answer?: string
}

interface WebSearchProvider {
  name: string
  isConfigured(): boolean
  search(query: string, maxResults: number, options?: Record<string, unknown>): Promise<SearchResponse>
}

interface ReadResponse {
  content: string
  title?: string
}

interface WebReadProvider {
  name: string
  isConfigured(): boolean
  read(url: string): Promise<ReadResponse>
}
```

### 4.2 Provider Files

Each provider is a standalone module exporting a single object implementing the interface. No classes, no inheritance, no shared state.

**Search providers:**
- `tavily.ts` — POST to `https://api.tavily.com/search` with `TAVILY_API_KEY`
- `serper.ts` — POST to `https://google.serper.dev/search` with `X-API-KEY: SERPER_API_KEY`
- `exa.ts` — POST to `https://api.exa.ai/search` with `x-api-key: EXA_API_KEY`

**Read providers:**
- `jina.ts` — GET `https://r.jina.ai/{url}` with `Accept: text/markdown`
- `markdown-new.ts` — GET `https://markdown.new/{url}`
- `raw-fetch.ts` — `fetch(url)` + Cheerio `$.text()` to strip HTML

### 4.3 Rate Limiter

```typescript
// src/lib/web/rate-limiter.ts

// In-memory daily counter. Resets at midnight UTC.
// Approximate on Vercel serverless (counters don't persist across cold starts).
// Good enough for cost control — not billing-grade.

function canUse(provider: string): boolean
function recordUse(provider: string): void
function getRemainingQuota(provider: string): number
```

Env var configuration:
- `TAVILY_DAILY_LIMIT` (default 50)
- `SERPER_DAILY_LIMIT` (default 50)
- `EXA_DAILY_LIMIT` (default 30)

---

## 5. File Structure

### New Files
```
src/lib/web/provider-types.ts            — WebSearchProvider, WebReadProvider interfaces
src/lib/web/providers/tavily.ts          — Tavily search provider
src/lib/web/providers/serper.ts          — Serper.dev search provider
src/lib/web/providers/exa.ts             — Exa semantic search provider
src/lib/web/providers/jina.ts            — Jina Reader provider
src/lib/web/providers/markdown-new.ts    — markdown.new provider
src/lib/web/providers/raw-fetch.ts       — fetch + Cheerio fallback provider
src/lib/web/rate-limiter.ts              — in-memory daily counter for paid providers
src/lib/agent/tools/web-tools.ts         — tool definitions + handlers for all 4 web tools
```

### Modified Files
```
src/lib/agent/tools.ts                   — import webToolDefinitions + webToolHandlers, merge into allHandlers
src/lib/agent/engine.ts                  — maxIterations 8→50, add tool timeout (30s), add token budget check
src/lib/agent/prompt-builder.ts          — full rewrite of buildSystemPrompt
package.json                             — add cheerio dependency
```

---

## 6. Environment Variables

### Required for Search (at least one)
```
TAVILY_API_KEY=          # Tavily search API key
SERPER_API_KEY=          # Serper.dev Google SERP API key
EXA_API_KEY=             # Exa semantic search API key
```

### Optional Rate Limits
```
TAVILY_DAILY_LIMIT=50    # Max Tavily searches per day (default 50)
SERPER_DAILY_LIMIT=50    # Max Serper searches per day (default 50)
EXA_DAILY_LIMIT=30       # Max Exa searches per day (default 30)
```

### No Config Needed
- Jina Reader — free, no key
- markdown.new — free, no key
- Cheerio — npm dependency, local
- web_read, web_extract, web_crawl — all use free providers

---

## 7. Error Handling

- **Provider failure:** Try next provider in cascade. If all fail, return error to model with details.
- **No providers configured:** Return clear error message naming the missing env vars.
- **Rate limit hit:** Skip exhausted provider, try next. If all exhausted, return "Search quota exhausted for today."
- **Tool timeout (30s):** Return timeout error to model. Model can retry or try alternative.
- **Invalid URL:** Return error immediately, don't attempt fetch.
- **Large page content:** Truncate at `max_length` (default 20000 chars), set `truncated: true`.
- **Network errors:** Catch, return to model as tool error. Model can retry.

---

## 8. Non-Goals (Explicitly Out of Scope)

- **Conversation history / multi-turn memory** — separate project
- **Sub-agent orchestration** (lead gen, campaigns, tendering agents) — separate project, but identity is written to accommodate future sub-agent access
- **Browser automation** (Browserbase, Playwright) — can be added as a provider later if needed
- **Caching of search/read results** — premature optimization; add if latency becomes an issue
- **Billing-grade usage tracking** — in-memory counters are approximate; move to database if exact tracking needed
