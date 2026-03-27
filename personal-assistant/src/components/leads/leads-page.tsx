'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Handshake, Mail } from 'lucide-react'
import { GlassToggle } from '@/components/ui/glass-toggle'
import { useLeads } from '@/hooks/use-leads'
import { useLeadsAnalytics } from '@/hooks/use-leads-analytics'
import { LeadsToolbar } from './leads-toolbar'
import { LeadsKanbanView } from './leads-kanban-view'
import { LeadsListView } from './leads-list-view'
import { LeadDetailDrawer } from './lead-detail-drawer'
import { ProspectDiscoveryPanel } from './prospect-discovery-panel'
import { OutreachDashboard } from './outreach-dashboard'
import { CompletionAnimation } from '../dashboard/completion-animation'
import { EmptyState } from '@/components/ui/empty-state'
import type { SmartView } from '@/lib/leads/types'

// ─── Smart Views (Lead Swarm discoveries moved to source filter) ────────────
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

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const pageContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  height: '100%',
}

const pillContainer: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const skeletonPill: React.CSSProperties = {
  width: 80,
  height: 40,
  borderRadius: 9999,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  animation: 'pulse 1.5s ease-in-out infinite',
}

const skeletonSearch: React.CSSProperties = {
  height: 40,
  borderRadius: 8,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  animation: 'pulse 1.5s ease-in-out infinite',
}

const skeletonCard: React.CSSProperties = {
  height: 120,
  borderRadius: 12,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  animation: 'pulse 1.5s ease-in-out infinite',
}

const shimmerCard: React.CSSProperties = {
  height: 120,
  borderRadius: 12,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
}

const emptyContainer: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  padding: 48,
}

const emptyIconWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 64,
  height: 64,
  borderRadius: 24,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  color: 'var(--text-dim, #475569)',
}

const emptyTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: 0,
}

const emptyDesc: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-dim, #475569)',
  margin: 0,
  textAlign: 'center',
}

const discoverBtn: React.CSSProperties = {
  height: 40,
  padding: '0 20px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 8,
  border: 'none',
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
}

const emptyFilterMsg: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-dim, #475569)',
  fontSize: 14,
}

const contentArea: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
}


// ─── Component ──────────────────────────────────────────────────────────────
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
  const [viewLoading, setViewLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const prevViewRef = useRef<SmartView | undefined>(undefined)
  const activeView = filters.smartView ?? 'all'

  // Smart view changes are now instant (client-side filtering in useLeads)
  // No artificial skeleton delay needed

  // Counts always computed from full dataset, not filtered view
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ ...skeletonPill, animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
        <div style={skeletonSearch} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...skeletonCard, animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Something went wrong"
        description={error}
        action={{ label: 'Retry', onClick: () => refresh() }}
      />
    )
  }

  const empty = leads.length === 0
  const msg = EMPTY_MSG[activeView] ?? EMPTY_MSG.all!

  return (
    <div style={pageContainer}>
      {/* Main Tabs */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))' }}>
        <GlassToggle
          options={[
            { key: 'leads' as const, label: 'Leads Pipeline', icon: <Handshake size={16} /> },
            { key: 'campaigns' as const, label: 'Email Campaigns', icon: <Mail size={16} /> },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Leads Tab */}
      {activeTab === 'leads' && (
        <>
          {/* Smart View Pills */}
          <nav style={pillContainer} role="tablist" aria-label="Lead views">
            {SMART_VIEWS.map((sv) => {
              const isActive = activeView === sv.key
              const count = (counts as Record<string, number>)[sv.key]
              return (
                <button
                  key={sv.key}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${sv.label}${count > 0 ? `, ${count} leads` : ''}`}
                  onClick={() => setFilters(f => ({ ...f, smartView: sv.key }))}
                  style={{
                    height: 40,
                    padding: '0 16px',
                    borderRadius: 9999,
                    fontSize: 14,
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background 200ms cubic-bezier(0.16, 1, 0.3, 1), color 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: isActive ? 'scale(1.02)' : 'scale(1)',
                    background: isActive ? 'var(--pill-active-bg, rgba(255, 255, 255, 0.1))' : 'var(--pill-inactive-bg, rgba(10, 14, 23, 0.42))',
                    backdropFilter: 'blur(22px) saturate(1.2)',
                    WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
                    boxShadow: isActive
                      ? 'var(--toggle-active-shadow, none)'
                      : 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                    color: isActive ? 'var(--text-primary, #F1F5F9)' : 'var(--text-secondary, #94A3B8)',
                  }}
                >
                  {sv.label}
                  {count > 0 && (
                    <span style={{
                      fontSize: 14,
                      fontWeight: 400,
                      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                      color: isActive
                        ? 'var(--text-secondary, #94A3B8)'
                        : 'var(--text-dim, #475569)',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
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
              <div style={emptyFilterMsg}>
                {msg.desc}
              </div>
            ) : (
              <div style={emptyContainer}>
                <div style={emptyIconWrap}>
                  <Handshake size={24} />
                </div>
                <p style={emptyTitle}>{msg.title}</p>
                <p style={emptyDesc}>{msg.desc}</p>
                <button
                  onClick={() => setDiscoveryOpen(true)}
                  style={discoverBtn}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  Discover Prospects
                </button>
              </div>
            )
          ) : (
            <div style={contentArea} role="tabpanel">
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
        </>
      )}

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <OutreachDashboard leads={leads} />
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
