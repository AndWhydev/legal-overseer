# Component Style Contracts

Single source of truth for visual consistency across the BitBit app.
Every component must conform to one of these archetypes.

## Foundation Rules

### Radius
- **Cards, panels, modals**: `rounded-xl` (16px)
- **Buttons, inputs, badges**: `rounded-lg` (from shadcn Button/Input defaults)
- **Pills, avatars, dots**: `rounded-full`
- Nothing else. No `rounded-md`, no `rounded-2xl`, no `rounded-sm`.

### Shadows
- **Cards on page**: `shadow-sm` (subtle lift)
- **Overlays (modals, drawers, popovers)**: `shadow-lg`
- **Everything else**: no shadow
- No `shadow-md`, `shadow-xl`, `shadow-2xl`, `shadow-hover`.

### Colors
- **No orange/amber anywhere** except status-warning indicators
- `primary` = near-black (already set in :root)
- Use only shadcn semantic tokens: `bg-card`, `bg-muted`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `border`
- Status colors: `text-destructive`, `text-success`, `text-warning` only
- No raw hex, no rgba, no oklch in component files
- No `bg-emerald-*`, `bg-blue-*`, `bg-violet-*` etc. — use `bg-muted` or `bg-secondary`

### Spacing
- Card internal padding: `p-4` (compact) or `p-6` (standard) via CardContent
- Section gaps: `gap-4` between cards, `gap-6` between sections
- No `p-3`, `p-5`, `p-8` on cards

---

## Archetypes

### 1. Stat Card (KPI widgets, role status, intelligence widgets)
```
<Card>                          // rounded-xl border shadow-sm (from base)
  <CardContent className="p-4">
    <icon + label header>       // text-xs text-muted-foreground
    <value>                     // text-2xl font-semibold font-mono
    <subtitle>                  // text-xs text-muted-foreground
  </CardContent>
</Card>
```
Rules:
- ALL stat cards identical — same radius, same shadow, same padding
- Icon in muted circle: `size-8 rounded-lg bg-muted flex items-center justify-center`
- Value is always `text-2xl font-semibold`
- No colored backgrounds on the card itself

### 2. Content Card (kanban cards, lead cards, invoice rows, list items)
```
<Card className="shadow-none">
  <CardContent className="p-4">
    ...content...
  </CardContent>
</Card>
```
Rules:
- No shadow (flat against background)
- `hover:bg-muted/50 transition-colors` for interactive cards
- Status shown via Badge, not colored borders or backgrounds

### 3. Dashboard Widget (today's jobs, hot leads, pending approvals)
```
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm font-medium">Widget Title</CardTitle>
  </CardHeader>
  <CardContent>
    ...list of items...
  </CardContent>
</Card>
```
Rules:
- Same Card base as stat cards (shadow-sm, rounded-xl)
- Title: `text-sm font-medium` (not bold, not xs)
- Items inside: no nested cards, just rows with `border-b last:border-0`

### 4. Empty / Error / Retry State
```
<Empty>
  <EmptyMedia variant="icon">
    <IconName />
  </EmptyMedia>
  <EmptyTitle>Title here</EmptyTitle>
  <EmptyDescription>Description here</EmptyDescription>
  <EmptyContent>
    <Button variant="outline" size="sm">Retry</Button>
  </EmptyContent>
</Empty>
```
Rules:
- ALWAYS use the shadcn Empty composition — no custom divs
- Icon wrapped in EmptyMedia with `variant="icon"` (gives muted bg circle)
- Button is always `variant="outline" size="sm"`
- No error-specific background colors on the container

### 5. Panel / Section (tab content, sidebar panels, drawers)
Rules:
- Background: `bg-background` (transparent, inherits page bg)
- No shadow, no border on the outer container
- Internal sections separated by `border-b` or `gap-6`

### 6. Input Group (search bars, filters, form fields)
Rules:
- Use shadcn Input/Select components as-is
- Group label: `text-sm font-medium`
- Helper text: `text-xs text-muted-foreground`

### 7. Badge / Status
- Use shadcn Badge variants only:
  - `default` — primary action
  - `secondary` — neutral/draft/pending
  - `destructive` — error/overdue/failed
  - `outline` — informational
- For status dots: `size-2 rounded-full bg-success/bg-destructive/bg-warning`
- No custom colored spans or divs for status

---

## Anti-patterns (never do)

- `rounded-md` or `rounded-2xl` on cards
- `shadow-md`, `shadow-xl`, `shadow-2xl` on anything
- Raw color values (`#ff6b00`, `rgba(...)`, `oklch(...)`) in component files
- `bg-orange-*`, `bg-amber-*`, `text-orange-*`, `text-amber-*`
- Custom empty/error divs instead of Empty component
- Different retry buttons (some outline, some ghost, some primary)
- Inline `style={{}}` for colors, borders, or backgrounds
- `space-x-*` or `space-y-*` (use `gap-*`)
