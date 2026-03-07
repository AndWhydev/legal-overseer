# BitBit Glassmorphic Style Guide — Agent Reference

## CRITICAL RULES

1. **INLINE React.CSSProperties ONLY** — No Tailwind utility classes for visual design. Tailwind is OK for layout (flex, grid) but all colors, backgrounds, borders, shadows, typography MUST use inline styles.
2. **Monochrome palette** — Use whites, grays, and the dark navy background. Orange accent sparingly for CTAs only.
3. **No fluoro colors** — Avoid bright greens, pinks, cyans unless absolutely required for UX (e.g., status indicators). Even status colors should be muted/desaturated.
4. **Noise texture over glows** — Whenever there is glow or color, apply SVG noise overlay with `mix-blend-mode: overlay`.
5. **Premium & minimalistic** — Less is more. Generous whitespace. No visual clutter.
6. **Preserve all functionality** — Only change styling, not behavior. Keep all hooks, state, API calls, data flow intact.
7. **Do NOT import shadcn components** (Card, Button, Badge, Input, Tabs, etc.) — Replace with styled `<div>`, `<button>`, `<span>`, `<input>` elements using inline styles.
8. **Keep TabShell wrapper** — Every tab must stay wrapped in `<TabShell>`.

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
  padding: '20px',
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
// Ghost button (default)
const ghostBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
}
// On hover: background: 'rgba(255, 255, 255, 0.04)', borderColor: 'rgba(255, 255, 255, 0.1)'

// Accent button (primary CTA)
const accentBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  background: '#FF5A1F',
  border: 'none',
  color: '#000',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 200ms',
}
// On hover: background: '#FF7A45', transform: 'translateY(-1px)'

// Pill/chip button (filter pills, tags)
const pillBtn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 20,
  background: 'rgba(10, 14, 23, 0.42)',
  backdropFilter: 'blur(22px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  border: 'none',
  fontSize: 12,
  color: 'var(--text-secondary, #94A3B8)',
  cursor: 'pointer',
  transition: 'all 200ms',
}
// Active state: color: 'var(--text-primary)', background: 'rgba(255, 90, 31, 0.15)'
```

## INPUT PATTERN

```typescript
const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
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
  padding: '10px 14px',
  borderRadius: 10,
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
  padding: '3px 10px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-secondary, #94A3B8)',
}

// Colored badge (pass accent color)
function coloredBadge(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
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
  padding: '12px 18px',
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
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
}
```

## PAGE HEADER PATTERN

```typescript
const pageTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--text-primary, #F1F5F9)',
  letterSpacing: '-0.02em',
}

const pageSubtitle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary, #94A3B8)',
  marginTop: 4,
}
```

## KPI/METRIC LARGE NUMBER

```typescript
const bigNumber: React.CSSProperties = {
  fontSize: 38,
  fontWeight: 700,
  color: 'var(--text-primary, #F1F5F9)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  letterSpacing: '-0.03em',
  lineHeight: 1,
}
```

## TYPOGRAPHY REFERENCE

```
// Page title:     fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em'
// Section label:  fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase'
// Card title:     fontSize: 14, fontWeight: 600
// Body text:      fontSize: 14, fontWeight: 400
// Small text:     fontSize: 12, fontWeight: 400
// Tiny label:     fontSize: 11, fontWeight: 500
// Mono numbers:   fontFamily: 'var(--font-mono)', fontWeight: 700
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
  <IconComponent size={32} style={{ color: 'var(--text-dim)' }} />
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
