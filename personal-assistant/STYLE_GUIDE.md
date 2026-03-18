# BitBit UI Design System — Agent Reference

## HARD CONSTRAINTS (no exceptions unless justified for accessibility)

### 1. Typography (extremely limited scale)

Two font sizes only:
- **16px** — primary body, labels, card titles, section headers
- **14px** — secondary/helper text, captions, metadata

Allowed weights: **400** (Regular) + **500** (Medium) only.
No bold (600/700+), no light (300-), no other sizes (no 11px, 12px, 13px, 18px, 20px, 22px, 24px, 38px etc.)

Line height: 1.4–1.5x for 16px, 1.35–1.45x for 14px

Font family: Inter (via `--font-inter` / `var(--font-sans)`) — do not mix families.
Mono numbers: JetBrains Mono (via `var(--font-mono)`) — allowed for numeric displays only.

### 2. Spacing & Layout (4px gospel)

Every spacing value MUST be a multiple of 4px.
Allowed: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, ...
Forbidden: 3, 5, 6, 7, 10, 14, 15, 18, 22, etc.

Most common values: **8px / 12px / 16px / 24px**

Use CSS vars: `--gap-xs: 4px`, `--gap-sm: 8px`, `--gap-md: 16px`, `--gap-lg: 24px`, `--gap-xl: 32px`, `--gap-2xl: 40px`

### 3. Buttons & Interactive Elements

Minimum tappable/clickable height = **40px** (most buttons exactly 40px tall).
Horizontal padding: 16px–24px (most commonly 20px).
Touch targets: minimum 40x40px hit area.
Primary CTA: may go 48px on mobile/spacious layouts — otherwise 40px.

### 4. Corner Radius (border-radius)

Only values in the range **8px → 40px** (or 9999px for pills).
- Cards, containers, large surfaces → 12px–16px
- Buttons, chips, tags → 8px–12px (or 9999px pill)
- Modals/dialogs → 16px–24px
- Soft/modern feel on large cards → 20px–32px

Forbidden: 0px, 6px, 10px, 14px, 18px

Use CSS vars: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 24px`, `--radius-full: 9999px`

### 5. Icons

Default size: **24x24px**
Smaller contextual icons: 20x20px or 16x16px only when necessary.
Stroke width: 1.5px default, 2px for high-contrast.
Prefer outlined style (lucide-react default).

## CRITICAL RULES

1. **INLINE React.CSSProperties ONLY** — No Tailwind utility classes for visual design. Tailwind is OK for layout (flex, grid) but all colors, backgrounds, borders, shadows, typography MUST use inline styles.
2. **Monochrome palette** — Use whites, grays, and the dark navy background. Orange accent sparingly for CTAs only.
3. **No fluoro colors** — Avoid bright greens, pinks, cyans unless absolutely required for UX (e.g., status indicators). Even status colors should be muted/desaturated.
4. **Noise texture over glows** — Whenever there is glow or color, apply SVG noise overlay with `mix-blend-mode: overlay`.
5. **Premium & minimalistic** — Less is more. Generous whitespace. No visual clutter.
6. **Preserve all functionality** — Only change styling, not behavior. Keep all hooks, state, API calls, data flow intact.
7. **Do NOT import shadcn components** (Card, Button, Badge, Input, Tabs, etc.) — Replace with styled `<div>`, `<button>`, `<span>`, `<input>` elements using inline styles.
8. **Keep TabShell wrapper** — Every tab must stay wrapped in `<TabShell>`.

## DEFAULT DECISION (when in doubt)

```
fontSize: 16, padding: 16, borderRadius: 12, icon: 24px, button height: 40px, fontWeight: 400
```

## COLOR TOKENS (use as CSS values in inline styles)

```
// Backgrounds
'#0a0f1a'                              // page background (already set by layout)
'rgba(15, 20, 30, 0.6)'               // glass card
'rgba(12, 16, 24, 0.85)'              // heavy glass (modals, dropdowns)
'rgba(10, 14, 23, 0.5)'               // list row
'rgba(25, 35, 50, 0.8)'               // elevated surface
'rgba(13, 17, 23, 0.6)'               // input background

// Text
'var(--text-primary, #F1F5F9)'         // primary text
'var(--text-secondary, #94A3B8)'       // secondary/label text
'var(--text-dim, #475569)'             // dim/muted text
'rgba(255, 255, 255, 0.5)'            // placeholder text

// Borders
'1px solid rgba(255, 255, 255, 0.03)'  // subtle card border
'1px solid rgba(255, 255, 255, 0.06)'  // slightly visible border
'1px solid rgba(255, 255, 255, 0.1)'   // hover/active border
'1px solid rgba(255, 255, 255, 0.2)'   // focus border

// Accent (use sparingly)
'#FF5A1F'                              // orange accent (CTAs, active states)
'rgba(255, 90, 31, 0.15)'             // orange tint background
'rgba(255, 90, 31, 0.3)'              // orange border

// Status colors (muted versions)
'#22c55e'                              // success green
'rgba(34, 197, 94, 0.12)'             // success bg
'#eab308'                              // warning yellow
'rgba(234, 179, 8, 0.12)'             // warning bg
'#ef4444'                              // error red
'rgba(239, 68, 68, 0.12)'             // error bg
```

## GLASS CARD PATTERN (copy-paste this)

```typescript
const glassCard: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
}
```

## GLASS BUTTON PATTERNS

```typescript
// Ghost button (default) — 40px tall
const ghostBtn: React.CSSProperties = {
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}
// On hover: background: 'rgba(255, 255, 255, 0.04)', borderColor: 'rgba(255, 255, 255, 0.1)'

// Accent button (primary CTA) — 40px tall
const accentBtn: React.CSSProperties = {
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  background: '#FF5A1F',
  border: 'none',
  color: '#000',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}
// On hover: background: '#FF7A45', transform: 'translateY(-1px)'

// Pill/chip button (filter pills, tags) — 40px tall
const pillBtn: React.CSSProperties = {
  height: 40,
  padding: '0 16px',
  borderRadius: 9999,
  background: 'rgba(10, 14, 23, 0.42)',
  backdropFilter: 'blur(22px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  border: 'none',
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}
// Active state: color: 'var(--text-primary)', background: 'rgba(255, 90, 31, 0.15)'
```

## INPUT PATTERN

```typescript
// 40px tall input
const glassInput: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  background: 'rgba(13, 17, 23, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
}
// On focus: borderColor: 'rgba(255, 255, 255, 0.2)', boxShadow: '0 0 0 2px rgba(255, 90, 31, 0.15)'
```

## SELECT/DROPDOWN PATTERN

```typescript
const glassSelect: React.CSSProperties = {
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  background: 'rgba(13, 17, 23, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  appearance: 'none' as const,
  cursor: 'pointer',
}
```

## BADGE/TAG PATTERN

```typescript
// Neutral badge
const badge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 12px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-secondary, #94A3B8)',
}

// Colored badge (pass accent color)
function coloredBadge(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    background: `${color}15`,
    color: color,
  }
}
```

## LIST ROW PATTERN (for tables/lists)

```typescript
const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(10, 14, 23, 0.5)',
  backdropFilter: 'blur(26px) saturate(1.15)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.15)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  border: 'none',
  transition: 'background 200ms',
  cursor: 'pointer',
}
// On hover: background: 'rgba(20, 28, 40, 0.7)'
```

## SECTION HEADER PATTERN

```typescript
const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
}
```

## PAGE HEADER PATTERN

```typescript
const pageTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  letterSpacing: '-0.01em',
}

const pageSubtitle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  marginTop: 4,
}
```

## KPI/METRIC LARGE NUMBER

```typescript
// Exception: KPI numbers use 16px mono — the only allowed display pattern
const bigNumber: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
}
```

## TYPOGRAPHY REFERENCE

```
// Page title:     fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em'
// Section label:  fontSize: 14, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase'
// Card title:     fontSize: 16, fontWeight: 500
// Body text:      fontSize: 16, fontWeight: 400
// Secondary text: fontSize: 14, fontWeight: 400
// Mono numbers:   fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500
```

## NOISE OVERLAY (for glowing/colored surfaces)

Apply as a `::after` pseudo-element via CSS class in bitbit-design-system.css, or inline via a sibling div:

```typescript
// Noise overlay div (place inside a position: relative container)
<div style={{
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.12'/%3E%3C/svg%3E")`,
  backgroundSize: '100px 100px',
  mixBlendMode: 'overlay' as const,
  pointerEvents: 'none' as const,
  zIndex: 1,
}} />
```

## EMPTY STATE PATTERN

```typescript
<div style={{
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 20px',
  gap: 12,
}}>
  <IconComponent size={24} style={{ color: 'var(--text-dim)' }} />
  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No items yet</span>
</div>
```

## LOADING SKELETON PATTERN

```typescript
const skeletonStyle: React.CSSProperties = {
  borderRadius: 8,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
}
// Add @keyframes shimmer { from { backgroundPosition: 200% 0 } to { backgroundPosition: -200% 0 } }
// OR use the existing .bb-skeleton class from design system CSS
```

## HOVER STATE MANAGEMENT

Use React state for hover since inline styles don't support :hover:

```typescript
const [hovered, setHovered] = useState<string | null>(null)

<div
  onMouseEnter={() => setHovered(item.id)}
  onMouseLeave={() => setHovered(null)}
  style={{
    ...listRow,
    background: hovered === item.id ? 'rgba(20, 28, 40, 0.7)' : 'rgba(10, 14, 23, 0.5)',
  }}
>
```

## SCROLLBAR STYLING

Already handled by globals.css — no action needed. Glass containers with overflow should use:
```typescript
{ overflowY: 'auto' as const, maxHeight: 'calc(100vh - 200px)' }
```

## WHAT TO REMOVE

- All `className="bg-... text-... border-... rounded-... shadow-..."` Tailwind visual classes
- All shadcn imports: `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Button`, `Badge`, `Input`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Select`, etc.
- Keep: `TabShell`, `EmptyState`, `useToast`, `AlertBanner`, lucide-react icons, hooks, API calls

## WHAT TO KEEP

- All React hooks (useState, useEffect, useCallback, useMemo, etc.)
- All API fetch calls and data transformations
- All TypeScript interfaces and types
- All lucide-react icon imports
- `TabShell` wrapper
- `motion/react` (framer-motion) animations if present
- DnD kit imports if present (invoices page)
- All business logic
