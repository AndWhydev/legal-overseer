# AI Elements Research

## Package: ai-elements v1.9.0

**Repository:** https://github.com/vercel/ai-elements  
**Documentation:** https://elements.ai-sdk.dev  
**Maintainer:** Vercel  

---

## Component 1: chain-of-thought

### What It Is
Collapsible UI for step-by-step AI reasoning visualization.

### Installation
```bash
npx ai-elements@latest add chain-of-thought
```

### Is It Copy-Paste?
YES - Like shadcn/ui
- Downloaded as TypeScript files
- Copied to @/components/ai-elements/
- Fully customizable
- No npm dependency after install (CLI just downloads)

### Dependencies
- @radix-ui/react-collapsible
- lucide-react (icons)
- shadcn/ui Badge + Collapsible

### Component Tree
- ChainOfThought (root)
  - ChainOfThoughtHeader (trigger)
  - ChainOfThoughtContent
    - ChainOfThoughtStep (each step)
    - ChainOfThoughtSearchResults
    - ChainOfThoughtImage

### Key Props
- open, defaultOpen, onOpenChange
- ChainOfThoughtStep: label, description, status (complete|active|pending), icon

### Animations
- Chevron rotates 180°
- Steps fade-in, slide from top
- Smooth collapse/expand

---

## Component 2: reasoning

### What It Is
Advanced streaming-aware thinking display with auto-open/close and shimmer animation.

### Installation
```bash
npx ai-elements@latest add reasoning
```

### Is It Copy-Paste?
YES - Like shadcn/ui
- TypeScript source files
- No npm dependency after install

### Dependencies
- @radix-ui/react-collapsible
- lucide-react
- motion/react (for shimmer\!)
- streamdown (markdown rendering):
  - @streamdown/cjk (CJK support)
  - @streamdown/code (syntax highlighting)
  - @streamdown/math (LaTeX)
  - @streamdown/mermaid (diagrams)

### Smart Features
- Auto-opens when isStreaming={true} starts
- Shows shimmer 'Thinking...' while streaming
- Auto-closes 1s after streaming ends
- Tracks elapsed time ('Thought for X seconds')
- Supports markdown with code, math, mermaid

### Component Tree
- Reasoning (handles streaming state)
  - ReasoningTrigger (header + shimmer)
  - ReasoningContent (markdown rendering)

### Key Props
- isStreaming: boolean
- open, defaultOpen, onOpenChange
- duration: number (seconds elapsed)
- ReasoningTrigger: getThinkingMessage callback
- ReasoningContent: children (markdown string)

---

## Component 3: shimmer

### What It Is
ChatGPT-style text shimmer animation.

### How It Works
- Gradient sweeps left across text
- Right-to-left animation
- Duration: 2 seconds default
- Spread: 2px per character default
- Infinite loop
- GPU-accelerated via motion/react

### Key Props
- children: string
- duration: number
- spread: number
- as: ElementType
- className: string

---

## Best Practices

### Streaming
✓ Track isStreaming separate from isLoading
✓ Update reasoning incrementally as tokens arrive
✓ Auto-open on stream start
✓ Show brief completion before auto-close (1s)
✓ Display duration
✓ Allow manual override

### Text Rendering
✓ Stream markdown not plain text
✓ Syntax highlight code blocks
✓ Render math (LaTeX)
✓ Support CJK
✓ Show diagrams (Mermaid)
✓ Use Streamdown for parsing

### Shimmer
✓ Use motion/react (GPU-accelerated)
✓ Keep 1-2 second duration
✓ Calculate spread dynamically
✓ Use CSS variables for colors
✓ Only show while streaming
✓ Infinite loop is natural

### Collapsibles
✓ Use Radix UI Collapsible (accessibility)
✓ Support controlled & uncontrolled modes
✓ Smooth transitions (fade + slide)
✓ Clear indicators (chevron, icon)
✓ Keyboard navigation
✓ Focus management

### Performance
✓ Memoize with React.memo()
✓ Cache Motion components
✓ Use useMemo for calculations
✓ Avoid new context per render
✓ Lazy-load plugins
✓ Stream incrementally

### Accessibility
✓ Semantic HTML (Radix UI)
✓ ARIA roles/attributes
✓ Keyboard navigation
✓ Focus management
✓ Color contrast ≥ 4.5:1
✓ Text alternatives for icons
✓ prefers-reduced-motion support

---

## Integration

Works with:
- @ai-sdk/react (useChat hook)
- shadcn/ui (built on top)
- Tailwind CSS (CSS Variables mode)
- motion/react (animations)
- streamdown (markdown)

---

## Key Takeaways

✓ Copy-paste like shadcn/ui (you own code)
✓ Zero npm deps after install
✓ chain-of-thought: vertical step visualization
✓ reasoning: streaming thinking with auto-behavior
✓ shimmer: GPU-accelerated text animation
✓ Markdown: code, math, CJK, mermaid support
✓ Built on Radix UI (accessible)
✓ Uses motion/react (smooth animations)
✓ CSS variables for theming
✓ Streaming-optimized

