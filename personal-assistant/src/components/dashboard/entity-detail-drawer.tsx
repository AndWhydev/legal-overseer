'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, User, Briefcase, FileText, CheckSquare, Mail, Phone, Calendar, DollarSign } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

type EntityType = 'contact' | 'project' | 'invoice' | 'task';

interface EntityDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  entityType: EntityType;
  entityId: string;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: string;
  channelSource: string | null;
}

interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relationshipType: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_ICON: Record<EntityType, React.ElementType> = {
  contact: User,
  project: Briefcase,
  invoice: FileText,
  task: CheckSquare,
};

const TYPE_COLOR: Record<EntityType, string> = {
  contact: '#60a5fa',
  project: '#34d399',
  invoice: '#f59e0b',
  task: '#a78bfa',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Detail Sections ───────────────────────────────────────────────────────

function ContactDetail({ meta }: { meta: Record<string, unknown> }) {
  const emails = (meta.emails as string[] | undefined) ?? [];
  const phones = (meta.phones as string[] | undefined) ?? [];
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</h3>
      {meta.name ? <div className="text-lg font-medium">{String(meta.name)}</div> : null}
      {meta.type ? <div className="text-sm text-muted-foreground capitalize">{String(meta.type)}</div> : null}
      {emails.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Mail size={14} className="text-muted-foreground" />
          <span>{emails.join(', ')}</span>
        </div>
      )}
      {phones.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Phone size={14} className="text-muted-foreground" />
          <span>{phones.join(', ')}</span>
        </div>
      )}
      {meta.created_at ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar size={14} />
          <span>Added {formatDate(String(meta.created_at))}</span>
        </div>
      ) : null}
    </div>
  );
}

function ProjectDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Project</h3>
      {meta.name ? <div className="text-lg font-medium">{String(meta.name)}</div> : null}
      {meta.status ? (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--bg-elevated)] capitalize">
          {String(meta.status)}
        </span>
      ) : null}
      {meta.description ? <p className="text-sm text-muted-foreground">{String(meta.description)}</p> : null}
    </div>
  );
}

function InvoiceDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoice</h3>
      {meta.invoice_number ? <div className="text-lg font-medium">{String(meta.invoice_number)}</div> : null}
      <div className="flex items-center gap-4">
        {meta.status ? (
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--bg-elevated)] capitalize">
            {String(meta.status)}
          </span>
        ) : null}
        {meta.amount != null ? (
          <div className="flex items-center gap-1 text-sm">
            <DollarSign size={14} className="text-muted-foreground" />
            <span>{Number(meta.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
          </div>
        ) : null}
      </div>
      {meta.due_date ? (
        <div className="text-sm text-muted-foreground">Due: {formatDate(String(meta.due_date))}</div>
      ) : null}
    </div>
  );
}

function TaskDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Task</h3>
      {meta.title ? <div className="text-lg font-medium">{String(meta.title)}</div> : null}
      <div className="flex items-center gap-3">
        {meta.status ? (
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--bg-elevated)] capitalize">
            {String(meta.status)}
          </span>
        ) : null}
        {meta.priority ? (
          <span className="text-xs text-muted-foreground capitalize">{String(meta.priority)} priority</span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main Drawer ───────────────────────────────────────────────────────────

function EntityDetailDrawer({ open, onClose, entityType, entityId }: EntityDetailDrawerProps) {
  const [entity, setEntity] = useState<GraphNode | null>(null);
  const [related, setRelated] = useState<{ node: GraphNode; edge: GraphEdge }[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!entityId || !entityType) return;
    setLoading(true);

    try {
      // Fetch graph + timeline in parallel
      const [graphRes, timelineRes] = await Promise.all([
        fetch(`/api/knowledge/graph?entity_type=${entityType}&entity_id=${entityId}`).then((r) => r.json()),
        fetch(`/api/activity?entity_type=${entityType}&entity_id=${entityId}`).then((r) => r.json()).catch(() => ({ events: [] })),
      ]);

      const graph = graphRes.graph;
      if (graph?.nodes?.length > 0) {
        setEntity(graph.nodes[0]);
        setRelated(
          graph.nodes.slice(1).map((node: GraphNode) => ({
            node,
            edge: graph.edges.find((e: GraphEdge) => e.target === node.id || e.source === node.id),
          }))
        );
      }

      setTimeline((timelineRes.events ?? []).slice(0, 20));
    } catch {
      setEntity(null);
      setRelated([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const Icon = TYPE_ICON[entityType] ?? Briefcase;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-[var(--bg-primary)] border-l border-[var(--border-primary)] shadow-2xl transition-transform duration-300 ease-out"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Entity details"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${TYPE_COLOR[entityType]}20`, color: TYPE_COLOR[entityType] }}
            >
              <Icon size={20} />
            </div>
            <span className="text-sm font-medium capitalize">{entityType} Details</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-5">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-48 rounded bg-[var(--bg-elevated)]" />
              <div className="h-4 w-32 rounded bg-[var(--bg-elevated)]" />
              <div className="h-4 w-64 rounded bg-[var(--bg-elevated)]" />
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Entity-specific detail */}
            {entity && (
              <>
                {entityType === 'contact' && <ContactDetail meta={entity.metadata} />}
                {entityType === 'project' && <ProjectDetail meta={entity.metadata} />}
                {entityType === 'invoice' && <InvoiceDetail meta={entity.metadata} />}
                {entityType === 'task' && <TaskDetail meta={entity.metadata} />}
              </>
            )}

            {/* Related Entities */}
            {related.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Related ({related.length})
                </h3>
                <div className="space-y-2">
                  {related.map(({ node, edge }) => {
                    const RelIcon = TYPE_ICON[node.type] ?? Briefcase;
                    return (
                      <div
                        key={`${node.type}-${node.id}`}
                        className="flex items-center gap-3 rounded-lg p-2.5 bg-[var(--bg-elevated)]"
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${TYPE_COLOR[node.type] ?? '#888'}20`, color: TYPE_COLOR[node.type] ?? '#888' }}
                        >
                          <RelIcon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{node.label}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {edge?.relationshipType?.replace(/_/g, ' ') ?? node.type}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Timeline
                </h3>
                <div className="space-y-2">
                  {timeline.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 rounded-lg p-2.5 bg-[var(--bg-elevated)]"
                    >
                      <div className="mt-0.5 h-2 w-2 rounded-full bg-[var(--bb-cyan)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{formatEventType(event.eventType)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(event.occurredAt)}
                          {event.channelSource && ` via ${event.channelSource}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!entity && !loading && (
              <p className="text-sm text-muted-foreground text-center py-8">Entity not found.</p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

export default React.memo(EntityDetailDrawer);
export { EntityDetailDrawer };
