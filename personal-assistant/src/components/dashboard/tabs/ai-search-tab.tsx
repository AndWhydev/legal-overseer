'use client'

import React, { useState, useCallback } from 'react'
import { Search, TrendingUp, TrendingDown, Minus, Copy, Check, Play, Code, FileText } from 'lucide-react'

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
  const color = score >= 60 ? '#22c55e' : score >= 30 ? '#eab308' : '#ef4444'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 48,
        padding: '4px 12px',
        borderRadius: 8,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 18,
        fontWeight: 700,
        color,
        background: `${color}15`,
      }}
    >
      {score}
    </span>
  )
}

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <Minus size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
  const diff = current - previous
  if (diff > 5) return <TrendingUp size={16} style={{ color: '#22c55e' }} />
  if (diff < -5) return <TrendingDown size={16} style={{ color: '#ef4444' }} />
  return <Minus size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.05)',
        color: copied ? '#22c55e' : 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        fontSize: 12,
        transition: 'all 0.15s',
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

function AuditForm({ onRunAudit, loading }: {
  onRunAudit: (params: { domain: string; brandName: string; queries: string[]; competitors: string[] }) => void
  loading: boolean
}) {
  const [domain, setDomain] = useState('')
  const [brandName, setBrandName] = useState('')
  const [queries, setQueries] = useState('')
  const [competitors, setCompetitors] = useState('')

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
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Domain</span>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com.au"
            required
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Brand Name</span>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Acme Web Design"
            required
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Target Queries (one per line)</span>
        <textarea
          value={queries}
          onChange={(e) => setQueries(e.target.value)}
          placeholder={'best web design agency Brisbane\nweb development company Queensland\naffordable website design near me'}
          rows={4}
          required
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Competitors (one per line, optional)</span>
        <textarea
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
          placeholder={'Competitor A\nCompetitor B'}
          rows={2}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 20px',
          borderRadius: 8,
          border: 'none',
          background: loading ? 'rgba(255,255,255,0.1)' : 'var(--bb-orange, #f97316)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          alignSelf: 'flex-start',
        }}
      >
        <Play size={16} />
        {loading ? 'Running Audit...' : 'Run Audit'}
      </button>
    </form>
  )
}

function QueryBreakdown({ results }: { results: QueryResult[] }) {
  // Group by query
  const queryMap = new Map<string, QueryResult[]>()
  for (const r of results) {
    if (!queryMap.has(r.query)) queryMap.set(r.query, [])
    queryMap.get(r.query)!.push(r)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr repeat(4, 1fr)',
        padding: '10px 16px',
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
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
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{query}</span>
          {['perplexity', 'chatgpt-search', 'gemini', 'copilot'].map((src) => {
            const match = sources.find((s) => s.source === src)
            const pos = match?.position ?? 'absent'
            return (
              <span
                key={src}
                style={{
                  fontSize: 12,
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

function CompetitorTable({ scores, myScore }: { scores: Record<string, number>; myScore: number }) {
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr',
        padding: '10px 16px',
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
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
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{name}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.7)' }}>{score}</span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              color: diff > 0 ? '#ef4444' : diff < 0 ? '#22c55e' : 'rgba(255,255,255,0.5)',
            }}>
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

  // Simple form fields based on schema type
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['LocalBusiness', 'Service', 'FAQ', 'Organization'].map((t) => (
          <button
            key={t}
            onClick={() => { setSchemaType(t); setResult(null) }}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              background: schemaType === t ? 'var(--bb-orange, #f97316)' : 'rgba(255,255,255,0.05)',
              color: schemaType === t ? '#fff' : 'rgba(255,255,255,0.7)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <input placeholder="Business Name" value={bizName} onChange={(e) => setBizName(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
        <input placeholder="Website URL" value={bizUrl} onChange={(e) => setBizUrl(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
        <input placeholder="Phone" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
        <input placeholder="Street Address" value={bizStreet} onChange={(e) => setBizStreet(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
        <input placeholder="City" value={bizCity} onChange={(e) => setBizCity(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
        <input placeholder="State" value={bizState} onChange={(e) => setBizState(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
        <input placeholder="Postal Code" value={bizPostal} onChange={(e) => setBizPostal(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none' }} />
      </div>

      <textarea placeholder="Description" value={bizDesc} onChange={(e) => setBizDesc(e.target.value)} rows={2}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />

      <button onClick={handleGenerate} disabled={loading || !bizName}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8,
          border: 'none', background: loading ? 'rgba(255,255,255,0.1)' : 'var(--bb-orange, #f97316)',
          color: '#fff', fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        <Code size={16} />
        {loading ? 'Generating...' : 'Generate Schema'}
      </button>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
              {result.schemaType} JSON-LD
            </span>
            <CopyButton text={result.htmlSnippet} />
          </div>
          <pre style={{
            padding: 16,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.3)',
            color: '#a5f3fc',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            overflow: 'auto',
            maxHeight: 400,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {result.htmlSnippet}
          </pre>
          {result.validationNotes.length > 0 && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
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

  const handleRunAudit = useCallback(async (params: {
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
  }, [])

  const panelButtons: Array<{ id: ActivePanel; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Visibility Audit', icon: <Search size={16} /> },
    { id: 'content', label: 'Content Suggestions', icon: <FileText size={16} /> },
    { id: 'schema', label: 'Schema Markup', icon: <Code size={16} /> },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'rgba(249, 115, 22, 0.15)',
          color: '#f97316',
        }}>
          <Search size={20} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
            AI Search Optimizer
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            Monitor and improve your visibility across AI search engines
          </p>
        </div>
      </div>

      {/* Score overview (shown when audit exists) */}
      {auditResult && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
        }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Visibility Score
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ScoreBadge score={auditResult.overallScore} />
              <TrendArrow current={auditResult.overallScore} previous={previousScore} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>/100</span>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Queries Tracked
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6', fontFamily: 'JetBrains Mono, monospace' }}>
              {new Set(auditResult.queryResults.map((r) => r.query)).size}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Mentioned
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>
              {auditResult.queryResults.filter((r) => r.position === 'mentioned').length}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Absent
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>
              {auditResult.queryResults.filter((r) => r.position === 'absent').length}
            </div>
          </div>
        </div>
      )}

      {/* Panel selector */}
      <div style={{ display: 'flex', gap: 8 }}>
        {panelButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setActivePanel(btn.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: activePanel === btn.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: activePanel === btn.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {btn.icon}
            {btn.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      {activePanel === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 12,
            padding: 20,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 0, marginBottom: 16 }}>
              Run Visibility Audit
            </h3>
            <AuditForm onRunAudit={handleRunAudit} loading={loading} />
          </div>

          {auditResult && (
            <>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>
                  Query Breakdown
                </h3>
                <QueryBreakdown results={auditResult.queryResults} />
              </div>

              {Object.keys(auditResult.competitorScores).length > 0 && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>
                    Competitor Comparison
                  </h3>
                  <CompetitorTable scores={auditResult.competitorScores} myScore={auditResult.overallScore} />
                </div>
              )}

              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>
                  Recommendations
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auditResult.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.7)',
                        lineHeight: 1.5,
                        borderLeft: '3px solid var(--bb-orange, #f97316)',
                      }}
                    >
                      {rec}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activePanel === 'content' && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          padding: 20,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 0, marginBottom: 12 }}>
            AI-Optimized Content Suggestions
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
            Run a visibility audit first to generate targeted content recommendations. The content generator creates FAQ-structured,
            entity-rich pages optimized for AI search engines to cite your business.
          </p>
          {auditResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                Based on your audit, focus content on these absent/partial queries:
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
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.05)',
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.8)',
                    }}
                  >
                    Create a dedicated FAQ page for: <strong>&quot;{query}&quot;</strong>
                  </div>
                ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              Run an audit to see content suggestions.
            </p>
          )}
        </div>
      )}

      {activePanel === 'schema' && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          padding: 20,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 0, marginBottom: 12 }}>
            Schema Markup Generator
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
            Generate JSON-LD structured data for your client websites. Copy and paste the output into the page &lt;head&gt;.
          </p>
          <SchemaGenerator />
        </div>
      )}
    </div>
  )
}

export default React.memo(AISearchTab)
