# Final Polish Pass

Execute a final quality assurance pass addressing alignment, spacing, consistency, and micro-details before release.

**Only polish functionally complete work.** Premature polishing wastes effort.

## Pre-Polish Assessment

Establish current state:
- Is the feature functionally complete?
- Known issues to preserve (intentional trade-offs)?
- Quality bar: MVP or flagship?
- Timeline constraints?

## Systematic Polish Dimensions

### Visual Alignment
- Pixel-perfect alignment to grid
- Consistent spacing using design scale (not arbitrary values)
- Uniform padding and margins across similar components
- Centered elements actually centered
- Consistent border radius

### Typography
- Hierarchy consistency across all pages
- Line length: 45-75 characters for body text
- Proper line height (1.4-1.6 for body, 1.1-1.2 for headings)
- No orphaned words on critical headings
- Consistent font weights for same roles

### Color & Contrast
- WCAG AA minimum (4.5:1 text, 3:1 UI elements)
- Design tokens used exclusively (no hardcoded colors)
- Theme consistency (dark/light mode both work)
- Tinted grays, not pure gray (subtle warmth/coolness)

### Interactive States
Every interactive element needs:
- Default, hover, focus, active
- Disabled, loading
- Error, success
- Focus-visible for keyboard users

### Micro-interactions
- Smooth transitions: 150-300ms
- Ease-out easing for enters, ease-in for exits
- Respect `prefers-reduced-motion`
- 60fps minimum for all animations

### Content
- Consistent terminology throughout
- Consistent capitalization (Title Case vs sentence case)
- Grammar and spelling check
- Appropriate text length (no truncation surprises)

## Verification Checklist

- [ ] All elements align to grid
- [ ] Spacing uses design scale consistently
- [ ] Typography hierarchy is clear and consistent
- [ ] All interactive states implemented
- [ ] Transitions are smooth (60fps)
- [ ] Colors meet WCAG contrast ratios
- [ ] Content is consistent and error-free
- [ ] Tested on real devices (not just browser DevTools)

## Anti-patterns

- Polishing incomplete features (premature)
- Introducing bugs during refinement
- Perfecting one element while leaving neighbors rough
- Ignoring systematic issues for cosmetic fixes
- Only testing in one browser/device
