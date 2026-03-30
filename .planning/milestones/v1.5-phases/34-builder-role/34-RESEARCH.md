# Phase 34: Builder Role (Premium Differentiator) - Research

**Researched:** 2026-03-27
**Domain:** AI-powered website generation, sandboxed code preview, deployment automation, WordPress/Elementor integration
**Confidence:** MEDIUM

## Summary

The Builder Role is a new role type (`builder`) that follows the existing `RoleImplementation` pattern (evaluate/hasChanges/defaultConfig) established by finance, comms, sales, and growth roles. The core technical challenge is threefold: (1) generating working HTML/CSS/JS from natural language via the existing Anthropic SDK agentic loop, (2) rendering generated code safely in a sandboxed preview, and (3) deploying generated sites to external platforms (Vercel/Netlify) and exporting to WordPress/Elementor format.

The existing artifact system (`use-artifacts.ts`, `artifact-panel.tsx`) already supports `html` type artifacts with code/preview toggle and blob-based "open in new tab" -- this provides a solid foundation for the preview sandbox. The code execution tool pattern (`code-execution.ts`) demonstrates how to safely run generated code. The key gap is that the current artifact system uses simple `srcdoc` iframes without proper sandbox attributes, and there is no persistence layer for generated sites.

**Primary recommendation:** Build iteratively -- start with the role registration + HTML/CSS/JS generation via chat (reusing the existing artifact panel with enhanced sandbox security), then add template library persistence, then WordPress/Elementor JSON export, and finally one-click Vercel/Netlify deployment. Use `iframe[sandbox]` with `srcdoc` for preview (no Sandpack needed for v1), and the Vercel REST API v13 for deployment.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUILD-01 | Builder Role for website/app construction via agentic coding | Role system pattern fully documented (RoleImplementation interface, role-registry, role-init, role-runtime). New `builder` enum value needed in Postgres + TypeScript. Generation uses existing Anthropic SDK tool-calling loop with new builder-specific tools. |
| BUILD-02 | Preview sandbox for generated code | Existing artifact system supports HTML preview with code/preview toggle. Needs hardened `iframe[sandbox]` attributes (drop `allow-same-origin`). Blob URL approach already implemented in `artifact-panel.tsx`. |
| BUILD-03 | One-click deployment of generated sites | Vercel REST API v13 (`POST /v13/deployments`) supports inline file deployment. Netlify API supports ZIP-based deployment. WordPress export via Elementor JSON template format. Integration credentials stored in `org_integrations` table. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.74.0 | Already in project -- AI code generation via tool-calling loop | Powers all existing agent interactions |
| `iframe[sandbox] + srcdoc` | Browser native | Sandboxed preview of generated HTML/CSS/JS | Zero dependency, already partially implemented in artifact-panel |
| Vercel REST API v13 | Current | One-click deployment to Vercel | Already deployed on Vercel; natural integration |
| Supabase | 2.95.3 | Persist generated sites, templates, builder state | Existing data layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 | Validate builder tool inputs, template schemas | Already in project; use for all tool input validation |
| `shiki` | 4.0.2 | Syntax highlighting in code view | Already in project; reuse for builder code panel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native iframe sandbox | @codesandbox/sandpack-react 2.20 | Sandpack adds npm dependency support + hot reload + Node.js runtime, but is 200KB+ bundle, last published ~1yr ago, overkill for static HTML/CSS/JS preview. Defer to v2 if users need React/framework previews. |
| Vercel REST API | GitHub Pages API | Vercel already in use; GitHub Pages requires repo creation overhead |
| Custom Elementor JSON generator | wp-cli + Elementor import | Custom generator gives full control without requiring WP server access at generation time |

**Installation:**
```bash
# No new npm dependencies needed for v1
# Vercel API calls use native fetch
# Elementor JSON export is pure TypeScript transformation
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    roles/
      builder/
        builder-role.ts           # RoleImplementation (evaluate, hasChanges, defaultConfig)
        builder-tools.ts          # Tool definitions: generate_site, update_site, list_templates
        builder-generator.ts      # HTML/CSS/JS generation orchestration
        template-library.ts       # Starter template definitions + CRUD
        elementor-export.ts       # HTML -> Elementor JSON converter
        deploy-vercel.ts          # Vercel deployment API wrapper
        deploy-netlify.ts         # Netlify deployment API wrapper
        __tests__/
          builder-role.test.ts
          elementor-export.test.ts
          deploy-vercel.test.ts
  components/
    builder/
      builder-preview.tsx         # Enhanced sandboxed iframe preview
      template-gallery.tsx        # Template selection UI
      builder-toolbar.tsx         # Deploy, export, download actions
      site-manager.tsx            # List/manage generated sites
  app/
    api/
      builder/
        deploy/route.ts           # POST deploy to Vercel/Netlify
        export/route.ts           # POST export as Elementor JSON / ZIP download
        templates/route.ts        # GET/POST template library
        sites/route.ts            # CRUD for generated sites
```

### Pattern 1: Role Registration (Follow Existing Convention)
**What:** Register builder as a new RoleImplementation following the exact pattern of growth-role.ts
**When to use:** Always -- this is the established pattern
**Example:**
```typescript
// Source: existing pattern from src/lib/roles/growth/growth-role.ts
import type { RoleImplementation, RoleEvaluation } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { registerRole } from '../role-registry'

export interface BuilderState {
  sites_generated: number
  last_generation_at: string | null
  active_sites: string[]  // site IDs currently being worked on
}

const builderRole: RoleImplementation = {
  type: 'builder',
  name: 'Builder',
  description: 'Website generation, template library, and deployment automation',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    // Builder role is primarily chat-driven, not tick-driven
    // Tick evaluations check for stale deployments, template updates, etc.
    return { actions: [], insights: [], stateUpdates: {}, workflowsToStart: [] }
  },

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    // Check if any sites need re-deployment or templates were updated
    return false
  },

  defaultConfig() {
    return {
      tick_interval_seconds: 3600,    // Hourly check (builder is mostly chat-driven)
      daily_budget_cents: 1000,        // $10/day -- code generation is token-heavy
      autonomy_level: 'copilot',
      config: {
        default_framework: 'html',     // html | tailwind | react
        auto_deploy: false,
        wordpress_enabled: false,
      },
    }
  },
}

registerRole(builderRole)
export { builderRole }
```

### Pattern 2: Builder Tools (Follow Agent Tool Convention)
**What:** Register builder-specific tools in the agent tool system following the exact pattern of content-tools.ts and seo-tools.ts
**When to use:** For all builder operations triggered via chat
**Example:**
```typescript
// Source: pattern from src/lib/agent/tools/content-tools.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler } from '../tools'

export const builderToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'generate_site',
    description: 'Generate a complete website (HTML/CSS/JS) from a natural language description. Returns the generated code as an HTML artifact that renders in the preview panel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description: 'What the website should look like and do',
        },
        template_id: {
          type: 'string',
          description: 'Optional starter template ID to base the design on',
        },
        style: {
          type: 'string',
          enum: ['modern', 'minimal', 'bold', 'professional', 'playful'],
          description: 'Design style direction',
        },
        sections: {
          type: 'array',
          items: { type: 'string' },
          description: 'Page sections to include (e.g., hero, about, services, contact, testimonials)',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'update_site',
    description: 'Update an existing generated site with specific changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        site_id: { type: 'string', description: 'ID of the site to update' },
        changes: { type: 'string', description: 'Description of changes to make' },
      },
      required: ['site_id', 'changes'],
    },
  },
  {
    name: 'deploy_site',
    description: 'Deploy a generated site to a hosting platform.',
    input_schema: {
      type: 'object' as const,
      properties: {
        site_id: { type: 'string', description: 'ID of the site to deploy' },
        platform: { type: 'string', enum: ['vercel', 'netlify'], description: 'Hosting platform' },
        domain: { type: 'string', description: 'Optional custom domain' },
      },
      required: ['site_id', 'platform'],
    },
  },
  {
    name: 'export_site',
    description: 'Export a generated site as WordPress/Elementor template or downloadable ZIP.',
    input_schema: {
      type: 'object' as const,
      properties: {
        site_id: { type: 'string', description: 'ID of the site to export' },
        format: { type: 'string', enum: ['elementor_json', 'html_zip', 'wordpress_theme'], description: 'Export format' },
      },
      required: ['site_id', 'format'],
    },
  },
]
```

### Pattern 3: Sandboxed Preview (Enhanced Artifact Panel)
**What:** Use `iframe[sandbox]` with `srcdoc` for secure preview, extending the existing artifact panel
**When to use:** Whenever displaying generated HTML to the user
**Example:**
```typescript
// Source: extends existing pattern in src/components/chat/artifact-panel.tsx
// Key security attributes:
<iframe
  sandbox="allow-scripts"
  // NO allow-same-origin -- this is critical for security
  // NO allow-top-navigation -- prevent navigation hijacking
  // NO allow-popups -- prevent popup spam
  srcDoc={generatedHtml}
  title="Site Preview"
  className="w-full h-full border-0"
/>
```

### Pattern 4: Vercel Deployment
**What:** Use Vercel REST API v13 to deploy generated sites with inline files
**When to use:** When user triggers one-click deploy
**Example:**
```typescript
// Source: https://vercel.com/docs/rest-api/deployments/create-a-new-deployment
async function deployToVercel(files: { path: string; content: string }[], projectName: string, token: string) {
  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      files: files.map(f => ({
        file: f.path,
        data: f.content,
        encoding: 'utf-8',
      })),
      projectSettings: {
        framework: null, // static site
      },
      target: 'production',
    }),
  })
  return response.json() // { id, url, status }
}
```

### Pattern 5: Elementor JSON Export
**What:** Convert generated HTML sections into Elementor template JSON format
**When to use:** When user exports for WordPress/Elementor
**Example:**
```typescript
// Source: https://developers.elementor.com/docs/data-structure/general-structure/
interface ElementorTemplate {
  title: string
  type: 'page'
  version: '0.4'
  page_settings: Record<string, unknown>
  content: ElementorElement[]
}

interface ElementorElement {
  id: string
  elType: 'container' | 'widget'
  isInner: boolean
  settings: Record<string, unknown>
  elements: ElementorElement[]
}

// HTML sections map to Elementor containers with HTML widgets
function htmlSectionToElementor(sectionHtml: string, title: string): ElementorElement {
  return {
    id: crypto.randomUUID().slice(0, 8),
    elType: 'container',
    isInner: false,
    settings: { content_width: 'full' },
    elements: [{
      id: crypto.randomUUID().slice(0, 8),
      elType: 'widget',
      isInner: false,
      settings: {
        html: sectionHtml,
        // Elementor's HTML widget renders raw HTML
      },
      elements: [],
    }],
  }
}
```

### Anti-Patterns to Avoid
- **Generating full React/Next.js apps in v1:** Start with static HTML/CSS/JS. Framework support is v2.
- **Running Sandpack for static preview:** Sandpack is 200KB+ and designed for interactive coding -- overkill for previewing generated output. Native iframe is faster, lighter, and already partially implemented.
- **Storing generated HTML in Supabase `text` columns:** Use a dedicated `builder_sites` table with JSONB for file structure, enabling multi-file sites.
- **Auto-deploying without user confirmation:** The autonomy engine requires copilot-level approval for deployment actions. Always queue for approval.
- **Direct WordPress API calls from frontend:** WordPress credentials should be handled server-side via the existing `org_integrations` table. Export as downloadable JSON instead of pushing directly to WP in v1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code preview sandbox | Custom WebSocket-based preview server | `iframe[sandbox] + srcdoc` | Browser sandboxing is battle-tested, zero-dependency, already partially implemented |
| Vercel deployment | Custom CI/CD pipeline | Vercel REST API v13 inline file deploy | One API call deploys static files directly; no git repo needed |
| Netlify deployment | Custom upload pipeline | Netlify Deploy API (ZIP method) | Upload a ZIP, get a URL; simpler than file-by-file |
| Elementor template format | Custom page builder format | Elementor JSON standard (version 0.4) | Industry standard; Andy (AWU) already uses Elementor |
| Syntax highlighting | Custom code renderer | `shiki` (already in project, v4.0.2) | Already installed, server-side highlighting, excellent theme support |
| HTML sanitization | Regex-based sanitizer | `iframe sandbox` attribute (browser-level isolation) | Browser enforcement is orders of magnitude more secure than JS sanitization |
| Template storage | File system or S3 | Supabase JSONB in `builder_sites` table | Consistent with all other data; RLS, org-scoped, no new infrastructure |

**Key insight:** The existing artifact system + Anthropic SDK agentic loop handles 80% of the builder's core functionality. The new work is mostly about persistence (builder_sites table), export formats (Elementor JSON), and deployment API wrappers (Vercel/Netlify).

## Common Pitfalls

### Pitfall 1: iframe sandbox + allow-same-origin = No Sandbox
**What goes wrong:** Adding `allow-same-origin` to a sandboxed iframe with `srcdoc` gives the embedded content full access to the parent page's DOM, cookies, and localStorage.
**Why it happens:** Developers add `allow-same-origin` to fix CORS errors for embedded scripts, not realizing it defeats the entire sandbox.
**How to avoid:** NEVER use `allow-same-origin` with `srcdoc` when the content is user/AI-generated. Use only `allow-scripts` if JS execution is needed. The existing `artifact-panel.tsx` uses blob URLs which are cross-origin by default -- this is safe.
**Warning signs:** Generated code accessing parent window, localStorage leaks, cookie theft.

### Pitfall 2: Token-Heavy Generation Blowing Cost Budgets
**What goes wrong:** A single site generation can use 10,000-50,000 tokens (prompt + output), and iterative refinement multiplies this. The daily_budget_cents limit gets hit quickly.
**Why it happens:** HTML/CSS/JS code generation produces verbose output. Multi-file sites compound the cost.
**How to avoid:** Set builder role daily_budget_cents higher ($10/day = 1000 cents), use templates to reduce generation from scratch, cache and diff-patch for iterative updates rather than regenerating full output.
**Warning signs:** Frequent cost guard halts during builder sessions, users unable to iterate.

### Pitfall 3: Generated HTML Breaking Sandbox Context
**What goes wrong:** Generated HTML includes `<script>` tags that try to access `parent.window`, `top.location`, or use `document.cookie`, breaking out of or conflicting with the sandbox.
**Why it happens:** LLMs may generate JavaScript that assumes it runs in a normal browser context.
**How to avoid:** The `sandbox` attribute without `allow-same-origin` prevents all of this at the browser level. Additionally, post-process generated HTML to strip known dangerous patterns (same patterns as code-execution.ts).
**Warning signs:** Console errors in iframe about cross-origin access, blank previews.

### Pitfall 4: Vercel Deployment Rate Limits
**What goes wrong:** Rapid iteration triggers Vercel API rate limits, causing deployments to fail silently.
**Why it happens:** Users may click deploy repeatedly or the system auto-redeploys on each change.
**How to avoid:** Debounce deployments (minimum 60-second gap), show deployment status clearly, queue multiple changes into a single deploy. Vercel has no published per-minute limit for API deployments but recommends batching.
**Warning signs:** 429 responses from Vercel API, "rate limited" errors.

### Pitfall 5: Elementor JSON Format Version Mismatch
**What goes wrong:** Generated Elementor JSON uses a schema version that doesn't match the user's Elementor installation, causing import failures.
**Why it happens:** Elementor's JSON schema has evolved (currently version "0.4"), and different Elementor versions expect different element structures.
**How to avoid:** Target version "0.4" (current standard), use only stable element types (`container`, `widget` with `html` widget type), validate output against known structure. Keep the conversion simple -- use HTML widgets rather than trying to map to native Elementor widgets.
**Warning signs:** Import errors in Elementor, blank pages after import, missing sections.

### Pitfall 6: Role Type Enum Migration
**What goes wrong:** Adding `builder` to the `role_type` Postgres enum requires a migration, and the TypeScript `RoleType` union must match exactly.
**Why it happens:** The enum exists in both Postgres (ALTER TYPE role_type ADD VALUE) and TypeScript (types.ts).
**How to avoid:** Follow the exact pattern from `149_role_type_growth.sql` and update `types.ts` to include `'builder'` in the RoleType union. Also update `ROLE_DEFAULTS` in `role-init.ts`.
**Warning signs:** Foreign key constraint violations, TypeScript compile errors, "No implementation for builder" runtime errors.

## Code Examples

Verified patterns from the codebase:

### Database Migration for Builder Role Type
```sql
-- Source: pattern from supabase/migrations/149_role_type_growth.sql
-- XXX_builder_role_type.sql
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'builder';
```

### Builder Sites Table
```sql
-- New table for persisting generated sites
CREATE TABLE builder_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  files JSONB NOT NULL DEFAULT '{}',  -- { "index.html": "...", "styles.css": "...", "script.js": "..." }
  template_id TEXT,                    -- starter template used, if any
  thumbnail_url TEXT,                  -- screenshot/preview thumbnail
  deployment_url TEXT,                 -- Vercel/Netlify URL if deployed
  deployment_platform TEXT,            -- 'vercel' | 'netlify' | null
  deployment_id TEXT,                  -- platform deployment ID
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'deployed', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE builder_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY builder_sites_org ON builder_sites
  FOR ALL USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY builder_sites_service ON builder_sites
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_builder_sites_org ON builder_sites(org_id);
CREATE INDEX idx_builder_sites_status ON builder_sites(org_id, status);

CREATE TRIGGER trg_builder_sites_updated_at
  BEFORE UPDATE ON builder_sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Template Library Starter Templates
```typescript
// Source: new file, following codebase conventions
export interface BuilderTemplate {
  id: string
  name: string
  category: 'business' | 'portfolio' | 'landing' | 'ecommerce' | 'restaurant' | 'trades'
  description: string
  thumbnail: string // path to static thumbnail
  files: Record<string, string> // filename -> content
  tags: string[]
}

export const STARTER_TEMPLATES: BuilderTemplate[] = [
  {
    id: 'business-modern',
    name: 'Modern Business',
    category: 'business',
    description: 'Clean, professional single-page website with hero, services, about, and contact sections',
    thumbnail: '/templates/business-modern.png',
    files: {
      'index.html': '<!DOCTYPE html>...', // Full template HTML
      'styles.css': '/* Tailwind CDN-based styles */',
    },
    tags: ['professional', 'services', 'contact-form'],
  },
  {
    id: 'trades-contractor',
    name: 'Trades & Contractor',
    category: 'trades',
    description: 'Service-focused site for plumbers, electricians, builders with quote request form',
    thumbnail: '/templates/trades-contractor.png',
    files: { /* ... */ },
    tags: ['trades', 'services', 'quote-form', 'testimonials'],
  },
  // ... more templates per category
]
```

### TypeScript Type Update
```typescript
// Source: src/lib/bitbit-core/types.ts line 342
// Update from:
export type RoleType = 'finance' | 'comms' | 'sales' | 'growth'
// To:
export type RoleType = 'finance' | 'comms' | 'sales' | 'growth' | 'builder'
```

### Plan Gate Update
```typescript
// Source: src/lib/billing/plan-gates.ts
// Builder should be gated to growth/scale plans (premium differentiator)
// Add 'builder' to growthRoles for growth and scale plans
growth: {
  // ...existing
  growthRoles: ['seo', 'content', 'ad-script', 'builder'],
},
scale: {
  // ...existing
  growthRoles: ['all'], // already covers builder
},
```

### Tool Group Registration
```typescript
// Source: pattern from src/lib/agent/tools.ts
// Add new tool group:
builder: {
  id: 'builder',
  label: 'Website Builder',
  description: 'Generate websites from natural language, preview in sandbox, deploy to hosting platforms, export to WordPress/Elementor',
  tools: ['generate_site', 'update_site', 'deploy_site', 'export_site', 'list_builder_templates'],
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full-page Sandpack embeds | Lightweight iframe sandbox + srcdoc | 2024-2025 | For AI-generated static previews, iframe sandbox is dominant. Sandpack reserved for interactive coding playgrounds. |
| WordPress REST API push | Elementor JSON export/import | 2024-2025 | Export-based approach avoids WP authentication complexity. Users import the JSON themselves. |
| GitHub-based deployments | Inline file deployment via Vercel/Netlify APIs | 2024-2025 | No git repo needed. Send files directly in API call for instant deployment. |
| Custom code sandboxes | Browser `sandbox` attribute hardening | 2023-2024 | Browser-level isolation is now the standard. `allow-same-origin` + `srcdoc` recognized as dangerous. |

**Deprecated/outdated:**
- Sandpack < 2.0: Major API changes between v1 and v2. If ever added, ensure v2.20+.
- WordPress XML-RPC: Deprecated in favor of REST API. Never use XML-RPC for programmatic page creation.
- Elementor template format < 0.4: Older versions use sections/columns instead of containers. Target 0.4 only.

## Open Questions

1. **Vercel API Authentication for End Users**
   - What we know: Vercel requires a Bearer token. BitBit's own Vercel project is already configured.
   - What's unclear: Should we deploy to the user's own Vercel account (requires OAuth flow + token storage in org_integrations) or to a shared BitBit Vercel account with custom subdomains?
   - Recommendation: Start with BitBit-managed deployment (sites deploy to `*.bitbit-sites.vercel.app`) as the default. Add "bring your own Vercel" via org_integrations OAuth flow as an upgrade. This removes the onboarding friction of requiring users to have a Vercel account.

2. **Multi-Page Site Generation**
   - What we know: v1 success criteria says "generates working HTML/CSS/JS from natural language chat" -- implies single-page.
   - What's unclear: Do starter templates need multi-page support (about.html, services.html, contact.html)?
   - Recommendation: v1 targets single-page sites (all sections in one index.html with CSS). Multi-page support is straightforward to add later since the `files` JSONB column already supports multiple files.

3. **Template Thumbnail Generation**
   - What we know: Templates need visual thumbnails for the gallery UI.
   - What's unclear: Generate thumbnails at build time (static), at upload time (Puppeteer screenshot), or on-demand?
   - Recommendation: Static thumbnails for starter templates (committed to public/templates/). For user-generated sites, defer thumbnail generation -- use a placeholder icon initially. Add Puppeteer/Playwright-based screenshot service later if validated.

4. **Iterative Refinement Token Cost**
   - What we know: Each "change the header color" request currently would regenerate the entire site.
   - What's unclear: How to efficiently patch existing HTML without full regeneration.
   - Recommendation: Pass the full current HTML as context with the change request. The LLM can return a diff or the full updated file. Track token usage per session and warn when approaching budget limits.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `vitest run --reporter=verbose` |
| Full suite command | `vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-01 | Builder role registers with correct type and defaults | unit | `vitest run src/lib/roles/builder/__tests__/builder-role.test.ts -t "registers"` | Wave 0 |
| BUILD-01 | Builder role evaluate returns valid RoleEvaluation | unit | `vitest run src/lib/roles/builder/__tests__/builder-role.test.ts -t "evaluate"` | Wave 0 |
| BUILD-01 | Builder tools generate valid HTML output | unit | `vitest run src/lib/roles/builder/__tests__/builder-tools.test.ts -t "generate"` | Wave 0 |
| BUILD-02 | Sandboxed iframe renders generated HTML safely | manual-only | Manual browser test: verify sandbox attributes prevent parent access | N/A - browser security |
| BUILD-02 | Artifact panel shows code/preview toggle for builder output | unit | `vitest run src/components/builder/__tests__/builder-preview.test.ts` | Wave 0 |
| BUILD-03 | Vercel deployment wrapper sends correct API payload | unit | `vitest run src/lib/roles/builder/__tests__/deploy-vercel.test.ts` | Wave 0 |
| BUILD-03 | Elementor JSON export produces valid template structure | unit | `vitest run src/lib/roles/builder/__tests__/elementor-export.test.ts` | Wave 0 |
| BUILD-03 | Netlify deployment wrapper sends correct ZIP payload | unit | `vitest run src/lib/roles/builder/__tests__/deploy-netlify.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `vitest run src/lib/roles/builder/ --reporter=verbose`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/roles/builder/__tests__/builder-role.test.ts` -- covers BUILD-01 role registration
- [ ] `src/lib/roles/builder/__tests__/builder-tools.test.ts` -- covers BUILD-01 tool generation
- [ ] `src/lib/roles/builder/__tests__/deploy-vercel.test.ts` -- covers BUILD-03 Vercel deployment
- [ ] `src/lib/roles/builder/__tests__/deploy-netlify.test.ts` -- covers BUILD-03 Netlify deployment
- [ ] `src/lib/roles/builder/__tests__/elementor-export.test.ts` -- covers BUILD-03 export format
- [ ] `src/components/builder/__tests__/builder-preview.test.ts` -- covers BUILD-02 preview

## Sources

### Primary (HIGH confidence)
- **Existing codebase**: `src/lib/roles/` -- full role system implementation (registry, runtime, init, scheduler, 4 existing roles)
- **Existing codebase**: `src/lib/agent/tools.ts` -- tool registration pattern, tool groups, JIT instructions
- **Existing codebase**: `src/components/chat/artifact-panel.tsx` + `use-artifacts.ts` -- existing HTML preview with code/preview toggle
- **Existing codebase**: `src/lib/agent/tools/code-execution.ts` -- sandboxed code execution pattern
- **Existing codebase**: `src/lib/billing/plan-gates.ts` -- plan gating system
- **Existing codebase**: `supabase/migrations/092_role_engine_tables.sql` -- role engine schema
- **Existing codebase**: `supabase/migrations/149_role_type_growth.sql` -- enum extension pattern
- [Vercel Create Deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) -- v13 endpoint with inline file support
- [MDN iframe sandbox attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) -- security model documentation

### Secondary (MEDIUM confidence)
- [Elementor Data Structure](https://developers.elementor.com/docs/data-structure/general-structure/) -- template JSON format (version 0.4)
- [Netlify Deploy API](https://docs.netlify.com/deploy/create-deploys/) -- ZIP-based deployment
- [Sandpack React](https://sandpack.codesandbox.io/) -- evaluated as alternative, deferred to v2
- [WordPress REST API](https://developer.wordpress.org/rest-api/) -- page creation endpoints (deferred for v1)

### Tertiary (LOW confidence)
- [Custom Elementor Template Library](https://dinhtungdu.github.io/create-your-own-elementor-template-library/) -- community guide for custom sources
- AI website builder market trends from web search -- directional only, not used for technical decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All core libraries are already in the project. No new dependencies needed for v1.
- Architecture: HIGH - Follows exact patterns established by 4 existing roles. Role system is mature and well-documented in codebase.
- Pitfalls: MEDIUM - iframe sandbox security is well-documented, but Vercel API rate limits and Elementor JSON compatibility have gaps in available documentation.
- Deployment integration: MEDIUM - Vercel API docs are comprehensive, but end-user auth flow (OAuth) is not fully researched. BitBit-managed deployment recommended for v1.
- Elementor export: MEDIUM - JSON format is documented, but real-world import testing with various Elementor versions was not performed.

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable domain -- iframe sandbox, REST APIs, and Elementor format are all stable)
