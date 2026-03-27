'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { IconHandshake, IconMail } from '@tabler/icons-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from '@/components/ui/empty'
import { useLeads } from '@/hooks/use-leads'
import { useLeadsAnalytics } from '@/hooks/use-leads-analytics'
import { LeadsToolbar } from './leads-toolbar'
import { LeadsKanbanView } from './leads-kanban-view'
import { LeadsListView } from './leads-list-view'
import { LeadDetailDrawer } from './lead-detail-drawer'
import { ProspectDiscoveryPanel } from './prospect-discovery-panel'
import { OutreachDashboard } from './outreach-dashboard'
import { CompletionAnimation } from '../dashboard/completion-animation'
import type { SmartView } from '@/lib/leads/types'
import { cn } from '@/lib/utils'

const SMART_VIEWS: Array<{ key: SmartView; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'hot_followup', label: 'Needs Action' },
  { key: 'stale', label: 'Stale' },
  { key: 'high_value', label: 'High Value' },
]

const EMPTY_MSG: Partial<Record<SmartView, { title: string; desc: string }>> = {
  all: { title: 'Your pipeline is empty', desc: 'Discover prospects or connect your channels to get started.' },
  stale: { title: 'All caught up', desc: 'No stale leads right now.' },
  hot_followup: { title: 'Nothing urgent', desc: 'No hot leads need follow-up right now.' },
  high_value: { title: 'No high-value leads', desc: 'Leads worth $10K+ will appear here.' },
}

export function LeadsPage() {
  const {
    leads, allLeads, grouped, isLoading, error,
    selectedLead, setSelectedLeadId,
    viewMode, setViewMode,
    filters, setFilters,
    moveLead, advanceLead, updateLead,
    movingLeadId, searchQuery, setSearchQuery,
    refresh,
  } = useLeads()

  const { analytics } = useLeadsAnalytics()
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'leads' | 'campaigns'>('leads')
  const [winTrigger, setWinTrigger] = useState(false)
  const [winPos, setWinPos] = useState({ x: 0, y: 0 })
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const activeView = filters.smartView ?? 'all'

  const counts = useMemo(() => {
    const oneDayAgo = Date.now() - 86_400_000
    const sevenDaysAgo = Date.now() - 7 * 86_400_000
    const active = allLeads.filter(l => l.status !== 'converted' && l.status !== 'lost')
    return {
      all: allLeads.length,
      hot_followup: active.filter(l => l.score === 'hot' && l.last_activity_at && new Date(l.last_activity_at).getTime() < oneDayAgo).length,
      stale: active.filter(l => l.last_activity_at && new Date(l.last_activity_at).getTime() < sevenDaysAgo).length,
      high_value: active.filter(l => (l.estimated_value ?? 0) > 10000).length,
    } as Record<SmartView, number>
  }, [allLeads])

  const handleAdvance = useCallback(async (leadId: string, event?: React.MouseEvent) => {
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
    const nextMap: Record<string, string> = { new: 'qualified', qualified: 'booked', booked: 'converted' }
    if (nextMap[lead.status] === 'converted' && event) {
      setWinPos({ x: event.clientX, y: event.clientY })
    }
    await advanceLead(leadId)
    if (nextMap[lead.status] === 'converted') setWinTrigger(true)
  }, [leads, advanceLead])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchInputRef.current?.focus(); return }
      if (e.key === 'Escape') { setSelectedLeadId(null); return }
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < SMART_VIEWS.length && !e.metaKey && !e.ctrlKey) {
        setFilters(f => ({ ...f, smartView: SMART_VIEWS[idx].key }))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setSelectedLeadId, setFilters])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-9 rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => refresh()}>Retry</Button>
      </Empty>
    )
  }

  const empty = leads.length === 0
  const msg = EMPTY_MSG[activeView] ?? EMPTY_MSG.all!

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'leads' | 'campaigns')}>
        <TabsList>
          <TabsTrigger value="leads">
            <IconHandshake data-icon />
            Leads Pipeline
          </TabsTrigger>
          <TabsTrigger value="campaigns">
            <IconMail data-icon />
            Email Campaigns
          </TabsTrigger>
        </TabsList>

        {/* Leads Tab */}
        <TabsContent value="leads" className="flex flex-col gap-3">
          {/* Smart View Pills */}
          <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Lead views">
            {SMART_VIEWS.map((sv) => {
              const isActive = activeView === sv.key
              const count = (counts as Record<string, number>)[sv.key]
              return (
                <Button
                  key={sv.key}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${sv.label}${count > 0 ? `, ${count} leads` : ''}`}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setFilters(f => ({ ...f, smartView: sv.key }))}
                  className="rounded-full"
                >
                  {sv.label}
                  {count > 0 && (
                    <Badge variant="secondary" className="ml-1 font-mono">
                      {count}
                    </Badge>
                  )}
                </Button>
              )
            })}
          </nav>

          <LeadsToolbar
            filters={filters} onFiltersChange={setFilters}
            viewMode={viewMode} onViewModeChange={setViewMode}
            onDiscoverClick={() => setDiscoveryOpen(true)}
            searchQuery={searchQuery} onSearchChange={setSearchQuery}
            analytics={analytics} searchInputRef={searchInputRef}
          />

          {empty ? (
            activeView !== 'all' ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {msg.desc}
              </div>
            ) : (
              <Empty className="flex-1">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconHandshake data-icon />
                  </EmptyMedia>
                  <EmptyTitle>{msg.title}</EmptyTitle>
                  <EmptyDescription>{msg.desc}</EmptyDescription>
                </EmptyHeader>
                <Button onClick={() => setDiscoveryOpen(true)}>
                  Discover Prospects
                </Button>
              </Empty>
            )
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
              {viewMode === 'kanban' ? (
                <LeadsKanbanView
                  grouped={grouped} onMoveLead={moveLead}
                  onSelectLead={(lead) => setSelectedLeadId(lead.id)}
                  onAdvanceStage={handleAdvance} movingLeadId={movingLeadId}
                />
              ) : (
                <LeadsListView
                  leads={leads}
                  onSelectLead={(lead) => setSelectedLeadId(lead.id)}
                  onAdvanceStage={handleAdvance}
                />
              )}
            </div>
          )}
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns">
          <OutreachDashboard leads={leads} />
        </TabsContent>
      </Tabs>

      <LeadDetailDrawer
        lead={selectedLead} open={!!selectedLead}
        onClose={() => setSelectedLeadId(null)}
        onUpdate={updateLead} onAdvanceStage={handleAdvance}
      />
      <ProspectDiscoveryPanel open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
      <CompletionAnimation trigger={winTrigger} onComplete={() => setWinTrigger(false)} variant="confetti" x={winPos.x} y={winPos.y} />
    </div>
  )
}
