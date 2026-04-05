'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { IconHeartHandshake, IconMail } from '@tabler/icons-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { TabSkeleton } from '@/components/dashboard/tabs/tab-skeleton'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '@/components/ui/empty'
import { useLeads } from '@/hooks/use-leads'
import { useLeadsAnalytics } from '@/hooks/use-leads-analytics'
import { useDrawer } from '@/components/dashboard/drawer-context'
import { LeadsToolbar } from './leads-toolbar'
import { LeadsKanbanView } from './leads-kanban-view'
import { LeadsListView } from './leads-list-view'
import { LeadDetailDrawer } from './lead-detail-drawer'
import { ProspectDiscoveryPanel } from './prospect-discovery-panel'
import { OutreachDashboard } from './outreach-dashboard'
import { CompletionAnimation } from '../dashboard/completion-animation'
import type { SmartView } from '@/lib/leads/types'

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
  const { setDrawer, closeDrawer: closeDrawerSlot } = useDrawer()
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

  // Push lead detail into the layout drawer
  useEffect(() => {
    if (selectedLead) {
      setDrawer(
        <LeadDetailDrawer
          lead={selectedLead}
          open={true}
          onClose={() => { setSelectedLeadId(null); closeDrawerSlot() }}
          onUpdate={updateLead}
          onAdvanceStage={handleAdvance}
        />
      )
    } else {
      closeDrawerSlot()
    }
  }, [selectedLead, setDrawer, closeDrawerSlot, setSelectedLeadId, updateLead, handleAdvance])

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
    return <TabSkeleton variant="kanban" />
  }

  if (error) {
    return (
      <Empty className="min-h-64">
        <EmptyMedia variant="icon"><IconHeartHandshake size={20} /></EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => refresh()}>Retry</Button>
        </EmptyContent>
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
            <IconHeartHandshake data-icon />
            Leads Pipeline
          </TabsTrigger>
          <TabsTrigger value="campaigns">
            <IconMail data-icon />
            Email Campaigns
          </TabsTrigger>
        </TabsList>

        {/* Leads Tab */}
        <TabsContent value="leads" className="flex flex-col gap-3">
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
                    <IconHeartHandshake data-icon />
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
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[24px] border border-border bg-card p-3 shadow-sm" role="tabpanel">
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

      <ProspectDiscoveryPanel open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
      <CompletionAnimation trigger={winTrigger} onComplete={() => setWinTrigger(false)} variant="confetti" x={winPos.x} y={winPos.y} />
    </div>
  )
}
