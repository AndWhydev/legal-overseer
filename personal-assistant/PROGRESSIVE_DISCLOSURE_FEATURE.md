# Progressive Disclosure Feature: Advanced Tabs Toggle

## Overview

The BitBit dashboard sidebar implements **progressive disclosure** to manage cognitive load by hiding power-user tabs by default. Users can reveal advanced functionality through a subtle chevron toggle at the bottom of the sidebar navigation.

## Architecture

### What Gets Hidden

The following tabs are considered "advanced" and hidden by default:
- **Analytics** — Dashboards, metrics, trends
- **Costs** — Budget tracking, expense analysis
- **Knowledge** — Knowledge bases, document management
- **Admin** — Administrative tools and settings
- **Sentry** — Error tracking and monitoring

Core tabs remain always visible:
- Dashboard, Chat, Inbox, Connections, Contacts, Invoices, Approvals, Activity

### Key Files

1. **`src/components/dashboard/sidebar-nav.tsx`** (lines 111-268)
   - `showAdvanced` state with localStorage persistence
   - `toggleAdvanced()` callback with smart positioning
   - Tab filtering logic based on advanced classification
   - Chevron toggle button rendering

2. **`src/styles/bitbit-design-system.css`** (lines 1070-1110)
   - `.bb-sidebar__chevron-toggle` styling
   - `.bb-sidebar__chevron-toggle--open` state class
   - `.bb-sidebar__item--stagger-in` animation for tab appearance

3. **`src/components/dashboard/sidebar-nav.test.tsx`** (NEW)
   - 33 comprehensive unit tests
   - localStorage persistence testing
   - CSS class and ARIA attribute validation
   - Edge case handling

## Implementation Details

### State Management

```typescript
const [showAdvanced, setShowAdvanced] = useState(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('bb-show-advanced') === 'true';
});
```

**SSR-Safe Initialization:**
- Returns `false` during server-side rendering (no window object)
- Reads from `localStorage` on client mount
- Defaults to `false` if localStorage is empty or unset

### Persistence

```typescript
const toggleAdvanced = useCallback(() => {
  setShowAdvanced(prev => {
    const next = !prev;
    localStorage.setItem('bb-show-advanced', String(next));
    // ... handle layout updates
    return next;
  });
}, []);
```

**Storage Key:** `bb-show-advanced`
**Format:** String boolean (`'true'` or `'false'`)

### Tab Visibility Logic

```typescript
const isAdvanced = filteredAdvancedTabIds.includes(tabId);
const displayStyle = isAdvanced && !showAdvanced ? 'none' : undefined;
```

- Primary tabs: always visible
- Advanced tabs: `display: none` when `showAdvanced === false`
- CSS class added for stagger animation on reveal

### Chevron Toggle Button

**Rendering Condition:**
```typescript
{filteredAdvancedTabIds.length > 0 && (
  <button
    className={['bb-sidebar__chevron-toggle', showAdvanced && 'bb-sidebar__chevron-toggle--open']}
    aria-label={showAdvanced ? 'Hide advanced tabs' : 'Show advanced tabs'}
    data-tooltip={showAdvanced ? 'Less' : 'More'}
  >
    <ChevronDown />
  </button>
)}
```

**Accessibility Attributes:**
- `aria-pressed` — Toggle state (`true`/`false`)
- `aria-expanded` — Expansion state (`true`/`false`)
- `aria-label` — Context-appropriate label
- `data-tooltip` — Visual hint ("More" / "Less")

### Smart Tab Switching

When `showAdvanced` toggles to `false`, if the currently active tab is an advanced tab, the component falls back to the first primary tab:

```typescript
if (!next && filteredAdvancedTabIds.includes(activeTabIdRef.current)) {
  const fallbackTabId = filteredPrimaryTabIds[0];
  if (fallbackTabId && fallbackTabId !== activeTabIdRef.current) {
    onTabChangeRef.current?.(fallbackTabId);
  }
}
```

This prevents users being stranded on a hidden tab.

### Chevron Positioning

The chevron button is positioned intelligently:
- **Collapsed (showAdvanced === false):** Positioned right after the last primary tab
- **Expanded (showAdvanced === true):** Natural position at the bottom of the nav

This creates a sense of "expand to reveal more" without layout shift.

### Stagger Animation

Advanced tabs animate in with a staggered entrance when revealed:

```css
.bb-sidebar__item--stagger-in {
  animation: bb-stagger-in 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: var(--stagger-index) * 50ms;
}
```

Each advanced tab's index determines its reveal timing (0ms, 50ms, 100ms, 150ms, 200ms).

## Testing

### Test Coverage (33 tests)

```
localStorage Management (3 tests)
├─ initializes showAdvanced to false when localStorage is empty
├─ persists showAdvanced state to localStorage key "bb-show-advanced"
└─ correctly parses localStorage value as boolean

Advanced Tab Classification (2 tests)
├─ correctly identifies advanced tabs from composition profile
└─ filters tabs through enabledModules correctly

Chevron Toggle Visibility (5 tests)
├─ should render chevron when advancedModules exist
├─ should not render chevron when no advanced modules exist
├─ chevron uses correct ARIA attributes
├─ chevron tooltip changes based on toggle state
└─ chevron aria-label reflects toggle state

Advanced Tab Display Logic (4 tests)
├─ applies display:none to advanced tabs when showAdvanced is false
├─ removes display:none when showAdvanced becomes true
├─ primary tabs are always visible regardless of showAdvanced
└─ advanced tabs have data-advanced attribute

CSS Class Application (4 tests)
├─ applies bb-sidebar__chevron-toggle--open class when expanded
├─ does not apply bb-sidebar__chevron-toggle--open when collapsed
├─ applies stagger animation class to advanced tabs when shown
└─ does not apply stagger class when advanced tabs are hidden

Stagger Animation Timing (2 tests)
├─ calculates correct stagger index for advanced tabs
└─ applies correct animation delay based on stagger index

Fallback to Primary Tab (4 tests)
├─ falls back to first primary tab when active tab is hidden
├─ does not fallback if active tab is primary
├─ does not fallback if advanced tabs remain visible
└─ does not fallback to same tab

Navigation Integration (2 tests)
├─ maintains scroll position when toggling advanced tabs
└─ resets wheel navigation to visible tabs

Edge Cases (4 tests)
├─ handles empty advanced modules list
├─ handles all tabs being advanced
├─ handles SSR hydration (no window object)
└─ handles rapid toggle clicks gracefully

Accessibility (3 tests)
├─ chevron toggle has proper ARIA attributes for toggle button
├─ advanced tabs have correct ARIA attributes
└─ tooltip provides user-facing context
```

**Run tests:**
```bash
npm test -- sidebar-nav.test.tsx
```

## Design Decisions

### Why Progressive Disclosure?

1. **Reduced Cognitive Load** — New users aren't overwhelmed by 13 tabs
2. **Familiar Pattern** — Similar to how most modern apps reveal advanced features
3. **Accessible Power** — Expert users can still access everything they need
4. **Clean Default State** — Dashboard shows only the essential 8 core tabs

### Why localStorage?

- Persists user preference across sessions
- No server-side state management needed
- No database queries or RLS rules required
- Works offline

### Why No Feature Flags?

- The composition profile (via `useEnabledModules()`) already gates tabs
- Progressive disclosure is separate from feature gating
- Simpler mental model: "show/hide" vs "enable/disable"

### Why Chevron (not "Advanced" Button)?

- Less prominent than a labeled button
- Familiar from expand/collapse UI patterns
- Tooltip provides hint without taking space
- 48px consistent with other nav buttons

## User Experience

### Default State
- 8 primary tabs visible
- Chevron at bottom with "More" tooltip
- Advanced tabs completely hidden (no scrolling needed)

### After Clicking Chevron
1. Chevron rotates to point up
2. 5 advanced tabs slide in with stagger animation (50ms intervals)
3. Chevron tooltip changes to "Less"
4. User can now access Analytics, Costs, Knowledge, Admin, Sentry

### After Clicking Again
1. Advanced tabs fade out with same stagger timing (reversed)
2. Chevron returns to original state
3. UI returns to compact 8-tab view

## Composition Integration

Advanced tabs are defined in the **composition profile** managed by `useEnabledModules()`:

```typescript
const { modules: enabledModules, composition } = useEnabledModules();

composition.primaryModules = ['dashboard', 'chat', 'inbox', 'connections', 'contacts', 'invoices', 'approvals', 'activity'];
composition.advancedModules = ['analytics', 'costs', 'knowledge', 'admin', 'sentry'];
```

This allows different compositions (e.g., enterprise plan) to define different tab sets.

## Browser Support

- **localStorage API** — All modern browsers (IE 11+)
- **CSS Grid & Transforms** — All modern browsers
- **ARIA attributes** — Full accessibility support
- **SSR-safe** — Returns `false` on server, hydrates on client

## Performance

- **Re-renders:** Minimal — only affected items re-render
- **localStorage:** O(1) read/write
- **Animation:** GPU-accelerated via CSS transforms
- **Initial load:** No performance impact (state initialized from localStorage)

## Future Enhancements

### Potential Improvements
1. **Animation Presets** — Customize stagger timing per composition
2. **Keyboard Shortcut** — e.g., Cmd+Shift+A to toggle advanced
3. **Deep Linking** — Preserve advanced state in URL hash
4. **Analytics** — Track toggle usage to inform UX decisions
5. **Contextual Hiding** — Auto-hide advanced tabs based on user activity
6. **Tab Groups** — Group advanced tabs into collapsible sections

### Not Planned
- Server-side persistence (use localStorage or add to user profile if needed)
- Customizable tab classification (use composition profile instead)
- Drag-to-reorder with advanced tabs (breaks predictable layout)

## Troubleshooting

### Advanced tabs not persisting on reload
- Check browser's localStorage is enabled
- Verify `bb-show-advanced` key exists: `console.log(localStorage.getItem('bb-show-advanced'))`

### Chevron not appearing
- Verify `filteredAdvancedTabIds.length > 0`
- Check `useEnabledModules()` returns advanced modules

### Stagger animation not smooth
- Verify CSS animation is not disabled (DevTools > Animations)
- Check `.bb-sidebar__item--stagger-in` is in CSS

### ARIA attributes not reported by screen reader
- Verify `aria-pressed` and `aria-expanded` are set correctly
- Test with NVDA, JAWS, or VoiceOver

## Related Components

- **`spa-shell.tsx`** — Main shell that renders sidebar
- **`bottom-nav.tsx`** — Mobile bottom navigation (separate implementation)
- **`use-enabled-modules.ts`** — Composition profile and module gating
