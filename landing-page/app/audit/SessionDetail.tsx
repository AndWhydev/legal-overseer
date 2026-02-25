'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SessionSummary, AuditLogEntry, AuditActionType } from '@/lib/agent/audit';

/**
 * Issue types for flagging
 */
type FlagIssueType =
  | 'wrong_action'
  | 'missed_action'
  | 'incorrect_response'
  | 'needs_policy_update'
  | 'other';

const ISSUE_TYPES: { value: FlagIssueType; label: string }[] = [
  { value: 'wrong_action', label: 'Wrong Action Taken' },
  { value: 'missed_action', label: 'Missed Action' },
  { value: 'incorrect_response', label: 'Incorrect Response' },
  { value: 'needs_policy_update', label: 'Needs Policy Update' },
  { value: 'other', label: 'Other' },
];

/**
 * Get confidence level with enhanced styling
 */
function getConfidenceLevel(score: number): { 
  level: string; 
  color: string; 
  bgColor: string; 
  borderColor: string;
  ringColor: string;
  gradient: string;
} {
  if (score >= 70) {
    return { 
      level: 'HIGH', 
      color: 'text-green-700', 
      bgColor: 'bg-green-100', 
      borderColor: 'border-green-300',
      ringColor: 'ring-green-500',
      gradient: 'from-green-500 to-emerald-500'
    };
  } else if (score >= 50) {
    return { 
      level: 'MEDIUM', 
      color: 'text-yellow-700', 
      bgColor: 'bg-yellow-100', 
      borderColor: 'border-yellow-300',
      ringColor: 'ring-yellow-500',
      gradient: 'from-yellow-500 to-amber-500'
    };
  } else {
    return { 
      level: 'LOW', 
      color: 'text-red-700', 
      bgColor: 'bg-red-100', 
      borderColor: 'border-red-300',
      ringColor: 'ring-red-500',
      gradient: 'from-red-500 to-rose-500'
    };
  }
}

/**
 * Get action type styling with enhanced visuals
 */
function getActionTypeStyle(type: AuditActionType): { 
  icon: string; 
  emoji: string;
  color: string; 
  bgColor: string; 
  borderColor: string;
  lightBg: string;
  label: string;
} {
  const styles: Record<AuditActionType, { 
    icon: string; 
    emoji: string;
    color: string; 
    bgColor: string; 
    borderColor: string;
    lightBg: string;
    label: string;
  }> = {
    request: { 
      icon: '→', 
      emoji: '📥',
      color: 'text-blue-700', 
      bgColor: 'bg-blue-500', 
      borderColor: 'border-blue-300',
      lightBg: 'bg-blue-50',
      label: 'Request Received'
    },
    tool_call: { 
      icon: '⚡', 
      emoji: '🔧',
      color: 'text-purple-700', 
      bgColor: 'bg-purple-500', 
      borderColor: 'border-purple-300',
      lightBg: 'bg-purple-50',
      label: 'Tool Executed'
    },
    response: { 
      icon: '←', 
      emoji: '📤',
      color: 'text-green-700', 
      bgColor: 'bg-green-500', 
      borderColor: 'border-green-300',
      lightBg: 'bg-green-50',
      label: 'Response Sent'
    },
    escalation: { 
      icon: '⚠', 
      emoji: '🚨',
      color: 'text-yellow-700', 
      bgColor: 'bg-yellow-500', 
      borderColor: 'border-yellow-300',
      lightBg: 'bg-yellow-50',
      label: 'Escalated to Human'
    },
    error: { 
      icon: '✕', 
      emoji: '❌',
      color: 'text-red-700', 
      bgColor: 'bg-red-500', 
      borderColor: 'border-red-300',
      lightBg: 'bg-red-50',
      label: 'Error Occurred'
    },
  };
  return styles[type] || styles.request;
}

/**
 * Get tool icon based on name
 */
function getToolIcon(toolName: string): string {
  const lower = toolName.toLowerCase();
  if (lower.includes('email') || lower.includes('send_email')) return '📧';
  if (lower.includes('calendar') || lower.includes('schedule')) return '📅';
  if (lower.includes('search') || lower.includes('lookup') || lower.includes('find')) return '🔍';
  if (lower.includes('database') || lower.includes('query') || lower.includes('sql')) return '🗄️';
  if (lower.includes('api') || lower.includes('fetch') || lower.includes('http')) return '🔌';
  if (lower.includes('file') || lower.includes('read') || lower.includes('write')) return '📁';
  if (lower.includes('calculate') || lower.includes('compute') || lower.includes('math')) return '🧮';
  if (lower.includes('notify') || lower.includes('alert') || lower.includes('message')) return '🔔';
  if (lower.includes('user') || lower.includes('customer') || lower.includes('profile')) return '👤';
  if (lower.includes('order') || lower.includes('purchase') || lower.includes('buy')) return '🛒';
  if (lower.includes('payment') || lower.includes('refund') || lower.includes('charge')) return '💳';
  if (lower.includes('ship') || lower.includes('deliver') || lower.includes('track')) return '📦';
  return '⚡';
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
    second: '2-digit',
  });
}

/**
 * Calculate time difference between entries
 */
function getTimeDiff(current: string, previous: string): string {
  const diff = new Date(current).getTime() - new Date(previous).getTime();
  if (diff < 1000) return '<1s';
  if (diff < 60000) return `${Math.round(diff / 1000)}s`;
  return `${Math.round(diff / 60000)}m`;
}

/**
 * Abbreviate session ID for display
 */
function abbreviateSessionId(sessionId: string): string {
  if (sessionId.length <= 8) return sessionId;
  return `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}`;
}

/**
 * Summarize entry input/output for display
 */
function summarizeEntryContent(entry: AuditLogEntry): { title: string; detail: string } {
  switch (entry.action_type) {
    case 'request': {
      const input = entry.input as { message?: string };
      return { 
        title: 'Incoming Request', 
        detail: input?.message?.slice(0, 80) || 'Request received' 
      };
    }
    case 'tool_call': {
      const input = entry.input as { tool?: string; name?: string; args?: Record<string, unknown> };
      const toolName = input?.tool || input?.name || 'unknown';
      return { 
        title: `${getToolIcon(toolName)} ${toolName}`, 
        detail: input?.args ? `Args: ${JSON.stringify(input.args).slice(0, 60)}...` : 'Executing tool...'
      };
    }
    case 'response': {
      const output = entry.output as { response?: { message?: string } };
      return { 
        title: 'Response Generated', 
        detail: output?.response?.message?.slice(0, 80) || entry.reasoning?.slice(0, 80) || 'Response sent'
      };
    }
    case 'escalation': {
      const input = entry.input as { reason?: string };
      return { 
        title: '⚠️ Escalated to Human', 
        detail: input?.reason?.slice(0, 80) || 'Needs human review'
      };
    }
    case 'error': {
      return { 
        title: '❌ Error', 
        detail: entry.error_message?.slice(0, 80) || 'An error occurred'
      };
    }
    default:
      return { title: 'Unknown Action', detail: '' };
  }
}

/**
 * Flag Modal component
 */
function FlagModal({
  sessionId,
  onClose,
  onSuccess,
}: {
  sessionId: string;
  onClose: () => void;
  onSuccess: (taskId: number) => void;
}) {
  const [issueType, setIssueType] = useState<FlagIssueType>('wrong_action');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/audit/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          issue_type: issueType,
          notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to flag session');
      }

      const data = await res.json();
      onSuccess(data.task_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-red-500 to-rose-500">
          <h3 className="text-lg font-bold text-white">🚩 Flag for Review</h3>
          <button
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Issue Type
            </label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value as FlagIssueType)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-rose-500 rounded-lg hover:from-red-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {isSubmitting ? 'Flagging...' : 'Flag Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Decision Tree Node - shows why BitBit made a decision
 */
function DecisionTreeNode({ 
  entry, 
  isLast 
}: { 
  entry: AuditLogEntry; 
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const style = getActionTypeStyle(entry.action_type);
  const content = summarizeEntryContent(entry);
  const confidence = entry.confidence !== undefined ? getConfidenceLevel(entry.confidence) : null;
  
  // Extract decision factors from reasoning
  const getDecisionFactors = () => {
    if (!entry.reasoning) return [];
    const factors = [];
    
    if (entry.reasoning.includes('confidence')) factors.push({ icon: '📊', text: 'Confidence assessment' });
    if (entry.reasoning.includes('policy') || entry.reasoning.includes('rule')) factors.push({ icon: '📋', text: 'Policy check' });
    if (entry.reasoning.includes('context') || entry.reasoning.includes('history')) factors.push({ icon: '📚', text: 'Context analysis' });
    if (entry.reasoning.includes('user') || entry.reasoning.includes('customer')) factors.push({ icon: '👤', text: 'User data' });
    if (entry.reasoning.includes('tool') || entry.reasoning.includes('action')) factors.push({ icon: '🔧', text: 'Tool selection' });
    
    if (factors.length === 0) factors.push({ icon: '🧠', text: 'AI reasoning' });
    return factors;
  };
  
  const decisionFactors = getDecisionFactors();

  return (
    <div className="relative">
      {/* Timeline connector line */}
      {!isLast && (
        <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-gradient-to-b from-gray-300 to-gray-200" />
      )}
      
      {/* Main node */}
      <div className="relative flex gap-4">
        {/* Timeline node with pulse effect for important actions */}
        <div className="relative flex-shrink-0">
          <div className={`
            w-10 h-10 rounded-full ${style.bgColor} flex items-center justify-center text-white text-lg shadow-md
            ${entry.action_type === 'escalation' ? 'animate-pulse ring-4 ring-yellow-200' : ''}
            ${entry.action_type === 'error' ? 'ring-4 ring-red-200' : ''}
          `}>
            {style.emoji}
          </div>
          {/* Confidence ring */}
          {confidence && (
            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${confidence.bgColor} ${confidence.borderColor} border-2 flex items-center justify-center`}>
              <span className={`text-[8px] font-bold ${confidence.color}`}>
                {entry.confidence}
              </span>
            </div>
          )}
        </div>
        
        {/* Content card */}
        <div className={`
          flex-1 rounded-xl border-2 overflow-hidden mb-4 transition-all duration-200
          ${entry.action_type === 'escalation' 
            ? 'border-yellow-400 bg-yellow-50 shadow-yellow-100 shadow-lg' 
            : entry.action_type === 'error'
              ? 'border-red-400 bg-red-50 shadow-red-100 shadow-lg'
              : `${style.borderColor} ${style.lightBg} hover:shadow-md`
          }
        `}>
          {/* Header */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-3 flex items-start justify-between text-left hover:bg-white/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-semibold ${style.color}`}>
                  {content.title}
                </span>
                {entry.action_type === 'escalation' && (
                  <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 text-[10px] font-bold rounded-full animate-pulse">
                    NEEDS REVIEW
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 line-clamp-2">{content.detail}</p>
              
              {/* Decision factors preview */}
              {entry.reasoning && (
                <div className="flex items-center gap-1 mt-2">
                  {decisionFactors.slice(0, 3).map((factor, idx) => (
                    <span 
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/70 rounded-full text-[10px] text-gray-600"
                      title={factor.text}
                    >
                      {factor.icon}
                    </span>
                  ))}
                  {entry.reasoning && (
                    <span className="text-[10px] text-gray-500">
                      • Click to see reasoning
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 ml-3">
              <span className="text-xs text-gray-400">
                {entry.created_at ? formatTimestamp(entry.created_at) : ''}
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {/* Expanded details */}
          {isExpanded && (
            <div className="px-4 py-4 border-t border-gray-200 bg-white space-y-4">
              {/* Decision Tree visualization */}
              {entry.reasoning && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-100">
                  <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span>🧠</span> AI Decision Process
                  </h4>
                  
                  <div className="space-y-2">
                    {decisionFactors.map((factor, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-sm">
                          {factor.icon}
                        </div>
                        <div className="flex-1 h-1 bg-purple-200 rounded-full">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${70 + Math.random() * 30}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-24">{factor.text}</span>
                      </div>
                    ))}
                  </div>
                  
                  <p className="mt-3 text-sm text-gray-700 bg-white/70 p-3 rounded-lg italic">
                    &ldquo;{entry.reasoning}&rdquo;
                  </p>
                </div>
              )}
              
              {/* Input data */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span>📥</span> Input Data
                </h4>
                <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto border">
                  {JSON.stringify(entry.input, null, 2)}
                </pre>
              </div>
              
              {/* Output data */}
              {entry.output !== undefined && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span>📤</span> Output Data
                  </h4>
                  <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto border">
                    {JSON.stringify(entry.output, null, 2)}
                  </pre>
                </div>
              )}
              
              {/* Error message */}
              {entry.error_message && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <span>⚠️</span> Error Details
                  </h4>
                  <p className="text-sm text-red-700">{entry.error_message}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Confidence Badge with visual indicator
 */
function ConfidenceBadge({ score }: { score: number }) {
  const conf = getConfidenceLevel(score);
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${conf.bgColor} ${conf.borderColor} border`}>
      <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${conf.gradient}`} />
      <span className={`text-sm font-semibold ${conf.color}`}>
        {score}% {conf.level}
      </span>
    </div>
  );
}

interface SessionDetailProps {
  sessionId: string;
  onClose: () => void;
}

export default function SessionDetail({ sessionId, onClose }: SessionDetailProps) {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [flagTaskId, setFlagTaskId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch(`/api/agent/session/${sessionId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Session not found');
          }
          throw new Error('Failed to fetch session');
        }

        const data = await res.json();
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSession();
  }, [sessionId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showFlagModal) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showFlagModal]);

  const handleFlagSuccess = useCallback((taskId: number) => {
    setIsFlagged(true);
    setFlagTaskId(taskId);
    setShowFlagModal(false);
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg">🧠</span>
            </div>
          </div>
          <span className="text-sm text-gray-600">Loading session details...</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
          <span className="text-2xl">😕</span>
        </div>
        <p className="text-sm text-red-600 mb-2">{error || 'Session not found'}</p>
        <button
          onClick={onClose}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          Go back
        </button>
      </div>
    );
  }

  const hasEscalation = session.trail.some(e => e.action_type === 'escalation');
  const hasErrors = session.trail.some(e => e.action_type === 'error');

  return (
    <div className="h-full overflow-y-auto">
      {showFlagModal && (
        <FlagModal
          sessionId={sessionId}
          onClose={() => setShowFlagModal(false)}
          onSuccess={handleFlagSuccess}
        />
      )}

      {/* Header with gradient */}
      <div className={`
        p-5 border-b sticky top-0 z-10
        ${hasEscalation 
          ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200' 
          : hasErrors
            ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'
            : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'
        }
      `}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-gray-900">
                Session {abbreviateSessionId(session.session_id)}
              </h2>
              {isFlagged && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                  🚩 Flagged
                </span>
              )}
              {hasEscalation && !isFlagged && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-200 animate-pulse">
                  ⚠️ Escalated
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <span>📅 {formatTimestamp(session.started_at)}</span>
              {flagTaskId && <span className="text-gray-400">• Task #{flagTaskId}</span>}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {!isFlagged && (
              <button
                onClick={() => setShowFlagModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
              >
                🚩 Flag
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50 transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Request Card */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">📥</span>
            <h3 className="text-sm font-bold uppercase tracking-wider opacity-90">Incoming Request</h3>
          </div>
          <p className="text-lg leading-relaxed">{session.request.message}</p>
          <div className="flex items-center gap-2 mt-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 capitalize">
              📱 {session.request.channel}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 capitalize">
              👤 {session.request.sender_type}
            </span>
          </div>
        </div>

        {/* Outcome Card */}
        <div className={`
          rounded-2xl p-5 border-2 shadow-lg
          ${session.outcome.escalated 
            ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300' 
            : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
          }
        `}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{session.outcome.escalated ? '⚠️' : '✅'}</span>
              <h3 className={`text-sm font-bold uppercase tracking-wider ${session.outcome.escalated ? 'text-yellow-700' : 'text-green-700'}`}>
                {session.outcome.escalated ? 'Escalated Response' : 'AI Response'}
              </h3>
            </div>
            <ConfidenceBadge score={session.outcome.confidence} />
          </div>
          <p className="text-gray-800 leading-relaxed">{session.outcome.response}</p>
          <div className="flex items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
              ⚡ {session.outcome.actions_count} action{session.outcome.actions_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Decision Timeline */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              🧠 AI Decision Timeline
            </h3>
            <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500">
              {session.trail.length} steps
            </span>
          </div>
          
          <div className="space-y-0">
            {session.trail.map((entry, index) => (
              <DecisionTreeNode 
                key={entry.id || index} 
                entry={entry} 
                isLast={index === session.trail.length - 1}
              />
            ))}
          </div>
        </div>

        {/* Session ID Footer */}
        <div className="text-xs text-gray-400 pt-4 border-t border-gray-200 flex items-center gap-2">
          <span className="font-mono bg-gray-100 px-2 py-1 rounded">{session.session_id}</span>
          <button 
            onClick={() => navigator.clipboard.writeText(session.session_id)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            title="Copy session ID"
          >
            📋
          </button>
        </div>
      </div>
    </div>
  );
}
