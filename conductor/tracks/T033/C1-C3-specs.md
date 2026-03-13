# C1-C3: Category Pills Styling Specification

## Overview
Redesign the category pills to have theme-aware selected/unselected states with proper glassmorphic styling and accessibility.

## File Location
`personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx` lines 806-889

## Current Issue
Pills collapse when count badges are appended; styling doesn't match design system.

## Solution: CategoryPillsBar Component

### Component Structure
```typescript
function CategoryPillsBar({
  activePill,
  onSelect,
  counts,
  hasUnreadPriority,
}: {
  activePill: CategoryPillType;
  onSelect: (pill: CategoryPillType) => void;
  counts: Record<CategoryPillType, number>;
  hasUnreadPriority: boolean;
}) {
  // 1. Detect theme (top of component)
  // 2. Map over PILL_ORDER
  // 3. Calculate styling based on isActive + isDarkMode
  // 4. Render button with proper styling
}
```

### Step 1: Theme Detection
Place this at the very beginning of the component:
```typescript
const isDarkMode = typeof window !== 'undefined'
  && !document.documentElement.classList.contains('light');
```

**Why**: Avoids SSR hydration mismatch. The `typeof window` check ensures this only runs on client.

### Step 2: Styling Constants
Define color mappings inside the map() function (not at component level):
```typescript
const darkSelectedBg = 'rgba(255,255,255,0.95)';
const darkSelectedColor = '#0A0A0B';
const darkUnselectedBg = 'rgba(10, 14, 23, 0.42)';
const darkUnselectedColor = 'var(--text-secondary, #94A3B8)';

const lightSelectedBg = '#1A1A1B';
const lightSelectedColor = '#FFFFFF';
const lightUnselectedBg = 'rgba(0,0,0,0.05)';
const lightUnselectedColor = 'var(--text-secondary, #94A3B8)';

const selectedBg = isDarkMode ? darkSelectedBg : lightSelectedBg;
const selectedColor = isDarkMode ? darkSelectedColor : lightSelectedColor;
const unselectedBg = isDarkMode ? darkUnselectedBg : lightUnselectedBg;
const unselectedColor = isDarkMode ? darkUnselectedColor : lightUnselectedColor;
```

### Step 3: Button Style Object
```typescript
style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderRadius: 20,
  // KEY FIX: No border when selected (C2)
  border: isActive ? 'none' : isDarkMode ? 'none' : '1px solid rgba(0,0,0,0.08)',
  // Use computed colors
  background: isActive ? selectedBg : unselectedBg,
  // Glassmorphism only in unselected state
  backdropFilter: isActive ? 'none' : isDarkMode ? 'blur(20px) saturate(1.2)' : 'none',
  WebkitBackdropFilter: isActive ? 'none' : isDarkMode ? 'blur(20px) saturate(1.2)' : 'none',
  // Inset shadow only in dark unselected
  boxShadow: isActive ? 'none' : isDarkMode ? 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' : 'none',
  color: isActive ? selectedColor : unselectedColor,
  fontSize: 12,
  fontWeight: isActive ? 600 : 500,
  cursor: 'pointer',
  transition: 'background 150ms ease, color 150ms ease, transform 150ms ease',
  whiteSpace: 'nowrap',  // KEY FIX (C1): Prevent pill from wrapping
  flexShrink: 0,         // KEY FIX (C1): Prevent shrinking when count appended
  animation: shouldPulse ? 'bb-pill-pulse 2s ease-in-out infinite' : 'none',
}}
```

### Step 4: Mouse Handlers
```typescript
onMouseEnter={(e) => {
  if (!isActive) {
    e.currentTarget.style.transform = 'scale(1.02)';
    // Light mode: brighten text on hover
    if (!isDarkMode) {
      e.currentTarget.style.color = 'var(--text-primary)';
    }
  }
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = 'scale(1)';
  // Restore color
  if (!isActive && !isDarkMode) {
    e.currentTarget.style.color = unselectedColor;
  }
}}
```

### Step 5: Count Badge Redesign
```typescript
{count > 0 && (
  <span style={{
    fontSize: 10,
    fontWeight: 600,
    minWidth: 16,
    height: 16,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    lineHeight: 1,
    flexShrink: 0,  // KEY FIX (C1): Prevent badge from shrinking pill
    // NO background color (C2)
    // NO border-radius
    // Inherits color from parent button
  }}>
    {count}
  </span>
)}
```

## Key Improvements (C1-C3)

### C1: Prevent Pill Collapse
- `whiteSpace: 'nowrap'` on button
- `flexShrink: 0` on button
- `flexShrink: 0` on count span
- `minWidth: 16` with `padding: 0 4px` ensures consistent badge size

### C2: Redesign Pill States
**Selected (Dark)**:
- Background: solid white (rgba(255,255,255,0.95))
- Text: dark (#0A0A0B)
- Weight: 600
- No backdrop-filter
- No border
- No shadow

**Unselected (Dark)**:
- Background: glassmorphic (rgba(10, 14, 23, 0.42))
- Backdrop-filter: blur(20px) saturate(1.2)
- Inset shadow: 0 1px 0 rgba(255, 255, 255, 0.06)
- No border
- Text: secondary color

### C3: Light Mode Support
- Use CSS classes to detect: `document.documentElement.classList.contains('light')`
- Selected pill: dark solid (#1A1A1B) background, white text
- Unselected pill: light solid (rgba(0,0,0,0.05)) background, soft border
- No glassmorphism in light mode
- Same text colors as dark mode for unselected

## Testing the Implementation

```typescript
// Test dark mode
document.documentElement.classList.remove('light');
// Pills should show white when selected, glass when unselected

// Test light mode
document.documentElement.classList.add('light');
// Pills should show dark when selected, light when unselected

// Test counts
// Should never wrap; badges should not break layout with numbers > 9

// Test hover
// All unselected pills should scale(1.02)
// Light mode pills should brighten text on hover
```

## Design System Alignment

| Prop | Value | Reference |
|------|-------|-----------|
| blur | `blur(20px) saturate(1.2)` | `--glass-card-blur` (new) |
| pill bg | `rgba(10, 14, 23, 0.42)` | `--glass-pill-bg` (new) |
| inset shadow | `inset 0 1px 0 rgba(255, 255, 255, 0.06)` | `--glass-pill-inset` (new) |
| border-radius | `20px` | Standard pill radius |
| text primary | `var(--text-primary, #F1F5F9)` | CSS variable |
| text secondary | `var(--text-secondary, #94A3B8)` | CSS variable |

## Migration Notes

The current implementation uses hardcoded rgba values. This PR standardizes on CSS variables for consistency with the design system.

Before:
```typescript
background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'
```

After:
```typescript
background: isActive ? selectedBg : unselectedBg
// selectedBg = isDarkMode ? darkSelectedBg : lightSelectedBg
```

This makes it easier to adjust colors globally and support multiple themes.

## Common Mistakes to Avoid

1. **❌ Defining theme at component level**
   - ✅ DO: Define inside component body (allows re-renders on theme switch)

2. **❌ Using Tailwind classes instead of inline styles**
   - ✅ DO: Use only React.CSSProperties inline styles

3. **❌ Forgetting flexShrink: 0 on button**
   - ✅ DO: Add `flexShrink: 0` to prevent squishing

4. **❌ Applying backdrop-filter to selected state**
   - ✅ DO: Only apply when `!isActive`

5. **❌ Hardcoding colors instead of using var() or constants**
   - ✅ DO: Use `var(--text-secondary)` with fallback

## Related Files

- **Design System**: `STYLE_GUIDE.md` (lines 96-111)
- **CSS Vars**: `bitbit-design-system.css` (newly added lines 90-94)
- **Light Mode Overrides**: `bitbit-design-system.css` (lines 142-189)
- **Global Styles**: `globals.css` (lines 22-100)

---

**Complexity**: Medium
**Est. Time**: 45 minutes (implementation + testing)
**Risk**: Low (localized component change, no API/data changes)
