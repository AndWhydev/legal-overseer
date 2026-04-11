# Onboarding Flow Design

Design onboarding experiences that help users understand, adopt, and succeed with the product quickly.

## Core Principles

### Show, Don't Tell
Demonstrate with working examples, not descriptions. Real functionality, not separate tutorial mode.

### Make It Optional
Let experienced users skip. Don't block access to the product. Always provide "Skip" or "I'll explore on my own".

### Time to Value
Get users to their "aha moment" ASAP. Front-load the 20% that delivers 80% of value.

### Context Over Ceremony
Teach features when users need them, not upfront. Empty states are onboarding opportunities.

### Respect Intelligence
Don't patronize. Be concise. Assume users can figure out standard patterns.

## Onboarding Types

### Initial Product Onboarding

**Welcome Screen**: Clear value proposition, what users will learn, honest time estimate, skip option
**Account Setup**: Minimal required info, explain why you're asking, smart defaults, social login
**Core Concepts**: Introduce 1-3 concepts max, interactive when possible, progress indication
**First Success**: Guide to real accomplishment, pre-populated templates, celebrate completion, clear next steps

### Empty States

Every empty state needs:
1. **What will be here**: "Your recent projects will appear here"
2. **Why it matters**: "Projects help you organize and collaborate"
3. **How to start**: `[Create project]` or `[Start from template]`
4. **Visual interest**: Illustration or icon (not just text)
5. **Help link**: "Need help? Watch 2-min tutorial"

**Types**: First use (emphasize value), user cleared (light touch), no results (suggest alternatives), no permissions (explain how to get access), error (explain + retry)

### Contextual Discovery

**Tooltips**: Appear at relevant moment, point at UI element, brief + benefit, dismissable with "Don't show again"
**Feature Announcements**: Highlight new features, show what's new and why, let users try immediately
**Progressive Onboarding**: Teach on encounter, badges on new features, unlock complexity gradually

### Guided Tours

When to use: Complex interfaces, significant product changes, domain-specific tools

Design rules:
- Spotlight specific elements (dim rest)
- 3-7 steps maximum per tour
- Interactive > passive (let users click real things)
- Focus on workflow not features ("Create a project" not "This is the project button")
- Always include "Skip tour"
- Make replayable from help menu

## Implementation

```javascript
// Track onboarding state
localStorage.setItem('onboarding-completed', 'true');
localStorage.setItem('feature-tooltip-seen-reports', 'true');
```

Libraries: Intro.js, Shepherd.js, React Joyride for tours. Tippy.js/Popper.js for tooltips.

## Anti-patterns

- Forcing long onboarding before product access
- Patronizing with obvious explanations
- Showing same tooltip repeatedly
- Blocking all UI during tours
- Separate tutorial mode disconnected from real product
- Overwhelming with information upfront
- Hiding "Skip" or making it hard to find
- Showing initial onboarding to returning users

## Verification

- Time to completion: Can users finish quickly?
- Comprehension: Do users understand after completing?
- Action: Do users take the desired next step?
- Skip rate: Too high = too long or not valuable
- Completion rate: Too low = simplify further
