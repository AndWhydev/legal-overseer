# BitBit — Workflow

## Development Methodology

- **AI-assisted development**: Claude Code as primary development partner
- **Swarm orchestration**: Parallel agent teams for large feature batches
- **Context-driven**: Conductor artifacts inform all development sessions
- **Test-first mindset**: Tests written alongside or immediately after implementation

## Git Workflow

- **Main branch**: `main` — production-deployed
- **Feature work**: Worktree isolation via `.claude/worktrees/` when needed
- **Commit style**: Conventional-ish — `feat:`, `fix:`, `test:`, `refactor:`, etc.
- **Co-authorship**: AI commits tagged with `Co-Authored-By: Claude`
- **Hook workaround**: `git -c core.hooksPath=/dev/null commit` when hooks block

## Testing

| Type | Tool | Location | Count |
|------|------|----------|-------|
| Unit/Integration | Vitest 4 | `**/*.test.ts` colocated | 1462 |
| E2E | Playwright | `e2e/` (12 spec files) | ~49 tests |

**Run tests**: `npm run test` (from personal-assistant/)
**Config**: `vitest.config.ts` — globals enabled, `@/` alias, excludes e2e/node_modules/.next
**Noise suppression**: pino logger noise excluded in vitest config

### Test Expectations
- New features should include tests
- Test files colocated with source (e.g., `foo.ts` + `foo.test.ts`)
- Target: maintain 1400+ test count, no regressions

## Code Quality

- **Linting**: ESLint 9 with next config
- **Type checking**: TypeScript strict mode
- **Build verification**: `next build --webpack`
- **Audit**: `npm audit --audit-level=moderate`

## Deployment

| Target | Method | Trigger |
|--------|--------|---------|
| Dashboard | Vercel | Push to main |
| Database | Supabase migrations | Manual apply |
| WhatsApp bridge | Fly.io / VPS | Manual deploy |

## API Development

- **Route pattern**: `personal-assistant/src/app/api/[domain]/route.ts`
- **22 API groups**: activity, admin, agent, ai, analytics, audit, auth, billing, channels, contacts, cron, events, health, knowledge, monitoring, onboarding, org, profile, reports, search, settings, tasks, webhooks
- **Auth**: Supabase session-based, `getActiveOrgId()` for tenancy scoping
- **Rate limiting**: `api-rate-limiter.ts`

## Component Development

- **Pattern**: React Server Components by default, `'use client'` where needed
- **UI primitives**: Radix UI via `src/components/ui/`
- **Styling**: TailwindCSS 4 + custom design system tokens
- **Animations**: Motion library (framer-motion successor)
- **Icons**: Lucide React

## Agent Development

- **Location**: `packages/agents/[agent-name]/`
- **Registry**: `src/lib/modules/registry.ts`
- **Routing**: Confidence-based — classifier determines intent, router picks agent
- **10 agents**: lead-swarm, invoice-flow, channel-triage, client-comms, proposal-bot, ad-script-gen, client-onboarding, ai-search-optimizer, tender-hunter, sentry

## Channel/Connection Development

- **Adapters**: `src/lib/channels/[channel].ts`
- **Active channels**: WhatsApp, SMS (Telnyx), Email, iMessage, Facebook Messenger, Instagram, Slack
- **OAuth flow**: `/api/channels/connect` → callback → token storage
- **Config**: Per-channel config via `/api/channels/[channel]/config`

## Background Processing

- **Cron routes**: 12 routes in `/api/cron/`
- **Reflection**: Haiku extracts facts from significant messages
- **Memory consolidation**: Dedup/merge/supersede cycle
- **Scheduler**: Built-in cron infrastructure

## Session Handoff

When pausing work mid-session:
1. Note current progress in the relevant track's `plan.md`
2. Update `conductor/tracks.md` status
3. Commit work-in-progress with clear status message
