'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  FileSearch,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  ArrowRight,
  Plus,
  X,
} from 'lucide-react';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { S, C } from '@/lib/styles/design-tokens';

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
  if (score === null) return C.textSecondary;
  if (score >= 60) return C.statusSuccess;
  if (score >= 35) return C.statusWarning;
  return C.statusError;
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

const glassCard: React.CSSProperties = {
  ...S.card,
};

const pillBtn: React.CSSProperties = {
  ...S.pill,
  padding: '8px 16px',
  borderRadius: 20,
};

const accentBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonPrimary,
};

const ghostBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonGhost,
  padding: '8px 16px',
  minHeight: 40,
  borderRadius: 12,
};

const listRow: React.CSSProperties = {
  ...S.listRow,
  padding: '12px 20px',
};

const sectionHeader: React.CSSProperties = {
  ...S.sectionLabel,
};

const badge: React.CSSProperties = {
  ...S.badge,
  letterSpacing: '0.02em',
};

function coloredBadge(color: string): React.CSSProperties {
  return {
    ...S.badge,
    gap: 8,
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
        {/* View Toggles + Actions */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <GlassToggle
            options={[
              { key: 'pipeline' as const, label: 'Pipeline' },
              { key: 'list' as const, label: 'List' },
              { key: 'profiles' as const, label: 'Profiles' },
            ]}
            value={view}
            onChange={setView}
          />

          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              ...S.button,
              ...S.buttonSoft,
              background: C.bgHoverStrong,
              color: C.textPrimary,
              opacity: scanning ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!scanning) {
                (e.target as HTMLElement).style.background = C.bgHover;
              }
            }}
            onMouseLeave={(e) => {
              if (!scanning) {
                (e.target as HTMLElement).style.background = C.bgHoverStrong;
              }
            }}
          >
            <RefreshCw
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
                  background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))',
                  boxShadow: 'var(--glass-pill-inset, none)',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                }}
              >
                <span>{stage.label}</span>
                <span style={{ fontSize: 14, opacity: 0.7 }}>{stage.tenders.length}</span>
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
                    <p style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary, marginBottom: 8, lineHeight: 1.4 }}>
                      {tender.title}
                    </p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: C.textSecondary, marginBottom: 8, width: '100%' }}>
                      <span>{sourceLabel(tender.source)}</span>
                      {tender.value && <span style={{ fontFamily: S.mono.fontFamily, fontWeight: 500 }}>{formatMoney(tender.value)}</span>}
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
                      border: `1px solid ${C.borderSubtle}`,
                      textAlign: 'center',
                      fontSize: 14,
                      color: C.textDim,
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
            <table style={{ width: '100%', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.borderSubtle}`, textAlign: 'left' }}>
                  {['Tender', 'Source', 'Value', 'Closing', 'Fit', 'Actions'].map((h) => (
                    <th key={h} style={{ ...S.sectionLabel, padding: '12px 16px', marginBottom: 0, letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
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
                      (e.target as HTMLElement).style.background = 'var(--hover-bg, rgba(255, 255, 255, 0.02))';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontWeight: 500, color: C.textPrimary, marginBottom: 4 }}>{tender.title}</p>
                      <p style={{ fontSize: 14, color: C.textSecondary }}>{tender.tender_number}</p>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: C.textSecondary }}>
                      {sourceLabel(tender.source)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: C.textSecondary, fontFamily: S.mono.fontFamily, fontWeight: 500 }}>
                      {tender.value ? formatMoney(tender.value) : '--'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: C.textSecondary }}>
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
                        <span style={{ fontSize: 14, color: C.textDim }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'evaluate'); }}
                          disabled={actionLoading === tender.id}
                          style={{
                            ...ghostBtn,
                            fontSize: 14,
                            padding: '8px 12px',
                            background: C.bgHoverStrong,
                            color: C.textSecondary,
                            opacity: actionLoading === tender.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = C.bgHover;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = C.bgHoverStrong;
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
                            fontSize: 14,
                            padding: '8px 12px',
                            background: C.bgHoverStrong,
                            color: C.textPrimary,
                            opacity: actionLoading === tender.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = C.bgHover;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (actionLoading !== tender.id) {
                              (e.target as HTMLElement).style.background = C.bgHoverStrong;
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
                      <div style={S.emptyState}>
                        <FileSearch size={32} style={S.emptyIcon} />
                        <span style={S.emptyText}>
                          No tenders found. Click &quot;Scan Now&quot; to search government tender portals.
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
                  <h3 style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary, marginBottom: 8 }}>
                    {profile.name}
                  </h3>
                  <p style={{ fontSize: 14, color: C.textSecondary, marginBottom: 12 }}>
                    {profile.service_category}
                  </p>

                  {profile.skills.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={sectionHeader}>Skills</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {profile.skills.map((skill) => (
                          <span key={skill} style={badge}>
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
                          <span key={cert} style={badge}>
                            {cert}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {profile.max_contract_value && (
                    <div style={{ paddingTop: 12, borderTop: `1px solid ${C.borderSubtle}` }}>
                      <p style={{ fontSize: 14, color: C.textSecondary }}>
                        Max contract:{' '}
                        <span style={{ fontFamily: S.mono.fontFamily, fontWeight: 500, color: C.textPrimary }}>
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
          borderLeft: '1px solid var(--glass-card-border)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-card-border)', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ ...S.title, marginBottom: 8 }}>
                {tender.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.textSecondary }}>
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
              <X size={20} />
            </button>
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ ...glassCard, padding: '12px', textAlign: 'center' }}>
              <p style={{ ...S.sectionLabel, fontSize: 14, marginBottom: 4 }}>
                Value
              </p>
              <p style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary, fontFamily: S.mono.fontFamily }}>
                {tender.value ? formatMoney(tender.value) : '--'}
              </p>
            </div>
            <div style={{ ...glassCard, padding: '12px', textAlign: 'center' }}>
              <p style={{ ...S.sectionLabel, fontSize: 14, marginBottom: 4 }}>
                Closing
              </p>
              <p style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
                {tender.deadline ? formatDate(tender.deadline) : '--'}
              </p>
            </div>
            <div style={{ ...glassCard, padding: '12px', textAlign: 'center' }}>
              <p style={{ ...S.sectionLabel, fontSize: 14, marginBottom: 4 }}>
                Fit Score
              </p>
              {tender.fit_score !== null ? (
                <span style={coloredBadge(fitScoreColor(tender.fit_score))}>
                  {tender.fit_score}%
                </span>
              ) : (
                <p style={{ fontSize: 14, color: C.textDim }}>--</p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            <button
              onClick={() => onAction(tender.id, 'evaluate')}
              disabled={actionLoading === tender.id}
              onMouseEnter={() => setHoveredBtn('evaluate')}
              onMouseLeave={() => setHoveredBtn(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                background: hoveredBtn === 'evaluate' && actionLoading !== tender.id ? 'var(--hover-bg, rgba(255, 255, 255, 0.10))' : 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
                border: 'none',
                color: 'var(--text-primary, #F1F5F9)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: actionLoading === tender.id ? 0.5 : 1,
                transition: 'all 200ms',
              }}
            >
              <Search size={16} />
              Evaluate Fit
            </button>
            <button
              onClick={() => onAction(tender.id, 'compliance')}
              disabled={actionLoading === tender.id}
              onMouseEnter={() => setHoveredBtn('compliance')}
              onMouseLeave={() => setHoveredBtn(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                background: hoveredBtn === 'compliance' && actionLoading !== tender.id ? 'var(--hover-bg, rgba(255, 255, 255, 0.10))' : 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
                border: 'none',
                color: 'var(--text-primary, #F1F5F9)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: actionLoading === tender.id ? 0.5 : 1,
                transition: 'all 200ms',
              }}
            >
              <CheckCircle2 size={16} />
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
                padding: '12px 16px',
                background: 'var(--btn-primary-bg, #F1F5F9)',
                color: 'var(--btn-primary-fg, #0a0f1a)',
                opacity: actionLoading === tender.id ? 0.5 : 1,
                transform: hoveredBtn === 'response' && actionLoading !== tender.id ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <ArrowRight size={16} />
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
                gap: 8,
                fontSize: 14,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                marginBottom: 24,
                transition: 'color 200ms',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              View on {sourceLabel(tender.source)}
              <ChevronRight size={14} />
            </a>
          )}

          {/* Response sections */}
          {response?.content?.sections && response.content.sections.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={sectionHeader}>Draft Response</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {response.content.sections.map((section, i) => (
                  <div key={i} style={{ ...glassCard, padding: '16px' }}>
                    <h4 style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary, marginBottom: 8 }}>
                      {section.title}
                    </h4>
                    <p style={{ fontSize: 14, color: C.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
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
              <div style={{ marginBottom: 12, fontSize: 14, color: C.textSecondary }}>
                Score:{' '}
                <span style={{ fontFamily: S.mono.fontFamily, fontWeight: 500, color: C.textPrimary }}>
                  {response.compliance_score ?? '--'}%
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      <CheckCircle2 size={18} style={{ color: C.statusSuccess, flexShrink: 0, marginTop: 2 }} />
                    )}
                    {item.status === 'partially_met' && (
                      <AlertCircle size={18} style={{ color: C.statusWarning, flexShrink: 0, marginTop: 2 }} />
                    )}
                    {item.status === 'not_met' && (
                      <MinusCircle size={18} style={{ color: C.statusError, flexShrink: 0, marginTop: 2 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, color: C.textPrimary, marginBottom: 4 }}>
                        {item.requirement}
                      </p>
                      <p style={{ fontSize: 14, color: C.textSecondary }}>
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
