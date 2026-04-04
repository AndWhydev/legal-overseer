# Integrations

## AI & Intelligence

### Anthropic Claude
- **Models**: Haiku (fast/cheap), Sonnet (balanced), Opus (complex reasoning)
- **Routing**: 3-tier model selection based on task complexity
- **Entry point**: `src/lib/ai/provider.ts`
- **Usage**: TAOR loop, response generation, tool planning

### Voyage AI
- **Model**: `voyage-3.5` (1024 dimensions)
- **Usage**: Document and query embeddings for RAG pipeline
- **Entry point**: `src/lib/rag/`

### Google Embeddings
- **Model**: `text-embedding-004` (768 dimensions)
- **Usage**: Alternative embedding model

## Data & Storage

### Supabase
- **Services**: PostgreSQL database + Auth (email/password, OAuth)
- **Entry point**: `src/lib/supabase/`
- **Schema**: 80+ migrations in `supabase/migrations/`
- **Features**: RLS policies, real-time subscriptions, multi-tenant isolation

### Pinecone
- **Index**: `bitbit-rag`
- **Usage**: Hybrid sparse + dense + graph-aware vector retrieval
- **Entry point**: `src/lib/rag/`

### pgvector (via Supabase)
- **Tables**: `entity_nodes`, `entity_edges`, `event_tuples`
- **Usage**: Knowledge graph entity embeddings
- **Entry point**: `src/lib/knowledge-graph/`

### Upstash Redis
- **Usage**: Response caching, rate limiting, session state

## Communication Channels

### Email
- **Gmail** — IMAP integration for inbox reading
- **Outlook** — Azure AD OAuth for Microsoft 365
- **Resend** — Transactional email sending (outbound)
- **Entry point**: `src/lib/channels/`

### Messaging
- **WhatsApp** — Meta Business API
- **Telegram** — Bot API
- **Slack** — Workspace integration
- **iMessage** — macOS native bridge
- **SMS** — Carrier integration

## Productivity

### Asana
- **Usage**: Task and project management sync

### Calendly
- **Usage**: Scheduling and appointment management

### Google Calendar
- **Usage**: Calendar event sync and scheduling

## Payments & Billing

### Stripe
- **Features**: Subscriptions, webhook processing, usage billing
- **Webhook verification**: Signature-based per Stripe best practices

## SEO & Analytics

### Google Search Console
- **Usage**: Search performance data, indexing status

### Google Analytics 4
- **Usage**: Traffic and engagement analytics

## Content Management

### WordPress REST API
- **Usage**: Content publishing and management

## Monitoring

### Sentry
- **Sampling**: 10% of transactions
- **Usage**: Error tracking, performance monitoring

## Security

### Credential Encryption
- **Algorithm**: AES-256-GCM
- **Usage**: All stored third-party credentials are encrypted at rest

### Webhook Verification
- Per-service signature verification (Stripe, Slack, etc.)
