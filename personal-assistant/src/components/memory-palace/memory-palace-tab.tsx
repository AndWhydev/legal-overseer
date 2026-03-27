'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  IconSearch, IconBrain, IconBulb, IconCurrencyDollar, IconUsers, IconMessage,
  IconTrendingUp, IconShield, IconClock, IconChevronRight, IconTrash, IconPlus,
  IconChartBar, IconAlertTriangle,
} from '@tabler/icons-react';
import { TabShell } from '@/components/ui/tab-shell';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

// --- Types ---

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

// --- Memory Type Config ---

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  conversation: { icon: IconMessage, color: '#3B82F6', label: 'Conversation' },
  decision: { icon: IconBulb, color: '#F59E0B', label: 'Decision' },
  pattern: { icon: IconTrendingUp, color: '#8B5CF6', label: 'Pattern' },
  fact: { icon: IconBrain, color: '#22C55E', label: 'Fact' },
  relationship: { icon: IconUsers, color: '#EC4899', label: 'Relationship' },
  pricing: { icon: IconCurrencyDollar, color: '#F1F5F9', label: 'Pricing' },
  lesson_learned: { icon: IconShield, color: '#14B8A6', label: 'Lesson' },
};

// --- Sub-Components ---

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.7 ? '#22C55E' : value > 0.3 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-[60px] overflow-hidden rounded-sm bg-secondary">
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-sm text-muted-foreground">{pct}%</span>
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
    <div className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors hover:bg-secondary/50">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${config.color}15` }}
      >
        <Icon size={16} color={config.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className="rounded-lg px-2 py-px text-xs font-medium uppercase tracking-wider"
            style={{ background: `${config.color}18`, color: config.color }}
          >
            {config.label}
          </span>
          <span className="text-sm text-muted-foreground">{date}</span>
        </div>
        <div className="truncate text-sm font-medium text-foreground">
          {memory.title}
        </div>
        <div className="line-clamp-2 text-sm leading-snug text-muted-foreground">
          {memory.content}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <ConfidenceBar value={memory.confidence} />
          {memory.entity_names.length > 0 && (
            <span className="text-sm text-muted-foreground">
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
    { label: 'Active Memories', value: stats.totalActive, icon: IconBrain, color: '#22C55E' },
    { label: 'Avg Confidence', value: `${Math.round(stats.avgConfidence * 100)}%`, icon: IconChartBar, color: '#3B82F6' },
    { label: 'Recent Decisions', value: stats.recentDecisions, icon: IconBulb, color: '#F59E0B' },
    { label: 'Archived', value: stats.totalArchived, icon: IconClock, color: 'var(--text-dim)' },
  ];

  return (
    <div className="bb-stagger grid grid-cols-4 gap-3">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-xl border border-border bg-card p-3.5 text-center shadow-sm">
            <Icon size={18} color={item.color} className="mx-auto mb-1.5" />
            <div className="text-base font-medium text-foreground">
              {item.value}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
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
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onTypeChange(null)}
        className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
          !activeType
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        All
      </button>
      {types.map(([key, config]) => (
        <button
          key={key}
          onClick={() => onTypeChange(activeType === key ? null : key)}
          className="rounded-lg px-3 py-1 text-sm font-medium transition-colors"
          style={{
            background: activeType === key ? `${config.color}30` : undefined,
            color: activeType === key ? config.color : undefined,
          }}
        >
          {config.label} {counts[key] ? `(${counts[key]})` : ''}
        </button>
      ))}
    </div>
  );
}

// --- Main Component ---

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
      <div className="flex flex-col gap-4 px-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IconBrain className="h-[22px] w-[22px] text-foreground" />
            <h2 className="text-base font-medium tracking-tight text-foreground">
              Memory Palace
            </h2>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setView('search')}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                view === 'search'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setView('decisions')}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                view === 'decisions'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              Decisions
            </button>
          </div>
        </div>

        {/* Stats */}
        <StatsCard stats={stats} />

        {/* Search */}
        <div className="relative">
          <IconSearch
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search memories... (e.g., 'pricing for WordPress builds')"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </div>

        {/* Type Filter */}
        <TypeFilter
          activeType={activeType}
          onTypeChange={setActiveType}
          counts={stats?.byType ?? {}}
        />

        {/* Results */}
        <div className="bb-stagger flex flex-col gap-2">
          {loading && (
            <div className="p-8 text-center text-muted-foreground">
              Searching memories...
            </div>
          )}
          {!loading && memories.length === 0 && searchQuery && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No memories found</EmptyTitle>
                <EmptyDescription>Try different keywords or broaden your search</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {!loading && memories.length === 0 && !searchQuery && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Institutional Memory</EmptyTitle>
                <EmptyDescription>Search across all conversations, decisions, pricing history, and lessons learned</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
