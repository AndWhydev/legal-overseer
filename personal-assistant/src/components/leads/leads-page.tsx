'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Handshake } from 'lucide-react'
import { useLeads } from '@/hooks/use-leads'
import { useLeadsAnalytics } from '@/hooks/use-leads-analytics'
import { LeadsToolbar } from './leads-toolbar'
import { LeadsKanbanView } from './leads-kanban-view'
import { LeadsListView } from './leads-list-view'
import { LeadDetailDrawer } from './lead-detail-drawer'
import { ProspectDiscoveryPanel } from './prospect-discovery-panel'
import { CompletionAnimation } from '../dashboard/completion-animation'
import { EmptyState } from '@/components/ui/empty-state'
import type { SmartView } from '@/lib/leads/types'

const SMART_VIEWS: Array<{ key: SmartView; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'hot_followup', label: 'Needs Action' },
  { key: 'stale', label: 'Stale' },
  { key: 'high_value', label: 'High Value' },
  { key: 'pcc_discoveries', label: 'PCC' },
]

const EMPTY_MSG: Partial<Record<SmartView, { title: string; desc: string }>> = {
  all: { title: 'Your pipeline is empty', desc: 'Discover prospects or connect your channels to get started.' },
  stale: { title: 'All caught up', desc: 'No stale leads right now.' },
  pcc_discoveries: { title: 'No discoveries yet', desc: 'Run a PCC scan to find prospects.' },
  hot_followup: { title: 'Nothing urgent', desc: 'No hot leads need follow-up right now.' },
  high_value: { title: 'No high-value leads', desc: 'Leads worth $10K+ will appear here.' },
}

export function LeadsPage() {
  const {
    leads, grouped, isLoading, error,
    selectedLead, setSelectedLeadId,
    viewMode, setViewMode,
    filters, setFilters,
    moveLead, advanceLead, updateLead,
    movingLeadId, searchQuery, setSearchQuery,
  } = useLeads()

  const { analytics } = useLeadsAnalytics()
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [winTrigger, setWinTrigger] = useState(false)
  const [winPos, setWinPos] = useState({ x: 0, y: 0 })
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const activeView = filters.smartView ?? 'all'

  const counts = useMemo(() => {
    const oneDayAgo = Date.now() - 86_400_000
    const sevenDaysAgo = Date.now() - 7 * 86_400_000
    const active = leads.filter(l => l.status !== 'converted' && l.status !== 'lost')
    return {
      all: leads.length,
      hot_followup: active.filter(l => l.score === 'hot' && l.last_activity_at && new Date(l.last_activity_at).getTime() < oneDayAgo).length,
      stale: active.filter(l => l.last_activity_at && new Date(l.last_activity_at).getTime() < sevenDaysAgo).length,
      high_value: active.filter(l => (l.estimated_value ?? 0) > 10000).length,
      pcc_discoveries: leads.filter(l => l.discovery_source === 'pcc_discovery').length,
    } as Record<SmartView, number>
  }, [leads])

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ width: 80, height: 30, borderRadius: 20, background: 'var(--glass-hover-bg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <div style={{ height: 36, borderRadius: 8, background: 'var(--glass-hover-bg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 120, borderRadius: 14, background: 'var(--glass-card-bg-light)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--status-error-border)', background: 'var(--status-error-bg)', fontSize: 13, color: 'var(--bb-red)' }}>
        {error}
      </div>
    )
  }

  const empty = leads.length === 0
  const msg = EMPTY_MSG[activeView] ?? EMPTY_MSG.all!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Smart View Pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SMART_VIEWS.map((sv) => {
          const active = activeView === sv.key
          const count = (counts as Record<string, number>)[sv.key]
          return (
            <button
              key={sv.key}
              onClick={() => setFilters(f => ({ ...f, smartView: sv.key }))}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-dim)',
                transition: 'all 150ms cubic-bezier(0.2, 0.9, 0.3, 1)',
              }}
            >
              {sv.key === 'hot_followup' && count > 0 && (
                <span style={{ width: 6, height: 6, borderRadius: 3, background: '#F97316', display: 'inline-block', marginRight: 4 }} />
              )}
              {sv.label}
              {count > 0 && (
                <span style={{ marginLeft: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <LeadsToolbar
        filters={filters} onFiltersChange={setFilters}
        viewMode={viewMode} onViewModeChange={setViewMode}
        onDiscoverClick={() => setDiscoveryOpen(true)}
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        analytics={analytics} searchInputRef={searchInputRef}
      />

      {empty ? (
        activeView === 'stale' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            All caught up — no stale leads right now.
          </div>
        ) : activeView === 'pcc_discoveries' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            No discoveries yet. Run a PCC scan to find prospects.
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 20, background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)' }}>
              <Handshake size={28} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Your pipeline is empty</p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, textAlign: 'center' }}>Discover prospects or connect your channels.</p>
            <button
              onClick={() => setDiscoveryOpen(true)}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Discover Prospects
            </button>
          </div>
        )
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
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
