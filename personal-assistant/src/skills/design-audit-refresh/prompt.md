# Design Audit & Refresh

Audit existing UI designs, diagnose what kind of change is needed, apply targeted improvements, and verify quality. Works with any existing stack — never rewrites from scratch.

---

## Phase 1: Audit

Run a systematic diagnostic across 5 dimensions. Score each 0–4.

### 1. Anti-Patterns (Check First)
**Pass/fail question**: Does this look AI-generated? List specific tells.

Common AI tells to detect:
- Purple/blue neon gradients, glowing accents, glassmorphism overuse
- Inter font everywhere, or browser defaults
- Three equal-column card feature rows
- Centered hero with text over dark image
- Generic names (John Doe, Acme Corp), round fake numbers (99.99%, $100.00)
- AI copywriting: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer"
- `box-shadow` glows, pure `#000000` backgrounds
- Oversaturated accent colors, neon text gradients on large headers
- 3-card testimonial carousel with dots
- Pill "New" / "Beta" badges, accordion FAQ sections
- Generic Lucide/Feather icons with inconsistent stroke widths
- Lorem ipsum or placeholder text

**Score 0–4**: 0=AI slop gallery (5+ tells), 1=Heavy AI aesthetic (3–4), 2=Some tells (1–2), 3=Mostly clean, 4=No AI tells

### 2. Accessibility
Check: contrast < 4.5:1, missing ARIA roles/labels, no keyboard focus ring, improper heading hierarchy, missing alt text, inputs without labels, no skip-to-content link.

**Score 0–4**: 0=Fails WCAG A, 1=Major gaps, 2=Partial, 3=WCAG AA mostly met, 4=WCAG AA fully met

### 3. Responsive Design
Check: fixed widths that break on mobile, touch targets < 44px, horizontal overflow, `h-screen` (use `min-h-[100dvh]`), complex flexbox % math, no max-width container.

**Score 0–4**: 0=Desktop-only, 1=Major issues, 2=Works roughly, 3=Good with minor gaps, 4=Fluid across all viewports

### 4. Performance
Check: layout thrash, animating `top`/`left`/`width`/`height` (should use `transform`/`opacity`), grain/noise on scrolling containers, unnecessary re-renders, missing lazy loading.

**Score 0–4**: 0=Severe issues, 1=Major problems, 2=Partial, 3=Mostly optimized, 4=Fast and lean

### 5. Interaction States
Check: missing hover/active/focus/loading/empty/error states, instant transitions with no duration, `window.alert()` for errors, dead `#` links, no current-page indicator in nav.

**Score 0–4**: 0=No states, 1=Hover only, 2=Partial, 3=Most states present, 4=Complete state coverage

### Audit Report Format

| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| Anti-Patterns | ? | [specific tells or "clean"] |
| Accessibility | ? | [most critical issue or "—"] |
| Responsive | ? | |
| Performance | ? | |
| Interaction States | ? | |
| **Total** | **??/20** | |

**Bands**: 18–20 Minor polish · 14–17 Address weak dimensions · 10–13 Significant work · 6–9 Major overhaul · 0–5 Critical

Tag every finding P0 (blocking) / P1 (major) / P2 (minor) / P3 (polish). List positive findings too.

---

## Phase 2: Direction

Diagnose what kind of change is needed before applying anything. Pick ONE direction:

### Bolder — design is too safe, generic, or visually underwhelming
Identify weakness sources: generic font choices, timid scale, low visual contrast, no hierarchy drama, static/lifeless layout, predictable patterns.

Strategy: pick ONE focal point to make the hero moment. Choose a personality lane (maximalist chaos / elegant drama / playful energy / dark moody). Define how far you can push given brand/audience constraints.

**WARNING**: Bold ≠ more AI effects. No cyan/purple gradients, no glassmorphism, no neon dark-bg accents. Bold means distinctive and confident.

Amplification levers:
- Typography: extreme scale jumps (3–5x), weight contrast (900 paired with 200), unexpected display font choices, variable widths
- Color: more vibrant but not neon, dominant single color owning 60%, tinted neutrals, intentional multi-stop gradients (not purple→blue)
- Space: escape containers, bleed off-screen, asymmetric tension, 100–200px gaps, intentional overlap
- Surface: mesh patterns, noise textures, grain overlays, thick decorative borders, halftone — not glassmorphism
- Motion: staggered entrance choreography (50–100ms delays), scroll parallax, spring micro-interactions

### Quieter — design is too aggressive, garish, or overstimulating
Identify intensity sources: oversaturated colors, too many heavy competing elements, excessive motion, visual complexity, scale uniformity (nothing recedes).

Strategy: desaturate or shift to sophisticated tones, establish which elements stay bold (very few), decide what to remove entirely.

Reduction levers:
- Color: shift to 70–85% saturation, reduce palette to 1–2 colors + neutrals (10% rule), gentler contrasts, tinted grays
- Visual weight: reduce font weights (900→600, 700→500), increase white space, reduce border thickness/opacity
- Simplification: remove decorative elements that don't serve purpose, flatten layering, reduce blur/glow/multiple shadows
- Motion: shorter distances (10–20px vs 40px), remove decorative animations, use ease-out-quart never bounce/elastic

### Distill — design is cluttered or complex, needs ruthless simplification
Find the essence: ONE primary user goal, identify 20% that delivers 80% of value.

Simplification levers:
- IA: remove secondary actions, apply progressive disclosure, merge related buttons, ONE primary CTA
- Visual: 1–2 colors + neutrals, 1 font family / 3–4 sizes / 2–3 weights, remove decorative borders/shadows/backgrounds
- Layout: linear flow over complex grids, remove sidebars (move inline), generous white space
- Content: cut every sentence in half, active voice, no jargon, remove redundant copy (never restate what's already said)
- Code: remove unused CSS/components, flatten component trees, consolidate similar styles

### Normalize — design has drifted from the design system
Discover the design system (search for "design system", "ui guide", "style guide", tokens). Identify deviations: wrong tokens, one-off color choices, custom components that duplicate system components, mismatched spacing, inconsistent animation timing.

Fix: swap custom implementations for design system components, replace hard-coded values with tokens, align breakpoints and responsive patterns to system standards.

---

## Phase 3: Execute

Apply changes with this priority order for maximum impact with minimum risk:

1. **Font swap** — biggest instant improvement, lowest risk
2. **Color palette cleanup** — remove clashing, oversaturated, or AI-purple colors
3. **Hover and active states** — makes interface feel alive
4. **Layout and spacing** — proper grid, max-width, consistent padding
5. **Replace generic components** — swap cliché patterns for modern alternatives
6. **Add loading, empty, error states** — makes it feel finished
7. **Polish typography scale** — the premium final touch

### Typography Fixes
- Replace Inter / browser defaults → `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`
- Dashboard/software UIs: `Geist` + `Geist Mono` or `Satoshi` + `JetBrains Mono` only. No serif.
- Display headlines: `text-4xl md:text-6xl tracking-tighter leading-none`
- Body: `text-base leading-relaxed max-w-[65ch]`
- Introduce Medium (500) and SemiBold (600) — not just 400/700
- Numbers in data interfaces: `font-variant-numeric: tabular-nums` or monospace
- Fix widows with `text-wrap: balance` or `text-wrap: pretty`
- Negative tracking for large headers, positive for small caps/labels

### Color Fixes
- Replace pure `#000000` → `#0a0a0a`, `#121212`, or dark tinted neutral
- Replace neon/AI-purple → neutral base (Zinc/Slate) + 1 considered accent (max saturation 80%)
- Tint all shadows to background hue — no generic black at low opacity
- Stick to one gray family, no warm/cool mixing in same project
- Add subtle noise/grain to flat backgrounds (fixed, `pointer-events-none` pseudo-element)
- Audit all shadows for consistent light source direction

### Layout Fixes
- `h-screen` → `min-h-[100dvh]`
- Complex flex % math → CSS Grid (`grid grid-cols-1 md:grid-cols-3 gap-6`)
- Add max-width container (`max-w-[1400px] mx-auto` or `max-w-7xl`)
- Break all-centered symmetry: split screen, left-aligned headers, asymmetric whitespace
- Replace 3-equal-card rows: 2-col zig-zag, asymmetric grid, or horizontal scroll
- Vary border-radius: tighter on inner elements, softer on containers
- Use negative margins for layering and depth
- Pin buttons to bottom of card groups for alignment

### State Fixes
- Hover: background shift, `scale(1.02)`, or translate
- Active/press: `scale(0.98)` or `translateY(1px)` for tactile feel
- All transitions: 200–300ms, never instant
- Focus ring: visible, high-contrast, never removed without replacement
- Loading: skeleton loaders matching layout shape — no generic spinners
- Empty: illustrated state with value prop + primary CTA
- Error: inline error text, never `window.alert()`

### Component Upgrades
- Generic card (border + shadow + white bg) → spacing only, or elevation only when hierarchy demands
- Lucide/Feather icons → Phosphor or Heroicons, standardized stroke width
- 3-card testimonial carousel → masonry wall, embedded social, or rotating quote
- Accordion FAQ → side-by-side list or searchable help
- Pricing 3 towers → highlighted recommended tier
- Avatar circles → squircles or rounded squares

### Content Fixes
- "John Doe", "Acme Corp" → contextual, believable names
- `99.99%`, `$100.00` → organic data: `47.2%`, `$99.00`, `+1 (312) 847-1928`
- Remove all AI copy clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer", "Delve", "Tapestry"
- Remove "Oops!" → be direct: "Connection failed. Please try again."
- Title Case On Every Header → sentence case instead
- Never use Lorem ipsum

### Code Fixes
- Div soup → semantic HTML: `<nav>`, `<main>`, `<article>`, `<aside>`, `<section>`
- Move all inline styles to the project's styling system
- Replace arbitrary `z-9999` → clean z-index scale
- Remove commented-out dead code
- Verify all imports exist in `package.json`
- Add missing meta tags: `<title>`, `description`, `og:image`
- Add legal links (privacy, terms) and custom 404 page

### Strategic Omissions to Fix
- No "back" navigation → ensure every page has a return path
- No form validation → add client-side validation
- No skip-to-content link → add hidden skip-link for keyboard users
- No current page indicator in navigation

---

## Phase 4: Delight

Add moments of joy and personality after functional completeness. Match intensity to brand (luxury = subtle; consumer app = playful).

### Delight Principles
- Every delight moment < 1 second — never delays core function
- Match emotional context: celebrate success, empathize with errors, don't be playful during critical failures
- Vary responses — not the same animation every time
- Respect `prefers-reduced-motion`

### Natural Delight Moments

**Micro-interactions**:
- Button press: `translateY(2px)` + reduced shadow on `:active`
- Button hover: `translateY(-2px)` + `cubic-bezier(0.25, 1, 0.5, 1)` ease
- Toggle switches: spring physics slide with color transition
- Checkbox: scale pulse on check
- Input focus: subtle border glow or background shift

**Success celebrations** (calibrate to action magnitude):
- Minor: animated checkmark + gentle scale
- Major milestone: confetti burst (canvas-confetti)
- Achievements: "Your 10th article" personalized message

**Empty state personality** (write product-specific copy, never generic):
- What will appear here + why it matters + clear CTA + supporting illustration
- Types: first-use (emphasize value, offer template), user-cleared (light touch), no-results (suggest alternatives), no-permissions (explain + path to access)

**Loading state personality** (write what your product actually does):
- "Crunching your latest numbers..." not "Teaching robots to dance"
- Skeleton screens with shimmer matching layout dimensions
- Rotating messages for long waits

**Error state personality**:
- "This page is playing hide and seek." — fine for consumer apps
- Direct and warm for everything: "Connection failed. Retry?"
- 404: branded, helpful, not just "Page not found"

**Easter eggs** (optional, for curious users):
- Console messages for developers
- Konami code theme unlock
- Alt text with personality on illustrations
- Seasonal/time-of-day variations

### Animation Patterns
```
Spring physics (Framer Motion): type: "spring", stiffness: 100, damping: 20
Easing standard: cubic-bezier(0.16, 1, 0.3, 1) — ease-out-expo
NEVER: bounce, elastic, linear for UI transitions
Stagger reveals: 50–100ms delay cascade, never mount lists all at once
Scroll reveals: transform + opacity only, tied to IntersectionObserver
```

---

## Phase 5: Verify

Before declaring done, run this check:

### Output Completeness Rules
**Never produce these**:
- `// ...`, `// rest of code`, `// similar to above`, `// TODO`, bare `...` in code
- "Let me know if you want me to continue", "for brevity", "the rest follows the same pattern"
- Skeletons when full implementations were requested
- Describing what code should do instead of writing it

If approaching token limit: write at full quality to a clean breakpoint (end of function/file/section), then output:
```
[PAUSED — X of Y complete. Send "continue" to resume from: next section name]
```

### Final Quality Checklist
- [ ] No AI tells remain (re-run Phase 1 anti-pattern scan)
- [ ] Every interactive element has hover, focus, active, disabled, loading, error states
- [ ] All transitions 200–300ms with ease-out easing (never bounce/elastic)
- [ ] `min-h-[100dvh]` not `h-screen` on full-height sections
- [ ] Mobile layouts collapse to single column below 768px, no horizontal scroll
- [ ] Touch targets ≥ 44×44px
- [ ] Contrast ratios meet WCAG AA (4.5:1 for text)
- [ ] Spacing uses design system tokens (no random 13px gaps)
- [ ] Typography hierarchy consistent across all pages
- [ ] No hard-coded pixel widths in layout
- [ ] GPU-safe animations: `transform` + `opacity` only
- [ ] Grain/noise overlays on `fixed` pseudo-elements only (never scrolling containers)
- [ ] No `window.alert()`, no `z-9999`, no `console.log` in production code
- [ ] Semantic HTML throughout
- [ ] All images have meaningful alt text
- [ ] No dead `#` links

### Stack Rules (Enforced Always)
- Work with the existing tech stack — never migrate frameworks or styling libraries
- Check `package.json` before importing any library; output install command if missing
- Check Tailwind version (v3 vs v4) before touching config
- Do not break existing functionality — test after every change
- Keep changes reviewable: targeted improvements over big rewrites
