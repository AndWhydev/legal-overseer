---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/app/callback/[provider]/route.ts
  - personal-assistant/src/app/dashboard/connections/page.tsx
autonomous: true
requirements: [GMAIL-RELAY-01, GMAIL-RELAY-02]
must_haves:
  truths:
    - "OAuth callback creates channel_connections row with relay_enabled=true so cron polls the channel"
    - "Connections page renders the ConnectionsGrid so users can connect Gmail via UI"
    - "Existing non-OAuth connect flow (Stripe, WhatsApp) remains unaffected"
  artifacts:
    - path: "personal-assistant/src/app/callback/[provider]/route.ts"
      provides: "OAuth callback with relay_enabled in upsert"
      contains: "relay_enabled: true"
    - path: "personal-assistant/src/app/dashboard/connections/page.tsx"
      provides: "Connections page rendering ConnectionsGrid"
      contains: "ConnectionsGrid"
  key_links:
    - from: "personal-assistant/src/app/callback/[provider]/route.ts"
      to: "channel_connections table"
      via: "supabase upsert with relay_enabled: true"
      pattern: "relay_enabled.*true"
    - from: "personal-assistant/src/app/dashboard/connections/page.tsx"
      to: "personal-assistant/src/components/connections/connections-grid.tsx"
      via: "import and render"
      pattern: "ConnectionsGrid"
---

<objective>
Fix the Gmail relay pipeline so emails flow from Gmail into BitBit's inbox.

Purpose: The relay daemon, cron job, and Gmail adapter are all fully built and working. Two bugs prevent the pipeline from activating: (1) the OAuth callback does not set `relay_enabled: true` when creating the `channel_connections` row, so the cron job skips all OAuth-connected channels; (2) the connections page at `/dashboard/connections` renders `null`, so there is no UI to initiate a Gmail OAuth connection.

Output: A working end-to-end path where a user visits the connections page, clicks "Connect" on Gmail, completes OAuth, and the resulting `channel_connections` row has `relay_enabled: true` so the cron picks it up and starts polling.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/app/callback/[provider]/route.ts
@personal-assistant/src/app/dashboard/connections/page.tsx
@personal-assistant/src/components/connections/connections-grid.tsx
@personal-assistant/src/app/api/channels/connect/route.ts
@personal-assistant/src/app/api/cron/channel-sync/route.ts
@personal-assistant/src/lib/channels/relay-daemon.ts

<interfaces>
<!-- The OAuth callback upserts into channel_connections. The cron job (channel-sync/route.ts)
     queries WHERE status='connected' AND relay_enabled=true. The relay daemon (relay-daemon.ts)
     also checks conn.relay_enabled before polling. Both must see relay_enabled=true. -->

<!-- The connect route at /api/channels/connect already sets relay_enabled: true for
     non-OAuth channels (Stripe). For OAuth channels it only returns a redirect URL
     (line 71-73) — the actual row is created in the callback route, which is the bug. -->

From personal-assistant/src/components/connections/connections-grid.tsx:
```typescript
export function ConnectionsGrid({
  onConnectionStateChange,
  onConnectedIdsChange,
  variant = 'dashboard',
  showHeader = true,
  showCategoryTabs = true,
}: ConnectionsGridProps)
```

From personal-assistant/src/components/channels/connect-modal.tsx:
```typescript
// ConnectModal is already imported by ConnectionsGrid — no separate import needed
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add relay_enabled to OAuth callback upsert</name>
  <files>personal-assistant/src/app/callback/[provider]/route.ts</files>
  <action>
In the `channel_connections` upsert (line 159-169), add `relay_enabled: true` to the upsert object. This is the single missing field that prevents the cron job from polling OAuth-connected channels.

The upsert currently has: org_id, channel_type, status, last_sync, config, message_count. Add `relay_enabled: true` after `status: 'connected'`.

This matches the pattern already used in `/api/channels/connect/route.ts` (line 101) for non-OAuth channels like Stripe.

Do NOT modify any other behavior in this file. The credential storage, state validation, and redirect logic are all correct.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && grep -n "relay_enabled" personal-assistant/src/app/callback/\[provider\]/route.ts | grep "true"</automated>
  </verify>
  <done>The OAuth callback upsert includes relay_enabled: true. When a user completes Gmail OAuth, the channel_connections row will have relay_enabled=true and the cron job will start polling it.</done>
</task>

<task type="auto">
  <name>Task 2: Wire connections page to render ConnectionsGrid</name>
  <files>personal-assistant/src/app/dashboard/connections/page.tsx</files>
  <action>
Replace the current `return null` with a proper page that renders the ConnectionsGrid component.

The page should:
1. Be a server component (default) that wraps a `Suspense` boundary around the client component
2. Import `ConnectionsGrid` from `@/components/connections/connections-grid`
3. Use the same glassmorphic page shell pattern as other dashboard pages (a container div with appropriate padding and max-width)
4. Include a `Suspense` fallback since `ConnectionsGrid` is a client component that uses `useSearchParams`

Minimal implementation — no extra layout chrome needed since the `ConnectionsGrid` component already includes its own header ("Connections"), category tabs, and the grid of connection cards.

Structure:
```tsx
import { Suspense } from 'react'
import { ConnectionsGrid } from '@/components/connections/connections-grid'

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<div className="py-12 text-center text-sm text-[#9b8a7d]">Loading connections...</div>}>
        <ConnectionsGrid />
      </Suspense>
    </div>
  )
}
```

This is the exact pattern used by other dashboard pages. The ConnectionsGrid handles all state, API calls, OAuth popup flow, and toast notifications internally.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>The /dashboard/connections page renders the ConnectionsGrid component. Users can see all available connections, click "Connect" on Gmail, complete the OAuth flow in a popup, and return to see the connected status.</done>
</task>

</tasks>

<verification>
1. `grep -n "relay_enabled" personal-assistant/src/app/callback/\[provider\]/route.ts` shows `relay_enabled: true` in the upsert
2. `grep -n "ConnectionsGrid" personal-assistant/src/app/dashboard/connections/page.tsx` shows the import and usage
3. Build succeeds: `cd personal-assistant && npx next build`
4. Manual: Visit /dashboard/connections — should show the connections grid with Gmail, Outlook, etc.
5. Manual: Click "Connect" on Gmail — should open OAuth popup, complete flow, return with relay_enabled=true in the DB row
</verification>

<success_criteria>
- OAuth callback sets relay_enabled: true on channel_connections upsert
- Connections page renders ConnectionsGrid (not null)
- Build passes with zero new errors
- The full Gmail relay pipeline is unblocked: connect via UI -> OAuth -> callback sets relay_enabled -> cron polls -> relay daemon pulls messages
</success_criteria>

<output>
After completion, create `.planning/quick/13-wire-gmail-relay-pipeline-and-fix-connec/13-SUMMARY.md`
</output>
