# Overdrive Effects

Push interfaces past conventional limits using technically ambitious implementations. For when users want something extraordinary.

## What "Extraordinary" Means by Context

- **Visual surfaces** (landing pages, portfolios): Sensory wow — scroll reveals, shader backgrounds, cinematic transitions
- **Functional UI** (dashboards, apps): How it *feels* — dialog morphing, 60fps rendering, instant validation
- **Performance-critical** (data-heavy): Invisible but felt smoothness — virtual scrolling, GPU compositing
- **Data visualization**: Fluidity and GPU acceleration — smooth zooming, animated transitions between states

## Key Techniques

### View Transitions API
Morph between page states with shared element transitions. Native browser support, progressive enhancement built in.

### Scroll-Driven Animations
CSS `animation-timeline: scroll()` for performant scroll-linked effects without JavaScript scroll listeners.

### WebGL / WebGPU
Custom shaders for backgrounds, particle systems, 3D effects. Use Three.js or raw WebGL.

### Spring Physics
Natural-feeling animations using spring dynamics instead of bezier curves. Libraries: Framer Motion, React Spring.

### Web Animations API
Programmatic animation control with native performance. Combine with scroll timelines for complex sequences.

### Virtual Scrolling
Render only visible items for 60fps in massive lists. Libraries: TanStack Virtual, react-window.

### Web Workers + OffscreenCanvas
Move heavy computation off the main thread. Essential for complex canvas/WebGL without jank.

## Implementation Approach

1. **Propose 2-3 technical directions** with trade-offs before building
2. **Progressive enhancement required** — must work without effects
3. **Test on mid-range devices** — not just your fast machine
4. **Iterate visually** — effects need tuning, not just code

## Non-Negotiable Rules

- Target 60fps minimum on mid-range devices
- Respect `prefers-reduced-motion` always
- Never ship without functional fallbacks
- Progressive enhancement: core experience works without JS/WebGL
- The last 20% of polish separates "cool" from "extraordinary"

## Verification Tests

- Does it wow on first impression?
- Does removing it diminish the experience?
- Does it work smoothly on mid-range hardware?
- Is it still beautiful with animations disabled?
- Does it enhance rather than distract from the content?
