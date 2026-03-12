# Conversation UI Patterns Research — BitBit Synthesis

**Date**: 2026-03-13
**Purpose**: Inform whether BitBit should have a conversation pop-out, sidebar, or other AI chat interface pattern.

---

## Part 1: Platform Survey

### 1. Perplexity AI

| Aspect | Details |
|--------|---------|
| **Layout** | Full-page, search-centric. Center column for responses with generous whitespace. Side pane for research outlines. |
| **History/switching** | "Library" in left sidebar. Semantic topic summaries (not generic titles). Threads organized into "Spaces" (folder-like). Branching creates derivative threads with preserved upstream context. |
| **Agent activity** | "Thinking Panel" narrates reasoning in real-time during Research Mode — shows queries being executed, papers analyzed, information gaps identified. Sub-tasks visible as discrete steps in a research timeline. |
| **Mobile vs desktop** | Mobile is voice-first. iOS share sheet integration, Android can replace default assistant. Compact scroll layout, no side panes. Labs section desktop-only. |
| **Unique patterns** | Three distinct modes (Search / Research / Labs) with different UIs for each. "Pages" feature converts threads into wiki-style knowledge docs. Inline citation chips throughout responses. |

### 2. Manus AI

| Aspect | Details |
|--------|---------|
| **Layout** | Task-oriented full-page. Organized around workflow execution, not sequential chat. |
| **History/switching** | History organized by completed workflows and tasks, not message chronology. Preserves operational context (tools used, parameters, refinements). |
| **Agent activity** | Real-time task execution status. Shows the agent navigating applications, interacting with UIs, completing workflows. Distinct from "thinking" — this is "doing." |
| **Mobile vs desktop** | Primarily desktop-focused. |
| **Unique patterns** | **Skill Creator** — watches how you complete a task, captures the workflow, packages it as reusable. "Operational memory" — remembers HOW you prefer tasks done, not just WHAT you said. Can create slides, build websites, generate designs within the conversation. |

### 3. Claude (claude.ai)

| Aspect | Details |
|--------|---------|
| **Layout** | Full-page chat with left sidebar. Minimalist, reading-focused. Artifact panel appears alongside conversation for code/docs/apps. |
| **History/switching** | Left sidebar with recent conversations. Projects group related chats with shared files and per-project custom instructions. |
| **Agent activity** | Artifact system implicitly shows tool use (code generation, visualization). "Custom Visuals" for ephemeral diagrams/flowcharts. Extended thinking shown in collapsible blocks. |
| **Mobile vs desktop** | Native apps on iOS, Android, macOS, Windows. Mobile is streamlined but retains projects/files/memory. |
| **Unique patterns** | **Artifacts as workspace** — persistent interactive apps (games, calculators, visualizations) live alongside chat. Users edit artifacts via natural language without code literacy. Two-tier visualization: ephemeral custom visuals vs persistent artifacts. |

### 4. ChatGPT

| Aspect | Details |
|--------|---------|
| **Layout** | Full-page with persistent left sidebar. Canvas creates split-view (chat + editing workspace). |
| **History/switching** | Sidebar with conversation list. Projects system for grouping + sharing. **Branching** — fork any message into a parallel thread. Adjustable sidebar width on larger screens. |
| **Agent activity** | Reasoning models show extended thinking with collapsible blocks. Operator shows browser-based task execution with visible browser state. Canvas shows inline code execution with console output. |
| **Mobile vs desktop** | Mobile supports branching (long-press to fork). Voice mode with animated visual indicator. |
| **Unique patterns** | **Canvas** — dedicated editing panel for writing/code with version history, inline suggestions, "fix bug" button, reading level adjustment. **Operator** — visible browser automation with explicit handoff for sensitive actions (login, payment). **Memory** — both explicit (user-saved) and implicit (inferred from patterns). |

### 5. Google Gemini

| Aspect | Details |
|--------|---------|
| **Layout** | Full-page, search-integrated. Responses incorporate real-time search results as integral elements, not supplements. |
| **History/switching** | Conversation history integrated with Google Workspace. Model selection via dropdown. |
| **Agent activity** | Deep Research shows "Thinking Panel" with reasoning narration. Planning view lets users review/refine research approach before execution. Up to 1M token context window. |
| **Mobile vs desktop** | Mobile is streamlined with voice emphasis. Desktop has Labs section and advanced controls. |
| **Unique patterns** | **Canvas** for document/code creation within search context. Native multimodal — images/video treated as first-class inputs, not add-ons. Deep integration with Google ecosystem (Workspace, Search, Maps). |

---

## Part 2: Business/Productivity Platform Patterns

### Floating Widget (Intercom, HubSpot, Drift)

- Bottom-right floating launcher, expands to chat panel overlay
- Conditional triggers: exit intent, time-on-page, scroll depth
- Multi-state: available vs away, with different behaviors and messaging for each
- Bot-to-human handoff is a first-class design concern — explicit routing, expectation management, and context preservation
- HubSpot deploys same agent across Facebook, WhatsApp, and web chat
- Performance matters: 5+ second load delay recommended to avoid degrading page performance

### Sidebar (Microsoft Copilot, Notion AI, Slack AI)

- **Copilot in Edge/Office**: Right sidebar, draws from page context (URL, content, open docs). Preserves primary workflow.
- **Notion AI**: Sidebar within workspace. Searches across integrated apps (Slack, Google Drive). Always-available without consuming main screen space.
- **Slack AI**: Conversation summaries, AI answers at top of search results with interactive source citations. Makes latency visible ("searching documents...").

### Inline Augmentation (Linear, Superhuman, GitHub Copilot)

- **Linear**: Triage Intelligence surfaces suggestions directly within issue management — no separate chat needed.
- **Superhuman**: AI drafting inline in email composer. Separate "Ask AI" sidebar opens only for complex non-drafting tasks.
- **GitHub Copilot**: Plan agent breaks down tasks within the IDE. Sessions view monitors multiple parallel agent sessions.

---

## Part 3: Agentic Action Visualization Patterns

### How leading platforms show agent tool execution:

| Pattern | Platform | Description |
|---------|----------|-------------|
| **Browser automation visibility** | OpenAI Operator | Shows agent navigating websites in real-time. Explicit handoff for sensitive actions. |
| **Generative UI** | Marketeam.ai | Agents compile custom JavaScript UIs on-the-fly — builds the exact tool needed, not a template. |
| **Tool-call render** | AI SDK pattern | Distinct states: initiation ("Checking database..."), execution (streaming), completion (result replaces loader), error handling. |
| **Live reasoning** | V7 Go | Real-time reasoning display, tool/skill attribution at each step, visible to-do list for multi-step tasks. |
| **Artifact panel** | Claude | Separates generated content (code, apps, docs) from chat into dedicated interactive panel. |
| **Parallel execution** | Kore.ai | Multiple independent tasks run simultaneously with convergent results. 15s sequential -> 5s parallel. |
| **Approval workflows** | MS Copilot Studio | Multi-stage: manual approval + AI approval stages with explicit rationale. Humans remain in control. |

### Key principle: **Transparency builds trust**

- Users are patient with latency when they understand what is happening
- Black-box responses create anxiety; visible reasoning creates confidence
- Sensitive actions MUST have explicit human decision points

---

## Part 4: Synthesis for BitBit

### What makes BitBit different from these platforms

BitBit is not a chatbot. It is not a search engine. It is an **agentic business assistant** with unique characteristics:

1. **Multi-channel inbox**: WhatsApp, SMS, email, and future channels all feed into unified threads. The AI needs access to this cross-channel context.
2. **Business actions**: Approvals, invoice processing, task creation, email sending, contact management — these are not "responses," they are operations.
3. **Always-on agents**: Background agents work autonomously (lead scoring, contact timing, pattern extraction). The user needs to see what they have done, not just chat with them.
4. **Dashboard-first**: Users live in the BitBit dashboard. The AI should meet them there, not pull them into a separate app.
5. **Context Baseplate**: BitBit compiles a "world model" of the user's business — the AI conversation should leverage and surface this context.

### What patterns to adopt

#### Recommended: **Hybrid Sidebar + Inline Actions**

Not a floating widget. Not a full-page chat. A **persistent right sidebar** that can be toggled from any dashboard page, combined with **inline action cards** in the main content area.

#### The Sidebar ("BitBit Assistant")

- **Trigger**: Persistent icon in the top nav bar (or keyboard shortcut, e.g. Cmd+B). Opens a right sidebar panel (~380px wide).
- **Always available**: Unlike a pop-out that covers content, a sidebar coexists with whatever page the user is on (kanban board, leads, invoices, analytics).
- **Context-aware**: The sidebar knows which page the user is viewing. On the Invoices page, it can say "I noticed 3 invoices are overdue. Want me to send reminders?" On the Kanban board, it can summarize task progress.
- **Conversation history**: Simple chronological list in a collapsible header. But conversations are organized by topic/project, not just timestamps. Inspired by Perplexity's semantic summaries.
- **Agent activity feed**: Below the chat input, a collapsible "Agent Activity" section shows what background agents have done since the user last checked — similar to a notification feed but richer. Each item is an action card (e.g., "Lead Scorer ranked 3 new leads", "Pattern Extractor found a billing trend").

#### Action Cards (not just text)

When the AI performs or proposes actions, these should NOT be plain text messages. They should be **structured action cards** inline in the conversation:

```
+--------------------------------------------------+
| APPROVAL REQUEST                                  |
| Invoice #4521 from Acme Corp — $2,340.00         |
| Due: March 18, 2026                               |
|                                                   |
| [Approve]  [Reject]  [View Invoice]              |
+--------------------------------------------------+
```

```
+--------------------------------------------------+
| EMAIL DRAFT                                       |
| To: sarah@client.com                              |
| Subject: Follow-up on Q1 proposal                 |
| "Hi Sarah, Following up on our conversation..."   |
|                                                   |
| [Send]  [Edit]  [Discard]                         |
+--------------------------------------------------+
```

```
+--------------------------------------------------+
| AGENT COMPLETED                                   |
| Contact Timing Analyzer finished                  |
| - Analyzed 47 contacts                            |
| - Best reach time for Andy: Tue/Thu 10-11am       |
| - 3 contacts flagged as "going cold"              |
|                                                   |
| [View Full Report]  [Dismiss]                     |
+--------------------------------------------------+
```

This follows the **tool-call render pattern** — distinct visual states for pending, executing, completed, and error. It also follows the Copilot Studio approach of mixing AI decisions with human approval points.

#### Thinking/Reasoning Visibility

When the AI is working on something non-trivial:

```
Thinking...
  Searching contact history for Sarah Chen
  Checking recent email threads (3 found)
  Analyzing sentiment of last interaction
  Drafting response...
```

Collapsible by default, expandable for users who want transparency. This directly adopts the Perplexity/Gemini "Thinking Panel" pattern.

#### Mobile Behavior

- Sidebar becomes a **full-screen overlay** on mobile (slide up from bottom, like iOS sheets).
- Voice input prominently available (following Perplexity's voice-first mobile approach).
- Action cards remain interactive — approve/reject with one tap.
- Agent activity feed accessible from a tab within the overlay.

### What patterns to avoid

| Pattern | Why not for BitBit |
|---------|-------------------|
| **Floating chat widget** (Intercom-style) | BitBit users are authenticated dashboard users, not anonymous website visitors. A widget feels like customer support, not a business partner. |
| **Full-page chat** (ChatGPT/Claude style) | BitBit's value is the dashboard — tasks, leads, invoices, analytics. A full-page chat abandons that context. Chat should augment the dashboard, not replace it. |
| **Separate chat app** | Forces context switching. The AI should live where the work lives. |
| **Command palette only** (Linear style) | Too minimal for BitBit's needs. Users need to see agent activity, pending approvals, and multi-turn conversations — a command palette cannot hold this. |

### Recommended Implementation Phases

**Phase 1: Sidebar Foundation**
- Toggle-able right sidebar from any page
- Basic chat with the AI (text in, text out)
- Context injection: sidebar knows current page and can reference it
- Conversation history with semantic titles

**Phase 2: Action Cards**
- Structured cards for approvals, email drafts, task creation
- Inline approve/reject/edit buttons
- Tool-call render pattern (pending -> executing -> completed states)

**Phase 3: Agent Activity Feed**
- Background agent results surfaced in the sidebar
- Collapsible "what happened while you were away" section
- Link each activity to its source (lead scorer -> leads page, etc.)

**Phase 4: Thinking Transparency**
- Collapsible reasoning steps for complex queries
- Show which tools/agents are being invoked
- Real-time progress for multi-step operations

**Phase 5: Mobile + Voice**
- Full-screen sheet overlay on mobile
- Voice input with hands-free response
- Push notifications for high-priority agent actions requiring approval

### Technical Considerations

- **State management**: Use AG-UI event pattern (RunStarted, StepStarted, StepFinished, RunError) for real-time agent status
- **Context injection**: Sidebar component receives current route + page data as context for the AI
- **Streaming**: Token-by-token streaming for responses; event-based updates for tool execution
- **Persistence**: Conversations stored in Supabase, linked to org_id and user_id
- **Keyboard shortcut**: Cmd+B (or Cmd+/) to toggle sidebar — follows Notion/Linear conventions
- **Width**: 380px default, resizable up to 500px. Collapses to icon on screens < 1200px

---

## Appendix: Key Takeaways by Platform

| Platform | Core Insight for BitBit |
|----------|------------------------|
| Perplexity | Semantic conversation summaries, mode-switching (quick vs deep), transparent reasoning |
| Manus | "Operational memory" — remember HOW the user prefers tasks done, not just WHAT they said |
| Claude | Artifact panel pattern — separate generated content from conversation flow |
| ChatGPT | Canvas for editing, branching for exploration, project-based organization |
| Gemini | Deep research with planning review before execution, native multimodal |
| HubSpot | Multi-channel agent deployment, conditional triggers, bot-to-human handoff |
| Copilot | Sidebar that draws from page context, preserves primary workflow |
| Superhuman | Inline AI in the workflow (email composer), separate sidebar only for complex tasks |
| Linear | Inline suggestions without separate chat — augment, don't interrupt |
| Operator/Devin | Visible browser/tool execution, explicit handoff for sensitive actions |

---

## Sources

Research conducted via Perplexity Deep Research (2026-03-13), covering 44 primary sources including platform documentation, UX analysis articles, developer documentation, and product announcements from 2025-2026.
