'use client'

import React, { useState, useCallback } from 'react'
import { IconSearch, IconTrendingUp, IconTrendingDown, IconMinus, IconCopy, IconCheck, IconPlayerPlay, IconCode, IconFileText, IconX } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POSITION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  mentioned: 'default',
  partial: 'secondary',
  absent: 'destructive',
}

const POSITION_LABELS: Record<string, string> = {
  mentioned: 'Mentioned',
  partial: 'Partial',
  absent: 'Absent',
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 60 ? 'default' : score >= 30 ? 'secondary' : 'destructive'
  return <Badge variant={variant} className="text-base tabular-nums px-3 py-1">{score}</Badge>
}

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <IconMinus className="size-4 text-muted-foreground" />
  const diff = current - previous
  if (diff > 5) return <IconTrendingUp className="size-4 text-green-600" />
  if (diff < -5) return <IconTrendingDown className="size-4 text-red-600" />
  return <IconMinus className="size-4 text-muted-foreground" />
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
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AuditForm({
  onRunAudit,
  loading,
}: {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-domain">Domain</Label>
          <Input id="audit-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com.au" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-brand">Brand Name</Label>
          <Input id="audit-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Acme Web Design" required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="audit-queries">Target Queries (one per line)</Label>
        <Textarea id="audit-queries" value={queries} onChange={(e) => setQueries(e.target.value)} placeholder={'best web design agency Brisbane\nweb development company Queensland\naffordable website design near me'} rows={4} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="audit-competitors">Competitors (one per line, optional)</Label>
        <Textarea id="audit-competitors" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder={'Competitor A\nCompetitor B'} rows={2} />
      </div>
      <Button type="submit" disabled={loading} className="gap-2 self-start">
        <IconPlayerPlay className="size-4" />
        {loading ? 'Running Audit...' : 'Run Audit'}
      </Button>
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
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead>Perplexity</TableHead>
              <TableHead>ChatGPT</TableHead>
              <TableHead>Gemini</TableHead>
              <TableHead>Copilot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(queryMap.entries()).map(([query, sources]) => (
              <TableRow key={query}>
                <TableCell className="font-medium">{query}</TableCell>
                {['perplexity', 'chatgpt-search', 'gemini', 'copilot'].map((src) => {
                  const match = sources.find((s) => s.source === src)
                  const pos = match?.position ?? 'absent'
                  return (
                    <TableCell key={src}>
                      <Badge variant={POSITION_VARIANT[pos]}>{POSITION_LABELS[pos]}</Badge>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function CompetitorTable({ scores, myScore }: { scores: Record<string, number>; myScore: number }) {
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return null

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competitor</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>vs You</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([name, score]) => {
              const diff = score - myScore
              return (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="tabular-nums">{score}</TableCell>
                  <TableCell className={`tabular-nums ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {diff > 0 ? '+' : ''}{diff}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SchemaGenerator() {
  const [schemaType, setSchemaType] = useState('LocalBusiness')
  const [result, setResult] = useState<SchemaResult | null>(null)
  const [loading, setLoading] = useState(false)

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
            address: { street: bizStreet, city: bizCity, state: bizState, postalCode: bizPostal, country: 'AU' },
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Schema Type</Label>
        <Select value={schemaType} onValueChange={(val) => { setSchemaType(val); setResult(null) }}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LocalBusiness">LocalBusiness</SelectItem>
            <SelectItem value="Service">Service</SelectItem>
            <SelectItem value="FAQ">FAQ</SelectItem>
            <SelectItem value="Organization">Organization</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { id: 'bizName', placeholder: 'Business Name', value: bizName, onChange: setBizName },
          { id: 'bizUrl', placeholder: 'Website URL', value: bizUrl, onChange: setBizUrl },
          { id: 'bizPhone', placeholder: 'Phone', value: bizPhone, onChange: setBizPhone },
          { id: 'bizStreet', placeholder: 'Street Address', value: bizStreet, onChange: setBizStreet },
          { id: 'bizCity', placeholder: 'City', value: bizCity, onChange: setBizCity },
          { id: 'bizState', placeholder: 'State', value: bizState, onChange: setBizState },
          { id: 'bizPostal', placeholder: 'Postal Code', value: bizPostal, onChange: setBizPostal },
        ].map(({ id, placeholder, value, onChange }) => (
          <Input key={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        ))}
      </div>

      <Textarea placeholder="Description" value={bizDesc} onChange={(e) => setBizDesc(e.target.value)} rows={2} />

      <Button onClick={handleGenerate} disabled={loading || !bizName} className="gap-2 self-start">
        <IconCode className="size-4" />
        {loading ? 'Generating...' : 'Generate Schema'}
      </Button>

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-medium">{result.schemaType} JSON-LD</span>
            <CopyButton text={result.htmlSnippet} />
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-4 tabular-nums text-base leading-relaxed">
            {result.htmlSnippet}
          </pre>
          {result.validationNotes.length > 0 && (
            <div className="text-base text-muted-foreground">
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
    async (params: { domain: string; brandName: string; queries: string[]; competitors: string[] }) => {
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

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Info card */}
      {!auditResult && !infoDismissed && (
        <Alert>
          <IconSearch className="size-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>Run a visibility audit to discover how the website ranks in AI search engines like Perplexity, ChatGPT, and Gemini.</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => { setInfoDismissed(true); localStorage.setItem('bb-ai-search-info-dismissed', '1') }}
              aria-label="Dismiss"
            >
              <IconX className="size-3.5" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Score overview */}
      {auditResult && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Visibility Score</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <ScoreBadge score={auditResult.overallScore} />
              <TrendArrow current={auditResult.overallScore} previous={previousScore} />
              <span className="text-base text-muted-foreground">/100</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Queries Tracked</CardDescription></CardHeader>
            <CardContent>
              <span className="tabular-nums text-lg font-medium">{new Set(auditResult.queryResults.map((r) => r.query)).size}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Mentioned</CardDescription></CardHeader>
            <CardContent>
              <span className="tabular-nums text-lg font-medium text-green-600">
                {auditResult.queryResults.filter((r) => r.position === 'mentioned').length}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Absent</CardDescription></CardHeader>
            <CardContent>
              <span className="tabular-nums text-lg font-medium text-red-600">
                {auditResult.queryResults.filter((r) => r.position === 'absent').length}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Panel tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><IconSearch className="size-4" /> Visibility Audit</TabsTrigger>
          <TabsTrigger value="content"><IconFileText className="size-4" /> Content Suggestions</TabsTrigger>
          <TabsTrigger value="schema"><IconCode className="size-4" /> Schema Markup</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
          <Card>
            <CardHeader><CardTitle>Run Visibility Audit</CardTitle></CardHeader>
            <CardContent>
              <AuditForm onRunAudit={handleRunAudit} loading={loading} />
            </CardContent>
          </Card>

          {auditResult && (
            <>
              <div>
                <h3 className="mb-3 text-base font-medium">Query Breakdown</h3>
                <QueryBreakdown results={auditResult.queryResults} />
              </div>

              {Object.keys(auditResult.competitorScores).length > 0 && (
                <div>
                  <h3 className="mb-3 text-base font-medium">Competitor Comparison</h3>
                  <CompetitorTable scores={auditResult.competitorScores} myScore={auditResult.overallScore} />
                </div>
              )}

              <div>
                <h3 className="mb-3 text-base font-medium">Recommendations</h3>
                <div className="flex flex-col gap-2">
                  {auditResult.recommendations.map((rec, i) => (
                    <Card key={i} className="border-l-4 border-l-primary py-3">
                      <CardContent className="py-0">
                        <span className="text-base text-muted-foreground leading-relaxed">{rec}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="content" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>AI-Optimized Content Suggestions</CardTitle>
              <CardDescription>
                Run a visibility audit first to generate targeted content recommendations. The content
                generator creates FAQ-structured, entity-rich pages optimized for AI search engines to cite the business.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditResult ? (
                <div className="flex flex-col gap-3">
                  <p className="text-base text-muted-foreground">Based on the audit, focus content on these absent/partial queries:</p>
                  {auditResult.queryResults
                    .filter((r) => r.position !== 'mentioned')
                    .reduce<string[]>((acc, r) => { if (!acc.includes(r.query)) acc.push(r.query); return acc }, [])
                    .slice(0, 5)
                    .map((query) => (
                      <div key={query} className="rounded-lg border bg-muted p-3 text-base text-muted-foreground transition-colors hover:bg-muted">
                        Create a dedicated FAQ page for: <strong>&quot;{query}&quot;</strong>
                      </div>
                    ))}
                </div>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No content suggestions yet</EmptyTitle>
                    <EmptyDescription>Run a visibility audit to generate targeted content recommendations.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schema" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Schema Markup Generator</CardTitle>
              <CardDescription>
                Generate JSON-LD structured data for client websites. Copy and paste the output into the page &lt;head&gt;.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SchemaGenerator />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default React.memo(AISearchTab)
