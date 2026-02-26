---
name: new-vertical
description: Add a new industry vertical to BitBit (config pack + agents + tabs)
---

# Add a New Industry Vertical

## When to Use
- "Add a healthcare vertical"
- "Create a logistics industry pack"
- "Set up BitBit for legal firms"
- Any request to support a new industry/vertical

## Architecture

Industry packs sit above plan tiers. Each pack declares which modules, agents, persona, and tier gating apply to that vertical. The framework lives in:

```
src/lib/industry/
├── types.ts          # IndustryPack interface
├── registry.ts       # INDUSTRY_PACKS map, getPack(), resolveIndustry()
└── packs/
    ├── agency.ts     # Reference implementation (current default)
    └── <new>.ts      # Your new vertical
```

Core modules (`command-center`, `dashboard`, `chat`, `inbox`, `settings`) are always included regardless of industry.

## Workflow

### Step 1 — Create the pack config

Create `src/lib/industry/packs/<vertical>.ts`:

```ts
import type { IndustryPack } from '../types'

export const <vertical>Pack: IndustryPack = {
  id: '<vertical>',
  label: '<Display Name>',
  description: '<One-liner for onboarding UI>',
  icon: '<emoji>',

  // Modules this vertical exposes (on top of core)
  modules: ['contacts', 'approvals', /* vertical-specific modules */],

  // Agents enabled by default for new orgs in this vertical
  defaultAgents: ['channel-triage', /* vertical-specific agents */],

  // All agents valid for this vertical (superset of defaultAgents)
  availableAgents: ['channel-triage', /* ... */],

  persona: {
    name: 'BitBit',
    context: '<vertical> operations',        // e.g. "healthcare practice management"
    systemPromptSuffix: '<What the AI helps with in this vertical>',
  },

  labelOverrides: {
    // Optional: 'contacts' -> 'Patients', 'leads' -> 'Referrals', etc.
  },

  tierModules: {
    starter:    [/* minimal module set */],
    growth:     [/* mid-tier modules */],
    scale:      'all',
    enterprise: 'all',
  },

  compositions: {
    essential: {
      primaryModules: ['command-center', 'inbox', /* 2-3 key modules */],
      advancedModules: ['chat', /* secondary modules */],
    },
    full: {
      primaryModules: ['command-center', 'dashboard', 'chat', 'inbox', /* all primary */],
      advancedModules: [/* remaining modules */],
    },
  },

  // Optional: override default plan limits for this vertical
  // planLimits: { starter: { maxUsers: 2, maxChannels: 5, tokenBudget: 75_000 } },
}
```

Use `src/lib/industry/packs/agency.ts` as the reference implementation.

### Step 2 — Register the pack

Edit `src/lib/industry/registry.ts`:

```ts
import { <vertical>Pack } from './packs/<vertical>'

export const INDUSTRY_PACKS: Record<string, IndustryPack> = {
  agency: agencyPack,
  <vertical>: <vertical>Pack,  // ← add this line
}
```

### Step 3 — Create vertical-specific tab components (if needed)

For any new module IDs in your pack's `modules` array that don't already exist:

1. Create the tab component: `src/components/dashboard/tabs/<module>-tab.tsx`
2. Register it in `src/components/dashboard/spa-shell.tsx` TABS array

Existing modules (contacts, leads, invoices, approvals, etc.) are reusable across verticals — only create new tabs for genuinely new UI.

### Step 4 — Create vertical-specific agents (if needed)

For any new agent types in `availableAgents`:

1. Create the agent: `src/lib/agent/<agent-name>.ts`
2. Add to the dispatch map in `src/lib/agent/scheduler.ts`

### Step 5 — Verify

```
- [ ] Pack file created and exports IndustryPack
- [ ] Pack registered in INDUSTRY_PACKS
- [ ] All module IDs in pack.modules have corresponding tabs
- [ ] All agent IDs in pack.availableAgents exist in scheduler dispatch map
- [ ] Dev toolbar shows new industry chip (run dev server, open toolbar)
- [ ] Selecting industry in dev toolbar updates visible modules correctly
- [ ] `npm run build` passes with no type errors
```

## What You Don't Need to Touch

The following are fully vertical-agnostic and require zero changes:

- Routing / Next.js app structure
- Channel adapters (WhatsApp, email, Slack, etc.)
- Semantic context engine / knowledge graph
- Auth / RLS / Supabase client
- Approval flow / cost guard / circuit breaker
- Billing / Stripe integration
- Realtime / SSE infrastructure

## Activating a Vertical for an Org

- **Single-tenant deploy:** Set `BITBIT_DEPLOYMENT=<vertical>` env var
- **Multi-tenant (SaaS):** Set `industry = '<vertical>'` on the org's row in `organisations` table
- **Dev testing:** Use the Industry section in the dev toolbar (no DB change needed)

## Reference Files

| File | Purpose |
|------|---------|
| `src/lib/industry/types.ts` | `IndustryPack` interface |
| `src/lib/industry/registry.ts` | Pack lookup + `BITBIT_DEPLOYMENT` resolution |
| `src/lib/industry/packs/agency.ts` | Reference pack implementation |
| `src/lib/modules/registry.ts` | Module/tier/composition resolution (reads packs) |
| `src/lib/agent/prompt-builder.ts` | System prompt (reads pack persona) |
| `src/lib/onboarding/multi-tenant.ts` | Org creation (seeds industry + pack defaults) |
| `src/components/dev/dev-toolbar.tsx` | Dev toolbar industry switcher |
| `supabase/migrations/050_industry_column.sql` | Industry column on organisations |
