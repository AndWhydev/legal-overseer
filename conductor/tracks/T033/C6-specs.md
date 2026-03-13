# C6: Hover Action Buttons Redesign Specification

## Overview
Replace text-based hover action buttons with a compact icon-only action bar that appears on row hover with staggered animation.

## File Location
`personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx` lines 1309-1472

## Current Implementation
- Text + icon buttons ("Archive", "Done", etc.)
- Overlaps content and text
- Hard cutoff at edge

## Target Design
- Icons only (no text labels)
- 28px × 28px square buttons
- Glassmorphic background: rgba(15, 20, 30, 0.9)
- Subtle blur effect
- Staggered entry animation
- Gradient fade-out on left edge
- Positioned absolutely on the right

## Implementation Steps

### Step 1: Update actionBtnStyle Object

Replace lines 1309-1324 with:
```typescript
const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(15, 20, 30, 0.9)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  color: 'rgba(255,255,255,0.65)',
  fontSize: 14,  // Icon size (use size={14} in icons)
  cursor: 'pointer',
  transition: 'all 150ms ease',
  whiteSpace: 'nowrap',
  padding: 0,
  gap: 0,
};
```

**Key changes**:
- `width/height/minWidth: 28` (square, fixed size)
- `borderRadius: 8` (not rounded-full, controlled corners)
- `padding: 0, gap: 0` (no text spacing)
- `backdrop-filter: 'blur(12px)'` for glass effect
- `color: 'rgba(255,255,255,0.65)'` (subtle icon color)

### Step 2: Replace hover-actions div structure

Replace lines 1417-1468 with:
```typescript
<div className="bb-inbox-row__hover-actions" style={{
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  position: 'relative',
}}>
  {/* Fade-out gradient on left */}
  <div style={{
    position: 'absolute',
    left: -24,
    top: 0,
    bottom: 0,
    width: 24,
    background: 'linear-gradient(to right, transparent, rgba(15, 20, 30, 0.9))',
    pointerEvents: 'none',
  }} />

  {/* Button 1: Reply */}
  <button
    className="bb-inbox-row__action"
    style={{
      ...actionBtnStyle,
      animation: 'fadeSlideIn 150ms ease 0ms forwards',
    }}
    title="Reply (R)"
    aria-label="Reply to message"
    onClick={(e) => { e.stopPropagation(); onReply?.(message.id); }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
    }}
  >
    <Reply size={14} />
  </button>

  {/* Button 2: Archive */}
  <button
    className="bb-inbox-row__action"
    style={{
      ...actionBtnStyle,
      animation: 'fadeSlideIn 150ms ease 30ms forwards',
    }}
    title="Archive (E)"
    aria-label="Archive message"
    onClick={(e) => { e.stopPropagation(); onArchive?.(message.id); }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
    }}
  >
    <Archive size={14} />
  </button>

  {/* Button 3: Done */}
  <button
    className="bb-inbox-row__action"
    style={{
      ...actionBtnStyle,
      animation: 'fadeSlideIn 150ms ease 60ms forwards',
    }}
    title="Done (D)"
    aria-label="Mark as done"
    onClick={(e) => { e.stopPropagation(); onDone?.(message.id); }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
    }}
  >
    <CheckCircle2 size={14} />
  </button>

  {/* Button 4: Snooze */}
  <button
    className="bb-inbox-row__action"
    style={{
      ...actionBtnStyle,
      animation: 'fadeSlideIn 150ms ease 90ms forwards',
    }}
    title="Snooze (S)"
    aria-label="Snooze message"
    onClick={(e) => { e.stopPropagation(); onSnooze?.(message.id, e); }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
    }}
  >
    <Clock size={14} />
  </button>

  {/* Animation keyframes */}
  <style>{`
    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateX(4px); }
      to { opacity: 1; transform: translateX(0); }
    }
  `}</style>
</div>
```

## Key Features Explained

### Compact Design
- **Size**: 28px × 28px (standard touch target, slightly larger than icon)
- **Spacing**: 4px gap between buttons (visually grouped)
- **Border-radius**: 8px (not rounded, geometric)
- **Icons only**: `size={14}` (fits nicely in 28px button with padding)

### Glassmorphic Styling
- **Background**: `rgba(15, 20, 30, 0.9)` (dark, nearly opaque)
- **Backdrop-filter**: `blur(12px)` (subtle blur behind)
- **Reason**: Solid enough to be readable, slight glass effect for premium feel

### Staggered Animation
```
Reply    @ 0ms    (instant)
Archive  @ 30ms   (30ms delay)
Done     @ 60ms   (60ms delay)
Snooze   @ 90ms   (90ms delay)
```

Animation: `fadeSlideIn 150ms ease` (duration 150ms, delay variable)

Keyframes:
```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateX(4px); }  /* invisible, 4px right */
  to { opacity: 1; transform: translateX(0); }      /* visible, in place */
}
```

### Gradient Fade-Out
- **Purpose**: Prevent hard cutoff where action bar meets text
- **Position**: 24px wide, left of action buttons
- **Gradient**: `linear-gradient(to right, transparent, rgba(15, 20, 30, 0.9))`
- **Technique**: Extra invisible div with negative left position

### Hover State
- **Background**: `rgba(255,255,255,0.15)` (brighten on hover)
- **Color**: `rgba(255,255,255,0.9)` (brighten icon text)
- **Transition**: Built into `actionBtnStyle` transition property (150ms)
- **Not applied to**: disabled/read-only states

## Accessibility

### aria-label
Each button should have a descriptive label for screen readers:
- Reply → "Reply to message"
- Archive → "Archive message"
- Done → "Mark as done"
- Snooze → "Snooze message"

### Keyboard Support
- Existing keyboard shortcuts (R, E, D, S) should still work
- Buttons are not keyboard-accessible (hover-only UI)
- This matches the current design intent

### Title Attribute
Show keyboard shortcut on hover (native browser tooltip):
```typescript
title="Reply (R)"
title="Archive (E)"
title="Done (D)"
title="Snooze (S)"
```

## Design System Alignment

| Property | Value | Notes |
|----------|-------|-------|
| size | 28px × 28px | Standard touch target + icon |
| border-radius | 8px | Controlled, not fully rounded |
| background | rgba(15, 20, 30, 0.9) | Dark glass background |
| blur | blur(12px) | Subtle backdrop effect |
| gap | 4px | Tight grouping |
| icon size | 14px | Fits 28px container nicely |
| color | rgba(255,255,255,0.65) | Muted icon color |
| hover color | rgba(255,255,255,0.9) | Brightened on hover |
| animation | fadeSlideIn 150ms | Smooth entry |

## Implementation Checklist

- [ ] Replace `actionBtnStyle` object (remove padding, set size, add backdrop-filter)
- [ ] Remove text labels from buttons (keep only icons)
- [ ] Reorder buttons: Reply → Archive → Done → Snooze
- [ ] Wrap action buttons in container with `display: flex, gap: 4px, position: relative`
- [ ] Add fade-out gradient div (absolute, left: -24px)
- [ ] Add `animation` property to each button with staggered delay
- [ ] Add `<style>` tag with `@keyframes fadeSlideIn` animation
- [ ] Update hover handlers (brighten background + color)
- [ ] Add `aria-label` to each button
- [ ] Remove mouse enter/leave for star button (if present)
- [ ] Test animation in browser (should stagger smoothly)
- [ ] Test hover states (should brighten)
- [ ] Test keyboard shortcuts (R, E, D, S still work)
- [ ] Test mobile (action bar should still appear on tap/long-press)

## Testing Scenarios

### Animation
1. Hover over a message row
2. Observe buttons appearing one-by-one with slight stagger
3. Total animation should complete in ~120ms (last button at 90ms + 150ms duration)

### Hover States
1. Move mouse over each button
2. Background and icon color should brighten instantly
3. Should fade back when mouse leaves

### Gradient Fade
1. Hover over message with very long subject
2. Text should fade naturally as it approaches action buttons
3. No hard edge where text meets buttons

### Icon Clarity
1. All icons should be clear at 14px size
2. No icon overlaps or clipping
3. Icons should be visually balanced in 28px buttons

### Mobile Behavior
- Action buttons should appear on long-press or row selection
- Buttons should be easily tappable (28px touch target)
- No accidental activation from scroll

## Related Files

- **Message Row Component**: `inbox-tab.tsx` lines 1200-1472
- **Icons Library**: lucide-react (Reply, Archive, CheckCircle2, Clock, Star)
- **CSS Animation Timing**: 150ms ease (matches design system transitions)
- **Hover Effects**: Similar to other UI elements (see SnoozePickerPopover)

---

**Complexity**: Medium
**Est. Time**: 30 minutes (implementation + testing)
**Risk**: Low (UI-only change, no data or logic changes)
**Impact**: Improves usability by reducing visual noise and providing smooth feedback
