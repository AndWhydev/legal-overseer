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
  if (score === null) return 'text-muted-foreground';
  if (score >= 60) return 'text-emerald-400';
  if (score >= 35) return 'text-amber-400';
  return 'text-red-400';
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

const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'found', label: 'Found', color: 'bg-slate-600' },
  { key: 'evaluating', label: 'Evaluating', color: 'bg-blue-600' },
  { key: 'drafting', label: 'Drafting', color: 'bg-violet-600' },
  { key: 'submitted', label: 'Submitted', color: 'bg-amber-600' },
  { key: 'won', label: 'Won', color: 'bg-emerald-600' },
  { key: 'lost', label: 'Lost', color: 'bg-red-600/50' },
];

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
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground text-sm">Loading tenders...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
            <FileSearch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Tender Hunter</h1>
            <p className="text-sm text-muted-foreground">
              Find, evaluate, and respond to government tenders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
            {(['pipeline', 'list', 'profiles'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  view === v ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan Now'}
          </button>
        </div>
      </div>

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {pipelineGroups.map((stage) => (
            <div key={stage.key} className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${stage.color}`}>
                <span>{stage.label}</span>
                <span className="ml-auto opacity-70">{stage.tenders.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {stage.tenders.slice(0, 5).map((tender) => (
                  <button
                    key={tender.id}
                    onClick={() => setSelectedTender(tender)}
                    className="rounded-lg border border-white/5 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    <p className="text-xs font-medium line-clamp-2">{tender.title}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{sourceLabel(tender.source)}</span>
                      {tender.value && <span>{formatMoney(tender.value)}</span>}
                    </div>
                    {tender.fit_score !== null && (
                      <div className={`mt-1 text-[10px] font-mono ${fitScoreColor(tender.fit_score)}`}>
                        Fit: {tender.fit_score}%
                      </div>
                    )}
                  </button>
                ))}
                {stage.tenders.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] text-muted-foreground">
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
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Tender</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Closing</th>
                <th className="px-4 py-3">Fit</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenders.map((tender) => (
                <tr
                  key={tender.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => setSelectedTender(tender)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium line-clamp-1">{tender.title}</p>
                    <p className="text-xs text-muted-foreground">{tender.tender_number}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{sourceLabel(tender.source)}</td>
                  <td className="px-4 py-3 text-xs">
                    {tender.value ? formatMoney(tender.value) : '--'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {tender.deadline ? (
                      <span className={daysUntil(tender.deadline) < 7 ? 'text-red-400' : ''}>
                        {formatDate(tender.deadline)} ({daysUntil(tender.deadline)}d)
                      </span>
                    ) : '--'}
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono ${fitScoreColor(tender.fit_score)}`}>
                    {tender.fit_score !== null ? `${tender.fit_score}%` : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'evaluate'); }}
                        disabled={actionLoading === tender.id}
                        className="rounded px-2 py-1 text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                      >
                        Evaluate
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'response'); }}
                        disabled={actionLoading === tender.id}
                        className="rounded px-2 py-1 text-[10px] bg-violet-600/20 text-violet-400 hover:bg-violet-600/30"
                      >
                        Draft
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No tenders found. Click "Scan Now" to search government tender portals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Capability Profiles View */}
      {view === 'profiles' && (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <h3 className="font-medium">{profile.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{profile.service_category}</p>

              {profile.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {profile.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] text-violet-300">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {profile.certifications.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {profile.certifications.map((cert) => (
                    <span key={cert} className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] text-emerald-300">
                      {cert}
                    </span>
                  ))}
                </div>
              )}

              {profile.max_contract_value && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Max contract: {formatMoney(profile.max_contract_value)}
                </p>
              )}
            </div>
          ))}

          {profiles.length === 0 && (
            <div className="col-span-2 rounded-xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-muted-foreground text-sm">
                No capability profiles configured. Add profiles to enable smart tender matching.
              </p>
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
    </div>
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
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0a0a0f] border-l border-white/10 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">{tender.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{sourceLabel(tender.source)}</span>
                {tender.tender_number && (
                  <>
                    <span>|</span>
                    <span>{tender.tender_number}</span>
                  </>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-white/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Value</p>
              <p className="text-sm font-medium">{tender.value ? formatMoney(tender.value) : '--'}</p>
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Closing</p>
              <p className="text-sm font-medium">
                {tender.deadline ? formatDate(tender.deadline) : '--'}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Fit Score</p>
              <p className={`text-sm font-mono font-medium ${fitScoreColor(tender.fit_score)}`}>
                {tender.fit_score !== null ? `${tender.fit_score}%` : '--'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => onAction(tender.id, 'evaluate')}
              disabled={actionLoading === tender.id}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              Evaluate Fit
            </button>
            <button
              onClick={() => onAction(tender.id, 'compliance')}
              disabled={actionLoading === tender.id}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Compliance
            </button>
            <button
              onClick={() => onAction(tender.id, 'response')}
              disabled={actionLoading === tender.id}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" />
              Draft
            </button>
          </div>

          {/* External link */}
          {tender.url && (
            <a
              href={tender.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 mb-6"
            >
              View on {sourceLabel(tender.source)}
              <ChevronRight className="h-3 w-3" />
            </a>
          )}

          {/* Response sections */}
          {response?.content?.sections && response.content.sections.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Draft Response</h3>
              {response.content.sections.map((section, i) => (
                <div key={i} className="rounded-lg border border-white/5 p-3">
                  <h4 className="text-xs font-medium text-violet-300 mb-1">{section.title}</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{section.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Compliance matrix */}
          {response?.content?.compliance_matrix && response.content.compliance_matrix.length > 0 && (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-medium">Compliance Check</h3>
              <div className="text-xs text-muted-foreground mb-2">
                Score: <span className="font-mono">{response.compliance_score ?? '--'}%</span>
              </div>
              {response.content.compliance_matrix.map((item, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 p-2">
                  {item.status === 'met' && <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />}
                  {item.status === 'partially_met' && <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />}
                  {item.status === 'not_met' && <MinusCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-xs">{item.requirement}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TendersTab);
