# E2E Tests (Playwright)

End-to-end tests for the BitBit personal assistant dashboard.

## Running tests

```bash
# Run all E2E tests (starts dev server automatically)
npm run test:e2e

# Run with Playwright UI (interactive mode)
npm run test:e2e:ui

# Run smoke tests only (page-render spec — fastest)
npm run test:smoke

# Run Vitest unit tests + all E2E tests
npm run test:full
```

## Required env vars

| Variable | Default | Description |
|---|---|---|
| `E2E_USER_EMAIL` | `hi+test@torkay.com` | Test account email |
| `E2E_USER_PASSWORD` | _(empty)_ | Test account password (optional — bypass used locally) |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | Override to test against a deployed URL |

Set these in a `.env.local` or export them before running tests.

## How auth works locally

The `setup` project (`auth.bootstrap.setup.ts`) runs before the `chromium` project and
saves an authenticated browser state to `test-results/.auth/user.json`.

Locally, the dev server is started via `npm run dev:auth`, which sets:

```
DEV_BYPASS_AUTH=true
```

This triggers `isDevBypass()` in `src/lib/supabase/server.ts`, which returns `true`
when `process.env.DEV_BYPASS_AUTH === 'true'` and `NODE_ENV !== 'production'`.
With bypass active, the auth setup project can obtain a valid session without a real
Supabase login — no credentials needed for local development.

## Troubleshooting

**Setup spec cannot find the bypass user / redirects to /login**
Check that `NODE_ENV` is `development` (the default for `next dev`) and that
`DEV_BYPASS_AUTH=true` is set. Both conditions must be true for `isDevBypass()` to
return `true`. If you are pointing `PLAYWRIGHT_BASE_URL` at a remote server,
bypass will not apply — you must supply `E2E_USER_EMAIL` and `E2E_USER_PASSWORD`
for a real account.

**Tests time out waiting for the server**
If `reuseExistingServer` is `false` (CI mode) or the server takes longer than usual
to start, increase `PW_WEB_SERVER_TIMEOUT_MS` (default 120 000 ms locally).

**Auth state is stale**
Delete `test-results/.auth/user.json` and re-run — the setup project will
regenerate it.
