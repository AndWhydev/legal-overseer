# BitBit Design System — Agent Reference

**You are an agent working in this codebase. Read this file before touching UI.**
This file is the contract for how agents extend or use the DS without creating drift.

---

## The discipline (read first)

1. **Search `manifest.tsx` BEFORE building anything UI-shaped.** Every canonical primitive lives there.
2. **Match by `replaces[]`.** If a manifest entry's `replaces` array describes the pattern you're about to write, use the entry — don't reinvent.
3. **Don't add new primitives without proposing first.** Ask whether your need is genuinely uncovered, or if you should extend an existing primitive.
4. **Avoid `status: 'deprecated'` entries.** They're listed for context only — do not use them in new code.
5. **Tokens belong to `src/styles/ds/`** — typography (`title-*`, `eyebrow`, `caption`, `micro`, `nano`), icons (`icon-{xs,sm,md,lg,xl}`). Use them, don't recreate.

---

## File map

```
src/components/ds/
  manifest.tsx        ← single source of truth (typed registry)
  index.ts            ← barrel — `import { ListRow, StatusDot, dsManifest } from '@/components/ds'`
  AGENTS.md           ← this file
  atoms/              ← indivisible primitives
    status-dot.tsx
  molecules/          ← compositions of atoms
    list-row.tsx
  organisms/          ← complex composites (drawers, message bubbles, sections)
  templates/          ← page-level shells

src/styles/ds/
  typography.css      ← .title-*, .eyebrow, .caption, .micro, .nano + tokens
  icons.css           ← .icon-{xs,sm,md,lg,xl} + tokens

src/app/dev/ds/
  page.tsx            ← live canvas — drives from manifest
```

---

## How to find what you need

**By description (semantic):** read `dsManifest[tier][Name].description`.

**By the legacy pattern you're replacing:** call `findReplacement('your pattern')`:

```ts
import { findReplacement } from '@/components/ds'
// Returns DSEntries whose replaces[] contains a matching substring.
findReplacement('rounded-full bg-emerald')  // → StatusDot
findReplacement('lead-card')                 // → ListRow
```

**By tier:** `dsEntries('atom')`, `dsEntries('molecule')`, `dsEntries()` (all).

**Visually:** `https://app.bitbit.chat/dev/ds`. The canvas iterates the manifest — what you see is what's available.

---

## How to add a new primitive

1. **Pick the tier.** Atom (no state, single visual), molecule (atom composition), organism (state-bearing composite), template (page shell).
2. **Create the file** under the correct subdirectory: `src/components/ds/{tier}s/your-thing.tsx`.
3. **Add a manifest entry** in `src/components/ds/manifest.tsx` under the matching tier key. Required fields:
   - `component` — the actual component reference
   - `tier`
   - `status` — start with `'experimental'`, promote to `'canonical'` once validated
   - `description`
   - `replaces` — patterns this supersedes (most important field for downstream agents)
   - `related` — siblings to consider
   - `example` — copy-pasteable JSX
   - `whenNotToUse` — anti-pattern guidance
   - `samples` — array of live render examples for the canvas
4. **Re-export** from `src/components/ds/index.ts`.
5. **Verify** at `/dev/ds` — your component renders automatically.

---

## How to use a primitive (the speed path)

```ts
import { ListRow, StatusDot } from '@/components/ds'

<ListRow leading={<Avatar />} trailing={<Time />}>
  <div className="flex items-baseline justify-between">
    <span className="text-sm font-medium">{name}</span>
    <StatusDot variant="active" label="Active" size={6} />
  </div>
  <p className="micro text-muted-foreground">{preview}</p>
</ListRow>
```

The DS owns layout + interaction + a11y. You compose typography and color via Tailwind utilities or DS token classes inside the slots.

---

## Token primitives (CSS classes, not React components)

Use these directly via `className`. They override the legacy `bb-*` and ad-hoc `text-*`/`size-*` classes.

| Class | Where | Purpose |
|---|---|---|
| `.title-h1` ... `.title-h4` | typography.css | Heading hierarchy |
| `.title-card` | typography.css | 15px panel/card/modal titles |
| `.eyebrow` | typography.css | Uppercase section labels |
| `.caption` | typography.css | 13px helper / meta text |
| `.micro` | typography.css | 12px tight inline labels |
| `.nano` | typography.css | 10px footer / kbd hints |
| `.icon-xs` ... `.icon-xl` | icons.css | 12 / 16 / 20 / 24 / 32 px |

---

## Don't

- Don't `text-2xl font-semibold tracking-tight` for a card title — use `.title-card` or the `CardTitle` slot.
- Don't `<span className="size-2 rounded-full bg-emerald-500" />` for a status dot — use `<StatusDot />`.
- Don't roll your own clickable row — use `<ListRow />`.
- Don't add color classes named `bb-red`/`bb-green`/etc. — use semantic Tailwind tokens (`text-success`, `bg-warning`, etc.).
- Don't use `size-3.5` for icons — round to `.icon-sm` (16px). 14px is off-scale.

---

## Lifecycle

A primitive's `status` evolves:

- **experimental** — newly added, in active iteration; agents may use but expect changes.
- **canonical** — the official path. Agents should default to these.
- **legacy** — superseded but still in use; sweep is in progress.
- **deprecated** — do not use in new code; will be removed.

When a primitive moves to `deprecated`, its `replaces[]` field continues to point at its successor. Agents reading the manifest can mechanically follow the chain.
