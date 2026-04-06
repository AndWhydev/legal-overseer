# Design Distillation

Strip designs to their essence. Great design is simple, powerful, and clean.

## Assess Complexity

Identify sources of unnecessary complexity:
- Excessive elements competing for attention
- Visual noise (decorative elements without purpose)
- Information overload (everything shown at once)
- Unclear hierarchy (no clear primary action)
- Feature creep (every edge case surfaced)

Before simplifying, understand: **What is the single primary user goal on this page?**

## Simplification Strategy

### Information Architecture
- Reduce scope to primary user goal
- Implement progressive disclosure (show more on demand)
- Consolidate related actions into menus/dropdowns
- Remove features used by < 5% of users from primary UI

### Visual Design
- Constrain to 2-3 colors maximum
- Limit to 2 font families (1 is better)
- Remove purely decorative elements
- Use whitespace instead of dividers

### Layout
- Favor linear flows over branching
- Eliminate sidebars where possible
- Use generous spacing (let elements breathe)
- Single-column for focused tasks

### Interaction
- Reduce choices at each decision point (3-5 max)
- Establish smart defaults (reduce decisions)
- Make the primary action unmistakable
- Remove confirmation dialogs for reversible actions

### Content
- Shorten copy ruthlessly (every word earns its place)
- Use active voice
- Remove jargon and redundancy
- Replace paragraphs with bullet points where scanning is the mode

### Code
- Eliminate unused styles and components
- Flatten deep nesting hierarchies
- Consolidate similar components

## Anti-patterns

Never:
- Remove necessary functionality (simple != incomplete)
- Sacrifice accessibility for minimalism
- Create unclear designs (simple != ambiguous)
- Eliminate decision-critical information
- Oversimplify complex domains (respect the problem)

## Verification

- Can users complete the primary task faster?
- Is cognitive load measurably reduced?
- Are all necessary features still accessible?
- Does the design feel intentional, not stripped?
