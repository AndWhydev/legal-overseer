# BitBit — Tech Stack

## Languages

- **TypeScript 5** — all application code
- **SQL** — Supabase migrations (PostgreSQL)
- **CSS** — TailwindCSS 4 with custom design system

## Frameworks

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js | 16.1.6 |
| React | React | 19.2.3 |
| CSS framework | TailwindCSS | 4.x |
| Database | Supabase (PostgreSQL) | - |
| AI SDK | @anthropic-ai/sdk | 0.74.0 |
| Error monitoring | @sentry/nextjs | 10.40.0 |

## Key Dependencies

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| @supabase/supabase-js | 2.95.3 | Database client |
| @supabase/ssr | 0.8.0 | Server-side Supabase auth |
| radix-ui | 1.4.3 | Accessible UI primitives |
| lucide-react | 0.567.0 | Icons |
| motion | 12.34.3 | Animation library |
| react-markdown | 10.1.0 | Markdown rendering in chat |
| remark-gfm | 4.0.1 | GitHub-flavored markdown |
| recharts | 3.7.0 | Charts/analytics |
| resend | 6.9.2 | Transactional email |
| class-variance-authority | 0.7.1 | Component variants |
| clsx + tailwind-merge | 2.1.1 / 3.4.1 | Class merging |
| @dnd-kit/* | 6.3.1+ | Drag and drop |
| imapflow | 1.2.9 | IMAP email integration |
| simple-icons | 14.0.0 | Brand icons for connections |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| vitest | 4.0.18 | Unit/integration testing |
| @playwright/test | 1.58.2 | E2E testing |
| eslint + eslint-config-next | 9.x / 16.1.6 | Linting |
| @tailwindcss/postcss | 4.x | CSS processing |

## Infrastructure

| Service | Purpose | Region |
|---------|---------|--------|
| Vercel | Dashboard hosting & serverless functions | Auto |
| Supabase | Database, auth, realtime, storage | ap-southeast-2 |
| Telnyx | SMS channel | - |
| Resend | Transactional email | - |
| Stripe | Billing (scaffolded) | - |

## Monorepo Structure

```
bitbit/                      # npm workspaces root
  personal-assistant/        # Main Next.js app (deployed)
  packages/core/             # Shared types and utilities
  packages/agents/           # 10 specialist agent packages
  deployments/               # Per-client deployment configs (awu, torkay, demo, etc.)
  landing-page/              # Marketing site
  demo-1/                    # Demo app
```

**Package manager**: npm (with workspaces)
**Node requirement**: >=20
**Build**: `next build --webpack` (webpack mode, turbopack available for dev)

## Database

- **Engine**: PostgreSQL via Supabase
- **Migrations**: 54 SQL migration files in `personal-assistant/supabase/migrations/`
- **Auth**: Supabase Auth with RLS policies
- **Tenancy**: Dual-tier — personal orgs (auto-created) + shared orgs
- **Key patterns**: RLS on all tables, `org_id` scoping, `created_by` tracking

## AI Models

- **Primary**: Claude (via @anthropic-ai/sdk)
- **Agent routing**: Confidence-based — high confidence = auto-act, low = ask user
- **Background**: Haiku for fact extraction (reflection), larger models for synthesis

## Development Environment

- **OS**: Linux
- **Shell**: zsh
- **IDE tools**: Claude Code CLI, GitNexus (codebase indexing)
- **Dev server**: `npm run dev` (Next.js dev with turbopack)
- **Testing**: `vitest run` (1433 tests across 120 test files)
- **E2E**: `npx playwright test` (8 spec files)
- **CI/CD**: 5 GitHub Actions workflows (ci, e2e, deploy, migrate, preview)

## Conventions

- Path alias: `@/*` maps to `./src/*`
- Server external packages: @whiskeysockets/baileys, jimp, sharp, link-preview-js
- Agent packages aliased to `false` in webpack (not deployed to Vercel)
- CSS: Custom design system in `src/styles/bitbit-design-system.css` + temp stylesheets per module
