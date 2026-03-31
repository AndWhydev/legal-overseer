'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconSearch, IconFileSearch, IconRefresh, IconChevronRight,
  IconCircleCheck, IconAlertCircle, IconCircleMinus, IconArrowRight,
  IconPlus, IconX,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TabSkeleton } from './tab-skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

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

function fitScoreBadgeVariant(score: number | null): 'default' | 'secondary' | 'destructive' {
  if (score === null) return 'secondary';
  if (score >= 60) return 'default';
  if (score >= 35) return 'secondary';
  return 'destructive';
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
  const [view, setView] = useState<string>('pipeline');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ---- Data fetching ----

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tendersRes, profilesRes, responsesRes] = await Promise.all([
        fetch('/api/agent/tenders'),
        fetch('/api/agent/tenders/capabilities'),
        fetch('/api/agent/tenders/responses'),
      ]);
      if (tendersRes.ok) setTenders(await tendersRes.json());
      if (profilesRes.ok) setProfiles(await profilesRes.json());
      if (responsesRes.ok) setResponses(await responsesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Actions ----

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

  // ---- Pipeline view ----

  const pipelineGroups = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    tenders: tenders.filter((t) => {
      const resp = responses.find((r) => r.tender_id === t.id);
      return getPipelineStage(t, resp) === stage.key;
    }),
  }));

  // ---- Render ----

  if (loading) {
    return <TabSkeleton variant="kanban" />;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} variant="outline">
          <ToggleGroupItem value="pipeline">Pipeline</ToggleGroupItem>
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="profiles">Profiles</ToggleGroupItem>
        </ToggleGroup>

        <Button variant="secondary" size="sm" onClick={handleScan} disabled={scanning}>
          <IconRefresh size={16} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning...' : 'Scan Now'}
        </Button>
      </div>

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
          {pipelineGroups.map((stage) => (
            <div key={stage.key} className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">{stage.label}</span>
                <Badge variant="secondary" className="text-xs">{stage.tenders.length}</Badge>
              </div>

              <div className="flex flex-col gap-2">
                {stage.tenders.slice(0, 5).map((tender) => (
                  <Card
                    key={tender.id}
                    className="cursor-pointer py-3 transition-colors hover:bg-muted/30"
                    onClick={() => setSelectedTender(tender)}
                  >
                    <CardContent className="flex flex-col gap-2 px-4">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {tender.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{sourceLabel(tender.source)}</span>
                        {tender.value && (
                          <span className="font-mono font-medium">{formatMoney(tender.value)}</span>
                        )}
                      </div>
                      {tender.fit_score !== null && (
                        <Badge variant={fitScoreBadgeVariant(tender.fit_score)} className="w-fit text-xs">
                          Fit: {tender.fit_score}%
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {stage.tenders.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tender</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Closing</TableHead>
                  <TableHead>Fit</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenders.map((tender) => (
                  <TableRow
                    key={tender.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedTender(tender)}
                  >
                    <TableCell>
                      <p className="font-medium text-foreground">{tender.title}</p>
                      <p className="text-xs text-muted-foreground">{tender.tender_number}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sourceLabel(tender.source)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-muted-foreground">
                      {tender.value ? formatMoney(tender.value) : '--'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tender.deadline ? (
                        <span className={daysUntil(tender.deadline) < 7 ? 'text-destructive' : ''}>
                          {formatDate(tender.deadline)} ({daysUntil(tender.deadline)}d)
                        </span>
                      ) : '--'}
                    </TableCell>
                    <TableCell>
                      {tender.fit_score !== null ? (
                        <Badge variant={fitScoreBadgeVariant(tender.fit_score)} className="text-xs">
                          {tender.fit_score}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'evaluate'); }}
                          disabled={actionLoading === tender.id}
                        >
                          Evaluate
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={(e) => { e.stopPropagation(); handleAction(tender.id, 'response'); }}
                          disabled={actionLoading === tender.id}
                        >
                          Draft
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {tenders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Empty>
                        <EmptyMedia><IconFileSearch size={32} /></EmptyMedia>
                        <EmptyTitle>No tenders found</EmptyTitle>
                        <EmptyDescription>Click &quot;Scan Now&quot; to search government tender portals.</EmptyDescription>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Capability Profiles View */}
      {view === 'profiles' && (
        <div>
          {profiles.length === 0 ? (
            <Empty>
              <EmptyTitle>No capability profiles yet</EmptyTitle>
              <EmptyDescription>Create profiles to enable smart tender matching and automated evaluations.</EmptyDescription>
            </Empty>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
              {profiles.map((profile) => (
                <Card key={profile.id}>
                  <CardHeader>
                    <CardTitle className="text-sm">{profile.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{profile.service_category}</p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {profile.skills.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.skills.map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {profile.certifications.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Certifications</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.certifications.map((cert) => (
                            <Badge key={cert} variant="secondary" className="text-xs">{cert}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {profile.max_contract_value && (
                      <div className="border-t border-border pt-3">
                        <p className="text-sm text-muted-foreground">
                          Max contract:{' '}
                          <span className="font-mono font-medium text-foreground">
                            {formatMoney(profile.max_contract_value)}
                          </span>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tender Detail Sheet */}
      <Sheet open={!!selectedTender} onOpenChange={(open) => { if (!open) { setSelectedTender(null); setSelectedResponse(null); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedTender && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedTender.title}</SheetTitle>
                <SheetDescription>
                  {sourceLabel(selectedTender.source)}
                  {selectedTender.tender_number && ` | ${selectedTender.tender_number}`}
                </SheetDescription>
              </SheetHeader>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3 px-4">
                <Card className="py-3">
                  <CardContent className="px-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Value</p>
                    <p className="mt-1 font-mono text-sm font-medium text-foreground">
                      {selectedTender.value ? formatMoney(selectedTender.value) : '--'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="py-3">
                  <CardContent className="px-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closing</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {selectedTender.deadline ? formatDate(selectedTender.deadline) : '--'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="py-3">
                  <CardContent className="px-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fit Score</p>
                    {selectedTender.fit_score !== null ? (
                      <Badge variant={fitScoreBadgeVariant(selectedTender.fit_score)} className="mt-1 text-xs">
                        {selectedTender.fit_score}%
                      </Badge>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">--</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 px-4">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => handleAction(selectedTender.id, 'evaluate')}
                  disabled={actionLoading === selectedTender.id}
                >
                  <IconSearch size={16} />
                  Evaluate Fit
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => handleAction(selectedTender.id, 'compliance')}
                  disabled={actionLoading === selectedTender.id}
                >
                  <IconCircleCheck size={16} />
                  Compliance
                </Button>
                <Button
                  className="w-full"
                  onClick={() => handleAction(selectedTender.id, 'response')}
                  disabled={actionLoading === selectedTender.id}
                >
                  <IconArrowRight size={16} />
                  Draft Response
                </Button>
              </div>

              {/* External link */}
              {selectedTender.url && (
                <div className="px-4">
                  <a
                    href={selectedTender.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View on {sourceLabel(selectedTender.source)}
                    <IconChevronRight size={14} />
                  </a>
                </div>
              )}

              {/* Response sections */}
              {selectedResponse?.content?.sections && selectedResponse.content.sections.length > 0 && (
                <div className="flex flex-col gap-3 px-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Draft Response</h3>
                  {selectedResponse.content.sections.map((section, i) => (
                    <Card key={i} className="py-3">
                      <CardContent className="px-4">
                        <h4 className="mb-2 text-sm font-medium text-foreground">{section.title}</h4>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{section.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Compliance matrix */}
              {selectedResponse?.content?.compliance_matrix && selectedResponse.content.compliance_matrix.length > 0 && (
                <div className="flex flex-col gap-3 px-4">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Compliance Check</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Score: <span className="font-mono font-medium text-foreground">{selectedResponse.compliance_score ?? '--'}%</span>
                    </p>
                  </div>
                  {selectedResponse.content.compliance_matrix.map((item, i) => (
                    <Card key={i} className="py-3">
                      <CardContent className="flex gap-3 px-4">
                        {item.status === 'met' && <IconCircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />}
                        {item.status === 'partially_met' && <IconAlertCircle size={18} className="mt-0.5 shrink-0 text-amber-500" />}
                        {item.status === 'not_met' && <IconCircleMinus size={18} className="mt-0.5 shrink-0 text-destructive" />}
                        <div>
                          <p className="text-sm text-foreground">{item.requirement}</p>
                          <p className="text-sm text-muted-foreground">{item.evidence}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default React.memo(TendersTab);