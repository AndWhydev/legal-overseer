# T033 Stream C — Exact Line Changes Required

This file provides the EXACT line numbers and code changes needed to complete the remaining tasks.

## File 1: inbox-tab.tsx

### CHANGE A: Category Pills Bar Function (Lines 806-889)

**Location**: `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`
**Lines**: 806-889 (entire `function CategoryPillsBar`)
**Status**: REPLACE ENTIRE FUNCTION

Current function starts at line 806:
```typescript
function CategoryPillsBar({
```

And ends at line 889:
```typescript
}
```

**Action**: Delete lines 806-889 and replace with the spec in `C1-C3-specs.md` (Component Structure section)

**Why**: Implements C1 (fix collapse), C2 (selected/unselected states), C3 (light mode)

**Verification**:
```bash
grep -n "function CategoryPillsBar" /path/to/inbox-tab.tsx
# Should show line 806
sed -n '889p' /path/to/inbox-tab.tsx
# Should show closing brace with closing paren: }
```

### CHANGE B: Action Button Style Object (Lines 1309-1324)

**Location**: `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`
**Lines**: 1309-1324 (const `actionBtnStyle`)
**Status**: REPLACE ENTIRE OBJECT

Current definition:
```typescript
const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  gap: 4,
  transition: 'all 100ms ease',
  whiteSpace: 'nowrap',
};
```

**Action**: Replace with spec in `C6-specs.md` (Step 1 section)

**Why**: Implements C6 (compact 28x28px glassmorphic buttons)

### CHANGE C: Hover Actions Container (Lines 1417-1468)

**Location**: `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`
**Lines**: 1417-1468 (entire hover-actions div with buttons)
**Status**: REPLACE ENTIRE SECTION

Current structure:
```typescript
<div className="bb-inbox-row__hover-actions">
  <button ... > Archive ... </button>
  <button ... > Done ... </button>
  <button ... > Snooze ... </button>
  <button ... > Reply ... </button>
  <button ... > Star ... </button>
</div>
```

**Action**: Replace with spec in `C6-specs.md` (Step 2 section)

**Why**: Implements C6 (icon-only, staggered animation, gradient fade)

**Key Differences**:
- Order changes: Reply, Archive, Done, Snooze (no Star in action bar)
- Button count: 4 instead of 5 (Star removed from action bar)
- Animation: Each button gets `animation: 'fadeSlideIn 150ms ease Xms forwards'`
- Fade gradient: New div before buttons
- No text labels, only icons (size={14})

## File 2: bitbit-design-system.css

✅ **ALREADY DONE** (Commit b03e98c8)

Added at lines 90-94:
```css
--glass-card-blur: blur(20px) saturate(1.2);
--glass-pill-bg: rgba(10, 14, 23, 0.42);
--glass-pill-inset: inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

No further changes needed.

## File 3: inbox-drawer.tsx

✅ **ALREADY DONE** (Commit b03e98c8)

Changes at:
- Line 473: `{msg.bodyPreview || '(No message content)'}`
- Line 896: `{message.bodyPreview || 'No message content'}`
- Line 892: `{hasThread && threadMessages ? (`

No further changes needed.

---

## Step-by-Step Implementation Order

### PHASE 1: Category Pills (C1-C3) — 45 minutes

1. Open `conductor/tracks/T033/C1-C3-specs.md`
2. Open `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`
3. Go to line 806
4. Select entire `CategoryPillsBar` function (lines 806-889)
5. Delete selected text
6. Copy the function from spec file's "Component Structure" section
7. Paste at line 806
8. Build and test:
   ```bash
   npm run build
   npm run dev
   ```
9. Test in browser:
   - Dark mode: pills show white when selected
   - Light mode: pills show dark when selected
   - Hover: all pills scale(1.02)
   - Numbers: don't break pill layout

### PHASE 2: Action Buttons (C6) — 30 minutes

1. Open `conductor/tracks/T033/C6-specs.md`
2. Go to line 1309 in `inbox-tab.tsx`
3. Select `actionBtnStyle` object (1309-1324)
4. Delete and replace with spec's "Step 1" code
5. Go to line 1417
6. Select hover-actions div section (1417-1468)
7. Delete and replace with spec's "Step 2" code
8. Build and test:
   ```bash
   npm run build
   npm run dev
   ```
9. Test in browser:
   - Hover over message: buttons appear with stagger
   - Hover over button: background + color brighten
   - Animation timing: smooth 150ms transitions
   - Icons: Reply, Archive, Done, Snooze clearly visible
   - No text labels visible

### PHASE 3: Verify & Test — 20 minutes

```bash
# Build
npm run build

# Should output:
# ✓ 1462/1462 tests
# ✓ zero type errors
# ✓ clean production build

# Run locally
npm run dev

# Browser tests:
# 1. Dark mode:
#    - Select a pill, verify white background, dark text
#    - Unselect, verify glass effect
#    - Hover unselected, verify scale(1.02)
#
# 2. Light mode (toggle theme switcher):
#    - Select a pill, verify dark background, white text
#    - Unselect, verify light background with border
#    - Hover unselected, verify color brightens
#
# 3. Action buttons:
#    - Hover message row, see buttons stagger in
#    - Each button appearance 30ms apart
#    - Total duration should be ~90ms + 150ms animation
#    - Hover button, verify background brightens
#
# 4. Mobile:
#    - Simulate touch with DevTools
#    - Buttons should appear
#    - Touch targets should be easy to hit (28px)
#
# 5. Accessibility:
#    - Open DevTools, inspect buttons
#    - Verify title attributes present (for tooltips)
#    - Verify aria-label attributes present
```

## Common Pitfalls & Fixes

| Pitfall | Fix |
|---------|-----|
| Pills still collapse | Check `whiteSpace: 'nowrap'` and `flexShrink: 0` on button + span |
| Animation doesn't stagger | Check `animation: 'fadeSlideIn 150ms ease Xms forwards'` delays are 0, 30, 60, 90 |
| Light mode colors wrong | Check `isDarkMode` detection with `!document.documentElement.classList.contains('light')` |
| Star button gone | It's intentional (removed from action bar, can be re-added later) |
| Hover doesn't brighten | Check `onMouseEnter` sets `background` and `color` properly |
| Animation doesn't play | Check `@keyframes fadeSlideIn` is defined in `<style>` tag |

## Verification Commands

After implementation:

```bash
# 1. Check for syntax errors
cd /home/claude/bitbit
npm run build 2>&1 | grep -i "error"
# Should have no errors

# 2. Check pill function exists and has theme detection
grep -A 2 "const isDarkMode" personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
# Should show isDarkMode detection

# 3. Check button style has new properties
grep "width: 28" personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
# Should find the 28px button width

# 4. Check animation is defined
grep "fadeSlideIn" personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
# Should find animation definition

# 5. Check star button moved (if applicable)
grep -n "Star size=" personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
# May show moved location or removed (both acceptable)
```

## Rollback Plan (If Needed)

If implementation causes issues:

```bash
# Reset to previous working state
git reset --hard b03e98c8

# Then cherry-pick just the CSS changes
git cherry-pick b03e98c8

# And debug the component changes
```

---

**Total Implementation Time**: ~95 minutes (45 + 30 + 20)
**Complexity**: Medium
**Risk**: Low (isolated UI changes)
**Testing**: Required (browser, dark/light modes, mobile)

**Questions?** Refer to:
- C1-C3-specs.md for pill styling
- C6-specs.md for action buttons
- IMPLEMENTATION_SUMMARY.md for overview
- stream-c-progress.md for progress tracking
