'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconBolt,
  IconPlus,
  IconTrash,
  IconCalendarEvent,
  IconFilter,
  IconAlertCircle,
  IconCheck,
  IconTemplate,
  IconChevronUp,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription as EmptyDesc,
  EmptyContent,
} from '@/components/ui/empty';
import { TabShell } from '@/components/ui/tab-shell';
import { WORKFLOW_TEMPLATES } from '@/lib/workflows/workflow-templates';
import type { WorkflowRule, WorkflowAction } from '@/lib/workflows/workflow-rule-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowRun {
  id: string;
  workflow_type: string;
  status: string;
  current_step: number;
  total_steps: number;
  started_at: string;
  completed_at: string | null;
  context: Record<string, unknown>;
}

interface ParseResponse {
  rule: Partial<WorkflowRule>;
  confidence: number;
  needsReview: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function triggerBadgeVariant(type: string) {
  switch (type) {
    case 'event': return 'default' as const;
    case 'schedule': return 'secondary' as const;
    case 'condition': return 'outline' as const;
    default: return 'outline' as const;
  }
}

function triggerIcon(type: string) {
  switch (type) {
    case 'event': return <IconBolt size={12} />;
    case 'schedule': return <IconCalendarEvent size={12} />;
    case 'condition': return <IconFilter size={12} />;
    default: return <IconBolt size={12} />;
  }
}

// ---------------------------------------------------------------------------
// Rule Card
// ---------------------------------------------------------------------------

function RuleCard({
  rule,
  onToggle,
  onDelete,
  onExpand,
  expanded,
}: {
  rule: WorkflowRule;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onExpand: (id: string) => void;
  expanded: boolean;
}) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Fetch runs when expanded
  useEffect(() => {
    if (!expanded) return;
    setLoadingRuns(true);
    fetch(`/api/workflows/${rule.id}/runs`)
      .then(r => r.json())
      .then(data => setRuns(data.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setLoadingRuns(false));
  }, [expanded, rule.id]);

  // DB row has trigger_type as a column; interface has trigger.type
  const triggerType = (rule as unknown as Record<string, unknown>).trigger_type as string
    ?? rule.trigger?.type
    ?? 'event';

  return (
    <>
      <Card
        className="transition-colors hover:bg-accent/50 cursor-pointer"
        onClick={() => onExpand(rule.id)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CardTitle className="text-sm font-medium truncate">{rule.name}</CardTitle>
              <Badge variant={triggerBadgeVariant(triggerType)} className="shrink-0 gap-1">
                {triggerIcon(triggerType)}
                {triggerType}
              </Badge>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-xs text-muted-foreground tabular-nums">
                {rule.trigger_count ?? 0} runs
              </span>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => {
                  onToggle(rule.id, checked);
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Toggle ${rule.name}`}
              />
            </div>
          </div>
          <CardDescription className="line-clamp-2 text-xs">
            {rule.description}
          </CardDescription>
          {rule.last_triggered_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Last triggered {relativeTime(rule.last_triggered_at)}
            </p>
          )}
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0 space-y-4" onClick={(e) => e.stopPropagation()}>
            <Separator />

            {/* Actions list */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Actions</h4>
              <div className="space-y-1.5">
                {(rule.actions as WorkflowAction[] ?? []).map((action, i) => (
                  <div key={action.step_id ?? i} className="flex items-center gap-2 text-xs">
                    <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                      {i + 1}
                    </span>
                    <span className="truncate">{action.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {action.tool_group}
                    </Badge>
                  </div>
                ))}
                {(!rule.actions || (rule.actions as WorkflowAction[]).length === 0) && (
                  <p className="text-xs text-muted-foreground">No actions configured</p>
                )}
              </div>
            </div>

            {/* Run history */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Recent Runs</h4>
              {loadingRuns ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : runs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No runs yet</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {runs.slice(0, 10).map(run => (
                    <div key={run.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          {run.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          Step {run.current_step}/{run.total_steps}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {relativeTime(run.started_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="flex justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <IconTrash size={14} className="mr-1" />
                Delete
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workflow rule</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{rule.name}&quot; and cancel any active runs.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(rule.id);
                setDeleteOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Template Gallery
// ---------------------------------------------------------------------------

function TemplateGallery({
  onSelect,
}: {
  onSelect: (description: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <IconTemplate size={16} />
        Template Gallery
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORKFLOW_TEMPLATES.map(tpl => (
          <Card key={tpl.id} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => onSelect(tpl.naturalLanguage)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium">{tpl.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{tpl.description}</p>
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={(e) => { e.stopPropagation(); onSelect(tpl.naturalLanguage); }}>
                Use Template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Tab
// ---------------------------------------------------------------------------

function WorkflowsTab() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [templateDescription, setTemplateDescription] = useState('');

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      setRules(data.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    // Optimistic update
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));

    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        // Revert on error
        setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
      }
    } catch {
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));

    try {
      await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    } catch {
      // Refetch on error
      fetchRules();
    }
  }, [fetchRules]);

  const handleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleTemplateSelect = useCallback((desc: string) => {
    setTemplateDescription(desc);
    setShowCreator(true);
  }, []);

  if (loading) {
    return (
      <TabShell>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </TabShell>
    );
  }

  if (error) {
    return (
      <TabShell>
        <Empty className="py-12">
          <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDesc>{error}</EmptyDesc>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => { setError(null); setLoading(true); fetchRules(); }}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      </TabShell>
    );
  }

  return (
    <TabShell>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Rules</h2>
          <p className="text-sm text-muted-foreground">
            Automate actions with natural language rules
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreator(prev => !prev)}
        >
          {showCreator ? (
            <><IconChevronUp size={14} className="mr-1" /> Hide Creator</>
          ) : (
            <><IconPlus size={14} className="mr-1" /> New Workflow</>
          )}
        </Button>
      </div>

      {/* NL Creator */}
      {showCreator && (
        <NLCreatorWithTemplate
          templateDescription={templateDescription}
          onClearTemplate={() => setTemplateDescription('')}
          onCreated={() => {
            fetchRules();
            setShowCreator(false);
          }}
        />
      )}

      {/* Rule List */}
      {rules.length === 0 ? (
        <Empty className="py-12" role="status">
          <EmptyMedia variant="icon"><IconBolt size={20} /></EmptyMedia>
          <EmptyTitle>No workflow rules yet</EmptyTitle>
          <EmptyDesc>
            Create your first automation by describing it in plain English
          </EmptyDesc>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreator(true)}>
              <IconPlus size={14} className="mr-1" />
              Create Workflow
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onExpand={handleExpand}
              expanded={expandedId === rule.id}
            />
          ))}
        </div>
      )}

      <Separator />

      {/* Template Gallery */}
      <TemplateGallery onSelect={handleTemplateSelect} />
    </TabShell>
  );
}

/**
 * NLCreator wrapper that accepts a template description to pre-fill
 */
function NLCreatorWithTemplate({
  templateDescription,
  onClearTemplate,
  onCreated,
}: {
  templateDescription: string;
  onClearTemplate: () => void;
  onCreated: () => void;
}) {
  const [description, setDescription] = useState(templateDescription);
  const [creating, setCreating] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync template description changes
  useEffect(() => {
    if (templateDescription) {
      setDescription(templateDescription);
      onClearTemplate();
    }
  }, [templateDescription, onClearTemplate]);

  const handleCreate = useCallback(async () => {
    if (!description.trim()) return;
    setCreating(true);
    setError(null);
    setParseResult(null);

    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = await res.json() as ParseResponse;

      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Failed to create workflow');
        return;
      }

      setParseResult(data);

      if (!data.needsReview) {
        setDescription('');
        onCreated();
      }
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  }, [description, onCreated]);

  const handleConfirm = useCallback(async () => {
    if (!parseResult?.rule) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          name: parseResult.rule.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create workflow');
        return;
      }

      setDescription('');
      setParseResult(null);
      onCreated();
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  }, [parseResult, description, onCreated]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconPlus size={16} />
          New Workflow Rule
        </CardTitle>
        <CardDescription className="text-xs">
          Describe your automation in plain English
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder="When a new lead comes in, research their company and draft an intro email..."
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setParseResult(null);
            setError(null);
          }}
          rows={3}
          className="resize-none"
        />

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <IconAlertCircle size={12} />
            {error}
          </p>
        )}

        {parseResult && parseResult.needsReview && (
          <Card className="bg-muted/50">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">{parseResult.rule.name}</p>
                <Badge variant="secondary" className="text-[10px]">
                  Confidence: {Math.round((parseResult.confidence ?? 0) * 100)}%
                </Badge>
              </div>

              {parseResult.rule.trigger && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {triggerIcon(parseResult.rule.trigger.type)}
                  <span>Trigger: {parseResult.rule.trigger.type}</span>
                  {parseResult.rule.trigger.event && (
                    <Badge variant="outline" className="text-[10px]">{parseResult.rule.trigger.event}</Badge>
                  )}
                </div>
              )}

              {parseResult.rule.actions && (parseResult.rule.actions as WorkflowAction[]).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">Actions:</p>
                  {(parseResult.rule.actions as WorkflowAction[]).map((a, i) => (
                    <p key={a.step_id ?? i} className="text-xs pl-3">
                      {i + 1}. {a.name}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleConfirm} disabled={creating}>
                  <IconCheck size={14} className="mr-1" />
                  Confirm & Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setParseResult(null)}
                >
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {parseResult && !parseResult.needsReview && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <IconCheck size={12} />
            Workflow created and activated
          </p>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || !description.trim()}
          >
            {creating ? 'Parsing...' : 'Create'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default React.memo(WorkflowsTab);
