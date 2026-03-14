'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SFXmark, SFPerson, SFBriefcase, SFDocument, SFCheckmarkSquare, SFDollarsignCircle } from 'sf-symbols-lib';

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
  contact: SFPerson,
  project: SFBriefcase,
  invoice: SFDocument,
  task: SFCheckmarkSquare,
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

// ─── Avatar ───────────────────────────────────────────────────────────────

function ContactAvatar({ meta, size = 40 }: { meta: Record<string, unknown>; size?: number }) {
  const avatarUrl = meta.avatar_url as string | undefined;
  const name = String(meta.name ?? 'U');
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 600,
        flexShrink: 0,
        background: 'rgba(96, 165, 250, 0.15)',
        color: '#60a5fa',
      }}
    >
      {initials}
    </div>
  );
}

// ─── Detail Sections ───────────────────────────────────────────────────────

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
            <SFDollarsignCircle size={14} className="text-muted-foreground" />
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
  const dialogRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!entityId || !entityType) return;
    setLoading(true);

    try {
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

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Trap scroll inside the modal — prevent scroll from leaking to body
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleWheel = (e: WheelEvent) => {
      const scrollContainer = dialog.querySelector('[data-scroll-content]') as HTMLElement | null;
      if (!scrollContainer) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;

      // Only prevent default when scroll would leak outside the container
      if (atTop || atBottom) {
        e.preventDefault();
      }
    };

    dialog.addEventListener('wheel', handleWheel, { passive: false });
    return () => dialog.removeEventListener('wheel', handleWheel);
  }, [open]);

  const Icon = TYPE_ICON[entityType] ?? SFBriefcase;
  const isContact = entityType === 'contact';
  const contactName = entity?.metadata?.name ? String(entity.metadata.name) : null;
  const contactType = entity?.metadata?.type ? String(entity.metadata.type) : null;

  if (!open) return null;

  return (
    <>
      {/* Backdrop — fixed overlay, click to dismiss */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'modalFadeIn 200ms ease-out',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal container — fixed, centered, scroll-isolated */}
      <div
        ref={dialogRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={isContact && contactName ? `${contactName} details` : 'Entity details'}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 560,
            maxHeight: 'min(80vh, 640px)',
            borderRadius: 20,
            background: 'rgba(15, 20, 30, 0.92)',
            backdropFilter: 'blur(24px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            display: 'flex',
            flexDirection: 'column' as const,
            overflow: 'hidden',
            pointerEvents: 'auto',
            animation: 'modalEnter 200ms ease-out',
          }}
        >
          {/* Header — non-scrollable */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
            padding: '16px 20px',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              {isContact && entity ? (
                <ContactAvatar meta={entity.metadata} size={36} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${TYPE_COLOR[entityType]}20`,
                    color: TYPE_COLOR[entityType],
                  }}
                >
                  <Icon size={20} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {isContact && contactName ? contactName : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Details`}
                </span>
                {isContact && contactType && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: TYPE_COLOR[entityType],
                    textTransform: 'capitalize',
                  }}>
                    {contactType}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                borderRadius: 10,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 200ms',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="Close modal"
            >
              <SFXmark size={18} />
            </button>
          </div>

          {/* Scrollable content — isolated scroll container */}
          <div
            data-scroll-content
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              padding: '16px 20px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {loading ? (
              <div style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                <div style={{
                  height: 24,
                  width: 192,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  marginBottom: '16px',
                }} />
                <div style={{
                  height: 16,
                  width: 128,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  marginBottom: '16px',
                }} />
                <div style={{
                  height: 16,
                  width: 256,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                }} />
              </div>
            ) : (
              <>
                {/* Entity-specific detail (contacts show name/type in header) */}
                {entity && !isContact && (
                  <>
                    {entityType === 'project' && <ProjectDetail meta={entity.metadata} />}
                    {entityType === 'invoice' && <InvoiceDetail meta={entity.metadata} />}
                    {entityType === 'task' && <TaskDetail meta={entity.metadata} />}
                  </>
                )}

                {/* Related Entities */}
                {related.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h3 style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      margin: 0,
                    }}>
                      Related ({related.length})
                    </h3>
                    {related.map(({ node, edge }) => {
                      const RelIcon = TYPE_ICON[node.type] ?? SFBriefcase;
                      return (
                        <div
                          key={`${node.type}-${node.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderRadius: 12,
                            padding: '10px 14px',
                            background: 'rgba(20, 28, 40, 0.5)',
                            border: '1px solid rgba(255, 255, 255, 0.03)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              backgroundColor: `${TYPE_COLOR[node.type] ?? '#888'}20`,
                              color: TYPE_COLOR[node.type] ?? '#888',
                              flexShrink: 0,
                            }}
                          >
                            <RelIcon size={14} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {node.label}
                            </div>
                            <div style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              textTransform: 'capitalize',
                            }}>
                              {edge?.relationshipType?.replace(/_/g, ' ') ?? node.type}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Timeline */}
                {timeline.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h3 style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      margin: 0,
                    }}>
                      Timeline
                    </h3>
                    {timeline.map((event) => (
                      <div
                        key={event.id}
                        style={{
                          display: 'flex',
                          gap: '10px',
                          borderRadius: 12,
                          padding: '10px 14px',
                          background: 'rgba(20, 28, 40, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        <div style={{
                          marginTop: 5,
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--bb-cyan)',
                          flexShrink: 0,
                        }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: 13,
                            color: 'var(--text-primary)',
                          }}>
                            {formatEventType(event.eventType)}
                          </div>
                          <div style={{
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                          }}>
                            {formatDate(event.occurredAt)}
                            {event.channelSource && ` via ${event.channelSource}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!entity && !loading && (
                  <p style={{
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    padding: '32px 0',
                  }}>
                    Entity not found.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalEnter {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
}

export default React.memo(EntityDetailDrawer);
export { EntityDetailDrawer };
