# App-Host Auth Gate

## Background

Before this change, a signed-in user visiting `https://app.bitbit.chat/`
landed on a full marketing page (the same landing page `bitbit.chat` shows),
with a "Sign In" CTA — and if they clicked it, they were re-prompted for
credentials instead of being recognized. The session cookie was live; the
root route just didn't consult it.

## What actually changed

Marketing and app are **already split at the infra level**: `bitbit.chat`
is served by the `bitbit-landing-page` Vercel project (separate codebase),
`app.bitbit.chat` is served by the `bitbit` project (this codebase). No
domain changes needed.

The fix is a single middleware change:

| Scenario | Before | After |
|---|---|---|
| Signed-in user → `app.bitbit.chat/` | Marketing landing | 302 → `/dashboard` |
| Signed-in user → `app.bitbit.chat/login` | Login form | 302 → `/dashboard` |
| Signed-in user → `app.bitbit.chat/signup` | Signup form | 302 → `/dashboard` |
| Signed-out user → `app.bitbit.chat/` | Marketing landing | 302 → `/login` |
| Signed-out user → `app.bitbit.chat/login` | Login form | Login form (unchanged) |

All other routes are untouched. `/pricing`, `/case-study`, `/industries/*`,
`/about`, `/onboard`, `/waitlist` keep working on `app.bitbit.chat` — those
pages don't all exist on `bitbit.chat` yet, so redirecting them would
308→404. If/when the marketing codebase catches up, cross-host redirects
can be added separately.

## Performance note

The middleware uses a cookie-name pre-check — if no Supabase auth cookie is
present AND the path is public, the Supabase RPC is skipped. First-time
visitors to `app.bitbit.chat/` pay zero auth cost.

## Vercel config

Already correct. Verified:

- `NEXT_PUBLIC_APP_URL=https://app.bitbit.chat` — set
- Domain routing: `bitbit.chat` → `bitbit-landing-page`, `app.bitbit.chat` → `bitbit`
- Supabase redirect allowlist: already includes `app.bitbit.chat`
- OAuth redirect URIs: already `app.bitbit.chat/callback/*`
- Stripe checkout URLs: already use `app.bitbit.chat`

No env var or dashboard changes required.

## Verification

After deploy, check each:

### Signed-out

- [ ] `curl -I https://app.bitbit.chat/` → 307 to `/login`
- [ ] `curl -I https://app.bitbit.chat/login` → 200
- [ ] `curl -I https://app.bitbit.chat/pricing` → 200 (unchanged)

### Signed-in (via browser)

- [ ] Log in at `app.bitbit.chat/login` → lands on `/dashboard`
- [ ] Open a new tab to `app.bitbit.chat/` → redirects to `/dashboard` (no re-auth)
- [ ] Open a new tab to `app.bitbit.chat/login` → redirects to `/dashboard`
- [ ] Open a new tab to `app.bitbit.chat/signup` → redirects to `/dashboard`
- [ ] `app.bitbit.chat/pricing` → pricing page renders (unchanged)
- [ ] Log out → lands on `/login`

## Rollback

Single commit. `git revert <sha>` on main, redeploy. No infra to unwind.
