'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Search, Brain, Lightbulb, DollarSign, Users, MessageSquare,
  TrendingUp, Shield, Clock, ChevronRight, Trash2, Plus,
  BarChart3, AlertTriangle,
} from 'lucide-react';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { S, C } from '@/lib/styles/design-tokens'

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  memory_type: string;
  title: string;
  content: string;
  confidence: number;
  entity_ids: string[];
  entity_names: string[];
  occurred_at: string;
  source_type: string;
  type_metadata: Record<string, unknown>;
  rank?: number;
}

interface Decision {
  id: string;
  decision_summary: string;
  reasoning_chain: string;
  domain: string | null;
  outcome_status: string;
  outcome_notes: string | null;
  lesson_learned: string | null;
  decided_at: string;
  participants: string[];
  memory?: MemoryEntry;
}

interface MemoryStats {
  totalActive: number;
  totalArchived: number;
  byType: Record<string, number>;
  avgConfidence: number;
  confidenceDistribution: { high: number; medium: number; low: number };
  recentDecisions: number;
}

// ─── Style Constants ────────────────────────────────────────────────────────

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
  padding: '12px 16px',
  paddingLeft: '40px',
  borderRadius: 12,
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  border: '1px solid var(--glass-interactive-border)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};

const badge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
};

// ─── Memory Type Config ─────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  conversation: { icon: MessageSquare, color: '#3B82F6', label: 'Conversation' },
  decision: { icon: Lightbulb, color: '#F59E0B', label: 'Decision' },
  pattern: { icon: TrendingUp, color: '#8B5CF6', label: 'Pattern' },
  fact: { icon: Brain, color: '#22C55E', label: 'Fact' },
  relationship: { icon: Users, color: '#EC4899', label: 'Relationship' },
  pricing: { icon: DollarSign, color: '#F1F5F9', label: 'Pricing' },
  lesson_learned: { icon: Shield, color: '#14B8A6', label: 'Lesson' },
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.7 ? '#22C55E' : value > 0.3 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 60,
        height: 4,
        borderRadius: 2,
        background: 'var(--hover-bg-strong)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 2,
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ fontSize: 14, color: C.textPlaceholder }}>{pct}%</span>
    </div>
  );
}

function MemoryCard({ memory }: { memory: MemoryEntry }) {
  const config = TYPE_CONFIG[memory.memory_type] ?? TYPE_CONFIG.fact;
  const Icon = config.icon;
  const date = new Date(memory.occurred_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div style={{
      ...glassCard,
      padding: '14px 16px',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: `${config.color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={16} color={config.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            ...badge,
            background: `${config.color}18`,
            color: config.color,
          }}>
            {config.label}
          </span>
          <span style={{ fontSize: 14, color: C.textDim }}>{date}</span>
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}>
          {memory.title}
        </div>
        <div style={{
          fontSize: 14,
          color: C.textSecondary,
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {memory.content}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <ConfidenceBar value={memory.confidence} />
          {memory.entity_names.length > 0 && (
            <span style={{ fontSize: 14, color: C.textDim }}>
              {memory.entity_names.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ stats }: { stats: MemoryStats | null }) {
  if (!stats) return null;

  const items = [
    { label: 'Active Memories', value: stats.totalActive, icon: Brain, color: '#22C55E' },
    { label: 'Avg Confidence', value: `${Math.round(stats.avgConfidence * 100)}%`, icon: BarChart3, color: '#3B82F6' },
    { label: 'Recent Decisions', value: stats.recentDecisions, icon: Lightbulb, color: '#F59E0B' },
    { label: 'Archived', value: stats.totalArchived, icon: Clock, color: C.textDim },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {items.map(item => {
        const Icon = item.icon;
        return (
          <div key={item.label} style={{ ...glassCard, padding: '14px 16px', textAlign: 'center' as const }}>
            <Icon size={18} color={item.color} style={{ marginBottom: 6 }} />
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>
              {item.value}
            </div>
            <div style={{ fontSize: 14, color: C.textPlaceholder, marginTop: 2 }}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypeFilter({
  activeType,
  onTypeChange,
  counts,
}: {
  activeType: string | null;
  onTypeChange: (type: string | null) => void;
  counts: Record<string, number>;
}) {
  const types = Object.entries(TYPE_CONFIG);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
      <button
        onClick={() => onTypeChange(null)}
        style={{
          ...badge,
          background: !activeType ? '#F1F5F9' : 'var(--hover-bg-strong)',
          color: !activeType ? '#0a0f1a' : C.textSecondary,
          cursor: 'pointer',
          border: 'none',
          padding: '4px 12px',
        }}
      >
        All
      </button>
      {types.map(([key, config]) => (
        <button
          key={key}
          onClick={() => onTypeChange(activeType === key ? null : key)}
          style={{
            ...badge,
            background: activeType === key ? `${config.color}30` : 'var(--hover-bg-strong)',
            color: activeType === key ? config.color : C.textPlaceholder,
            cursor: 'pointer',
            border: 'none',
            padding: '4px 12px',
          }}
        >
          {config.label} {counts[key] ? `(${counts[key]})` : ''}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function MemoryPalaceTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'search' | 'decisions'>('search');

  // Load stats on mount
  useEffect(() => {
    fetch('/api/memory-palace?view=stats')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setStats(data);
      })
      .catch(() => {});
  }, []);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/memory-palace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: searchQuery,
          memoryType: activeType ?? undefined,
        }),
      });
      const data = await res.json();
      setMemories(data.results ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeType]);

  // Search on Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  return (
    <TabShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={22} color="var(--text-primary, #F1F5F9)" />
            <h2 style={{
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}>
              Memory Palace
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setView('search')}
              style={{
                ...badge,
                background: view === 'search' ? '#F1F5F9' : 'var(--hover-bg-strong)',
                color: view === 'search' ? '#0a0f1a' : C.textSecondary,
                cursor: 'pointer',
                border: 'none',
                padding: '4px 12px',
                fontSize: 14,
              }}
            >
              Search
            </button>
            <button
              onClick={() => setView('decisions')}
              style={{
                ...badge,
                background: view === 'decisions' ? '#F1F5F9' : 'var(--hover-bg-strong)',
                color: view === 'decisions' ? '#0a0f1a' : C.textSecondary,
                cursor: 'pointer',
                border: 'none',
                padding: '4px 12px',
                fontSize: 14,
              }}
            >
              Decisions
            </button>
          </div>
        </div>

        {/* Stats */}
        <StatsCard stats={stats} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            color="rgba(255,255,255,0.35)"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Search memories... (e.g., 'pricing for WordPress builds')"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={glassInput}
          />
        </div>

        {/* Type Filter */}
        <TypeFilter
          activeType={activeType}
          onTypeChange={setActiveType}
          counts={stats?.byType ?? {}}
        />

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 32, color: C.textDim }}>
              Searching memories...
            </div>
          )}
          {!loading && memories.length === 0 && searchQuery && (
            <EmptyState
              title="No memories found"
              description="Try different keywords or broaden your search"
            />
          )}
          {!loading && memories.length === 0 && !searchQuery && (
            <EmptyState
              title="Institutional Memory"
              description="Search across all conversations, decisions, pricing history, and lessons learned"
            />
          )}
          {memories.map(mem => (
            <MemoryCard key={mem.id} memory={mem} />
          ))}
        </div>
      </div>
    </TabShell>
  );
}

export default MemoryPalaceTab;
