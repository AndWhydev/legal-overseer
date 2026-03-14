'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SFMagnifyingglass, SFDocument, SFArrowClockwise, SFChevronRight, SFCheckmarkCircle, SFExclamationmarkCircle, SFMinusCircle, SFArrowRight, SFPlus, SFXmark, SFBriefcase } from 'sf-symbols-lib';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tender {
  id: string;
  title: string;
  source: string;
  tender_number: string | null;
  url: string;
  value: number | null;
  deadline: string | null;
  status: string;
  fit_score: number | null;
  category: string;
  created_at: string;
}

interface TenderResponse {
  id: string;
  tender_id: string;
  status: string;
  compliance_score: number | null;
  fit_score: number | null;
  estimated_effort_hours: number | null;
  content: {
    sections?: Array<{ title: string; content: string }>;
    compliance_matrix?: Array<{
      requirement: string;
      status: string;
      evidence: string;
    }>;
  };
}

interface CapabilityProfile {
  id: string;
  name: string;
  service_category: string;
  skills: string[];
  certifications: string[];
  location_coverage: string[];
  max_contract_value: number | null;
}

type PipelineStage = 'found' | 'evaluating' | 'drafting' | 'submitted' | 'won' | 'lost';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function fitScoreColor(score: number | null): string {
  if (score === null) return 'var(--text-secondary)';
  if (score >= 60) return '#22c55e';
  if (score >= 35) return '#eab308';
  return '#ef4444';
}

function fitScoreBg(score: number | null): string {
  if (score === null) return 'rgba(148, 163, 184, 0.12)';
  if (score >= 60) return 'rgba(34, 197, 94, 0.12)';
  if (score >= 35) return 'rgba(234, 179, 8, 0.12)';
  return 'rgba(239, 68, 68, 0.12)';
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    austender: 'AusTender',
    qtenders: 'QTenders',
    nsw: 'NSW eTendering',
  };
  return map[source] ?? source;
}

function getPipelineStage(tender: Tender, response: TenderResponse | undefined): PipelineStage {
  if (response?.status === 'won') return 'won';
  if (response?.status === 'lost') return 'lost';
  if (response?.status === 'submitted' || tender.status === 'drafted') return 'submitted';
  if (response?.status === 'draft' || response?.status === 'review') return 'drafting';
  if (tender.fit_score !== null) return 'evaluating';
  return 'found';
}

const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'found', label: 'Found' },
  { key: 'evaluating', label: 'Evaluating' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

// ---------------------------------------------------------------------------
// Inline Style Definitions
// ---------------------------------------------------------------------------

const pageTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em',
};

const pageSubtitle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  marginTop: 4,
};

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  border: '1px solid var(--glass-card-border)',
  boxShadow: 'var(--glass-card-inset)',
};

const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
};

const pillBtn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 20,
  background: 'var(--glass-pill-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  fontSize: 12,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'all 200ms',
};

const accentBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  background: '#1A1A1B',
  border: 'none',
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 200ms',
};

const ghostBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  background: 'transparent',
  border: '1px solid var(--glass-interactive-border)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
};

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: 12,
  background: 'var(--bb-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  transition: 'background 200ms',
  cursor: 'pointer',
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim)',
  marginBottom: 12,
};

const badge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  background: 'var(--glass-hover-bg)',
  color: 'var(--text-secondary)',
};

function coloredBadge(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    background: `${color}15`,
    color: color,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TendersTab() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [responses, setResponses] = useState<TenderResponse[]>([]);
  const [profiles, setProfiles] = useState<CapabilityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<TenderResponse | null>(null);
  const [view, setView] = useState<'list' | 'pipeline' | 'profiles'>('pipeline');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hoveredTender, setHoveredTender] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tendersRes, profilesRes] = await Promise.all([
        fetch('/api/agent/tenders'),
        fetch('/api/agent/tenders/capabilities'),
      ]);
      if (tendersRes.ok) setTenders(await tendersRes.json());
      if (profilesRes.ok) setProfiles(await profilesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      const keywords = profiles.flatMap((p) => p.skills.slice(0, 3));
      if (keywords.length === 0) keywords.push('technology', 'consulting', 'digital');

      const res = await fetch('/api/agent/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', keywords }),
      });
      if (res.ok) {
        const data = await res.json();
        setTenders(data.tenders ?? []);
      }
    } finally {
      setScanning(false);
    }
  }, [profiles]);

  const handleAction = useCallback(async (tenderId: string, action: string) => {
    setActionLoading(tenderId);
    try {
      const res = await fetch('/api/agent/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tenderId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (action === 'response') {
          setSelectedResponse(data);
        }
        await fetchData();
      }
    } finally {
      setActionLoading(null);
    }
  }, [fetchData]);

  // ── Pipeline view ──────────────────────────────────────────────────────

  const pipelineGroups = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    tenders: tenders.filter((t) => {
      const resp = responses.find((r) => r.tender_id === t.id);
      return getPipelineStage(t, resp) === stage.key;
    }),
  }));

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <TabShell>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease infinite',
            }}
          />
        </div>
      </TabShell>
    );
  }

  return (
    <TabShell>
      {/* Page Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <SFDocument size={28} style={{ color: 'var(--bb-purple)' }} />
          <div>
            <h1 style={pageTitle}>Tender Hunter</h1>
            <p style={pageSubtitle}>Find, evaluate, and respond to government tenders</p>
          </div>
        </div>

        {/* View Toggles + Actions */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--glass-interactive-border)', overflow: 'hidden' }}>
            {(['pipeline', 'list', 'profiles'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: view === v ? 'var(--glass-hover-bg)' : 'transparent',
                  color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  textTransform: 'capitalize',
                }}
                onMouseEnter={(e) => {
                  if (view !== v) {
                    (e.target as HTMLElement).style.background = 'var(--glass-interactive-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (view !== v) {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              ...accentBtn,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: scanning ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!scanning) {
                (e.target as HTMLElement).style.background = '#FF7A45';
                (e.target as HTMLElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!scanning) {
                (e.target as HTMLElement).style.background = '#1A1A1B';
                (e.target as HTMLElement).style.transform = 'translateY(0)';
              }
            }}
          >
            <SFArrowClockwise
              size={16}
              style={{
                animation: scanning ? 'spin 1s linear infinite' : 'none',
              }}
            />
            {scanning ? 'Scanning...' : 'Scan Now'}
          </button>
        </div>
      </div>

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          {pipelineGroups.map((stage) => (
            <div key={stage.key}>
              <button
                style={{
                  ...pillBtn,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  background: 'rgba(255, 90, 31, 0.15)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                <span>{stage.label}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{stage.tenders.length}</span>
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stage.tenders.slice(0, 5).map((tender) => (
                  <button
                    key={tender.id}
                    onClick={() => setSelectedTender(tender)}
                    onMouseEnter={() => setHoveredTender(tender.id)}
                    onMouseLeave={() => setHoveredTender(null)}
                    style={{
                      ...listRow,
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      background: hoveredTender === tender.id ? 'var(--hover-bg-strong)' : 'var(--bb-surface)',
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                      {tender.title}
                    </p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, width: '100%' }}>
                      <span>{sourceLabel(tender.source)}</span>
                      {tender.value && <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontWeight: 600 }}>{formatMoney(tender.value)}</span>}
                    </div>
                    {tender.fit_score !== null && (
                      <span style={coloredBadge(fitScoreColor(tender.fit_score))}>
                        Fit: {tender.fit_score}%
                      </span>
                    )}
                  </button>
                ))}

                {stage.tenders.length === 0 && (
                  <div
                    style={{
                      padding: '20px 16px',
                      borderRadius: 12,
                      border: '1px dashed var(--border-active)',
                      textAlign: 'center',
                      fontSize: 12,
                      color: 'var(--text-dim)',
                    }}
                  >
                    No tenders
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div style={{ ...glassCard, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-interactive-border)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Tender
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Source
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Value
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Closing
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Fit
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenders.map((tender) => (
                  <tr
                    key={tender.id}
                    onClick={() => setSelectedTender(tender)}
                    style={{
                      borderBottom: '1px solid var(--glass-card-border)',
                      cursor: 'pointer',
                      transition: 'background 200ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.02)';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{tender.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tender.tender_number}</p>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {sourceLabel(tender.source)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontWeight: 600 }}>
                      {tender.value ? formatMoney(tender.value) : '--'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {tender.deadline ? (
                        <span style={{ color: daysUntil(tender.deadline) < 7 ? 'var(--bb-red)' : 'inherit' }}>
                          {formatDate(tender.deadline)} ({daysUntil(tender.deadline)}d)
                        </span>
                      ) : '--'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {tender.fit_score !== null ? (
                        <span style={coloredBadge(fitScoreColor(tender.fit_score))}>
                          {tender.fit_score}%
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'evaluate'); }}
                          disabled={actionLoading === tender.id}
                          style={{
                            ...ghostBtn,
                            fontSize: 11,
                            padding: '6px 10px',
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#3b82f6',
                            opacity: actionLoading === tender.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = 'rgba(59, 130, 246, 0.18)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = 'rgba(59, 130, 246, 0.12)';
                            }
                          }}
                        >
                          Evaluate
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'response'); }}
                          disabled={actionLoading === tender.id}
                          style={{
                            ...ghostBtn,
                            fontSize: 11,
                            padding: '6px 10px',
                            background: 'rgba(168, 85, 247, 0.12)',
                            color: '#a855f7',
                            opacity: actionLoading === tender.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = 'rgba(168, 85, 247, 0.18)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = 'rgba(168, 85, 247, 0.12)';
                            }
                          }}
                        >
                          Draft
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {tenders.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '60px 20px',
                          gap: 12,
                        }}
                      >
                        <SFDocument size={32} style={{ color: 'var(--text-dim)' }} />
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                          No tenders found. Click "Scan Now" to search government tender portals.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Capability Profiles View */}
      {view === 'profiles' && (
        <div>
          {profiles.length === 0 ? (
            <EmptyState
              icon={<SFBriefcase size={40} />}
              title="No capability profiles yet"
              description="Create profiles to enable smart tender matching and automated evaluations."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  style={{
                    ...glassCard,
                  }}
                >
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {profile.name}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    {profile.service_category}
                  </p>

                  {profile.skills.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={sectionHeader}>Skills</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {profile.skills.map((skill) => (
                          <span key={skill} style={coloredBadge('#A78BFA')}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {profile.certifications.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={sectionHeader}>Certifications</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {profile.certifications.map((cert) => (
                          <span key={cert} style={coloredBadge('#22c55e')}>
                            {cert}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {profile.max_contract_value && (
                    <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Max contract:{' '}
                        <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatMoney(profile.max_contract_value)}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tender Detail Drawer */}
      {selectedTender && (
        <TenderDetailDrawer
          tender={selectedTender}
          response={selectedResponse}
          onClose={() => { setSelectedTender(null); setSelectedResponse(null); }}
          onAction={handleAction}
          actionLoading={actionLoading}
        />
      )}
    </TabShell>
  );
}

// ---------------------------------------------------------------------------
// Tender Detail Drawer
// ---------------------------------------------------------------------------

interface TenderDetailDrawerProps {
  tender: Tender;
  response: TenderResponse | null;
  onClose: () => void;
  onAction: (tenderId: string, action: string) => Promise<void>;
  actionLoading: string | null;
}

function TenderDetailDrawer({ tender, response, onClose, onAction, actionLoading }: TenderDetailDrawerProps) {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'var(--bg-overlay)' }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-card-solid)',
          backdropFilter: 'var(--glass-card-blur)',
          WebkitBackdropFilter: 'var(--glass-card-blur)',
          borderLeft: '1px solid var(--glass-interactive-border)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-card-border)', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                {tender.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>{sourceLabel(tender.source)}</span>
                {tender.tender_number && (
                  <>
                    <span>|</span>
                    <span>{tender.tender_number}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              <SFXmark size={20} />
            </button>
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ ...glassCard, padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                Value
              </p>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
                {tender.value ? formatMoney(tender.value) : '--'}
              </p>
            </div>
            <div style={{ ...glassCard, padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                Closing
              </p>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {tender.deadline ? formatDate(tender.deadline) : '--'}
              </p>
            </div>
            <div style={{ ...glassCard, padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                Fit Score
              </p>
              {tender.fit_score !== null ? (
                <span style={coloredBadge(fitScoreColor(tender.fit_score))}>
                  {tender.fit_score}%
                </span>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>--</p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <button
              onClick={() => onAction(tender.id, 'evaluate')}
              disabled={actionLoading === tender.id}
              onMouseEnter={() => setHoveredBtn('evaluate')}
              onMouseLeave={() => setHoveredBtn(null)}
              style={{
                ...accentBtn,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 16px',
                opacity: actionLoading === tender.id ? 0.5 : 1,
                background: hoveredBtn === 'evaluate' && actionLoading !== tender.id ? '#333333' : '#1A1A1B',
                transform: hoveredBtn === 'evaluate' && actionLoading !== tender.id ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <SFMagnifyingglass size={16} />
              Evaluate Fit
            </button>
            <button
              onClick={() => onAction(tender.id, 'compliance')}
              disabled={actionLoading === tender.id}
              onMouseEnter={() => setHoveredBtn('compliance')}
              onMouseLeave={() => setHoveredBtn(null)}
              style={{
                ...accentBtn,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 16px',
                background: '#eab308',
                opacity: actionLoading === tender.id ? 0.5 : 1,
                transform: hoveredBtn === 'compliance' && actionLoading !== tender.id ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <SFCheckmarkCircle size={16} />
              Compliance
            </button>
            <button
              onClick={() => onAction(tender.id, 'response')}
              disabled={actionLoading === tender.id}
              onMouseEnter={() => setHoveredBtn('response')}
              onMouseLeave={() => setHoveredBtn(null)}
              style={{
                ...accentBtn,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 16px',
                background: '#a855f7',
                opacity: actionLoading === tender.id ? 0.5 : 1,
                transform: hoveredBtn === 'response' && actionLoading !== tender.id ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <SFArrowRight size={16} />
              Draft Response
            </button>
          </div>

          {/* External link */}
          {tender.url && (
            <a
              href={tender.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--bb-purple)',
                textDecoration: 'none',
                marginBottom: 24,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = 'var(--bb-purple)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = 'var(--bb-purple)';
              }}
            >
              View on {sourceLabel(tender.source)}
              <SFChevronRight size={14} />
            </a>
          )}

          {/* Response sections */}
          {response?.content?.sections && response.content.sections.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={sectionHeader}>Draft Response</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {response.content.sections.map((section, i) => (
                  <div key={i} style={{ ...glassCard, padding: '16px' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--bb-purple)', marginBottom: 8 }}>
                      {section.title}
                    </h4>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance matrix */}
          {response?.content?.compliance_matrix && response.content.compliance_matrix.length > 0 && (
            <div>
              <h3 style={sectionHeader}>Compliance Check</h3>
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                Score:{' '}
                <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {response.compliance_score ?? '--'}%
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {response.content.compliance_matrix.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      ...glassCard,
                      padding: '12px',
                      display: 'flex',
                      gap: 12,
                    }}
                  >
                    {item.status === 'met' && (
                      <SFCheckmarkCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                    )}
                    {item.status === 'partially_met' && (
                      <SFExclamationmarkCircle size={18} style={{ color: '#eab308', flexShrink: 0, marginTop: 2 }} />
                    )}
                    {item.status === 'not_met' && (
                      <SFMinusCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {item.requirement}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {item.evidence}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TendersTab);
