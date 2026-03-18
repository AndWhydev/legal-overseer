'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { TabShell } from '@/components/ui/tab-shell'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

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
    description: 'Full articles, outlines, and introductions for your audience',
    icon: '✍️',
  },
]

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'playful', label: 'Playful' },
]

const LENGTH_OPTIONS: Array<{ value: Length; label: string; hint: string }> = [
  { value: 'short', label: 'Short', hint: '~100 words' },
  { value: 'medium', label: 'Medium', hint: '~300 words' },
  { value: 'long', label: 'Long', hint: '~600+ words' },
]

const STATUS_COLORS: Record<ContentStatus, string> = {
  draft: '#94A3B8',
  scheduled: '#eab308',
  published: '#22c55e',
}

const STATUS_BG: Record<ContentStatus, string> = {
  draft: 'rgba(148, 163, 184, 0.12)',
  scheduled: 'rgba(234, 179, 8, 0.12)',
  published: 'rgba(34, 197, 94, 0.12)',
}

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  ad_scripts: 'Ad Script',
  social_posts: 'Social Post',
  email_campaigns: 'Email Campaign',
  blog_posts: 'Blog Post',
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline styles
// ─────────────────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
}

const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(13, 17, 23, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
  boxSizing: 'border-box',
}

const glassSelect: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(13, 17, 23, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
}

const accentBtn: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  background: '#FF5A1F',
  border: 'none',
  color: '#000',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 12,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary, #94A3B8)',
  marginBottom: 8,
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

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
      style={{
        padding: 16,
        borderRadius: 12,
        background: selected ? 'rgba(255, 90, 31, 0.1)' : 'rgba(13, 17, 23, 0.5)',
        border: selected
          ? '1px solid rgba(255, 90, 31, 0.4)'
          : '1px solid rgba(255, 255, 255, 0.04)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 200ms',
        outline: 'none',
      }}
    >
      <div style={{ fontSize: 16, marginBottom: 8 }}>{template.icon}</div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: selected ? '#FF5A1F' : 'var(--text-primary, #F1F5F9)',
          marginBottom: 4,
        }}
      >
        {template.label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', lineHeight: 1.5 }}>
        {template.description}
      </div>
    </button>
  )
}

function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: '0.03em',
        background: STATUS_BG[status],
        color: STATUS_COLORS[status],
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
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
    <button onClick={copy} style={ghostBtn}>
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar View
// ─────────────────────────────────────────────────────────────────────────────

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          style={{ ...ghostBtn, padding: '8px 12px' }}
        >
          ← Prev
        </button>
        <span style={{ fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', fontSize: 16 }}>
          {monthLabel}
        </span>
        <button
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          style={{ ...ghostBtn, padding: '8px 12px' }}
        >
          Next →
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: 'var(--text-dim, #475569)',
              padding: '8px 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} style={{ minHeight: 80 }} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dayItems = scheduledByDate[day.toString()] || []
          const isToday = isCurrentMonth && day === todayDate

          return (
            <div
              key={day}
              style={{
                minHeight: 80,
                padding: 8,
                borderRadius: 8,
                background: isToday
                  ? 'rgba(255, 90, 31, 0.08)'
                  : 'rgba(13, 17, 23, 0.4)',
                border: isToday
                  ? '1px solid rgba(255, 90, 31, 0.25)'
                  : '1px solid rgba(255, 255, 255, 0.03)',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? '#FF5A1F' : 'var(--text-secondary, #94A3B8)',
                  marginBottom: 4,
                }}
              >
                {day}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayItems.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    title={`${TEMPLATE_LABELS[item.template_type]}: ${item.inputs.product_name}`}
                    style={{
                      fontSize: 10,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: STATUS_BG[item.status],
                      color: STATUS_COLORS[item.status],
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next: ContentStatus =
                        item.status === 'scheduled' ? 'published' : item.status === 'draft' ? 'scheduled' : 'draft'
                      onStatusChange(item.id, next)
                    }}
                  >
                    {item.inputs.product_name || TEMPLATE_LABELS[item.template_type]}
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim, #475569)' }}>
                    +{dayItems.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 16,
          justifyContent: 'flex-end',
        }}
      >
        {(['draft', 'scheduled', 'published'] as ContentStatus[]).map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: STATUS_COLORS[s],
              }}
            />
            <span style={{ color: 'var(--text-secondary, #94A3B8)', textTransform: 'capitalize' }}>
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// History list
// ─────────────────────────────────────────────────────────────────────────────

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
    <div
      style={{
        borderRadius: 12,
        background: 'rgba(13, 17, 23, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span style={{ fontSize: 16 }}>{template?.icon ?? '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary, #F1F5F9)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {TEMPLATE_LABELS[item.template_type]} — {item.inputs.product_name}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginTop: 2 }}>
            {created} · {item.inputs.tone} · {item.inputs.length}
          </div>
        </div>
        <StatusBadge status={item.status} />
        <span
          style={{
            color: 'var(--text-dim, #475569)',
            fontSize: 14,
            transition: 'transform 200ms',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        >
          ▾
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: '0 16px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.03)',
          }}
        >
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: 'rgba(0, 0, 0, 0.3)',
              fontSize: 14,
              color: 'var(--text-secondary, #94A3B8)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
          >
            {item.output}
          </pre>

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <CopyButton text={item.output} />

            {item.status !== 'published' && (
              <button
                onClick={() =>
                  onStatusChange(
                    item.id,
                    item.status === 'draft' ? 'scheduled' : 'published'
                  )
                }
                style={ghostBtn}
              >
                {item.status === 'draft' ? '📅 Schedule' : '✓ Mark Published'}
              </button>
            )}

            {item.status === 'scheduled' && (
              <button
                onClick={() => onStatusChange(item.id, 'draft')}
                style={{ ...ghostBtn, color: '#ef4444' }}
              >
                ✕ Unschedule
              </button>
            )}

            {!scheduling && item.status !== 'published' && (
              <button
                onClick={() => setScheduling(true)}
                style={{ ...ghostBtn, fontSize: 14 }}
              >
                📅 Set date
              </button>
            )}

            {scheduling && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="datetime-local"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  style={{ ...glassInput, width: 'auto', fontSize: 14, padding: '8px 12px' }}
                />
                <button
                  onClick={() => {
                    if (dateValue) {
                      onSchedule(item.id, new Date(dateValue).toISOString())
                    }
                    setScheduling(false)
                  }}
                  style={{ ...accentBtn, padding: '8px 12px', fontSize: 14 }}
                >
                  Save
                </button>
                <button
                  onClick={() => setScheduling(false)}
                  style={{ ...ghostBtn, padding: '8px 12px', fontSize: 14 }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {item.scheduled_for && (
            <div
              style={{
                marginTop: 12,
                fontSize: 14,
                color: STATUS_COLORS.scheduled,
              }}
            >
              📅 Scheduled for{' '}
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
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tab
// ─────────────────────────────────────────────────────────────────────────────

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

  const VIEW_TABS: Array<{ id: View; label: string }> = [
    { id: 'generate', label: 'Generate' },
    { id: 'history', label: 'History' },
    { id: 'calendar', label: 'Calendar' },
  ]

  return (
    <TabShell variant="fixed" padding="p-0" className="min-h-0 gap-0">
      <div style={{ height: '100%', overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--text-primary, #F1F5F9)',
                margin: 0,
                marginBottom: 8,
              }}
            >
              Creator Studio
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: 0 }}>
              Generate marketing content using AI — ad scripts, social posts, emails, and blogs.
            </p>
          </div>

          {/* View tabs */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              borderRadius: 12,
              background: 'rgba(13, 17, 23, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              width: 'fit-content',
              marginBottom: 28,
            }}
          >
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  background:
                    view === tab.id ? 'rgba(255, 90, 31, 0.15)' : 'transparent',
                  color:
                    view === tab.id
                      ? '#FF5A1F'
                      : 'var(--text-secondary, #94A3B8)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── GENERATE VIEW ─────────────────────────────────────────── */}
          {view === 'generate' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: generatedOutput ? '1fr 1fr' : '1fr',
                gap: 24,
              }}
            >
              {/* Left: form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Template selector */}
                <div style={{ ...glassCard, padding: 24 }}>
                  <div style={{ ...labelStyle, marginBottom: 16 }}>Content Type</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 12,
                    }}
                  >
                    {TEMPLATES.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        selected={selectedTemplate === t.id}
                        onClick={() => setSelectedTemplate(t.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* Generation form */}
                <div style={{ ...glassCard, padding: 24 }}>
                  <div style={{ ...labelStyle, marginBottom: 20 }}>Content Details</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={labelStyle} htmlFor="cs-product">
                        Product / Service Name
                      </label>
                      <input
                        id="cs-product"
                        type="text"
                        placeholder="e.g. BitBit AI Platform"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        style={glassInput}
                      />
                    </div>

                    <div>
                      <label style={labelStyle} htmlFor="cs-audience">
                        Target Audience
                      </label>
                      <input
                        id="cs-audience"
                        type="text"
                        placeholder="e.g. Small business owners aged 30-50"
                        value={targetAudience}
                        onChange={(e) => setTargetAudience(e.target.value)}
                        style={glassInput}
                      />
                    </div>

                    {/* Tone */}
                    <div>
                      <div style={labelStyle}>Tone</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {TONE_OPTIONS.map((t) => (
                          <button
                            key={t.value}
                            onClick={() => setTone(t.value)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 12,
                              border: tone === t.value
                                ? '1px solid rgba(255, 90, 31, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.05)',
                              background: tone === t.value
                                ? 'rgba(255, 90, 31, 0.1)'
                                : 'rgba(13, 17, 23, 0.5)',
                              color: tone === t.value
                                ? '#FF5A1F'
                                : 'var(--text-secondary, #94A3B8)',
                              fontSize: 14,
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 200ms',
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Length */}
                    <div>
                      <div style={labelStyle}>Length</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {LENGTH_OPTIONS.map((l) => (
                          <button
                            key={l.value}
                            onClick={() => setLength(l.value)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 12,
                              border: length === l.value
                                ? '1px solid rgba(255, 90, 31, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.05)',
                              background: length === l.value
                                ? 'rgba(255, 90, 31, 0.1)'
                                : 'rgba(13, 17, 23, 0.5)',
                              color: length === l.value
                                ? '#FF5A1F'
                                : 'var(--text-secondary, #94A3B8)',
                              fontSize: 14,
                              cursor: 'pointer',
                              transition: 'all 200ms',
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{l.label}</span>
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 14,
                                opacity: 0.6,
                              }}
                            >
                              {l.hint}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {generateError && (
                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          fontSize: 14,
                        }}
                      >
                        {generateError}
                      </div>
                    )}

                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      style={{
                        ...accentBtn,
                        justifyContent: 'center',
                        opacity: generating ? 0.7 : 1,
                        cursor: generating ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {generating ? (
                        <>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              border: '2px solid rgba(0,0,0,0.3)',
                              borderTopColor: '#000',
                              animation: 'spin 0.7s linear infinite',
                            }}
                          />
                          Generating…
                        </>
                      ) : (
                        <>✦ Generate Content</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: preview panel */}
              {generatedOutput && (
                <div style={{ ...glassCard, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>
                        {TEMPLATE_LABELS[generatedOutput.template_type]}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginTop: 2 }}>
                        {generatedOutput.inputs.product_name} · {generatedOutput.inputs.tone} ·{' '}
                        {generatedOutput.inputs.length}
                      </div>
                    </div>
                    <StatusBadge status={generatedOutput.status} />
                  </div>

                  <pre
                    style={{
                      flex: 1,
                      margin: 0,
                      padding: 16,
                      borderRadius: 12,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      fontSize: 14,
                      color: 'var(--text-secondary, #94A3B8)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.65,
                      fontFamily: 'inherit',
                      overflowY: 'auto',
                      maxHeight: 420,
                    }}
                  >
                    {generatedOutput.output}
                  </pre>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <CopyButton text={generatedOutput.output} />
                    <button
                      onClick={() => {
                        setView('history')
                        loadHistory()
                      }}
                      style={ghostBtn}
                    >
                      View History
                    </button>
                    {generatedOutput.status === 'draft' && (
                      <button
                        onClick={() => handleStatusChange(generatedOutput.id, 'scheduled')}
                        style={ghostBtn}
                      >
                        📅 Schedule
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setGeneratedOutput(null)
                        setProductName('')
                        setTargetAudience('')
                      }}
                      style={{ ...ghostBtn, marginLeft: 'auto' }}
                    >
                      + New
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY VIEW ──────────────────────────────────────────── */}
          {view === 'history' && (
            <div>
              {/* Filter tabs */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                <button
                  onClick={() => setHistoryFilter('all')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background:
                      historyFilter === 'all'
                        ? 'rgba(255, 90, 31, 0.15)'
                        : 'rgba(13, 17, 23, 0.5)',
                    color:
                      historyFilter === 'all'
                        ? '#FF5A1F'
                        : 'var(--text-secondary, #94A3B8)',
                  }}
                >
                  All
                </button>
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setHistoryFilter(t.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 20,
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                      background:
                        historyFilter === t.id
                          ? 'rgba(255, 90, 31, 0.15)'
                          : 'rgba(13, 17, 23, 0.5)',
                      color:
                        historyFilter === t.id
                          ? '#FF5A1F'
                          : 'var(--text-secondary, #94A3B8)',
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {historyLoading ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: 60,
                    color: 'var(--text-dim, #475569)',
                    fontSize: 14,
                  }}
                >
                  Loading history…
                </div>
              ) : filteredHistory.length === 0 ? (
                <div
                  style={{
                    ...glassCard,
                    padding: 48,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 12 }}>✦</div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: 'var(--text-primary, #F1F5F9)',
                      marginBottom: 8,
                    }}
                  >
                    No content yet
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', marginBottom: 20 }}>
                    Generate your first piece of content to see it here.
                  </div>
                  <button onClick={() => setView('generate')} style={accentBtn}>
                    Start generating
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

          {/* ── CALENDAR VIEW ─────────────────────────────────────────── */}
          {view === 'calendar' && (
            <div style={{ ...glassCard, padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-primary, #F1F5F9)',
                    marginBottom: 4,
                  }}
                >
                  Content Calendar
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
                  Scheduled and published content across the month. Click a dot to cycle its status.
                </div>
              </div>

              {historyLoading ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: 40,
                    color: 'var(--text-dim, #475569)',
                    fontSize: 14,
                  }}
                >
                  Loading…
                </div>
              ) : (
                <CalendarView
                  items={history}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spinning animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </TabShell>
  )
}
