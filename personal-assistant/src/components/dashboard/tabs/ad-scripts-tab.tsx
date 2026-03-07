'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { TabShell } from '@/components/ui/tab-shell'

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
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<Platform, string> = {
  reels: 'Reels',
  tiktok: 'TikTok',
  shorts: 'Shorts',
  feed: 'Feed',
}

const PLATFORM_COLORS: Record<Platform, string> = {
  reels: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  tiktok: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  shorts: 'bg-red-500/15 text-red-400 border-red-500/30',
  feed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

const HOOK_LABELS: Record<HookType, string> = {
  curiosity: 'Curiosity',
  'problem-agitation': 'Problem-Agitation',
  'social-proof': 'Social Proof',
  'direct-offer': 'Direct Offer',
}

const TONE_COLORS: Record<string, string> = {
  urgent: 'text-red-400',
  casual: 'text-green-400',
  professional: 'text-blue-400',
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

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
      className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-white/10 hover:bg-white/20 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Storyboard view
// ---------------------------------------------------------------------------

function StoryboardView({ shots }: { shots: StoryboardShot[] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Storyboard ({shots.length} shots)
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {shots.map((shot) => (
            <div
              key={shot.shotNumber}
              className="rounded-lg border border-border/50 bg-card/30 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Shot {shot.shotNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  {shot.startTime}s - {shot.endTime}s ({shot.duration}s)
                </span>
              </div>
              <p className="text-sm mb-1">{shot.visual}</p>
              {shot.textOverlay && (
                <p className="text-xs text-muted-foreground">
                  Text: <span className="text-foreground/80">{shot.textOverlay}</span>
                </p>
              )}
              {shot.audio && (
                <p className="text-xs text-muted-foreground">
                  Audio: <span className="text-foreground/80">{shot.audio}</span>
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
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[script.platform]}`}>
            {PLATFORM_LABELS[script.platform]}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
            {HOOK_LABELS[script.hookType]}
          </span>
          <span className="text-xs text-muted-foreground">{script.duration}s</span>
        </div>
        <CopyButton text={script.script} />
      </div>

      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-sans">
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
    <div className="rounded-xl border border-border/50 bg-card/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{variation.variantLabel}</span>
          <span className={`text-xs ${TONE_COLORS[variation.tone] ?? 'text-muted-foreground'}`}>
            {variation.tone}
          </span>
        </div>
        <CopyButton text={variation.script} />
      </div>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 font-sans">
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
    <form onSubmit={handleSubmit} className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Service / Offer Package</label>
        <select
          value={selectedOffer}
          onChange={(e) => setSelectedOffer(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {offers.length === 0 && <option value="">No offer packages found</option>}
          {offers.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {(['reels', 'tiktok', 'shorts', 'feed'] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selectedPlatforms.includes(p)
                  ? PLATFORM_COLORS[p]
                  : 'border-border/50 text-muted-foreground hover:border-border'
              }`}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Hook Style</label>
        <div className="flex flex-wrap gap-2">
          {(['curiosity', 'problem-agitation', 'social-proof', 'direct-offer'] as HookType[]).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => toggleHook(h)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selectedHooks.includes(h)
                  ? 'border-violet-500/30 bg-violet-500/15 text-violet-400'
                  : 'border-border/50 text-muted-foreground hover:border-border'
              }`}
            >
              {HOOK_LABELS[h]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={isGenerating || !selectedOffer || selectedPlatforms.length === 0 || selectedHooks.length === 0}
        className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Film className="h-4 w-4" />
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
  if (batches.length === 0) return null

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        History
      </h2>
      <div className="space-y-2">
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b)}
            className="w-full text-left rounded-lg border border-border/50 bg-card/30 p-3 hover:bg-card/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{b.offer_name}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(b.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
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
        <div className="flex flex-col gap-6 p-6">
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="h-48 rounded-xl bg-muted animate-pulse" />
        </div>
      </TabShell>
    )
  }

  return (
    <TabShell>
      <div className="flex flex-col gap-6 p-6">
        {/* Generate Form */}
        <GenerateForm
          offers={offers}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />

        {/* Current result */}
        {currentResult && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Scripts for {currentResult.offerName}
            </h2>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {currentResult.scripts.map((script, i) => (
                <ScriptCard key={`${script.platform}-${script.hookType}-${i}`} script={script} />
              ))}
            </div>

            {currentResult.variations.length > 0 && (
              <>
                <h3 className="text-md font-semibold text-muted-foreground mt-4">
                  A/B Variations
                </h3>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
      </div>
    </TabShell>
  )
}

export default React.memo(AdScriptsTab)
