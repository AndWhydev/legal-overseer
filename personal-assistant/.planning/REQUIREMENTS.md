# Requirements: BitBit v2.0 Chat-First UI Redesign

**Defined:** 2026-04-08
**Core Value:** Chat is the product. The agent does work; the UI surfaces results.

## v2.0 Requirements

### Shell & Navigation

- [ ] **SHELL-01**: App displays mode tabs (Chat / Work) centered at top of window
- [ ] **SHELL-02**: Clicking a mode tab switches the sidebar items and main content area
- [ ] **SHELL-03**: Chat mode sidebar shows: + New chat, Search, Customize, Chats, Projects, Artifacts, then Recents list
- [ ] **SHELL-04**: Work mode sidebar shows: + New task, Search, Scheduled, Projects, Dispatch, Ideas, Customize, then Recents list
- [ ] **SHELL-05**: Recents list displays conversation/task history with truncated titles
- [ ] **SHELL-06**: User profile avatar at bottom-left opens dropdown with Settings, Billing, Appearance, Sign out
- [ ] **SHELL-07**: Previous 28-tab flat nav is removed from sidebar
- [ ] **SHELL-08**: Sidebar is collapsible (toggle via button or keyboard shortcut)

### Chat Experience

- [ ] **CHAT-01**: Chat is the default landing view when app opens (no separate dashboard page)
- [ ] **CHAT-02**: Opening the app starts a new thread with Daily Brief as BitBit's first message
- [ ] **CHAT-03**: Daily Brief includes: email triage summary, calendar for today, attention-needed tasks, overnight agent activity
- [ ] **CHAT-04**: Mentioning or referencing a contact in chat triggers their contact card in the right context panel (DrawerSlot)
- [ ] **CHAT-05**: Mentioning or creating an invoice in chat triggers invoice preview in the right context panel
- [ ] **CHAT-06**: Quick action suggestion chips appear below the input field on new chat (e.g., Write, From Email, From Calendar)
- [ ] **CHAT-07**: Chat input supports "Type / for skills" prompt pattern
- [ ] **CHAT-08**: Conversation title shown at top of chat area with dropdown for rename/actions

### Typography & Visual

- [ ] **TYPO-01**: App uses system font stack with anti-aliasing disabled on macOS (-webkit-font-smoothing: none)
- [ ] **TYPO-02**: Font weight hierarchy matches Claude Desktop density: clear size/weight distinction between headings, body, labels, muted text
- [ ] **TYPO-03**: Dashboard overview widgets removed (relationship health, financial snapshot, chart suite, agent metrics, weekly ops)
- [ ] **TYPO-04**: Overall visual density is information-rich but clean (Claude Desktop-level spacing)

### Agent Tool Layer

- [ ] **TOOL-01**: Removed tabs (Invoices, Contacts, Leads, Tasks, etc.) are accessible as feature-gated views via Cmd+K search
- [ ] **TOOL-02**: BitBit can open a feature-gated view by dropping a clickable link in chat (e.g., "Here are your invoices → [View all]")
- [ ] **TOOL-03**: Core tab logic (CRUD operations, data display) refactored into internal agent-callable functions
- [ ] **TOOL-04**: Agent can create, read, update invoices without user navigating to a dedicated page
- [ ] **TOOL-05**: Agent can query and display contacts, leads, tasks through chat responses
- [ ] **TOOL-06**: Swarm orchestration, sentry monitoring, ad scripts operate as agent-only tools (no user-facing UI)

## v2.1 Requirements (Deferred)

### Multi-Channel Delivery

- **CHAN-01**: Daily Brief sends to iMessage via Sendblue
- **CHAN-02**: Daily Brief sends to WhatsApp
- **CHAN-03**: Daily Brief sends to email
- **CHAN-04**: User can configure preferred delivery channels in settings

### Advanced Modes

- **MODE-01**: Third mode tab (Data/Admin) for power-user views
- **MODE-02**: Agent activity stream showing real-time orchestration

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native desktop app (Electron/Tauri) | Web-first, native later |
| Real-time collaborative editing | Single-user product for now |
| Offline support | Requires service worker complexity, defer |
| Voice input in chat | Nice-to-have, not core to redesign |
| Complete CRM rebuild | Existing CRM logic preserved, just re-surfaced via chat |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | — | Pending |
| SHELL-02 | — | Pending |
| SHELL-03 | — | Pending |
| SHELL-04 | — | Pending |
| SHELL-05 | — | Pending |
| SHELL-06 | — | Pending |
| SHELL-07 | — | Pending |
| SHELL-08 | — | Pending |
| CHAT-01 | — | Pending |
| CHAT-02 | — | Pending |
| CHAT-03 | — | Pending |
| CHAT-04 | — | Pending |
| CHAT-05 | — | Pending |
| CHAT-06 | — | Pending |
| CHAT-07 | — | Pending |
| CHAT-08 | — | Pending |
| TYPO-01 | — | Pending |
| TYPO-02 | — | Pending |
| TYPO-03 | — | Pending |
| TYPO-04 | — | Pending |
| TOOL-01 | — | Pending |
| TOOL-02 | — | Pending |
| TOOL-03 | — | Pending |
| TOOL-04 | — | Pending |
| TOOL-05 | — | Pending |
| TOOL-06 | — | Pending |

**Coverage:**
- v2.0 requirements: 26 total
- Mapped to phases: 0
- Unmapped: 26 (roadmap pending)

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after initial definition*
