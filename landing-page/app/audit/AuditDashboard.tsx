'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { SessionSummary, AuditActionType } from '@/lib/agent/audit';
import SessionDetail from './SessionDetail';
import PendingItems from './PendingItems';
import MetricsPanel from './MetricsPanel';

// Tab type
type TabType = 'timeline' | 'pending';

// Filter state type
interface Filters {
  channel: string;
  confidence: string;
  escalatedOnly: boolean;
  errorsOnly: boolean;
}

// Summary stats type
interface SummaryStats {
  counts: Record<AuditActionType, number>;
  total: number;
}

/**
 * Animated counter hook
 */
function useAnimatedCounter(target: number, duration: number = 800) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);
  
  useEffect(() => {
    if (target === prevTarget.current && count !== 0) return;
    prevTarget.current = target;
    
    const startTime = Date.now();
    const startValue = 0;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(startValue + (target - startValue) * easeOutQuart);
      
      setCount(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration]);
  
  return count;
}

/**
 * Get confidence level and color from score
 */
function getConfidenceLevel(score: number): { level: string; color: string; bgColor: string; gradient: string } {
  if (score >= 70) {
    return { level: 'HIGH', color: 'text-green-700', bgColor: 'bg-green-100', gradient: 'from-green-500 to-emerald-500' };
  } else if (score >= 50) {
    return { level: 'MED', color: 'text-yellow-700', bgColor: 'bg-yellow-100', gradient: 'from-yellow-500 to-amber-500' };
  } else {
    return { level: 'LOW', color: 'text-red-700', bgColor: 'bg-red-100', gradient: 'from-red-500 to-rose-500' };
  }
}

/**
 * Get confidence bucket from score
 */
function getConfidenceBucket(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * Get channel icon and color
 */
function getChannelInfo(channel: string): { icon: string; color: string; bgColor: string } {
  const info: Record<string, { icon: string; color: string; bgColor: string }> = {
    whatsapp: { icon: '💬', color: 'text-green-700', bgColor: 'bg-green-100' },
    email: { icon: '📧', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    voice: { icon: '📞', color: 'text-purple-700', bgColor: 'bg-purple-100' },
    sms: { icon: '📱', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  };
  return info[channel] || { icon: '💬', color: 'text-gray-700', bgColor: 'bg-gray-100' };
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Within last hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  // Within last 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Abbreviate session ID for display
 */
function abbreviateSessionId(sessionId: string): string {
  if (sessionId.length <= 8) return sessionId;
  return `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}`;
}

/**
 * Animated stat card component
 */
function AnimatedStatCard({ 
  label, 
  value, 
  icon, 
  color, 
  bgColor,
  gradient,
  subtitle,
}: { 
  label: string; 
  value: number; 
  icon: string;
  color: string;
  bgColor: string;
  gradient?: string;
  subtitle?: string;
}) {
  const animatedValue = useAnimatedCounter(value);
  
  return (
    <div className={`
      relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 
      hover:shadow-lg hover:border-purple-200 transition-all duration-300
    `}>
      {/* Gradient accent */}
      {gradient && (
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      )}
      
      <div className="flex items-center gap-4">
        <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${bgColor} shadow-sm`}>
          <span className="text-2xl">{icon}</span>
        </div>
        <div>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{animatedValue}</p>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Summary stats bar component
 */
function StatsBar({ stats, sessions }: { stats: SummaryStats | null; sessions: SessionSummary[] }) {
  const todaysSessions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return sessions.filter(s => new Date(s.started_at) >= today);
  }, [sessions]);
  
  const escalatedToday = todaysSessions.filter(s => s.outcome.escalated).length;
  const avgConfidence = todaysSessions.length > 0
    ? Math.round(todaysSessions.reduce((sum, s) => sum + s.outcome.confidence, 0) / todaysSessions.length)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <AnimatedStatCard
        label="Sessions Today"
        value={todaysSessions.length}
        icon="💬"
        color="text-blue-700"
        bgColor="bg-blue-100"
        gradient="from-blue-500 to-indigo-500"
        subtitle="conversations"
      />
      <AnimatedStatCard
        label="Tool Calls"
        value={stats?.counts.tool_call || 0}
        icon="⚡"
        color="text-purple-700"
        bgColor="bg-purple-100"
        gradient="from-purple-500 to-pink-500"
        subtitle="actions executed"
      />
      <AnimatedStatCard
        label="Escalations"
        value={escalatedToday}
        icon="⚠️"
        color="text-yellow-700"
        bgColor="bg-yellow-100"
        gradient="from-yellow-500 to-orange-500"
        subtitle="need review"
      />
      <AnimatedStatCard
        label="Avg Confidence"
        value={avgConfidence}
        icon="🎯"
        color="text-green-700"
        bgColor="bg-green-100"
        gradient="from-green-500 to-emerald-500"
        subtitle={avgConfidence >= 70 ? 'excellent' : avgConfidence >= 50 ? 'good' : 'needs work'}
      />
    </div>
  );
}

/**
 * Filter controls component
 */
function FilterControls({
  filters,
  onFiltersChange,
  hasActiveFilters,
  onClearFilters,
}: {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const channels = [
    { value: 'all', label: '🌐 All Channels' },
    { value: 'whatsapp', label: '💬 WhatsApp' },
    { value: 'email', label: '📧 Email' },
    { value: 'voice', label: '📞 Voice' },
    { value: 'sms', label: '📱 SMS' },
  ];

  const confidenceLevels = [
    { value: 'all', label: '📊 All Confidence' },
    { value: 'high', label: '🟢 High (70+)' },
    { value: 'medium', label: '🟡 Medium (50-70)' },
    { value: 'low', label: '🔴 Low (<50)' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
      <select
        value={filters.channel}
        onChange={e => onFiltersChange({ ...filters, channel: e.target.value })}
        className="px-4 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm"
      >
        {channels.map(ch => (
          <option key={ch.value} value={ch.value}>{ch.label}</option>
        ))}
      </select>

      <select
        value={filters.confidence}
        onChange={e => onFiltersChange({ ...filters, confidence: e.target.value })}
        className="px-4 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm"
      >
        {confidenceLevels.map(conf => (
          <option key={conf.value} value={conf.value}>{conf.label}</option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-yellow-300 transition-colors">
        <input
          type="checkbox"
          checked={filters.escalatedOnly}
          onChange={e => onFiltersChange({ ...filters, escalatedOnly: e.target.checked })}
          className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
        />
        <span>⚠️ Escalated</span>
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-red-300 transition-colors">
        <input
          type="checkbox"
          checked={filters.errorsOnly}
          onChange={e => onFiltersChange({ ...filters, errorsOnly: e.target.checked })}
          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
        />
        <span>❌ Errors</span>
      </label>

      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
}

interface SessionListItemProps {
  session: SessionSummary;
  isSelected: boolean;
  onClick: () => void;
}

function SessionListItem({ session, isSelected, onClick }: SessionListItemProps) {
  const confidence = getConfidenceLevel(session.outcome.confidence);
  const channelInfo = getChannelInfo(session.request.channel);
  const messagePreview = session.request.message.slice(0, 50) + (session.request.message.length > 50 ? '...' : '');
  const hasErrors = session.trail.some(e => e.action_type === 'error');
  const hasEscalation = session.outcome.escalated;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded-xl border-2 transition-all duration-200
        ${isSelected
          ? 'border-purple-500 bg-purple-50 shadow-md ring-2 ring-purple-200'
          : hasEscalation
            ? 'border-yellow-300 bg-yellow-50 hover:border-yellow-400 hover:shadow-md'
            : hasErrors
              ? 'border-red-300 bg-red-50 hover:border-red-400 hover:shadow-md'
              : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-md'
        }
      `}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
          {abbreviateSessionId(session.session_id)}
        </span>
        <span className="text-xs text-gray-400">
          {formatTimestamp(session.started_at)}
        </span>
      </div>

      {/* Message preview */}
      <p className="text-sm text-gray-800 mb-3 line-clamp-2 leading-relaxed">
        {messagePreview}
      </p>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Channel badge */}
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${channelInfo.bgColor} ${channelInfo.color}`}>
          {channelInfo.icon} {session.request.channel}
        </span>

        {/* Confidence badge with mini bar */}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${confidence.bgColor} ${confidence.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${confidence.gradient}`} />
          {session.outcome.confidence}%
        </span>

        {/* Escalation badge with pulse */}
        {hasEscalation && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-200 text-yellow-800 animate-pulse">
            ⚠️ Escalated
          </span>
        )}

        {/* Error badge */}
        {hasErrors && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-200 text-red-800">
            ❌ Error
          </span>
        )}

        {/* Actions count */}
        {session.outcome.actions_count > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
            ⚡ {session.outcome.actions_count}
          </span>
        )}
      </div>
    </button>
  );
}

export default function AuditDashboard() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [filters, setFilters] = useState<Filters>({
    channel: 'all',
    confidence: 'all',
    escalatedOnly: false,
    errorsOnly: false,
  });
  const [activeTab, setActiveTab] = useState<TabType>('timeline');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const [statsRes, sessionsRes] = await Promise.all([
          fetch('/api/agent/audit?summary=true'),
          fetch('/api/agent/audit?sessions_only=true&limit=20'),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats({
            counts: statsData.counts,
            total: statsData.total,
          });
        }

        if (!sessionsRes.ok) {
          throw new Error('Failed to fetch sessions');
        }
        const sessionsData = await sessionsRes.json();
        const sessionIds: string[] = sessionsData.sessions;

        const summaries: SessionSummary[] = [];
        for (const sessionId of sessionIds) {
          const summaryRes = await fetch(`/api/agent/session/${sessionId}`);
          if (summaryRes.ok) {
            const summary = await summaryRes.json();
            summaries.push(summary);
          }
        }

        setSessions(summaries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const [flagsRes] = await Promise.all([
          fetch('/api/audit/flag'),
        ]);

        let count = 0;

        if (flagsRes.ok) {
          const flagsData = await flagsRes.json();
          const openFlags = flagsData.flags.filter((f: { status: string }) => f.status !== 'done');
          count += openFlags.length;
        }

        if (sessions.length > 0) {
          count += sessions.filter(s => s.outcome.escalated).length;
        }

        setPendingCount(count);
      } catch (err) {
        console.error('Failed to fetch pending count:', err);
      }
    }

    fetchPendingCount();
  }, [sessions]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.channel !== 'all' ||
      filters.confidence !== 'all' ||
      filters.escalatedOnly ||
      filters.errorsOnly
    );
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      channel: 'all',
      confidence: 'all',
      escalatedOnly: false,
      errorsOnly: false,
    });
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (filters.channel !== 'all' && session.request.channel !== filters.channel) {
        return false;
      }

      if (filters.confidence !== 'all') {
        const bucket = getConfidenceBucket(session.outcome.confidence);
        if (bucket !== filters.confidence) {
          return false;
        }
      }

      if (filters.escalatedOnly && !session.outcome.escalated) {
        return false;
      }

      if (filters.errorsOnly) {
        const hasErrors = session.trail.some(e => e.action_type === 'error');
        if (!hasErrors) {
          return false;
        }
      }

      return true;
    });
  }, [sessions, filters]);

  return (
    <div className="space-y-0">
      {/* Summary stats bar */}
      <StatsBar stats={stats} sessions={sessions} />

      {/* Metrics Panel */}
      <MetricsPanel sessions={sessions} stats={stats} />

      {/* Tab navigation */}
      <div className="flex gap-1 mb-4 p-1.5 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`
            px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200
            ${activeTab === 'timeline'
              ? 'bg-white text-gray-900 shadow-md'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }
          `}
        >
          📊 Activity Timeline
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`
            px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center gap-2
            ${activeTab === 'pending'
              ? 'bg-white text-gray-900 shadow-md'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }
          `}
        >
          📋 Pending Items
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'pending' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 h-[calc(100vh-18rem)] overflow-y-auto">
          <PendingItems
            onViewSession={(sessionId) => {
              setSelectedSessionId(sessionId);
              setActiveTab('timeline');
            }}
          />
        </div>
      ) : (
        <div className="flex gap-6 h-[calc(100vh-18rem)]">
          {/* Session list (left column) */}
          <div className="w-[380px] flex-shrink-0 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Recent Sessions
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {filteredSessions.length}
                {hasActiveFilters ? ` of ${sessions.length}` : ''} conversations
              </p>
            </div>

            <FilterControls
              filters={filters}
              onFiltersChange={setFilters}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600" />
                  </div>
                  <span className="text-sm text-gray-600">Loading sessions...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <span className="text-2xl">😕</span>
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <span className="text-3xl">📭</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">No sessions yet</h3>
                  <p className="text-sm text-gray-500">
                    Use the{' '}
                    <a href="/chat" className="text-purple-600 hover:text-purple-700 font-medium">
                      chat interface
                    </a>{' '}
                    to create some.
                  </p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <span className="text-3xl">🔍</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">No matching sessions</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    Try adjusting your filters.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                filteredSessions.map(session => (
                  <SessionListItem
                    key={session.session_id}
                    session={session}
                    isSelected={selectedSessionId === session.session_id}
                    onClick={() => setSelectedSessionId(session.session_id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Session details (right column) */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {selectedSessionId ? (
              <SessionDetail
                sessionId={selectedSessionId}
                onClose={() => setSelectedSessionId(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                  <span className="text-4xl">🧠</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Select a Session</h3>
                <p className="text-sm text-gray-500 max-w-md leading-relaxed">
                  Click on a session from the list to view its decision timeline, 
                  audit trail, and see how BitBit reasoned through each step.
                </p>
                <div className="flex items-center gap-4 mt-6">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    High confidence
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                    Medium
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    Low
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
