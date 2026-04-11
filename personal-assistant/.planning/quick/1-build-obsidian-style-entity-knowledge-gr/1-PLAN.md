---
phase: quick-1
title: Obsidian-style Entity Knowledge Graph
status: planned
tasks: 3
---

<objective>
Replace the list-based relationship view in the Knowledge tab with an interactive Obsidian-style force-directed graph. Nodes represent entities (contacts, projects, invoices, tasks), edges represent relationships. Dark glassmorphic aesthetic with glowing nodes, curved links, zoom/pan/drag, always-visible labels.
</objective>

## Task 1: Rewrite graph-viewer.tsx — Obsidian-quality force graph

**Files:** `src/components/knowledge/graph-viewer.tsx`
**Action:** Rewrite the existing SVG force-directed graph with:

### Physics
- Stronger repulsion (charge -200) with Barnes-Hut approximation feel
- Spring attraction with ideal distance ~120px
- Center gravity pulling nodes toward canvas center
- Higher damping (0.92) for slower settle, more organic feel
- Cooling: simulation alpha decays over time, stops when settled
- Node dragging: click+drag a node pins it, releases on mouseup

### Visual — Obsidian aesthetic
- **Nodes**: Circles with type-based colors (contact=#6b8fc9, project=#4ba383, invoice=#c4934a, task=#9b88b8), soft glow via SVG filter (feGaussianBlur + feComposite), size based on connection count
- **Labels**: Always visible (not just on hover), positioned below node, truncated to ~15 chars, white text with dark shadow for readability
- **Edges**: Curved paths (quadratic bezier with slight arc), semi-transparent, color from source node, thickness based on relationship strength
- **Selected node**: Brighter glow, connected edges highlighted, non-connected nodes dimmed
- **Background**: Subtle dot grid pattern via SVG pattern, matches glassmorphic dark theme

### Interaction
- Zoom: mouse wheel, range 0.3–3x
- Pan: click+drag on background (not on a node)
- Node click: select node, highlight connections, fire onNodeClick
- Node drag: reposition individual nodes
- Double-click background: reset zoom/pan

### Performance
- Use refs for simulation state, not React state — only re-render SVG via requestAnimationFrame writing to DOM directly
- Stop simulation when alpha < 0.001
- Resume on node drag or data change

### Props — keep same interface
```typescript
interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (node: GraphNode) => void
  height?: number
  width?: number
}
```

**Verify:** Component renders, nodes spread out, can zoom/pan/drag
**Done:** graph-viewer.tsx rewritten with Obsidian aesthetic

## Task 2: Add Entity Graph section to knowledge-tab.tsx

**Files:** `src/components/dashboard/tabs/knowledge-tab.tsx`, `src/app/api/knowledge/graph/route.ts`
**Action:**

- Add "Entity Graph" section at the top of the Knowledge tab (before search)
- Lazy-load `GraphViewer` via `React.lazy` + Suspense
- Fetch full graph on mount: `GET /api/knowledge/graph?format=nodes`
- GraphViewer fills available height (~400px min, flex if space allows)
- Clicking a node in the graph loads its detail (same as current selectEntity)
- Wrap in glassCard with "Entity Graph" header

Check the API route supports `format=nodes` — if not, add it to return all nodes and edges for the org.

**Verify:** Knowledge tab shows graph on load, clicking a node shows details below
**Done:** Entity Graph section wired into knowledge tab

## Task 3: API — ensure format=nodes returns full org graph

**Files:** `src/app/api/knowledge/graph/route.ts`
**Action:**

Check if `format=nodes` query param is handled. If not, add a handler that:
- Fetches all kg_nodes for the org
- Fetches all kg_edges for the org (valid, non-expired)
- Falls back to entity_relationships + contacts if kg_nodes is empty
- Returns `{ nodes: GraphNode[], edges: GraphEdge[], stats: { nodeCount, edgeCount } }`

**Verify:** `GET /api/knowledge/graph?format=nodes` returns nodes and edges
**Done:** API serves full org graph data
