/**
 * /dev/ds — live design system canvas.
 *
 * Single page rendering every canonical primitive from `dsManifest`, plus
 * hardcoded sections for CSS-only tokens (typography, icon sizes). The page
 * iterates the manifest, so future primitives auto-appear as they get added.
 *
 * The DS spec and the rendered app are the same artifact: this page IS the
 * canonical reference. Static `bitbit-ds/` repo is the design archive.
 */

import { IconBolt } from '@tabler/icons-react'
import {
  dsManifest,
  type DSEntry,
  type DSTier,
} from '@/components/ds/manifest'

const TIER_LABEL: Record<DSTier, string> = {
  atom: 'Atoms',
  molecule: 'Molecules',
  organism: 'Organisms',
  template: 'Templates',
}

const TIER_HINT: Record<DSTier, string> = {
  atom: 'Indivisible primitives. No state, minimal props, single visual purpose.',
  molecule: 'Compositions of atoms. Slot-based; caller decides typography and inner structure.',
  organism: 'Complex composites — section-level UI with their own state or domain.',
  template: 'Page-level shells (sidebar + topbar + content frame).',
}

export default function DSCanvasPage() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-12 text-foreground">
      <header className="mb-12">
        <p className="eyebrow text-muted-foreground">BitBit Design System</p>
        <h1 className="title-h1 mt-2">Canvas</h1>
        <p className="caption mt-3 max-w-prose text-muted-foreground">
          Every canonical primitive, rendered live. Drives from{' '}
          <code className="rounded bg-secondary px-1 py-0.5 text-[12px]">
            src/components/ds/manifest.tsx
          </code>{' '}
          — agents and canvas read the same registry. Add a manifest entry, the
          canvas updates automatically.
        </p>

        <nav className="mt-5 flex gap-3">
          <a
            href="/dev/ds"
            className="caption rounded-full bg-secondary px-3 py-1 text-foreground"
          >
            Components
          </a>
          <a
            href="/dev/ds/tokens"
            className="caption rounded-full px-3 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Tokens
          </a>
        </nav>
      </header>

      {/* ── Tokens (CSS-only) ───────────────────────────────────────────── */}
      <TierHeader title="Tokens" hint="CSS custom properties + utility classes. Foundation layer." />

      <Section title="Typography" code="src/styles/ds/typography.css">
        <TokenRow label=".title-h1">
          <h1 className="title-h1">The quick brown fox jumps</h1>
        </TokenRow>
        <TokenRow label=".title-h2">
          <h2 className="title-h2">The quick brown fox jumps</h2>
        </TokenRow>
        <TokenRow label=".title-h3">
          <h3 className="title-h3">The quick brown fox jumps</h3>
        </TokenRow>
        <TokenRow label=".title-h4">
          <h4 className="title-h4">The quick brown fox jumps</h4>
        </TokenRow>
        <TokenRow label=".title-card">
          <span className="title-card">Card / panel / modal title</span>
        </TokenRow>
        <TokenRow label=".eyebrow">
          <span className="eyebrow text-muted-foreground">Section label</span>
        </TokenRow>
        <TokenRow label=".caption">
          <span className="caption">13px helper / meta text</span>
        </TokenRow>
        <TokenRow label=".micro">
          <span className="micro">12px tight inline label</span>
        </TokenRow>
        <TokenRow label=".nano">
          <span className="nano">10px footer / kbd-hint</span>
        </TokenRow>
      </Section>

      <Section title="Icon sizes" code="src/styles/ds/icons.css">
        <div className="flex items-end gap-6">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <IconBolt className={`icon-${s}`} />
              <span className="micro text-muted-foreground">.icon-{s}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Components (manifest-driven) ────────────────────────────────── */}
      {(['atom', 'molecule', 'organism', 'template'] as const).map((tier) => {
        const tierKey = `${tier}s` as keyof typeof dsManifest
        const entries = Object.entries(dsManifest[tierKey])
        if (entries.length === 0) {
          return (
            <div key={tier}>
              <TierHeader title={TIER_LABEL[tier]} hint={TIER_HINT[tier]} />
              <p className="caption mb-12 text-muted-foreground">
                None yet — this tier will populate as the DS grows.
              </p>
            </div>
          )
        }
        return (
          <div key={tier}>
            <TierHeader title={TIER_LABEL[tier]} hint={TIER_HINT[tier]} />
            {entries.map(([name, entry]) => (
              <ManifestSection key={name} name={name} entry={entry} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Layout helpers — local to canvas, not part of DS
   ───────────────────────────────────────────────────────────────────────── */

function TierHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mt-16 mb-6">
      <h2 className="title-h2">{title}</h2>
      <p className="caption mt-1 text-muted-foreground">{hint}</p>
    </div>
  )
}

function Section({
  title,
  code,
  children,
}: {
  title: string
  code: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12 rounded-xl border border-border p-6">
      <header className="mb-5 flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="title-h3">{title}</h3>
        <code className="micro text-muted-foreground">{code}</code>
      </header>
      {children}
    </section>
  )
}

function TokenRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-6 py-2">
      <code className="nano w-20 shrink-0 text-muted-foreground">{label}</code>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function ManifestSection({ name, entry }: { name: string; entry: DSEntry }) {
  return (
    <section className="mb-12 rounded-xl border border-border p-6">
      <header className="mb-5 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="title-h3">{name}</h3>
          <StatusBadge status={entry.status} />
        </div>
        <p className="caption mt-2 text-muted-foreground">{entry.description}</p>
      </header>

      {/* Live samples */}
      <div className="mb-6 space-y-5">
        {entry.samples.map((s) => (
          <div key={s.label}>
            <p className="eyebrow mb-2 text-muted-foreground">{s.label}</p>
            <div>{s.render()}</div>
          </div>
        ))}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2">
        <MetaBlock label="Replaces" items={entry.replaces} />
        <MetaBlock label="Related" items={entry.related} />
      </div>

      {/* Code example */}
      <div className="mt-4">
        <p className="eyebrow mb-2 text-muted-foreground">Example</p>
        <pre className="overflow-x-auto rounded-lg bg-secondary p-3 text-[12px] leading-relaxed">
          <code>{entry.example}</code>
        </pre>
      </div>

      {/* Anti-pattern */}
      {entry.whenNotToUse && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="eyebrow mb-1 text-amber-600 dark:text-amber-400">
            When NOT to use
          </p>
          <p className="caption">{entry.whenNotToUse}</p>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: DSEntry['status'] }) {
  const styles: Record<DSEntry['status'], string> = {
    canonical: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    experimental: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    legacy: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    deprecated: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return (
    <span
      className={`micro rounded-full px-2 py-0.5 font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function MetaBlock({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="eyebrow mb-2 text-muted-foreground">{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="caption text-muted-foreground">
            <span className="mr-2 text-foreground/40">·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
