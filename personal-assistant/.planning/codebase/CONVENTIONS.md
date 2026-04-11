# Conventions

## Code Style

- **Quotes**: Single quotes
- **Semicolons**: Required
- **Indentation**: 2 spaces
- **File naming**: kebab-case (e.g., `taor-loop.ts`, `memory-palace.ts`)
- **Component naming**: PascalCase (e.g., `ChatInterface`, `ToolExecutor`)
- **Function naming**: camelCase (e.g., `assembleContext`, `routeModel`)

## Path Aliases

- `@/` maps to `src/` (configured in `tsconfig.json`)

## Import Order

1. Standard library / Node.js built-ins
2. Next.js imports
3. External packages
4. Local imports (using `@/` alias)

## Linting

- **ESLint** extends `next/core-web-vitals` + `@typescript-eslint`
- Unused variables with underscore prefix (`_unused`) are allowed
- No Prettier — ESLint handles formatting rules

## Error Handling

- **try/catch at boundaries** — API routes, page components, tool executors wrap in try/catch
- **Fire-and-forget for non-critical** — telemetry, analytics, cache writes fail silently
- **Logger**: `src/lib/core/logger.ts` with structured JSON output
  - Levels: `debug`, `info`, `warn`, `error`
  - Includes context metadata (user, request, operation)

## TypeScript Patterns

- Prefer `interface` over `type` for object shapes
- Use `zod` for runtime validation at API boundaries
- Avoid `any` (though 1346 instances exist — see CONCERNS.md)

## Component Patterns

- Server Components by default (no `'use client'` unless needed)
- Client components use `'use client'` directive at top of file
- Data fetching in Server Components, passed as props to Client Components
- `swr` for client-side data fetching with revalidation

## API Route Patterns

- Route handlers in `src/app/api/` using Next.js App Router conventions
- Request validation with `zod` schemas
- Consistent error response format with status codes
- Webhook endpoints verify signatures per service

## Git

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Feature branches off `main`
