/**
 * /dev/ds/tokens — visual reference for every CSS token.
 *
 * Drives from `src/styles/ds/tokens.ts`. Each category renders its tokens
 * with a live sample so you can compare scale + intent at a glance.
 */

import { IconBolt } from '@tabler/icons-react'
import {
  tokens,
  type Token,
  type TokenCategory,
} from '@/styles/ds/tokens'

const CATEGORY_LABEL: Record<TokenCategory, string> = {
  typography: 'Typography',
  icon: 'Icon sizes',
  color: 'Color',
  spacing: 'Spacing',
  motion: 'Motion',
}

const CATEGORY_HINT: Record<TokenCategory, string> = {
  typography:
    'Font-size scale + matching utility classes. Use utilities for headings/labels; raw tokens via var() when composing.',
  icon: 'Icon sizing scale. Apply via .icon-{xs,sm,md,lg,xl} classes on SVG/Tabler icons.',
  color: 'Pending — color sweep + semantic tokens land in next phase.',
  spacing:
    'Pending — Tailwind spacing covers most needs; DS-specific spacing tokens land if/when we override.',
  motion: 'Pending — duration + easing tokens for canonical motion patterns.',
}

export default function DSTokensPage() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-12 text-foreground">
      <header className="mb-12">
        <p className="eyebrow text-muted-foreground">BitBit Design System</p>
        <h1 className="title-h1 mt-2">Tokens</h1>
        <p className="caption mt-3 max-w-prose text-muted-foreground">
          Every CSS custom property and utility class with intent metadata.
          Drives from{' '}
          <code className="rounded bg-secondary px-1 py-0.5 text-[12px]">
            src/styles/ds/tokens.ts
          </code>
          . Agents query this directly; humans see it rendered here.
        </p>
      </header>

      {(Object.keys(tokens) as TokenCategory[]).map((cat) => {
        const list = tokens[cat]
        return (
          <section key={cat} className="mb-12">
            <header className="mb-6">
              <h2 className="title-h2">{CATEGORY_LABEL[cat]}</h2>
              <p className="caption mt-1 text-muted-foreground">
                {CATEGORY_HINT[cat]}
              </p>
            </header>

            {list.length === 0 ? (
              <p className="caption italic text-muted-foreground">
                No tokens registered yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-4 py-3 text-left">
                        <span className="eyebrow text-muted-foreground">Sample</span>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <span className="eyebrow text-muted-foreground">Token</span>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <span className="eyebrow text-muted-foreground">Value</span>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <span className="eyebrow text-muted-foreground">Utility</span>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <span className="eyebrow text-muted-foreground">Description</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...list]
                      .sort((a, b) => a.scale.localeCompare(b.scale))
                      .map((tok) => (
                        <tr
                          key={tok.name}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3 align-middle">
                            <TokenSample token={tok} category={cat} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <code className="micro text-foreground">
                              {tok.cssVar}
                            </code>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <code className="micro text-muted-foreground">
                              {tok.value}
                            </code>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {tok.utility ? (
                              <code className="micro text-emerald-600 dark:text-emerald-400">
                                {tok.utility}
                              </code>
                            ) : (
                              <span className="micro text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span className="caption text-muted-foreground">
                              {tok.description}
                              {tok.notes && (
                                <span className="ml-2 text-amber-600 dark:text-amber-400">
                                  ({tok.notes})
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Per-category live samples
   ───────────────────────────────────────────────────────────────────────── */

function TokenSample({
  token,
  category,
}: {
  token: Token
  category: TokenCategory
}) {
  if (category === 'typography') {
    return (
      <span
        style={{
          fontSize: `var(${token.cssVar})`,
          fontWeight: 500,
          letterSpacing: 'var(--tracking-tight)',
        }}
      >
        Aa
      </span>
    )
  }
  if (category === 'icon') {
    return (
      <IconBolt
        style={{
          width: `var(${token.cssVar})`,
          height: `var(${token.cssVar})`,
        }}
      />
    )
  }
  // Future: color swatch, spacing line, motion preview
  return <span className="caption text-muted-foreground">—</span>
}
