# Stack

## Runtime & Package Management

- **Runtime**: Node.js 20+
- **Package Manager**: npm workspaces

## Framework

- **Next.js** 16.1.6 (App Router, Turbopack)
- **React** 19.2.3
- **TypeScript** (strict mode)

## Styling

- **TailwindCSS** 4.2.2
- **Framer Motion** (animations)

## AI / LLM

- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude Haiku, Sonnet, Opus (3-tier model routing)
- **Vercel AI SDK** v6 (`ai`) — streaming, tool calling, structured output
- **Voyage AI** — embeddings (`voyage-3.5`, 1024 dimensions)
- **Google** — embeddings (`text-embedding-004`, 768 dimensions)

## Vector & Search

- **Pinecone** (`@pinecone-database/pinecone`) — `bitbit-rag` index, hybrid sparse+dense retrieval
- **pgvector** — entity graph embeddings (via Supabase PostgreSQL)

## Database

- **Supabase PostgreSQL** — primary data store, 80+ migrations, RLS policies
- **Client**: `@supabase/supabase-js`

## Cache

- **Upstash Redis** — response caching, rate limiting

## Email

- **Resend** — transactional email delivery

## Payments

- **Stripe** — subscriptions, webhooks, usage billing

## Monitoring

- **Sentry** — error tracking, 10% sampling rate

## Testing

- **Vitest** 4.0.18 — unit and integration tests
- **Playwright** — end-to-end tests

## Build & Deploy

- **Turbopack** — development bundler
- **Vercel** — production deployment platform

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Database client + auth |
| `@anthropic-ai/sdk` | Claude API access |
| `ai` | Vercel AI SDK (streaming, tools) |
| `@pinecone-database/pinecone` | Vector search |
| `resend` | Email sending |
| `stripe` | Payment processing |
| `swr` | Client-side data fetching |
| `framer-motion` | UI animations |
| `zod` | Runtime schema validation |
