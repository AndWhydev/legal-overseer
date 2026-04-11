# Responsive Adaptation

Adapt existing designs to work effectively across different screen sizes, devices, platforms, and usage contexts.

## Assessment

Before adapting, understand the source and target:

1. **Source context**: What was it designed for? What assumptions were made (large screen, mouse input, fast connection)?
2. **Target context**: Device type, input method, screen constraints, connection speed, usage context
3. **Adaptation challenges**: What won't fit, won't work, or is inappropriate in the new context

**Adaptation is not just scaling** — it's rethinking the experience for the new context.

## Adaptation Strategies

### Mobile (Desktop -> Mobile)

**Layout**: Single column, vertical stacking, full-width components, bottom navigation
**Interaction**: 44x44px touch targets minimum, swipe gestures, bottom sheets, thumbs-first design
**Content**: Progressive disclosure, prioritize primary content, 16px minimum text
**Navigation**: Hamburger or bottom nav, sticky headers, simplified hierarchy

### Tablet (Hybrid)

**Layout**: Two-column, side panels, master-detail views, orientation-adaptive
**Interaction**: Support both touch and pointer, 44px targets but denser than phone

### Desktop (Mobile -> Desktop)

**Layout**: Multi-column, persistent side nav, multiple info panels, max-width constraints
**Interaction**: Hover states, keyboard shortcuts, right-click menus, drag-and-drop, multi-select

### Print (Screen -> Print)

**Layout**: Logical page breaks, remove nav/interactive elements, proper margins
**Content**: Expand shortened content, show full URLs, add page numbers and metadata

### Email (Web -> Email)

**Layout**: 600px max width, single column, inline CSS, table-based for compatibility
**Interaction**: Large obvious CTAs, no hover states, deep links for complex interactions

## Implementation

### Breakpoints
- Mobile: 320px-767px
- Tablet: 768px-1023px
- Desktop: 1024px+
- Or content-driven breakpoints (where design actually breaks)

### Techniques
- CSS Grid/Flexbox for layout reflow
- Container Queries for component-level adaptation
- `clamp()` for fluid sizing
- `srcset` and `<picture>` for responsive images
- Lazy loading for off-screen content

### Touch Adaptation
- 44x44px minimum touch targets
- More spacing between interactive elements
- Remove hover-dependent interactions
- Touch feedback (ripples, highlights)
- Consider thumb zones

## Anti-patterns

- Hiding core functionality on mobile
- Assuming desktop = powerful device
- Different information architecture across contexts
- Breaking platform expectations
- Forgetting landscape orientation
- Using generic breakpoints blindly
- Ignoring touch on desktop (many desktops have touch)

## Verification

Test on real devices, not just browser DevTools:
- Different orientations (portrait + landscape)
- Different browsers and OS
- Different input methods (touch, mouse, keyboard)
- Edge cases: 320px screens, 4K screens
- Slow connections (throttled network)
