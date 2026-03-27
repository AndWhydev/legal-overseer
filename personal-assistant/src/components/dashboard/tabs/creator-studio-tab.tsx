'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { IconLoader2, IconCopy, IconCheck, IconCalendar, IconChevronDown } from '@tabler/icons-react'
import { TabShell } from '@/components/ui/tab-shell'
import { Tabs, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

// ---- Types ----

type TemplateType = 'ad_scripts' | 'social_posts' | 'email_campaigns' | 'blog_posts'
type Tone = 'professional' | 'casual' | 'playful'
type Length = 'short' | 'medium' | 'long'
type ContentStatus = 'draft' | 'scheduled' | 'published'
type View = 'generate' | 'history' | 'calendar'

interface GeneratedItem {
  id: string
  template_type: TemplateType
  inputs: {
    product_name: string
    target_audience: string
    tone: Tone
    length: Length
  }
  output: string
  status: ContentStatus
  scheduled_for: string | null
  created_at: string
}

// ---- Constants ----

const TEMPLATES: Array<{
  id: TemplateType
  label: string
  description: string
  icon: string
}> = [
  {
    id: 'ad_scripts',
    label: 'Ad Scripts',
    description: 'Compelling video and ad copy for social, YouTube, and display',
    icon: '🎬',
  },
  {
    id: 'social_posts',
    label: 'Social Posts',
    description: 'Engaging posts optimised for Instagram, X, LinkedIn, and TikTok',
    icon: '📣',
  },
  {
    id: 'email_campaigns',
    label: 'Email Campaigns',
    description: 'Subject lines, email body, and sequences that convert',
    icon: '📧',
  },
  {
    id: 'blog_posts',
    label: 'Blog Posts',
    description: 'Full articles, outlines, and introductions for the target audience',
    icon: '✍️',
  },
]

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  ad_scripts: 'Ad Script',
  social_posts: 'Social Post',
  email_campaigns: 'Email Campaign',
  blog_posts: 'Blog Post',
}

const STATUS_VARIANT: Record<ContentStatus, 'secondary' | 'outline' | 'default'> = {
  draft: 'secondary',
  scheduled: 'outline',
  published: 'default',
}

// ---- Sub-components ----

function TemplateCard({
  template,
  selected,
  onClick,
}: {
  template: (typeof TEMPLATES)[0]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-primary bg-muted'
          : 'border-border bg-card hover:bg-accent/50'
      )}
    >
      <div className="mb-2 text-base">{template.icon}</div>
      <div className="text-sm font-medium text-foreground">{template.label}</div>
      <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {template.description}
      </div>
    </button>
  )
}

function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? (
        <><IconCheck className="size-3.5" /> Copied</>
      ) : (
        <><IconCopy className="size-3.5" /> Copy</>
      )}
    </Button>
  )
}

// ---- Calendar View ----

function CalendarView({
  items,
  onStatusChange,
}: {
  items: GeneratedItem[]
  onStatusChange: (id: string, status: ContentStatus) => void
}) {
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(now)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const scheduledByDate = useMemo(() => {
    const map: Record<string, GeneratedItem[]> = {}
    for (const item of items) {
      if (!item.scheduled_for) continue
      const d = new Date(item.scheduled_for)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = d.getDate().toString()
        map[key] = [...(map[key] || []), item]
      }
    }
    return map
  }, [items, year, month])

  const monthLabel = currentMonth.toLocaleString('en', { month: 'long', year: 'numeric' })
  const todayDate = now.getDate()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month

  return (
    <div>
      {/* Month nav */}
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>
          Prev
        </Button>
        <span className="text-sm font-medium text-foreground">{monthLabel}</span>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>
          Next
        </Button>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dayItems = scheduledByDate[day.toString()] || []
          const isToday = isCurrentMonth && day === todayDate

          return (
            <div
              key={day}
              className={cn(
                'min-h-[80px] rounded-lg border p-2',
                isToday ? 'border-primary/30 bg-muted/50' : 'border-border bg-card'
              )}
            >
              <div className={cn(
                'mb-1 text-xs font-medium',
                isToday ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {day}
              </div>
              <div className="flex flex-col gap-1">
                {dayItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    title={`${TEMPLATE_LABELS[item.template_type]}: ${item.inputs.product_name}`}
                    className="cursor-pointer truncate rounded-md px-1.5 py-0.5 text-xs transition-colors"
                    onClick={() => {
                      const next: ContentStatus =
                        item.status === 'scheduled' ? 'published' : item.status === 'draft' ? 'scheduled' : 'draft'
                      onStatusChange(item.id, next)
                    }}
                  >
                    <Badge variant={STATUS_VARIANT[item.status]} className="text-[10px]">
                      {item.inputs.product_name || TEMPLATE_LABELS[item.template_type]}
                    </Badge>
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{dayItems.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex justify-end gap-4">
        {(['draft', 'scheduled', 'published'] as ContentStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-2 text-xs">
            <Badge variant={STATUS_VARIANT[s]} className="size-2 rounded-full p-0" />
            <span className="capitalize text-muted-foreground">{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- History list ----

function HistoryItem({
  item,
  onSchedule,
  onStatusChange,
}: {
  item: GeneratedItem
  onSchedule: (id: string, scheduledFor: string) => void
  onStatusChange: (id: string, status: ContentStatus) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [dateValue, setDateValue] = useState(
    item.scheduled_for ? item.scheduled_for.split('T')[0] : ''
  )

  const template = TEMPLATES.find((t) => t.id === item.template_type)
  const created = new Date(item.created_at).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="gap-0 py-0 overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardContent className="flex cursor-pointer items-center gap-3 py-3 px-4">
            <span className="text-base">{template?.icon ?? '📄'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {TEMPLATE_LABELS[item.template_type]} — {item.inputs.product_name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {created} · {item.inputs.tone} · {item.inputs.length}
              </div>
            </div>
            <StatusBadge status={item.status} />
            <IconChevronDown className={cn(
              'size-4 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )} />
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-4 pb-4">
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-muted/50 p-3 font-sans text-sm leading-relaxed text-muted-foreground">
              {item.output}
            </pre>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton text={item.output} />

              {item.status !== 'published' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onStatusChange(
                      item.id,
                      item.status === 'draft' ? 'scheduled' : 'published'
                    )
                  }
                >
                  {item.status === 'draft' ? 'Schedule' : 'Mark Published'}
                </Button>
              )}

              {item.status === 'scheduled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusChange(item.id, 'draft')}
                  className="text-destructive"
                >
                  Unschedule
                </Button>
              )}

              {!scheduling && item.status !== 'published' && (
                <Button variant="outline" size="sm" onClick={() => setScheduling(true)}>
                  <IconCalendar className="size-3.5" /> Set date
                </Button>
              )}

              {scheduling && (
                <div className="flex items-center gap-2">
                  <Input
                    type="datetime-local"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    className="w-auto text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (dateValue) {
                        onSchedule(item.id, new Date(dateValue).toISOString())
                      }
                      setScheduling(false)
                    }}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setScheduling(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {item.scheduled_for && (
              <div className="mt-3 text-sm text-muted-foreground">
                Scheduled for{' '}
                {new Date(item.scheduled_for).toLocaleString('en', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// ---- Main tab ----

export default function CreatorStudioTab() {
  const [view, setView] = useState<View>('generate')

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('ad_scripts')
  const [productName, setProductName] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [tone, setTone] = useState<Tone>('professional')
  const [length, setLength] = useState<Length>('medium')
  const [generating, setGenerating] = useState(false)
  const [generatedOutput, setGeneratedOutput] = useState<GeneratedItem | null>(null)
  const [generateError, setGenerateError] = useState('')

  // History state
  const [history, setHistory] = useState<GeneratedItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<TemplateType | 'all'>('all')

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const url =
        historyFilter === 'all'
          ? '/api/creator-studio/history'
          : `/api/creator-studio/history?template_type=${historyFilter}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load history')
      const data = await res.json()
      setHistory(data.items || [])
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false)
    }
  }, [historyFilter])

  useEffect(() => {
    if (view === 'history' || view === 'calendar') {
      loadHistory()
    }
  }, [view, loadHistory])

  const handleGenerate = async () => {
    if (!productName.trim() || !targetAudience.trim()) {
      setGenerateError('Product name and target audience are required.')
      return
    }
    setGenerateError('')
    setGenerating(true)
    setGeneratedOutput(null)

    try {
      const res = await fetch('/api/creator-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_type: selectedTemplate,
          inputs: { product_name: productName, target_audience: targetAudience, tone, length },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Generation failed')
      }
      const data = await res.json()
      setGeneratedOutput(data)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setGenerating(false)
    }
  }

  const handleSchedule = async (id: string, scheduledFor: string) => {
    try {
      const res = await fetch('/api/creator-studio/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scheduled_for: scheduledFor, status: 'scheduled' }),
      })
      if (!res.ok) return
      setHistory((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, scheduled_for: scheduledFor, status: 'scheduled' } : item
        )
      )
      if (generatedOutput?.id === id) {
        setGeneratedOutput((prev) =>
          prev ? { ...prev, scheduled_for: scheduledFor, status: 'scheduled' } : prev
        )
      }
    } catch {
      // silently fail
    }
  }

  const handleStatusChange = async (id: string, status: ContentStatus) => {
    try {
      const res = await fetch('/api/creator-studio/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) return
      setHistory((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      )
      if (generatedOutput?.id === id) {
        setGeneratedOutput((prev) => (prev ? { ...prev, status } : prev))
      }
    } catch {
      // silently fail
    }
  }

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return history
    return history.filter((item) => item.template_type === historyFilter)
  }, [history, historyFilter])

  return (
    <TabShell variant="fixed" padding="p-0" className="min-h-0 gap-0">
      <div className="h-full overflow-y-auto p-7">
        <div className="mx-auto max-w-[960px]">

          {/* Header */}
          <div className="mb-7">
            <h1 className="text-lg font-semibold text-foreground">Creator Studio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate marketing content using AI — ad scripts, social posts, emails, and blogs.
            </p>
          </div>

          {/* View tabs */}
          <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mb-7">
            <TabsList>
              <TabsTrigger value="generate">Generate</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* GENERATE VIEW */}
          {view === 'generate' && (
            <div className={cn(
              'grid gap-6',
              generatedOutput ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            )}>
              {/* Left: form */}
              <div className="flex flex-col gap-6">
                {/* Template selector */}
                <Card>
                  <CardHeader>
                    <CardTitle>Content Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {TEMPLATES.map((t) => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          selected={selectedTemplate === t.id}
                          onClick={() => setSelectedTemplate(t.id)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Generation form */}
                <Card>
                  <CardHeader>
                    <CardTitle>Content Details</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div>
                      <Label htmlFor="cs-product">Product / Service Name</Label>
                      <Input
                        id="cs-product"
                        type="text"
                        placeholder="e.g. BitBit AI Platform"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="cs-audience">Target Audience</Label>
                      <Input
                        id="cs-audience"
                        type="text"
                        placeholder="e.g. Small business owners aged 30-50"
                        value={targetAudience}
                        onChange={(e) => setTargetAudience(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>

                    {/* Tone */}
                    <div>
                      <Label>Tone</Label>
                      <ToggleGroup
                        type="single"
                        value={tone}
                        onValueChange={(v) => v && setTone(v as Tone)}
                        variant="outline"
                        className="mt-1.5"
                      >
                        <ToggleGroupItem value="professional">Professional</ToggleGroupItem>
                        <ToggleGroupItem value="casual">Casual</ToggleGroupItem>
                        <ToggleGroupItem value="playful">Playful</ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    {/* Length */}
                    <div>
                      <Label>Length</Label>
                      <ToggleGroup
                        type="single"
                        value={length}
                        onValueChange={(v) => v && setLength(v as Length)}
                        variant="outline"
                        className="mt-1.5"
                      >
                        <ToggleGroupItem value="short">Short ~100w</ToggleGroupItem>
                        <ToggleGroupItem value="medium">Medium ~300w</ToggleGroupItem>
                        <ToggleGroupItem value="long">Long ~600w+</ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    {generateError && (
                      <Alert variant="destructive">
                        <AlertDescription>{generateError}</AlertDescription>
                      </Alert>
                    )}

                    <Button onClick={handleGenerate} disabled={generating} className="w-full">
                      {generating ? (
                        <><IconLoader2 className="size-4 animate-spin" /> Generating...</>
                      ) : (
                        'Generate Content'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Right: preview panel */}
              {generatedOutput && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{TEMPLATE_LABELS[generatedOutput.template_type]}</CardTitle>
                        <CardDescription className="mt-1">
                          {generatedOutput.inputs.product_name} · {generatedOutput.inputs.tone} · {generatedOutput.inputs.length}
                        </CardDescription>
                      </div>
                      <StatusBadge status={generatedOutput.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/50 p-4 font-sans text-sm leading-relaxed text-muted-foreground">
                      {generatedOutput.output}
                    </pre>

                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={generatedOutput.output} />
                      <Button variant="outline" size="sm" onClick={() => { setView('history'); loadHistory(); }}>
                        View History
                      </Button>
                      {generatedOutput.status === 'draft' && (
                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(generatedOutput.id, 'scheduled')}>
                          <IconCalendar className="size-3.5" /> Schedule
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => {
                          setGeneratedOutput(null)
                          setProductName('')
                          setTargetAudience('')
                        }}
                      >
                        + New
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* HISTORY VIEW */}
          {view === 'history' && (
            <div>
              <div className="mb-5">
                <Select value={historyFilter} onValueChange={(v) => setHistoryFilter(v as TemplateType | 'all')}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.icon} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {historyLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              ) : filteredHistory.length === 0 ? (
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyTitle>No content yet</EmptyTitle>
                    <EmptyDescription>Generated content will appear here.</EmptyDescription>
                  </EmptyHeader>
                  <Button variant="outline" size="sm" onClick={() => setView('generate')}>
                    Start generating
                  </Button>
                </Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredHistory.map((item) => (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      onSchedule={handleSchedule}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CALENDAR VIEW */}
          {view === 'calendar' && (
            <Card>
              <CardHeader>
                <CardTitle>Content Calendar</CardTitle>
                <CardDescription>
                  Scheduled and published content across the month. Click a dot to cycle its status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <CalendarView
                    items={history}
                    onStatusChange={handleStatusChange}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TabShell>
  )
}
