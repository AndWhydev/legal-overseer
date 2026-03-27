'use client'

import React, { useState, useCallback } from 'react'
import { Search, TrendingUp, TrendingDown, Minus, Copy, Check, Play, Code, FileText, X } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'
import { TabShell } from '@/components/ui/tab-shell'
import { GlassToggle } from '@/components/ui/glass-toggle'
import { EmptyState } from '@/components/ui/empty-state'

// ---------------------------------------------------------------------------
// Types (mirrors agent types without importing server code)
// ---------------------------------------------------------------------------

interface QueryResult {
  query: string
  source: string
  score: number
  position: 'mentioned' | 'partial' | 'absent'
}

interface AuditResult {
  id: string
  overallScore: number
  queryResults: QueryResult[]
  competitorScores: Record<string, number>
  recommendations: string[]
  auditedAt: string
}

interface SchemaResult {
  schemaType: string
  htmlSnippet: string
  validationNotes: string[]
}

type ActivePanel = 'overview' | 'content' | 'schema'

// ---------------------------------------------------------------------------
// Style Tokens
// ---------------------------------------------------------------------------

const glassInput: React.CSSProperties = {
  ...S.input,
  padding: '12px 16px',
  borderRadius: 12,
}

const accentBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonPrimary,
}

const smallText: React.CSSProperties = {
  ...S.sectionLabel,
  marginBottom: 0,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POSITION_COLORS: Record<string, string> = {
  mentioned: '#22c55e',
  partial: '#eab308',
  absent: '#ef4444',
}

const POSITION_LABELS: Record<string, string> = {
  mentioned: 'Mentioned',
  partial: 'Partial',
  absent: 'Absent',
}

function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = () => {
    if (score >= 60) return '#22c55e'
    if (score >= 30) return '#eab308'
    return '#ef4444'
  }

  const color = getScoreColor()
  const bgColor = color === '#22c55e' ? C.statusSuccessBg :
                  color === '#eab308' ? C.statusWarningBg :
                  C.statusErrorBg

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 48,
        padding: '4px 12px',
        borderRadius: 8,
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 16,
        fontWeight: 500,
        color,
        background: bgColor,
      }}
    >
      {score}
    </span>
  )
}

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <Minus size={16} style={{ color: C.textMuted }} />
  const diff = current - previous
  if (diff > 5) return <TrendingUp size={16} style={{ color: '#22c55e' }} />
  if (diff < -5) return <TrendingDown size={16} style={{ color: '#ef4444' }} />
  return <Minus size={16} style={{ color: C.textMuted }} />
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      style={{
        ...S.button,
        ...S.buttonGhost,
        height: 'auto',
        padding: '8px 12px',
        color: copied ? C.statusSuccess : C.textSecondary,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = C.bgHover
        e.currentTarget.style.borderColor = C.borderHover
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = C.borderVisible
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AuditForm({
  onRunAudit,
  loading,
}: {
  onRunAudit: (params: {
    domain: string
    brandName: string
    queries: string[]
    competitors: string[]
  }) => void
  loading: boolean
}) {
  const [domain, setDomain] = useState('')
  const [brandName, setBrandName] = useState('')
  const [queries, setQueries] = useState('')
  const [competitors, setCompetitors] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onRunAudit({
      domain,
      brandName,
      queries: queries.split('\n').map((q) => q.trim()).filter(Boolean),
      competitors: competitors.split('\n').map((c) => c.trim()).filter(Boolean),
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={smallText}>Domain</span>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onFocus={() => setFocusedField('domain')}
            onBlur={() => setFocusedField(null)}
            placeholder="example.com.au"
            required
            style={{
              ...glassInput,
              borderColor:
                focusedField === 'domain'
                  ? C.borderFocus
                  : C.borderSubtle,
              boxShadow:
                focusedField === 'domain'
                  ? `0 0 0 2px ${C.bgHoverStrong}`
                  : 'none',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={smallText}>Brand Name</span>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            onFocus={() => setFocusedField('brand')}
            onBlur={() => setFocusedField(null)}
            placeholder="Acme Web Design"
            required
            style={{
              ...glassInput,
              borderColor:
                focusedField === 'brand'
                  ? C.borderFocus
                  : C.borderSubtle,
              boxShadow:
                focusedField === 'brand'
                  ? `0 0 0 2px ${C.bgHoverStrong}`
                  : 'none',
            }}
          />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={smallText}>Target Queries (one per line)</span>
        <textarea
          value={queries}
          onChange={(e) => setQueries(e.target.value)}
          onFocus={() => setFocusedField('queries')}
          onBlur={() => setFocusedField(null)}
          placeholder={'best web design agency Brisbane\nweb development company Queensland\naffordable website design near me'}
          rows={4}
          required
          style={{
            ...glassInput,
            resize: 'vertical',
            borderColor:
              focusedField === 'queries'
                ? C.borderFocus
                : C.borderSubtle,
            boxShadow:
              focusedField === 'queries'
                ? `0 0 0 2px ${C.bgHoverStrong}`
                : 'none',
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={smallText}>Competitors (one per line, optional)</span>
        <textarea
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
          onFocus={() => setFocusedField('competitors')}
          onBlur={() => setFocusedField(null)}
          placeholder={'Competitor A\nCompetitor B'}
          rows={2}
          style={{
            ...glassInput,
            resize: 'vertical',
            borderColor:
              focusedField === 'competitors'
                ? C.borderFocus
                : C.borderSubtle,
            boxShadow:
              focusedField === 'competitors'
                ? `0 0 0 2px ${C.bgHoverStrong}`
                : 'none',
          }}
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        style={{
          ...accentBtn,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <Play size={16} />
        {loading ? 'Running Audit...' : 'Run Audit'}
      </button>
    </form>
  )
}

function QueryBreakdown({ results }: { results: QueryResult[] }) {
  const queryMap = new Map<string, QueryResult[]>()
  for (const r of results) {
    if (!queryMap.has(r.query)) queryMap.set(r.query, [])
    queryMap.get(r.query)!.push(r)
  }

  return (
    <div
      style={{
        ...S.card,
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr repeat(4, 1fr)',
          padding: '12px 16px',
          fontSize: 14,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          borderBottom: '1px solid var(--glass-interactive-border)',
          fontWeight: 500,
        }}
      >
        <span>Query</span>
        <span>Perplexity</span>
        <span>ChatGPT</span>
        <span>Gemini</span>
        <span>Copilot</span>
      </div>
      {Array.from(queryMap.entries()).map(([query, sources]) => (
        <div
          key={query}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr repeat(4, 1fr)',
            padding: '12px 16px',
            alignItems: 'center',
            borderBottom: '1px solid var(--glass-divider)',
            transition: 'background 200ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.bgHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{query}</span>
          {['perplexity', 'chatgpt-search', 'gemini', 'copilot'].map((src) => {
            const match = sources.find((s) => s.source === src)
            const pos = match?.position ?? 'absent'
            return (
              <span
                key={src}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: POSITION_COLORS[pos],
                }}
              >
                {POSITION_LABELS[pos]}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function CompetitorTable({
  scores,
  myScore,
}: {
  scores: Record<string, number>
  myScore: number
}) {
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return null

  return (
    <div
      style={{
        ...S.card,
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          padding: '12px 16px',
          fontSize: 14,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          borderBottom: '1px solid var(--glass-interactive-border)',
          fontWeight: 500,
        }}
      >
        <span>Competitor</span>
        <span>Score</span>
        <span>vs You</span>
      </div>
      {entries.map(([name, score]) => {
        const diff = score - myScore
        return (
          <div
            key={name}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              padding: '12px 16px',
              alignItems: 'center',
              borderBottom: '1px solid var(--glass-divider)',
              transition: 'background 200ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C.bgHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{name}</span>
            <span
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                color: 'var(--text-secondary)',
                fontSize: 14,
              }}
            >
              {score}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                color: diff > 0 ? '#ef4444' : diff < 0 ? '#22c55e' : C.textPlaceholder,
                fontSize: 14,
              }}
            >
              {diff > 0 ? '+' : ''}{diff}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SchemaGenerator() {
  const [schemaType, setSchemaType] = useState('LocalBusiness')
  const [result, setResult] = useState<SchemaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const [bizName, setBizName] = useState('')
  const [bizDesc, setBizDesc] = useState('')
  const [bizUrl, setBizUrl] = useState('')
  const [bizPhone, setBizPhone] = useState('')
  const [bizStreet, setBizStreet] = useState('')
  const [bizCity, setBizCity] = useState('')
  const [bizState, setBizState] = useState('')
  const [bizPostal, setBizPostal] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agent/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schema',
          schemaType,
          data: {
            name: bizName,
            description: bizDesc,
            url: bizUrl,
            phone: bizPhone,
            address: {
              street: bizStreet,
              city: bizCity,
              state: bizState,
              postalCode: bizPostal,
              country: 'AU',
            },
          },
        }),
      })
      const data = await res.json()
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  const schemaToggleOptions = [
    { key: 'LocalBusiness', label: 'LocalBusiness' },
    { key: 'Service', label: 'Service' },
    { key: 'FAQ', label: 'FAQ' },
    { key: 'Organization', label: 'Organization' },
  ]

  const handleSchemaTypeChange = (val: string) => {
    setSchemaType(val)
    setResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GlassToggle
        options={schemaToggleOptions}
        value={schemaType}
        onChange={handleSchemaTypeChange}
        size="sm"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { key: 'bizName', placeholder: 'Business Name', value: bizName, onChange: setBizName },
          { key: 'bizUrl', placeholder: 'Website URL', value: bizUrl, onChange: setBizUrl },
          { key: 'bizPhone', placeholder: 'Phone', value: bizPhone, onChange: setBizPhone },
          {
            key: 'bizStreet',
            placeholder: 'Street Address',
            value: bizStreet,
            onChange: setBizStreet,
          },
          { key: 'bizCity', placeholder: 'City', value: bizCity, onChange: setBizCity },
          { key: 'bizState', placeholder: 'State', value: bizState, onChange: setBizState },
          { key: 'bizPostal', placeholder: 'Postal Code', value: bizPostal, onChange: setBizPostal },
        ].map(({ key, placeholder, value, onChange }) => (
          <input
            key={key}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocusedField(key)}
            onBlur={() => setFocusedField(null)}
            style={{
              ...glassInput,
              borderColor:
                focusedField === key
                  ? C.borderFocus
                  : C.borderSubtle,
              boxShadow:
                focusedField === key
                  ? `0 0 0 2px ${C.bgHoverStrong}`
                  : 'none',
            }}
          />
        ))}
      </div>

      <textarea
        placeholder="Description"
        value={bizDesc}
        onChange={(e) => setBizDesc(e.target.value)}
        onFocus={() => setFocusedField('desc')}
        onBlur={() => setFocusedField(null)}
        rows={2}
        style={{
          ...glassInput,
          resize: 'vertical',
          borderColor:
            focusedField === 'desc'
              ? C.borderFocus
              : C.borderSubtle,
          boxShadow:
            focusedField === 'desc'
              ? `0 0 0 2px ${C.bgHoverStrong}`
              : 'none',
        }}
      />

      <button
        onClick={handleGenerate}
        disabled={loading || !bizName}
        style={{
          ...accentBtn,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          opacity: loading || !bizName ? 0.6 : 1,
          cursor: loading || !bizName ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!loading && bizName) {
            e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <Code size={16} />
        {loading ? 'Generating...' : 'Generate Schema'}
      </button>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              {result.schemaType} JSON-LD
            </span>
            <CopyButton text={result.htmlSnippet} />
          </div>
          <pre
            style={{
              ...S.card,
              color: 'rgba(165, 243, 252, 0.9)',
              fontSize: 14,
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              overflow: 'auto',
              maxHeight: 400,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {result.htmlSnippet}
          </pre>
          {result.validationNotes.length > 0 && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {result.validationNotes.map((note, i) => (
                <div key={i}>- {note}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Tab
// ---------------------------------------------------------------------------

function AISearchTab() {
  const [activePanel, setActivePanel] = useState<ActivePanel>('overview')
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [previousScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [infoDismissed, setInfoDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bb-ai-search-info-dismissed') === '1'
    }
    return false
  })

  const handleRunAudit = useCallback(
    async (params: {
      domain: string
      brandName: string
      queries: string[]
      competitors: string[]
    }) => {
      setLoading(true)
      try {
        const res = await fetch('/api/agent/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'audit', ...params }),
        })
        const data = await res.json()
        setAuditResult(data)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const panelOptions = [
    { key: 'overview' as const, label: 'Visibility Audit', icon: <Search size={16} /> },
    { key: 'content' as const, label: 'Content Suggestions', icon: <FileText size={16} /> },
    { key: 'schema' as const, label: 'Schema Markup', icon: <Code size={16} /> },
  ]

  return (
    <TabShell>
      <div style={{ padding: 24, maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Instructional info card when no audit has run yet */}
        {!auditResult && activePanel === 'overview' && !infoDismissed && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderRadius: 16,
            background: C.bgCardLight,
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            border: 'none',
            boxShadow: 'var(--card-shadow), var(--card-inset)',
            animation: 'bb-fade-up 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, flex: 1 }}>
              Run a visibility audit to discover how the website ranks in AI search engines like Perplexity, ChatGPT, and Gemini.
            </p>
            <button
              onClick={() => {
                setInfoDismissed(true)
                localStorage.setItem('bb-ai-search-info-dismissed', '1')
              }}
              aria-label="Dismiss"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Score overview (shown when audit exists) */}
        {auditResult && (
          <div
            className="bb-stagger"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {/* Overall Score Card */}
            <div style={{ ...S.card, position: 'relative' }}>
              <div style={smallText}>Visibility Score</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <ScoreBadge score={auditResult.overallScore} />
                <TrendArrow current={auditResult.overallScore} previous={previousScore} />
                <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>/100</span>
              </div>
            </div>

            {/* Queries Tracked Card */}
            <div style={{ ...S.card, position: 'relative' }}>
              <div style={smallText}>Queries Tracked</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  marginTop: 8,
                }}
              >
                {new Set(auditResult.queryResults.map((r) => r.query)).size}
              </div>
            </div>

            {/* Mentioned Card */}
            <div style={{ ...S.card, position: 'relative' }}>
              <div style={smallText}>Mentioned</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#22c55e',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  marginTop: 8,
                }}
              >
                {auditResult.queryResults.filter((r) => r.position === 'mentioned').length}
              </div>
            </div>

            {/* Absent Card */}
            <div style={{ ...S.card, position: 'relative' }}>
              <div style={smallText}>Absent</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#ef4444',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  marginTop: 8,
                }}
              >
                {auditResult.queryResults.filter((r) => r.position === 'absent').length}
              </div>
            </div>
          </div>
        )}

        {/* Panel selector */}
        <GlassToggle
          options={panelOptions}
          value={activePanel}
          onChange={setActivePanel}
        />

        {/* Panels */}
        {activePanel === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Audit Form Card */}
            <div style={S.card}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  marginTop: 0,
                  marginBottom: 16,
                }}
              >
                Run Visibility Audit
              </h3>
              <AuditForm onRunAudit={handleRunAudit} loading={loading} />
            </div>

            {auditResult && (
              <>
                {/* Query Breakdown */}
                <div>
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginBottom: 12,
                      marginTop: 0,
                    }}
                  >
                    Query Breakdown
                  </h3>
                  <QueryBreakdown results={auditResult.queryResults} />
                </div>

                {/* Competitor Comparison */}
                {Object.keys(auditResult.competitorScores).length > 0 && (
                  <div>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        marginBottom: 12,
                        marginTop: 0,
                      }}
                    >
                      Competitor Comparison
                    </h3>
                    <CompetitorTable
                      scores={auditResult.competitorScores}
                      myScore={auditResult.overallScore}
                    />
                  </div>
                )}

                {/* Recommendations */}
                <div>
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginBottom: 12,
                      marginTop: 0,
                    }}
                  >
                    Recommendations
                  </h3>
                  <div className="bb-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {auditResult.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          ...S.card,
                          borderLeft: `3px solid ${C.borderVisible}`,
                          padding: '12px 16px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderLeftColor = '#F1F5F9'
                          e.currentTarget.style.background = 'var(--glass-bg-heavy)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderLeftColor = C.borderVisible
                          e.currentTarget.style.background = 'var(--glass-card-bg)'
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            color: 'var(--text-secondary)',
                            lineHeight: 1.6,
                          }}
                        >
                          {rec}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activePanel === 'content' && (
          <div style={S.card}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginTop: 0,
                marginBottom: 12,
              }}
            >
              AI-Optimized Content Suggestions
            </h3>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                marginBottom: 16,
                lineHeight: 1.6,
              }}
            >
              Run a visibility audit first to generate targeted content recommendations. The content
              generator creates FAQ-structured, entity-rich pages optimized for AI search engines
              to cite the business.
            </p>
            {auditResult ? (
              <div className="bb-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Based on the audit, focus content on these absent/partial queries:
                </p>
                {auditResult.queryResults
                  .filter((r) => r.position !== 'mentioned')
                  .reduce<string[]>((acc, r) => {
                    if (!acc.includes(r.query)) acc.push(r.query)
                    return acc
                  }, [])
                  .slice(0, 5)
                  .map((query) => (
                    <div
                      key={query}
                      style={S.listRow}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bb-surface-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--glass-pill-bg)'
                      }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        Create a dedicated FAQ page for: <strong>&quot;{query}&quot;</strong>
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                title="No content suggestions yet"
                description="Run a visibility audit to generate targeted content recommendations."
              />
            )}
          </div>
        )}

        {activePanel === 'schema' && (
          <div style={S.card}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginTop: 0,
                marginBottom: 12,
              }}
            >
              Schema Markup Generator
            </h3>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                marginBottom: 16,
                lineHeight: 1.6,
              }}
            >
              Generate JSON-LD structured data for client websites. Copy and paste the output
              into the page &lt;head&gt;.
            </p>
            <SchemaGenerator />
          </div>
        )}
      </div>
    </TabShell>
  )
}

export default React.memo(AISearchTab)
