'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Search, User, Briefcase, FileText, CheckSquare, ChevronRight, X, Book } from 'lucide-react';
import { S, C } from '@/lib/styles/design-tokens';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import type { GraphNode as ViewerNode, GraphEdge as ViewerEdge } from '@/components/knowledge/graph-viewer';

const GraphViewer = dynamic(() => import('@/components/knowledge/graph-viewer'), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────

type EntityType = 'contact' | 'project' | 'invoice' | 'task';

interface SearchResult {
  id: string;
  type: EntityType;
  label: string;
  snippet: string;
  metadata: Record<string, unknown>;
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
  strength: number;
  lastEvidenceAt: string;
}

interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Icon Map ──────────────────────────────────────────────────────────────

const TYPE_ICON: Record<EntityType, React.ElementType> = {
  contact: User,
  project: Briefcase,
  invoice: FileText,
  task: CheckSquare,
};

// Muted color palette for entity types (desaturated versions)
const TYPE_COLOR: Record<EntityType, string> = {
  contact: '#6b8fc9',    // muted blue
  project: '#4ba383',    // muted green
  invoice: '#c4934a',    // muted amber
  task: '#9b88b8',       // muted purple
};

// ─── Style Constants ───────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  ...S.card,
};

const glassInput: React.CSSProperties = {
  ...S.input,
  padding: '12px 16px',
  paddingLeft: '40px',
  borderRadius: 12,
};

const listRow: React.CSSProperties = {
  ...S.listRow,
};

const ghostBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonGhost,
  padding: '8px 8px',
  borderRadius: 8,
  height: 'auto',
  display: 'flex',
  justifyContent: 'center',
};

const pillBtn: React.CSSProperties = {
  ...S.pill,
  padding: '8px 16px',
  borderRadius: 20,
  height: 'auto',
  fontWeight: 500,
};

const sectionHeader: React.CSSProperties = {
  ...S.sectionLabel,
};

// ─── Component ─────────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: EntityType; id: string } | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [hoveredResult, setHoveredResult] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [closeHovered, setCloseHovered] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Entity Graph — full org graph loaded on mount
  const [graphNodes, setGraphNodes] = useState<ViewerNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<ViewerEdge[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/knowledge/graph?format=nodes');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setGraphNodes(data.nodes ?? []);
          setGraphEdges(data.edges ?? []);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGraphNodeClick = useCallback((node: ViewerNode) => {
    // Extract entity type and id from node id format "type:uuid"
    const [type, ...rest] = node.id.split(':');
    const id = rest.join(':');
    const entityType = type === 'person' ? 'contact' : type as EntityType;
    if (!id) return;
    setSelectedEntity({ type: entityType, id });
    setLoadingGraph(true);
    fetch(`/api/knowledge/graph?entity_type=${entityType}&entity_id=${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setGraph(data.graph ?? null))
      .catch(() => setGraph(null))
      .finally(() => setLoadingGraph(false));
  }, []);

  // Search with debounce
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/knowledge/graph?search=${encodeURIComponent(value)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Load graph for selected entity
  const selectEntity = useCallback(async (type: EntityType, id: string) => {
    setSelectedEntity({ type, id });
    setLoadingGraph(true);
    try {
      const res = await fetch(`/api/knowledge/graph?entity_type=${type}&entity_id=${id}`);
      const data = await res.json();
      setGraph(data.graph ?? null);
    } catch {
      setGraph(null);
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntity(null);
    setGraph(null);
  }, []);

  return (
    <TabShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px' }}>
        {/* ─── Entity Graph ───────────────────────────────────────────────────── */}
        <div style={glassCard}>
          <div style={{ ...sectionHeader, marginBottom: 12 }}>Entity Graph</div>
          {graphLoading ? (
            <div style={{
              height: 420,
              borderRadius: 12,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.02) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease infinite',
            }} />
          ) : graphNodes.length > 0 ? (
            <GraphViewer
              nodes={graphNodes}
              edges={graphEdges}
              onNodeClick={handleGraphNodeClick}
              height={420}
            />
          ) : (
            <div style={{
              height: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text-dim)',
              fontSize: 14,
            }}>
              <Book size={28} style={{ opacity: 0.4 }} />
              No entities yet. Add contacts and relationships to build the knowledge graph.
            </div>
          )}
        </div>

        {/* ─── Search Bar ───────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search contacts, projects, invoices, tasks..."
            style={glassInput}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = C.borderFocus;
              e.currentTarget.style.boxShadow = `0 0 0 2px ${C.bgHoverStrong}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = C.borderSubtle;
              e.currentTarget.style.boxShadow = 'var(--glass-card-inset)';
            }}
          />
          {searching && (
            <div
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${C.borderHover}`,
                  borderTopColor: '#F1F5F9',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            </div>
          )}
        </div>

        {/* ─── Selected Entity Graph ─────────────────────────────────────────────── */}
        {selectedEntity && (
          <div style={glassCard}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Relationship Graph
              </h2>
              <button
                onClick={clearSelection}
                onMouseEnter={() => setCloseHovered(true)}
                onMouseLeave={() => setCloseHovered(false)}
                style={{
                  ...ghostBtn,
                  background: closeHovered ? 'var(--glass-interactive-bg)' : 'transparent',
                  borderColor: closeHovered ? C.borderHover : C.borderVisible,
                }}
                aria-label="Close graph"
              >
                <X size={18} />
              </button>
            </div>

            {loadingGraph ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 60,
                      borderRadius: 12,
                      background:
                        'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s ease infinite',
                    }}
                  />
                ))}
              </div>
            ) : graph ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Root Entity */}
                {graph.nodes.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: 'var(--glass-pill-bg)',
                      backdropFilter: 'var(--glass-blur)',
                      WebkitBackdropFilter: 'var(--glass-blur)',
                      border: 'none',
                      boxShadow: 'var(--glass-card-inset)',
                    }}
                  >
                    {(() => {
                      const root = graph.nodes[0];
                      const Icon = TYPE_ICON[root.type] ?? Briefcase;
                      const color = TYPE_COLOR[root.type] ?? '#888';
                      return (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              backgroundColor: `${color}20`,
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={20} style={{ color }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                margin: 0,
                              }}
                            >
                              {root.label}
                            </div>
                            <div
                              style={{
                                fontSize: 14,
                                color: 'var(--text-secondary)',
                                marginTop: 4,
                                textTransform: 'capitalize',
                              }}
                            >
                              {root.type}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Connected Entities Pills */}
                {graph.nodes.length > 1 && (
                  <div>
                    <div style={sectionHeader}>Connected Entities</div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      {graph.nodes.slice(1).map((node) => {
                        const Icon = TYPE_ICON[node.type] ?? Briefcase;
                        const color = TYPE_COLOR[node.type] ?? '#888';
                        const edge = graph.edges.find(
                          (e) => e.target === node.id || e.source === node.id
                        );
                        const isHovered = hoveredNode === `${node.type}-${node.id}`;

                        return (
                          <button
                            key={`${node.type}-${node.id}`}
                            onClick={() => selectEntity(node.type, node.id)}
                            onMouseEnter={() => setHoveredNode(`${node.type}-${node.id}`)}
                            onMouseLeave={() => setHoveredNode(null)}
                            style={{
                              ...pillBtn,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                              background: isHovered
                                ? C.bgHoverStrong
                                : 'var(--glass-pill-bg)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 20,
                                height: 20,
                                borderRadius: 8,
                                backgroundColor: `${color}20`,
                                flexShrink: 0,
                              }}
                            >
                              <Icon size={14} style={{ color }} />
                            </div>
                            <span style={{ whiteSpace: 'nowrap', fontSize: 14 }}>{node.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Relationships List */}
                {graph.edges.length > 0 && (
                  <div>
                    <div style={sectionHeader}>Relationships</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {graph.edges.map((edge, idx) => {
                        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
                        const targetNode = graph.nodes.find((n) => n.id === edge.target);

                        return (
                          <div
                            key={idx}
                            style={{
                              ...listRow,
                              background: hoveredNode === `edge-${idx}` ? 'var(--bb-surface-hover)' : 'var(--glass-pill-bg)',
                            }}
                            onMouseEnter={() => setHoveredNode(`edge-${idx}`)}
                            onMouseLeave={() => setHoveredNode(null)}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                  marginBottom: 4,
                                }}
                              >
                                {sourceNode?.label ?? edge.source}
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  color: 'var(--text-secondary)',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {edge.relationshipType?.replace(/_/g, ' ') ?? 'Related'} (strength:{' '}
                                {(edge.strength * 100).toFixed(0)}%)
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 14,
                                color: 'var(--text-dim)',
                                flexShrink: 0,
                                marginLeft: 12,
                              }}
                            >
                              → {targetNode?.label ?? edge.target}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {graph.nodes.length <= 1 && graph.edges.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px 20px',
                      gap: 12,
                    }}
                  >
                    <ChevronRight size={32} style={{ color: 'var(--text-dim)' }} />
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                      No connected entities found.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  gap: 12,
                }}
              >
                <FileText size={32} style={{ color: 'var(--text-dim)' }} />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Could not load graph data.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ─── Search Results ───────────────────────────────────────────────────── */}
        {!selectedEntity && results.length > 0 && (
          <div>
            <div style={sectionHeader}>Search Results</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
              }}
            >
              {results.map((result) => {
                const Icon = TYPE_ICON[result.type] ?? Briefcase;
                const color = TYPE_COLOR[result.type] ?? '#888';
                const isHovered = hoveredResult === `${result.type}-${result.id}`;

                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => selectEntity(result.type, result.id)}
                    onMouseEnter={() => setHoveredResult(`${result.type}-${result.id}`)}
                    onMouseLeave={() => setHoveredResult(null)}
                    style={{
                      ...glassCard,
                      textAlign: 'left',
                      background: isHovered
                        ? 'var(--glass-card-bg)'
                        : 'var(--glass-card-bg-light)',
                      border: isHovered
                        ? '1px solid var(--glass-interactive-border)'
                        : '1px solid var(--glass-card-border)',
                      boxShadow: isHovered
                        ? `inset 0 1px 0 ${C.borderHover}, 0 0 0 1px ${C.borderHover}`
                        : 'var(--glass-card-inset)',
                      cursor: 'pointer',
                      transition: 'all 200ms',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 36,
                          height: 36,
                          borderRadius: 12,
                          backgroundColor: `${color}20`,
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} style={{ color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {result.label}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            color: 'var(--text-secondary)',
                            marginTop: 4,
                            textTransform: 'capitalize',
                          }}
                        >
                          {result.type}
                        </div>
                      </div>
                    </div>
                    {result.snippet && (
                      <p
                        style={{
                          fontSize: 14,
                          color: 'var(--text-secondary)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {result.snippet}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Empty States ──────────────────────────────────────────────────────── */}
        {!selectedEntity && !searching && query && results.length === 0 && (
          <EmptyState
            title={`No results for "${query}"`}
            description="Try searching for contacts, projects, invoices, or tasks."
          />
        )}

        {!selectedEntity && !query && (
          <EmptyState
            title="Search the knowledge base"
            description="Find contacts, projects, invoices, and tasks to see how they connect across the organisation."
          />
        )}
      </div>

      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes shimmer {
          from {
            background-position: 200% 0;
          }
          to {
            background-position: -200% 0;
          }
        }
      `}</style>
    </TabShell>
  );
}

export default React.memo(KnowledgeTab);
