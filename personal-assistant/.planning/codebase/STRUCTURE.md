# Structure

## Top-Level Layout

```
personal-assistant/
├── src/                    # Application source code
├── supabase/               # Database migrations (80+)
├── scripts/                # Build and utility scripts
├── public/                 # Static assets
├── .planning/              # Planning documents
├── next.config.ts          # Next.js configuration
├── vitest.config.ts        # Test configuration
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```

## src/ Directory

### `src/app/` — Next.js App Router

Route groups and pages:

- `src/app/(auth)/` — Authentication flows (login, signup, reset)
- `src/app/(portal)/` — Authenticated user portal
- `src/app/(public)/` — Public-facing pages
- `src/app/api/` — API route handlers (chat, webhooks, cron)
- `src/app/dashboard/` — Dashboard views

### `src/components/` — React Components

31 domain-specific component directories. Components are organized by feature domain rather than atomic design.

### `src/lib/` — Core Business Logic

65+ modules containing all non-UI logic:

```
src/lib/
├── agent/              # TAOR loop engine + tool definitions (60+ files)
├── ai/                 # Model provider, routing, streaming
├── intelligence/       # Analytics and insight engines
├── memory-palace/      # Episodic + semantic memory management
├── knowledge-graph/    # Entity graph (pgvector, NEW)
├── context-assembly/   # 4-tier context building pipeline
├── rag/                # Hybrid retrieval (sparse + dense + graph)
├── proactive/          # Signal → Decision → Action pipeline
├── channels/           # Multi-channel integrations
│   ├── gmail/          # IMAP integration
│   ├── outlook/        # Azure AD OAuth
│   ├── whatsapp/       # Meta Business API
│   ├── telegram/       # Bot API
│   ├── slack/          # Workspace integration
│   └── ...
├── supabase/           # Database client, queries, helpers
├── core/               # Logger, config, shared utilities
├── __tests__/          # Integration test directory
│   └── integration/
└── __test-helpers__/   # Test utilities (e.g., supabase-integration.ts)
```

### `src/hooks/` — React Hooks

Custom hooks for client-side state and data fetching.

### `src/types/` — TypeScript Definitions

Shared type definitions and interfaces.

### `src/styles/` — Styling

Tailwind configuration and global CSS.

## supabase/

```
supabase/
├── migrations/         # 80+ sequential migration files
├── seed.sql            # Development seed data
└── config.toml         # Supabase project configuration
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/agent/taor-loop.ts` | Core agent execution loop |
| `src/lib/agent/tool-executor.ts` | Tool invocation and result handling |
| `src/lib/ai/provider.ts` | Model selection and API client |
| `src/lib/context-assembly/` | Context building pipeline |
| `src/lib/rag/` | Retrieval-augmented generation |
| `src/lib/core/logger.ts` | Structured JSON logging |
| `src/app/api/` | All API route handlers |
