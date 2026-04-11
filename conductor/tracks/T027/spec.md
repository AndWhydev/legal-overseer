# T027 — Agent Superpower Toolkit

## Vision

Transform BitBit agents from "chatbot with a kanban board" into an autonomous assistant with real-world capabilities: web research, browser automation, outbound comms, credential vault access, and extensible skill system. Reference: OpenClaw's 13,700+ community skills and portable skill format.

## Workstreams

### WS1: Web Research Tools (P0 — blocks live test)

**Goal**: Agent can research anything on the internet and read any webpage.

#### WS1.1: `web_search` tool
- Backend: Brave Search API (independent 30B+ page index, $5/1000 queries, privacy-first)
- Free tier: 2,000 queries/month — sufficient for beta
- Tool schema: `{ query: string, count?: number }` → returns ranked results with titles, URLs, snippets
- Add to `src/lib/agent/tools.ts` as new tool definition + handler
- Handler: `fetch('https://api.search.brave.com/res/v1/web/search?q=...')` with API key from env
- Env var: `BRAVE_SEARCH_API_KEY`

#### WS1.2: `fetch_url` tool
- Fetch any URL → extract readable text → truncate to fit context
- Dependencies: `node-fetch` (already available) + `@extractus/article-extractor` or `mozilla/readability` + `jsdom`
- Tool schema: `{ url: string, max_chars?: number }` → returns `{ title, content, url }`
- Handles HTML pages, JSON APIs, plain text
- Respects robots.txt? Optional — can skip for beta
- Max response: 8000 chars (configurable) to avoid context blowout

### WS2: Outbound Communication Tools (P0 — blocks live test)

**Goal**: Agent can send emails and SMS on the user's behalf (with approval routing).

#### WS2.1: `send_email` tool
- Backend: Resend API (already configured, domain verified)
- Tool schema: `{ to: string, subject: string, body: string, reply_to?: string }`
- Sender: `bitbit@bitbit.chat` (or org-configured sender)
- Default confidence routing: `ask` (requires user approval before sending)
- Handler: calls Resend SDK, logs to activity feed + conversation adapter

#### WS2.2: `send_sms` tool
- Backend: Telnyx API (already configured, phone +61480089862)
- Tool schema: `{ to: string, message: string }`
- Default confidence routing: `ask` (requires approval)
- Handler: calls Telnyx messaging API, logs to activity feed

### WS3: Browser Automation (P1 — nice for live test, not blocking)

**Goal**: Agent can navigate websites, fill forms, extract structured data, take screenshots.

#### WS3.1: `browse_website` tool
- Backend: Playwright headless Chromium (server-side, in Fly container or Vercel serverless)
- Tool schema: `{ url: string, action: 'extract' | 'screenshot' | 'navigate', selector?: string, instructions?: string }`
- `extract`: Navigate to URL, return page text/structured data
- `screenshot`: Navigate to URL, return base64 PNG (for vision model analysis)
- `navigate`: Multi-step — follow instructions like "click Login, fill email field with X"
- For beta: run Playwright in the existing Fly worker (add headless Chrome to Dockerfile)
- Future: Stagehand v3 for AI-native CDP interaction, or Browserbase for managed infra

### WS4: Credential Vault (P2 — Tor's personal superpower, not blocking beta)

**Goal**: Agent can securely access stored credentials to authenticate with services.

#### WS4.1: 1Password Connect Server on Fly
- Deploy 2 containers: `1password/connect-api` + `1password/connect-sync`
- Shared encrypted volume for data sync
- REST API: `GET /v1/vaults/{id}/items/{id}` with bearer token
- Agent tool: `get_credential(service_name)` → looks up by title in vault
- Only available for Tor's org initially (1Password account required)

#### WS4.2: Generic credential tool for all users
- Uses existing `credentials.ts` encrypted store
- Tool: `get_stored_credential(provider)` → decrypts from Supabase
- Already partially built — just needs a tool wrapper

### WS5: Skill Extensibility Framework (P2 — design now, build post-beta)

**Goal**: Portable skill format inspired by OpenClaw's ClawHub, allowing community/custom skills.

#### WS5.1: Skill definition format
- Each skill: `{ name, description, input_schema, handler_url_or_function, confidence_default }`
- Skills can be: built-in (shipped with BitBit), org-installed (from marketplace), custom (user-defined)
- Storage: `skills` table in Supabase with org_id scope

#### WS5.2: Skill marketplace (future)
- Browse/install skills from a registry
- Inspired by OpenClaw ClawHub (13,700+ skills)
- Skills reference: humanizer (outbound message cleanup), summarizer, translator, code executor

### WS6: Per-User Agent Environments (P3 — post-beta architecture)

**Goal**: Each user gets an isolated, persistent compute environment for their agents.

#### WS6.1: Fly Sprites integration
- Per-user Linux VMs that sleep to zero ($0 idle, ~$0.01/hr active)
- Create in 1-2s, checkpoint in 300ms, 100GB durable storage
- Agent tasks dispatch to user's Sprite, execute with full credential context, sleep
- Browser, 1Password CLI, filesystem all persist between sessions

## Implementation Order

| Phase | Workstreams | Effort | Blocks |
|-------|------------|--------|--------|
| **Phase 1** | WS1.1 + WS1.2 + WS2.1 + WS2.2 | 2-3 hours | Live test |
| **Phase 2** | WS3.1 (basic Playwright) | 1 day | - |
| **Phase 3** | WS4.1 + WS4.2 + WS5.1 | 2-3 days | - |
| **Phase 4** | WS6.1 + WS5.2 | 1-2 weeks | - |

## Acceptance Criteria

### Phase 1 (live test ready)
- [ ] Agent responds to "search for X" by calling Brave API and summarizing results
- [ ] Agent responds to "read this URL" by fetching and extracting page content
- [ ] Agent responds to "email X about Y" by drafting, seeking approval, then sending via Resend
- [ ] Agent responds to "text X about Y" by drafting, seeking approval, then sending via Telnyx
- [ ] All 4 tools appear in agent tool list and execute correctly in the tool_use loop
- [ ] Confidence routing: send_email and send_sms default to 'ask' (user must approve)

### Phase 2
- [ ] Agent can navigate to a URL and extract structured text
- [ ] Agent can take a screenshot and describe what it sees (via vision)
- [ ] Playwright runs in Fly container with headless Chromium

### Phase 3
- [ ] Tor can ask agent to fetch a credential by service name from 1Password
- [ ] Skills can be defined and registered per-org
- [ ] At least 3 reference skills installed (humanizer, summarizer, web-search)

### Phase 4
- [ ] Per-user Fly Sprite provisioned on first agent task
- [ ] Sprite sleeps after 5min idle, wakes on next task
- [ ] Credentials and browser state persist across sleep/wake cycles

## Reference Material

- OpenClaw GitHub: https://github.com/openclaw/openclaw (68K stars, skill format reference)
- OpenClaw ClawHub: 13,700+ community skills
- Brave Search API: https://brave.com/search/api/ ($5/1000 queries, 2000 free/month)
- Stagehand v3: Browserbase's AI-native CDP browser automation
- Fly Sprites: Persistent sleep-to-zero VMs (launched Jan 2026)
- 1Password Connect: https://developer.1password.com/docs/connect/ (self-hosted REST API)
- Perplexity MCP: `npx -y @perplexity-ai/mcp-server` (Sonar Pro, Deep Research)
- Composio: https://composio.dev/ (1000+ pre-built tool integrations, managed auth)
- BitBit tool system: `src/lib/agent/tools.ts` (Anthropic tool_use format, handler registry)
