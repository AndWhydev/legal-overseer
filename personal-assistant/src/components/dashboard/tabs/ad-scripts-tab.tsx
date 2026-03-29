'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { IconCopy, IconCheck, IconLoader2, IconChevronDown, IconChevronRight, IconMovie } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TabSkeleton } from './tab-skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// ---------------------------------------------------------------------------
// Types
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

const PLATFORM_VARIANT: Record<Platform, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  reels: 'secondary',
  tiktok: 'default',
  shorts: 'destructive',
  feed: 'outline',
}

const HOOK_LABELS: Record<HookType, string> = {
  curiosity: 'Curiosity',
  'problem-agitation': 'Problem-Agitation',
  'social-proof': 'Social Proof',
  'direct-offer': 'Direct Offer',
}

const TONE_VARIANT: Record<string, 'destructive' | 'default' | 'outline'> = {
  urgent: 'destructive',
  casual: 'default',
  professional: 'outline',
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
    <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy to clipboard">
      {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Storyboard view
// ---------------------------------------------------------------------------

function StoryboardView({ shots }: { shots: StoryboardShot[] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="mt-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 px-0 text-muted-foreground hover:text-foreground">
          {expanded ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
          Storyboard ({shots.length} shots)
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 flex flex-col gap-2">
          {shots.map((shot) => (
            <div key={shot.shotNumber} className="rounded-md border bg-muted/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Shot {shot.shotNumber}</span>
                <span className="text-xs text-muted-foreground">{shot.startTime}s - {shot.endTime}s ({shot.duration}s)</span>
              </div>
              <p className="mb-2 text-sm">{shot.visual}</p>
              {shot.textOverlay && (
                <p className="text-xs text-muted-foreground">Text: <span className="text-foreground">{shot.textOverlay}</span></p>
              )}
              {shot.audio && (
                <p className="text-xs text-muted-foreground">Audio: <span className="text-foreground">{shot.audio}</span></p>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Script card
// ---------------------------------------------------------------------------

function ScriptCard({ script }: { script: AdScript }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={PLATFORM_VARIANT[script.platform]}>
              {PLATFORM_LABELS[script.platform]}
            </Badge>
            <Badge variant="outline">{HOOK_LABELS[script.hookType]}</Badge>
            <span className="text-xs text-muted-foreground">{script.duration}s</span>
          </div>
          <CopyButton text={script.script} />
        </div>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{script.script}</pre>
        {script.storyboard?.length > 0 && <StoryboardView shots={script.storyboard} />}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Variation card
// ---------------------------------------------------------------------------

function VariationCard({ variation }: { variation: AdScriptVariation }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{variation.variantLabel}</span>
            <Badge variant={TONE_VARIANT[variation.tone] ?? 'outline'}>{variation.tone}</Badge>
          </div>
          <CopyButton text={variation.script} />
        </div>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{variation.script}</pre>
      </CardContent>
    </Card>
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

  const canSubmit = !isGenerating && selectedOffer && selectedPlatforms.length > 0 && selectedHooks.length > 0

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Service / Offer Package</Label>
            <Select value={selectedOffer} onValueChange={setSelectedOffer}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select offer" />
              </SelectTrigger>
              <SelectContent>
                {offers.length === 0 ? (
                  <SelectItem value="" disabled>No offer packages found</SelectItem>
                ) : (
                  offers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {(['reels', 'tiktok', 'shorts', 'feed'] as Platform[]).map((p) => {
                const isSelected = selectedPlatforms.includes(p)
                return (
                  <Button
                    key={p}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => togglePlatform(p)}
                  >
                    {PLATFORM_LABELS[p]}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Hook Style</Label>
            <div className="flex flex-wrap gap-2">
              {(['curiosity', 'problem-agitation', 'social-proof', 'direct-offer'] as HookType[]).map((h) => {
                const isSelected = selectedHooks.includes(h)
                return (
                  <Button
                    key={h}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleHook(h)}
                  >
                    {HOOK_LABELS[h]}
                  </Button>
                )
              })}
            </div>
          </div>

          <Button type="submit" disabled={!canSubmit} className="gap-2">
            {isGenerating ? (
              <>
                <IconLoader2 className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <IconMovie className="size-4" />
                Generate Scripts
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistorySection({ batches, onSelect }: { batches: SavedBatch[]; onSelect: (b: SavedBatch) => void }) {
  if (batches.length === 0) return null

  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">History</h2>
      <div className="flex flex-col gap-2">
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b)}
            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{b.offer_name}</span>
              <span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
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
    return <TabSkeleton variant="cards-grid" />
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {offers.length === 0 && !currentResult ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No offer packages found</EmptyTitle>
            <EmptyDescription>Create offer packages or service tiers to generate ad scripts.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <GenerateForm offers={offers} onGenerate={handleGenerate} isGenerating={isGenerating} />

          {currentResult && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Scripts for {currentResult.offerName}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {currentResult.scripts.map((script, i) => (
                  <ScriptCard key={`${script.platform}-${script.hookType}-${i}`} script={script} />
                ))}
              </div>

              {currentResult.variations.length > 0 && (
                <>
                  <h3 className="mt-2 text-base font-medium text-muted-foreground">A/B Variations</h3>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {currentResult.variations.map((v, i) => (
                      <VariationCard key={`var-${i}`} variation={v} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <HistorySection batches={batches} onSelect={handleSelectBatch} />
        </>
      )}
    </div>
  )
}

export default React.memo(AdScriptsTab)
