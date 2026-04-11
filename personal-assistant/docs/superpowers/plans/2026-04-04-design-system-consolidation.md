# Design System Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate design system drift by enforcing tokens at the Tailwind config level, fixing UI primitives, and sweeping feature components — reducing 650+ deviations to zero.

**Architecture:** Three-phase approach: (1) Fix Tailwind theme overrides in `globals.css` so utility classes like `text-xs`, `rounded-md`, `font-semibold` resolve to allowed values — this auto-fixes ~550 violations with zero component edits. (2) Fix the 6 UI primitive components that propagate violations to every consumer. (3) Sweep remaining hardcoded inline styles in feature components.

**Tech Stack:** Tailwind CSS v4 (with `@theme inline`), Next.js App Router, React inline styles via `design-tokens.ts`

---

## Phase 1: Tailwind Config Overrides (Auto-Fix ~550 Violations)

### Task 1: Override Font Sizes in Tailwind Theme

The `@theme inline` block in `globals.css` already overrides `--text-sm` and `--text-base` to `1rem` (16px). But `--text-xs` is untouched, resolving to Tailwind's default 12px. Similarly, `--text-lg` through `--text-5xl` use Tailwind defaults (18-48px).

**Files:**
- Modify: `src/app/globals.css:11-78` (the `@theme inline` block)

- [ ] **Step 1: Add font size overrides to `@theme inline`**

In `src/app/globals.css`, inside the `@theme inline { ... }` block, after the existing `--text-base--line-height` line, add:

```css
  --text-xs: 0.875rem;
  --text-xs--line-height: calc(1.45 / 0.875);
  --text-lg: 1rem;
  --text-lg--line-height: calc(1.5 / 1);
  --text-xl: 1rem;
  --text-xl--line-height: calc(1.5 / 1);
  --text-2xl: 1rem;
  --text-2xl--line-height: calc(1.5 / 1);
  --text-3xl: 1rem;
  --text-3xl--line-height: calc(1.5 / 1);
  --text-4xl: 1rem;
  --text-4xl--line-height: calc(1.5 / 1);
  --text-5xl: 1rem;
  --text-5xl--line-height: calc(1.5 / 1);
```

This collapses the entire font size scale to two values: `text-xs` = 14px (0.875rem), everything else = 16px (1rem). All 439 `text-xs` instances and 52 `text-lg/2xl/3xl/4xl/5xl` instances auto-fix.

- [ ] **Step 2: Verify no visual breakage**

Run: `ssh studio-server 'cd ~/bitbit/personal-assistant && npx next build 2>&1 | tail -5'`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(design-system): collapse font size scale to 14px/16px via Tailwind theme overrides"
```

---

### Task 2: Override Font Weights in Tailwind Theme

Tailwind's `font-semibold` = 600 and `font-bold` = 700. The design system allows only 400 and 500. Override at the theme level.

**Files:**
- Modify: `src/app/globals.css:11-78` (the `@theme inline` block)

- [ ] **Step 1: Add font weight overrides to `@theme inline`**

In `src/app/globals.css`, inside the `@theme inline { ... }` block, add:

```css
  --font-weight-semibold: 500;
  --font-weight-bold: 500;
  --font-weight-extrabold: 500;
  --font-weight-black: 500;
```

This makes `font-semibold`, `font-bold`, `font-extrabold`, and `font-black` all resolve to 500. The 67 violations auto-fix.

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(design-system): cap font weights at 500 via Tailwind theme overrides"
```

---

### Task 3: Override Border Radius in Tailwind Theme

`rounded-md` resolves to `--radius-md` which is `--radius-base-md` = 8px. The STYLE_GUIDE says 8px is allowed, so `rounded-md` is actually fine. But the spatial audit flagged `rounded-sm` (4px on non-internal elements) and `rounded-none` (0px) as forbidden. Also fix the `--radius-base-xl: 22px` which should be `24px`.

**Files:**
- Modify: `src/app/globals.css:125-128` (radius token definitions)

- [ ] **Step 1: Fix `--radius-base-xl` from 22px to 24px**

In `src/app/globals.css`, change:

```css
  --radius-base-xl: 22px;   /* Large Interactive (Chat Input, Large Cards) */
```

to:

```css
  --radius-base-xl: 24px;   /* Large Interactive (Chat Input, Large Cards) */
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(design-system): correct --radius-base-xl from 22px to 24px"
```

---

## Phase 2: Fix UI Primitives (6 Components)

These are imported by dozens of feature components. Fixing them cascades fixes everywhere.

### Task 4: Fix `components/ui/badge.tsx`

The STYLE_GUIDE says Badge should not be a shadcn import — but since 62 files import it, we keep the component but fix its internals to match the design system.

**Files:**
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: Read the current file**

```bash
ssh studio-server 'cat ~/bitbit/personal-assistant/src/components/ui/badge.tsx'
```

- [ ] **Step 2: Replace `text-xs` with `text-sm`, replace `font-semibold` with `font-medium`, replace `rounded-md` with `rounded-lg` if present**

Apply these replacements in `src/components/ui/badge.tsx`:
- `text-xs` → `text-sm` (14px)
- `font-semibold` → `font-medium` (500)
- `rounded-md` → `rounded-lg` (10px) if present
- Keep `rounded-full` (9999px — allowed)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "fix(ui): align Badge to design system (14px, weight 500, radius 10px)"
```

---

### Task 5: Fix `components/ui/button.tsx`

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Read the current file**

```bash
ssh studio-server 'cat ~/bitbit/personal-assistant/src/components/ui/button.tsx'
```

- [ ] **Step 2: Replace violations**

Apply these replacements in `src/components/ui/button.tsx`:
- `text-xs` → `text-sm`
- `font-semibold` → `font-medium`
- `rounded-md` → `rounded-lg` if present
- Ensure minimum height is 40px (`h-10`)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "fix(ui): align Button to design system"
```

---

### Task 6: Fix `components/ui/sidebar.tsx`

Has 10+ `rounded-md` instances and 4 `text-xs` instances.

**Files:**
- Modify: `src/components/ui/sidebar.tsx`

- [ ] **Step 1: Read the current file**

```bash
ssh studio-server 'cat ~/bitbit/personal-assistant/src/components/ui/sidebar.tsx'
```

- [ ] **Step 2: Replace all violations**

Apply globally in `src/components/ui/sidebar.tsx`:
- `rounded-md` → `rounded-lg` (all instances)
- `text-xs` → `text-sm` (all instances)
- `font-semibold` → `font-medium` (if present)
- `font-bold` → `font-medium` (if present)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sidebar.tsx
git commit -m "fix(ui): align Sidebar to design system (radius, font size, weight)"
```

---

### Task 7: Fix `components/ui/dropdown-menu.tsx`

Has 4 `rounded-md` and 2 `text-xs`.

**Files:**
- Modify: `src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Read and fix**

Apply globally in `src/components/ui/dropdown-menu.tsx`:
- `rounded-md` → `rounded-lg`
- `text-xs` → `text-sm`

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx
git commit -m "fix(ui): align DropdownMenu to design system"
```

---

### Task 8: Fix `components/ui/tooltip.tsx` and `components/ui/toast.tsx`

**Files:**
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/ui/toast.tsx`

- [ ] **Step 1: Fix tooltip**

In `src/components/ui/tooltip.tsx`:
- `rounded-md` → `rounded-lg`
- `text-xs` → `text-sm`

- [ ] **Step 2: Fix toast**

In `src/components/ui/toast.tsx`:
- `rounded-md` → `rounded-lg`
- Any non-4px spacing values (gap: 10 → gap: 12)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tooltip.tsx src/components/ui/toast.tsx
git commit -m "fix(ui): align Tooltip and Toast to design system"
```

---

### Task 9: Fix `components/ui/tabs.tsx`

**Files:**
- Modify: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Fix tabs**

In `src/components/ui/tabs.tsx`:
- `rounded-md` → `rounded-lg`
- `text-xs` → `text-sm`
- `font-semibold` → `font-medium`

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "fix(ui): align Tabs to design system"
```

---

## Phase 3: Sweep Feature Components — Inline Style Violations

With Tailwind overrides handling utility classes and UI primitives fixed, what remains are hardcoded inline `fontSize`, `fontWeight`, `borderRadius` values in feature components.

### Task 10: Fix Hardcoded `fontSize` in Inline Styles

These are components using `style={{ fontSize: 12 }}` or similar non-14/16 values.

**Files:**
- Modify: `src/components/dashboard/notification-center.tsx` (lines 402, 425, 458, 560, 570, 582)
- Modify: `src/components/dashboard/splash-screen.tsx` (line 310)
- Modify: `src/components/dashboard/markdown-renderer.tsx` (line 26)
- Modify: `src/components/dashboard/charts/chart-radar-capabilities.tsx` (line 57)
- Modify: `src/components/chat/chat-interface.tsx` (line 2228)

- [ ] **Step 1: Read each file and locate the violations**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src && grep -n "fontSize: 1[0-3]\|fontSize: 11\|fontSize: 32\|fontSize.*0.9" components/dashboard/notification-center.tsx components/dashboard/splash-screen.tsx components/dashboard/markdown-renderer.tsx components/dashboard/charts/chart-radar-capabilities.tsx components/chat/chat-interface.tsx'
```

- [ ] **Step 2: Fix each violation**

Replace in each file:
- `fontSize: 11` → `fontSize: 14`
- `fontSize: 12` → `fontSize: 14`
- `fontSize: 13` → `fontSize: 14`
- `fontSize: 32` → `fontSize: 16` (splash-screen — page title should use weight/color for hierarchy, not size)
- `fontSize: '0.9em'` → `fontSize: 14` (markdown-renderer)

- [ ] **Step 3: Fix `fontWeight: 800` in splash-screen**

In `src/components/dashboard/splash-screen.tsx`, change `fontWeight: 800` to `fontWeight: 500`.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/notification-center.tsx src/components/dashboard/splash-screen.tsx src/components/dashboard/markdown-renderer.tsx src/components/dashboard/charts/chart-radar-capabilities.tsx src/components/chat/chat-interface.tsx
git commit -m "fix(components): replace hardcoded font sizes/weights with design system values"
```

---

### Task 11: Fix Hardcoded `borderRadius` in Inline Styles

**Files:**
- Modify: `src/components/portal/portal-dashboard.tsx` (lines 255, 259 — `borderRadius: 3`)
- Modify: `src/components/portal/portal-files.tsx` (line 221 — `borderRadius: 4`)
- Modify: `src/components/portal/portal-projects.tsx` (lines 115, 119 — `borderRadius: 4`)
- Modify: `src/components/dashboard/notification-center.tsx` (line 428 — `borderRadius: 4`)
- Modify: `src/components/invoices/invoice-list.tsx` (line 568 — `borderRadius: 99`)

- [ ] **Step 1: Fix each violation**

Replace:
- `borderRadius: 2` → `borderRadius: 8`
- `borderRadius: 3` → `borderRadius: 8`
- `borderRadius: 4` → `borderRadius: 8`
- `borderRadius: 0` → `borderRadius: 8` (splash-screen, unless it's a progress bar fill)
- `borderRadius: 99` → `borderRadius: 9999` (pill)

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/portal-dashboard.tsx src/components/portal/portal-files.tsx src/components/portal/portal-projects.tsx src/components/dashboard/notification-center.tsx src/components/invoices/invoice-list.tsx
git commit -m "fix(components): replace hardcoded border-radius with design system values"
```

---

### Task 12: Fix Non-4px Spacing in Inline Styles

**Files:**
- Modify: `src/components/revenue/cashflow-bar.tsx` (line 63 — `marginTop: 2`)
- Modify: `src/components/ui/toast.tsx` (lines 98, 137 — `gap: 10`)
- Modify: `src/components/dashboard/notification-center.tsx` (lines 552, 572, 584, 597)
- Modify: `src/components/dashboard/markdown-renderer.tsx` (lines 46, 51 — values of 14)

- [ ] **Step 1: Fix each violation**

Replace:
- `marginTop: 2` → `marginTop: 4`
- `gap: 10` → `gap: 12`
- `marginTop: 6` → `marginTop: 8`
- `marginTop: 1` → `marginTop: 4`
- `gap: 1` → `gap: 4`
- `14` (spacing) → `16` or `12` depending on context

- [ ] **Step 2: Commit**

```bash
git add src/components/revenue/cashflow-bar.tsx src/components/ui/toast.tsx src/components/dashboard/notification-center.tsx src/components/dashboard/markdown-renderer.tsx
git commit -m "fix(components): align spacing to 4px grid"
```

---

## Phase 4: Remove `font-semibold` and `font-bold` from Feature Components

The Tailwind overrides in Phase 1 already make these render as 500. But for code clarity, replace the class names too so the code matches intent.

### Task 13: Bulk Replace `font-semibold` → `font-medium` Across Components

**Files:**
- All 51 instances across ~20 files

- [ ] **Step 1: Run bulk sed replacement**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src/components && find . -name "*.tsx" -exec sed -i "s/font-semibold/font-medium/g" {} +'
```

- [ ] **Step 2: Run bulk sed for font-bold (excluding markdown-renderer which needs it for `<strong>`)**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src/components && find . -name "*.tsx" ! -name "markdown-renderer.tsx" -exec sed -i "s/font-bold/font-medium/g" {} +'
```

For `markdown-renderer.tsx`, `font-bold` on `<strong>` tags and headings should become `font-medium`:

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src/components && sed -i "s/font-bold/font-medium/g" markdown-renderer.tsx'
```

- [ ] **Step 3: Verify build**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | head -5'
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(components): replace font-semibold/bold with font-medium across all components"
```

---

## Phase 5: Replace `rounded-md` in Feature Components

Same logic as Phase 4 — Tailwind override handles rendering, but align code to intent.

### Task 14: Bulk Replace `rounded-md` → `rounded-lg` Across Components

**Files:**
- All 61 instances across ~25 files

- [ ] **Step 1: Run bulk replacement**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src/components && find . -name "*.tsx" -exec sed -i "s/rounded-md/rounded-lg/g" {} +'
```

- [ ] **Step 2: Also replace `rounded-sm` → `rounded-lg` and `rounded-none` → `rounded-lg` (except where 0 radius is structural like dividers)**

Review first:
```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src/components && grep -rn "rounded-sm\|rounded-none" --include="*.tsx" .'
```

Replace only non-structural uses (skip dividers, progress bar fills).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(components): replace rounded-md/sm with rounded-lg across all components"
```

---

## Phase 6: Hardcoded Glass Patterns → Design Tokens (Stretch)

Zero components import `design-tokens.ts`. This phase is lower priority — the current hardcoded patterns work, but they duplicate values. This can be done incrementally as components are touched for other reasons.

### Task 15: Document the Pattern for Future Work

**Files:**
- Modify: `STYLE_GUIDE.md`

- [ ] **Step 1: Add migration note to STYLE_GUIDE.md**

Add a section at the bottom:

```markdown
## Migration: Hardcoded Glass → Design Tokens

When editing any component that uses inline `background: 'rgba(...)'` + `backdropFilter: 'blur(...)'`,
replace with the appropriate `S.*` token from `@/lib/styles/design-tokens`:

```tsx
// BEFORE
style={{ background: 'rgba(15, 20, 30, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.03)' }}

// AFTER
import { S } from '@/lib/styles/design-tokens'
style={S.card}
```

Priority files (most hardcoded glass patterns):
- `components/marketing/testimonials-section.tsx`
- `components/dashboard/notification-center.tsx`
- `components/marketing/nav-bar.tsx`
- `components/dev/dev-toolbar.tsx`
- `components/knowledge/graph-viewer.tsx`
- `components/connections/connections-grid.tsx`
```

- [ ] **Step 2: Commit**

```bash
git add STYLE_GUIDE.md
git commit -m "docs(style-guide): add glass pattern migration guidance"
```

---

## Verification

### Task 16: Final Verification Pass

- [ ] **Step 1: Type check**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | tail -5'
```

Expected: No errors.

- [ ] **Step 2: Audit remaining violations**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant/src/components && echo "text-xs:" && grep -r "text-xs" --include="*.tsx" -l | wc -l && echo "font-semibold:" && grep -r "font-semibold" --include="*.tsx" -l | wc -l && echo "font-bold:" && grep -r "font-bold" --include="*.tsx" -l | wc -l && echo "rounded-md:" && grep -r "rounded-md" --include="*.tsx" -l | wc -l && echo "fontSize 11-13:" && grep -rn "fontSize: 1[1-3]" --include="*.tsx" | wc -l'
```

Expected: All counts should be 0 (except `font-bold` in markdown-renderer if `<strong>` needs visual weight — but it will render as 500 via Tailwind override anyway).

- [ ] **Step 3: Build**

```bash
ssh studio-server 'cd ~/bitbit/personal-assistant && npx next build 2>&1 | tail -10'
```

Expected: Build succeeds.

- [ ] **Step 4: Commit any remaining fixes**

---

## Summary of Impact

| Phase | What | Violations Fixed | Method |
|-------|------|-----------------|--------|
| 1 | Tailwind theme overrides | ~558 | Config change, zero component edits |
| 2 | UI primitive fixes | ~30 (cascades to all consumers) | 6 file edits |
| 3 | Inline style violations | ~25 | ~10 file edits |
| 4 | font-semibold/bold cleanup | 67 | Bulk sed |
| 5 | rounded-md cleanup | 61 | Bulk sed |
| 6 | Glass pattern docs | 0 (future guidance) | 1 doc edit |
| **Total** | | **~741** | |
