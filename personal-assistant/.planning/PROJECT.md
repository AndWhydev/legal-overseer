# BitBit — Agentic AI Operations Platform

Personal-first AI operations platform with optional org layer.
Stack: Next.js 16, React 19, TypeScript 5, Supabase, Anthropic SDK, TailwindCSS 4.

## Completed Milestones

### v1.0: Production Dashboard
- 28-tab SPA shell with sidebar navigation
- Chat interface with streaming, artifacts, tool calls
- CRM: contacts, leads, invoices, companies
- Agent orchestration: swarm, workflows, sentry
- Module gating by plan tier
- DrawerSlot context panel system

### v1.1: Cognitive Memory OS (Phases 35-40)
- Entity graph (pgvector, HNSW indexes)
- Graph-aware retrieval (hybrid scoring)
- Contextual retrieval (Haiku contextualizer)
- Sleep consolidation (5-stage nightly pipeline)
- Adaptive query routing (rule-based classifier)
- Predictive loading + procedural memory

## Current Milestone: v2.0 Chat-First UI Redesign

**Goal:** Transform BitBit from a 28-tab SPA into a Claude Desktop-style chat-first interface where conversation is the primary interaction model and agent capabilities replace dedicated UI pages.

**Design references:**
- Claude Desktop (Chat/Cowork/Code modes with context-aware sidebar)
- alfred_ (Daily Brief, overnight autonomous processing)
- Manus (system font + AA off on macOS)

**Target features:**
- Chat as the default home screen with Daily Brief as first message
- Mode tabs at top (Chat / Work — mirroring Claude Desktop's Chat / Cowork)
- Context-aware sidebar that changes per mode (threads, search, projects, customize)
- Right-side context panel (DrawerSlot) surfaces entity cards, invoice previews, project status
- Typography overhaul (system font, Claude Desktop-quality weight hierarchy)
- Feature-gated views accessible via Cmd+K / agent links (invoices, contacts, tasks)
- Agent CLI layer — removed tab functionality becomes internal agent-callable tools
- Multi-channel Daily Brief delivery (iMessage/Sendblue, WhatsApp, email)
- Recents list in sidebar showing conversation history
- User profile dropdown at bottom (settings, billing, appearance — not nav items)

**Architecture principle:** The UI gets simpler while the agent gets more powerful. Tabs become agent tools, not user-facing pages.
