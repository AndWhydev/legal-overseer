# Vercel Deployment Status Report

**Date:** 2026-04-02  
**Project:** bitbit (awu-team)  
**Production URL:** https://app.bitbit.chat  
**Root Directory:** `personal-assistant` (correctly configured in Vercel project settings)  
**Node.js:** 24.x  
**Framework:** Next.js 16.1.6  

---

## Current Status

| Environment | Status | URL |
|---|---|---|
| Production (main) | ✅ Ready | bitbit-fim0oci6n-awu-team.vercel.app |
| Previous Production | ✅ Ready (1d ago) | bitbit-2eh0lzdhe-awu-team.vercel.app |
| Preview (feat/dashboard-redesign) | ✅ Ready | bitbit-2r1uyyt7m-awu-team.vercel.app |
| Preview (feat/lead-discovery-outreach) | ✅ Ready | bitbit-76886b4qb-awu-team.vercel.app |
| Preview (main via CLI) | ✅ Ready | bitbit-59bwlqgd7-awu-team.vercel.app |

**Production is healthy.** The latest main branch deploy succeeded.

---

## Root Causes of Failing Deployments

There are **three distinct failure modes** causing the ~15 errored deployments over the past 3 days:

### 1. `master` branch: Root directory doesn't exist (instant fail)

**Affected deploys:** bitbit-y07xbaabx (312ms duration)  
**Error:**
```
The specified Root Directory "personal-assistant" does not exist.
```

**Explanation:** The `master` branch is an old/legacy branch with a flat repo structure (no `personal-assistant/` subdirectory). The Vercel project is configured with `Root Directory: personal-assistant`, so when this branch is deployed, it fails immediately because the directory doesn't exist on that branch.

**Fix:** Either delete the `master` branch from GitHub (since `main` is the primary branch), or exclude it from Vercel's Git integration in the project settings ("Ignored Build Step").

### 2. `agentic-comprehension-runtime` branch: npm install failure (Sentry CLI module error)

**Affected deploys:** bitbit-4nbfmxyuc (34s duration)  
**Error:**
```
Error: Cannot find module './agent'
Require stack:
- /vercel/path0/node_modules/https-proxy-agent/dist/index.js
- /vercel/path0/node_modules/@sentry/cli/scripts/install.js
```

**Explanation:** This branch has a `package-lock.json` that references an incompatible version of `https-proxy-agent` which breaks during `@sentry/cli` post-install on Node 24.x. The `./agent` submodule resolution fails, preventing npm install from completing.

**Fix:** Update the branch's `package-lock.json` by running `npm install` with the current Node 24.x and committing the updated lockfile. Or merge latest `main` into this branch.

### 3. Various branches: Build/compile errors (TypeScript and module resolution)

These are legitimate code bugs on feature branches that haven't been fixed:

#### a) `v1.5-marketing-launch`: Invalid route segment config
```
Invalid segment configuration export detected.
Unknown identifier "cronMaxDuration" at "maxDuration" in /api/cron/revenue-intelligence/route
```
The route exports a `cronMaxDuration` config key that Next.js 16.x doesn't recognize. Should be `maxDuration`.

#### b) `feat/dashboard-redesign` (older deploy): Missing module
```
Module not found: Can't resolve './pulse-row'
  in src/components/dashboard/dashboard-redesign.tsx:7
```
Component file `pulse-row` was imported but not committed. (NOTE: The latest deploy of this branch now succeeds — this was likely fixed.)

#### c) Production deploys 2d ago: Missing module
```
Module not found: Can't resolve '@/lib/user/user-profile-context'
  in src/components/dashboard/spa-shell.tsx:38
```
File was imported but didn't exist at that commit. Fixed in subsequent commits.

#### d) Production deploys 3d ago: TypeScript type error
```
Type error: Object literal may only specify known properties, but 'org_id' does not exist
in type 'DispatchNotificationParams'. Did you mean to write 'orgId'?
  at src/app/api/cron/sentiment-drift/route.ts:33
```
Snake_case vs camelCase property mismatch. Fixed in subsequent commits.

---

## Recurring Warning (Non-blocking)

All builds show this warning:
```
Warning: Failed to fetch one or more git submodules
```
The repo contains a `demo-1` git submodule that Vercel can't access. This doesn't block builds but should be noted.

---

## Vercel Project Configuration

**vercel.json** — Contains framework setting and 28 cron job definitions. No issues found.

**next.config.ts** — Standard Next.js config with:
- Sentry integration (with `errorHandler` to prevent source map upload failures from crashing builds)
- Bundle analyzer (opt-in via ANALYZE env var)
- Server external packages: baileys, jimp, sharp, link-preview-js, voyageai
- Voyageai CJS alias for server-side webpack

**Root directory:** `personal-assistant` (correctly set in Vercel project settings)

---

## Recommendations

1. **Delete or archive the `master` branch** — It's a legacy branch from the old flat repo structure. Every push to any branch triggers a Vercel preview deploy for `master` too, and it always fails instantly. Either delete it or configure Vercel's "Ignored Build Step" to skip it.

2. **Rebase stale feature branches** — `agentic-comprehension-runtime` has a broken lockfile. Running `npm install` and pushing the updated `package-lock.json` will fix it.

3. **Fix `v1.5-marketing-launch` route config** — Change `cronMaxDuration` to `maxDuration` in `/api/cron/revenue-intelligence/route.ts`.

4. **Consider Sentry config migration** — Every build warns about deprecated `sentry.server.config.ts`, `sentry.edge.config.ts`, and `sentry.client.config.ts`. These should be migrated to the Next.js instrumentation file pattern.

5. **Fix or remove the `demo-1` submodule** — It causes a warning on every build.

---

## Summary

The **production deployment is healthy and working**. The majority of errors are from:
- A legacy `master` branch that lacks the `personal-assistant/` subdirectory (immediate failure)
- Stale feature branches with dependency or code issues
- Rapid iteration on `main` where TypeScript/import errors were introduced and quickly fixed

No systemic Vercel configuration issue exists. The root directory, framework, and build settings are all correct.
