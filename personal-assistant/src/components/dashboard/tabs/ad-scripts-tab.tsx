'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Loader2, ChevronDown, ChevronRight, Film } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'
import { TabShell } from '@/components/ui/tab-shell'
import { EmptyState } from '@/components/ui/empty-state'
import { GlassDropdown } from '@/components/ui/glass-dropdown'

// ---------------------------------------------------------------------------
// Types (mirrored from ad-script-gen)
// ---------------------------------------------------------------------------

type Platform = 'reels' | 'tiktok' | 'shorts' | 'feed'
type HookType = 'curiosity' | 'problem-agitation' | 'social-proof' | 'direct-offer'

interface StoryboardShot {
  shotNumber: number
  startTime: number
  endTime: number
  duration: number
  visual: string
  textOverlay: string
  audio: string
}

interface AdScript {
  platform: Platform
  hookType: HookType
  script: string
  duration: number
  shotDescriptions: string[]
  storyboard: StoryboardShot[]
  tone: string
}

interface AdScriptVariation {
  variantLabel: string
  openingLine: string
  callToAction: string
  tone: 'urgent' | 'casual' | 'professional'
  script: string
}

interface SavedBatch {
  id: string
  offer_name: string
  scripts: AdScript[]
  variations: AdScriptVariation[]
  created_at: string
}

interface OfferOption {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Constants - Inline styles instead of Tailwind classes
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<Platform, string> = {
  reels: 'Reels',
  tiktok: 'TikTok',
  shorts: 'Shorts',
  feed: 'Feed',
}

// Platform colors as inline style objects (muted versions)
const PLATFORM_COLORS: Record<Platform, React.CSSProperties> = {
  reels: {
    background: 'rgba(168, 85, 247, 0.12)',
    color: '#a855f7',
    border: '1px solid rgba(168, 85, 247, 0.3)',
  },
  tiktok: {
    background: 'rgba(14, 165, 233, 0.12)',
    color: '#0ea5e9',
    border: '1px solid rgba(14, 165, 233, 0.3)',
  },
  shorts: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  feed: {
    background: 'rgba(59, 130, 246, 0.12)',
    color: '#3b82f6',
    border: '1px solid rgba(59, 130, 246, 0.3)',
  },
}

const HOOK_LABELS: Record<HookType, string> = {
  curiosity: 'Curiosity',
  'problem-agitation': 'Problem-Agitation',
  'social-proof': 'Social Proof',
  'direct-offer': 'Direct Offer',
}

// Tone colors as inline style objects (muted)
const TONE_COLORS: Record<string, React.CSSProperties> = {
  urgent: {
    color: '#ef4444',
  },
  casual: {
    color: '#22c55e',
  },
  professional: {
    color: '#3b82f6',
  },
}

// ---------------------------------------------------------------------------
// Inline styles - Glass patterns from STYLE_GUIDE
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  ...S.card,
}

const ghostBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonGhost,
  padding: '8px 16px',
  borderRadius: 12,
  height: 'auto',
}

const accentBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonPrimary,
}

const pillBtn: React.CSSProperties = {
  ...S.pill,
  padding: '8px 16px',
  borderRadius: 20,
  height: 'auto',
}

const glassInput: React.CSSProperties = {
  ...S.input,
  padding: '12px 16px',
  borderRadius: 12,
}

const glassSelect: React.CSSProperties = {
  ...S.input,
  padding: '12px 16px',
  borderRadius: 12,
  appearance: 'none' as const,
  cursor: 'pointer',
}

const listRow: React.CSSProperties = {
  ...S.listRow,
}

const sectionHeader: React.CSSProperties = {
  ...S.sectionLabel,
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silent
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...ghostBtn,
        background: hovered ? 'var(--glass-interactive-bg)' : 'transparent',
        borderColor: hovered ? C.borderHover : C.borderVisible,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingRight: 8,
        paddingLeft: 8,
      }}
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span style={{ fontSize: 14 }}>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Storyboard view
// ---------------------------------------------------------------------------

function StoryboardView({ shots }: { shots: StoryboardShot[] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 14,
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'color 200ms',
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Storyboard ({shots.length} shots)
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shots.map((shot) => (
            <div
              key={shot.shotNumber}
              style={{
                ...glassCard,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Shot {shot.shotNumber}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {shot.startTime}s - {shot.endTime}s ({shot.duration}s)
                </span>
              </div>
              <p style={{ fontSize: 14, marginBottom: 8, color: 'var(--text-primary)' }}>
                {shot.visual}
              </p>
              {shot.textOverlay && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Text: <span style={{ color: C.textPrimary }}>{shot.textOverlay}</span>
                </p>
              )}
              {shot.audio && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Audio: <span style={{ color: C.textPrimary }}>{shot.audio}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Script card
// ---------------------------------------------------------------------------

function ScriptCard({ script }: { script: AdScript }) {
  return (
    <div style={glassCard}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              ...pillBtn,
              ...PLATFORM_COLORS[script.platform],
              padding: '8px 12px',
              borderRadius: 16,
            }}
          >
            {PLATFORM_LABELS[script.platform]}
          </span>
          <span
            style={{
              ...pillBtn,
              padding: '8px 12px',
              borderRadius: 16,
            }}
          >
            {HOOK_LABELS[script.hookType]}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {script.duration}s
          </span>
        </div>
        <CopyButton text={script.script} />
      </div>

      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: 14,
          lineHeight: 1.6,
          color: C.textPrimary,
          fontFamily: 'inherit',
          margin: 0,
        }}
      >
        {script.script}
      </pre>

      {script.storyboard?.length > 0 && (
        <StoryboardView shots={script.storyboard} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variation card
// ---------------------------------------------------------------------------

function VariationCard({ variation }: { variation: AdScriptVariation }) {
  return (
    <div style={glassCard}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {variation.variantLabel}
          </span>
          <span style={{ fontSize: 14, ...TONE_COLORS[variation.tone] }}>
            {variation.tone}
          </span>
        </div>
        <CopyButton text={variation.script} />
      </div>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: 14,
          lineHeight: 1.6,
          color: C.textPrimary,
          fontFamily: 'inherit',
          margin: 0,
        }}
      >
        {variation.script}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generation form
// ---------------------------------------------------------------------------

function GenerateForm({
  offers,
  onGenerate,
  isGenerating,
}: {
  offers: OfferOption[]
  onGenerate: (params: { offerPackageId: string; platforms: Platform[]; hookTypes: HookType[] }) => void
  isGenerating: boolean
}) {
  const [selectedOffer, setSelectedOffer] = useState(offers[0]?.id ?? '')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['reels', 'tiktok'])
  const [selectedHooks, setSelectedHooks] = useState<HookType[]>(['curiosity', 'problem-agitation'])

  useEffect(() => {
    if (!selectedOffer && offers.length > 0) {
      setSelectedOffer(offers[0].id)
    }
  }, [offers, selectedOffer])

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  const toggleHook = (h: HookType) => {
    setSelectedHooks((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOffer || selectedPlatforms.length === 0 || selectedHooks.length === 0) return
    onGenerate({
      offerPackageId: selectedOffer,
      platforms: selectedPlatforms,
      hookTypes: selectedHooks,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        ...glassCard,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-primary)' }}>
          Service / Offer Package
        </label>
        <GlassDropdown
          options={offers.length === 0 ? [{ value: '', label: 'No offer packages found' }] : offers.map((o) => ({ value: o.id, label: o.name }))}
          value={selectedOffer}
          onChange={(v) => setSelectedOffer(v)}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-primary)' }}>
          Platforms
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['reels', 'tiktok', 'shorts', 'feed'] as Platform[]).map((p) => {
            const isSelected = selectedPlatforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                style={{
                  ...pillBtn,
                  ...(isSelected ? PLATFORM_COLORS[p] : {}),
                  borderColor: isSelected ? undefined : 'var(--glass-interactive-border)',
                  color: isSelected ? PLATFORM_COLORS[p].color : 'var(--text-secondary)',
                }}
              >
                {PLATFORM_LABELS[p]}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-primary)' }}>
          Hook Style
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['curiosity', 'problem-agitation', 'social-proof', 'direct-offer'] as HookType[]).map((h) => {
            const isSelected = selectedHooks.includes(h)
            return (
              <button
                key={h}
                type="button"
                onClick={() => toggleHook(h)}
                style={{
                  ...pillBtn,
                  ...(isSelected
                    ? {
                        background: 'rgba(168, 85, 247, 0.15)',
                        color: '#a855f7',
                      }
                    : {}),
                }}
              >
                {HOOK_LABELS[h]}
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={isGenerating || !selectedOffer || selectedPlatforms.length === 0 || selectedHooks.length === 0}
        style={{
          ...accentBtn,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'center',
          opacity: isGenerating || !selectedOffer || selectedPlatforms.length === 0 || selectedHooks.length === 0 ? 0.5 : 1,
          cursor: isGenerating || !selectedOffer || selectedPlatforms.length === 0 || selectedHooks.length === 0 ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isGenerating && selectedOffer && selectedPlatforms.length > 0 && selectedHooks.length > 0) {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--btn-primary-hover, #E2E8F0)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--btn-primary-bg, #F1F5F9)'
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
        }}
      >
        {isGenerating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Film size={16} />
            Generate Scripts
          </>
        )}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistorySection({ batches, onSelect }: { batches: SavedBatch[]; onSelect: (b: SavedBatch) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (batches.length === 0) return null

  return (
    <div>
      <h2 style={sectionHeader}>History</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b)}
            onMouseEnter={() => setHoveredId(b.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              ...listRow,
              width: '100%',
              textAlign: 'left',
              background: hoveredId === b.id ? 'var(--bb-surface-hover)' : 'var(--glass-pill-bg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                {b.offer_name}
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {new Date(b.created_at).toLocaleDateString()}
              </span>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              {b.scripts.length} script{b.scripts.length !== 1 ? 's' : ''}
              {b.variations.length > 0 ? ` + ${b.variations.length} variations` : ''}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

function AdScriptsTab() {
  const [offers, setOffers] = useState<OfferOption[]>([])
  const [batches, setBatches] = useState<SavedBatch[]>([])
  const [currentResult, setCurrentResult] = useState<{
    scripts: AdScript[]
    variations: AdScriptVariation[]
    offerName: string
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch offers and history
  useEffect(() => {
    async function load() {
      try {
        const [offersRes, batchesRes] = await Promise.all([
          fetch('/api/agent/ad-scripts/offers').catch(() => null),
          fetch('/api/agent/ad-scripts').catch(() => null),
        ])

        if (offersRes?.ok) {
          const data = await offersRes.json()
          setOffers(data.offers ?? [])
        }

        if (batchesRes?.ok) {
          const data = await batchesRes.json()
          setBatches(data.batches ?? [])
        }
      } catch {
        // silent
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const handleGenerate = useCallback(async (params: { offerPackageId: string; platforms: Platform[]; hookTypes: HookType[] }) => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/agent/ad-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data = await res.json()
      setCurrentResult({
        scripts: data.scripts ?? [],
        variations: data.variations ?? [],
        offerName: data.offerPackageName ?? '',
      })
      // Refresh history
      const histRes = await fetch('/api/agent/ad-scripts')
      if (histRes.ok) {
        const histData = await histRes.json()
        setBatches(histData.batches ?? [])
      }
    } catch {
      // silent
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const handleSelectBatch = useCallback((batch: SavedBatch) => {
    setCurrentResult({
      scripts: batch.scripts,
      variations: batch.variations,
      offerName: batch.offer_name,
    })
  }, [])

  if (isLoading) {
    return (
      <TabShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
          <div
            style={{
              height: 32,
              width: 192,
              borderRadius: 8,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease infinite',
            }}
          />
          <div
            style={{
              height: 192,
              borderRadius: 16,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease infinite',
            }}
          />
        </div>
      </TabShell>
    )
  }

  return (
    <TabShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
        {/* No offers state */}
        {offers.length === 0 && !currentResult ? (
          <EmptyState
            title="No offer packages found"
            description="Create offer packages or service tiers to generate ad scripts."
          />
        ) : (
          <>
            {/* Generate Form */}
            <GenerateForm
              offers={offers}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
            />

            {/* Current result */}
            {currentResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Scripts for {currentResult.offerName}
                </h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: 16,
                  }}
                >
                  {currentResult.scripts.map((script, i) => (
                    <ScriptCard key={`${script.platform}-${script.hookType}-${i}`} script={script} />
                  ))}
                </div>

                {currentResult.variations.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 8 }}>
                      A/B Variations
                    </h3>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: 16,
                      }}
                    >
                      {currentResult.variations.map((v, i) => (
                        <VariationCard key={`var-${i}`} variation={v} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* History */}
            <HistorySection batches={batches} onSelect={handleSelectBatch} />
          </>
        )}
      </div>
    </TabShell>
  )
}

export default React.memo(AdScriptsTab)
