'use client';

import { useState, useEffect } from 'react';
import type { SessionSummary } from '@/lib/agent/audit';

/**
 * Flag task from API
 */
interface FlagTask {
  id: number;
  title: string;
  owner: string;
  status: string;
  created_at: string;
  metadata: {
    type: string;
    session_id: string;
    issue_type: string;
    notes: string;
    flagged_at: string;
  } | null;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format issue type for display
 */
function formatIssueType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Abbreviate session ID for display
 */
function abbreviateSessionId(sessionId: string): string {
  if (sessionId.length <= 8) return sessionId;
  return `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}`;
}

/**
 * Get confidence level and color from score
 */
function getConfidenceLevel(score: number): { level: string; color: string; bgColor: string } {
  if (score >= 70) {
    return { level: 'HIGH', color: 'text-green-700', bgColor: 'bg-green-100' };
  } else if (score >= 50) {
    return { level: 'MED', color: 'text-yellow-700', bgColor: 'bg-yellow-100' };
  } else {
    return { level: 'LOW', color: 'text-red-700', bgColor: 'bg-red-100' };
  }
}

interface PendingItemsProps {
  onViewSession: (sessionId: string) => void;
}

export default function PendingItems({ onViewSession }: PendingItemsProps) {
  const [escalatedSessions, setEscalatedSessions] = useState<SessionSummary[]>([]);
  const [flaggedTasks, setFlaggedTasks] = useState<FlagTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedEscalations, setDismissedEscalations] = useState<Set<string>>(new Set());

  // Fetch pending items
  useEffect(() => {
    async function fetchPendingItems() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch sessions and flags in parallel
        const [sessionsRes, flagsRes] = await Promise.all([
          fetch('/api/agent/audit?sessions_only=true&limit=50'),
          fetch('/api/audit/flag'),
        ]);

        // Process sessions - get full summaries for each
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          const sessionIds: string[] = sessionsData.sessions;

          // Fetch full summaries
          const summaries: SessionSummary[] = [];
          for (const sessionId of sessionIds) {
            const summaryRes = await fetch(`/api/agent/session/${sessionId}`);
            if (summaryRes.ok) {
              const summary = await summaryRes.json();
              // Only include escalated sessions
              if (summary.outcome.escalated) {
                summaries.push(summary);
              }
            }
          }
          setEscalatedSessions(summaries);
        }

        // Process flags - only show open ones
        if (flagsRes.ok) {
          const flagsData = await flagsRes.json();
          const openFlags = flagsData.flags.filter(
            (f: FlagTask) => f.status !== 'done'
          );
          setFlaggedTasks(openFlags);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPendingItems();
  }, []);

  // Handle dismissing a flag
  const handleDismissFlag = async (taskId: number) => {
    try {
      const res = await fetch(`/api/audit/flag?task_id=${taskId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setFlaggedTasks(prev => prev.filter(f => f.id !== taskId));
      }
    } catch (err) {
      console.error('Failed to dismiss flag:', err);
    }
  };

  // Handle marking escalation as resolved (local state only for MVP)
  const handleResolveEscalation = (sessionId: string) => {
    setDismissedEscalations(prev => new Set(prev).add(sessionId));
  };

  // Filter out dismissed escalations
  const visibleEscalations = escalatedSessions.filter(
    s => !dismissedEscalations.has(s.session_id)
  );

  const totalPending = visibleEscalations.length + flaggedTasks.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm text-gray-600">Loading pending items...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-purple-600 hover:text-purple-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (totalPending === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">All Clear</h3>
        <p className="text-sm text-gray-500">
          No pending items need attention.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Escalated Sessions */}
      {visibleEscalations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-yellow-700 uppercase mb-3 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">
              {visibleEscalations.length}
            </span>
            Escalated Sessions
          </h3>
          <div className="space-y-3">
            {visibleEscalations.map(session => {
              const confidence = getConfidenceLevel(session.outcome.confidence);
              return (
                <div
                  key={session.session_id}
                  className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-500">
                          {abbreviateSessionId(session.session_id)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${confidence.bgColor} ${confidence.color}`}>
                          {confidence.level} ({session.outcome.confidence}%)
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 mb-2 line-clamp-2">
                        {session.request.message.slice(0, 100)}
                        {session.request.message.length > 100 ? '...' : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTimestamp(session.started_at)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => onViewSession(session.session_id)}
                        className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleResolveEscalation(session.session_id)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Flagged for Review */}
      {flaggedTasks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 uppercase mb-3 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-800 text-xs font-bold">
              {flaggedTasks.length}
            </span>
            Flagged for Review
          </h3>
          <div className="space-y-3">
            {flaggedTasks.map(flag => (
              <div
                key={flag.id}
                className="bg-red-50 border border-red-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        {flag.metadata ? formatIssueType(flag.metadata.issue_type) : 'Unknown Issue'}
                      </span>
                      {flag.metadata?.session_id && (
                        <span className="text-xs font-mono text-gray-500">
                          {abbreviateSessionId(flag.metadata.session_id)}
                        </span>
                      )}
                    </div>
                    {flag.metadata?.notes && (
                      <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                        {flag.metadata.notes}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      {formatTimestamp(flag.created_at)} - Task #{flag.id}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {flag.metadata?.session_id && (
                      <button
                        onClick={() => onViewSession(flag.metadata!.session_id)}
                        className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 transition-colors"
                      >
                        View
                      </button>
                    )}
                    <button
                      onClick={() => handleDismissFlag(flag.id)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
