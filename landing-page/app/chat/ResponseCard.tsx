'use client';

import { useState } from 'react';
import type { AgentResponse, AgentAction } from '@/lib/agent/types';

interface ResponseCardProps {
  response: AgentResponse;
  timestamp?: Date;
  responseTimeMs?: number;
}

/**
 * Format timestamp
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Get confidence level and color from score
 */
function getConfidenceLevel(score: number): { level: string; color: string; bgColor: string; barColor: string } {
  if (score >= 70) {
    return { level: 'HIGH', color: 'text-emerald-700', bgColor: 'bg-emerald-50', barColor: 'bg-emerald-500' };
  } else if (score >= 50) {
    return { level: 'MEDIUM', color: 'text-amber-700', bgColor: 'bg-amber-50', barColor: 'bg-amber-500' };
  } else {
    return { level: 'LOW', color: 'text-red-700', bgColor: 'bg-red-50', barColor: 'bg-red-500' };
  }
}

/**
 * Extract policy references from reasoning text
 */
function extractPolicies(reasoning: string): string[] {
  const policies: string[] = [];
  
  // Common policy patterns to look for
  const policyPatterns = [
    /(\d+[-\s]?day return policy)/gi,
    /(return policy)/gi,
    /(shipping policy)/gi,
    /(refund policy)/gi,
    /(exchange policy)/gi,
    /(cancellation policy)/gi,
    /(warranty policy)/gi,
    /(subscription terms)/gi,
    /(international shipping)/gi,
    /(domestic shipping)/gi,
    /(free shipping)/gi,
    /(sizing guide)/gi,
    /(product care)/gi,
    /(usage instructions)/gi,
  ];
  
  policyPatterns.forEach(pattern => {
    const matches = reasoning.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalized = match.toLowerCase().replace(/\s+/g, ' ').trim();
        // Capitalize first letter of each word
        const formatted = normalized.replace(/\b\w/g, l => l.toUpperCase());
        if (!policies.some(p => p.toLowerCase() === formatted.toLowerCase())) {
          policies.push(formatted);
        }
      });
    }
  });
  
  // If no explicit policies found, infer from intent
  if (policies.length === 0 && reasoning) {
    if (reasoning.toLowerCase().includes('return') || reasoning.toLowerCase().includes('refund')) {
      policies.push('30-Day Return Policy');
    }
    if (reasoning.toLowerCase().includes('ship') || reasoning.toLowerCase().includes('delivery')) {
      policies.push('Shipping Policy');
    }
    if (reasoning.toLowerCase().includes('cancel') || reasoning.toLowerCase().includes('subscription')) {
      policies.push('Subscription Terms');
    }
    if (reasoning.toLowerCase().includes('size') || reasoning.toLowerCase().includes('fit')) {
      policies.push('Sizing Guide');
    }
  }
  
  return policies;
}

/**
 * Build a decision tree from actions and reasoning
 */
function buildDecisionTree(response: AgentResponse): DecisionNode[] {
  const nodes: DecisionNode[] = [];
  
  // Intent detection node
  if (response.routing?.intent) {
    nodes.push({
      type: 'decision',
      label: 'Intent Classification',
      value: response.routing.intent,
      icon: '🎯',
    });
  }
  
  // Actions as nodes
  response.actions_taken.forEach((action, idx) => {
    nodes.push({
      type: 'action',
      label: formatActionType(action.type),
      value: getActionSummary(action),
      icon: getActionEmoji(action.type),
    });
  });
  
  // Confidence check
  nodes.push({
    type: 'decision',
    label: 'Confidence Check',
    value: `${response.confidence}% → ${response.confidence >= 70 ? 'Auto-approve' : response.confidence >= 50 ? 'Review suggested' : 'Escalate required'}`,
    icon: response.confidence >= 70 ? '✅' : response.confidence >= 50 ? '⚠️' : '🚨',
  });
  
  // Routing decision
  if (response.routing) {
    nodes.push({
      type: 'outcome',
      label: 'Routing Decision',
      value: `${response.routing.queue} queue${response.routing.auto_resolve ? ' (auto-resolve)' : ''}`,
      icon: response.routing.auto_resolve ? '🤖' : '👤',
    });
  }
  
  return nodes;
}

interface DecisionNode {
  type: 'decision' | 'action' | 'outcome';
  label: string;
  value: string;
  icon: string;
}

/**
 * Get emoji for action type
 */
function getActionEmoji(type: string): string {
  const emojis: Record<string, string> = {
    lookup_order: '🔍',
    get_shipping_status: '🚚',
    get_customer_history: '👤',
    send_reply: '💬',
    create_task: '📝',
    escalate: '⚠️',
    check_inventory: '📦',
    check_policy: '📋',
  };
  return emojis[type] || '⚡';
}

/**
 * Get a brief summary of an action
 */
function getActionSummary(action: AgentAction): string {
  const params = action.params as Record<string, unknown>;
  switch (action.type) {
    case 'lookup_order':
      return `Order ${params.order_id || 'lookup'}`;
    case 'get_shipping_status':
      return `Tracking ${params.order_id || 'status'}`;
    case 'get_customer_history':
      return `Customer profile`;
    case 'check_policy':
      return `${params.policy_type || 'Policy'} check`;
    default:
      return Object.keys(params).length > 0 
        ? Object.values(params).slice(0, 2).join(', ')
        : 'Executed';
  }
}

/**
 * Get icon for action type
 */
function getActionIcon(type: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    lookup_order: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    get_shipping_status: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
    get_customer_history: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    send_reply: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    ),
    create_task: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
    ),
    escalate: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    check_inventory: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  };
  return icons[type] || (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}

/**
 * Format action type for display
 */
function formatActionType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Individual action item with expand/collapse
 */
function ActionItem({ action, index }: { action: AgentAction; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow" style={{ animationDelay: `${index * 100}ms` }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-all text-left"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700">
          {getActionIcon(action.type)}
        </div>
        <span className="flex-1 text-sm font-semibold text-gray-800">
          {formatActionType(action.type)}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-3 animate-expand">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parameters</span>
            <pre className="mt-2 text-xs text-gray-700 bg-gray-50 p-3 rounded-lg overflow-x-auto font-mono">
              {JSON.stringify(action.params, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</span>
            <pre className="mt-2 text-xs text-gray-700 bg-gray-50 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto font-mono">
              {JSON.stringify(action.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Decision Tree visualization component
 */
function DecisionTree({ nodes }: { nodes: DecisionNode[] }) {
  return (
    <div className="relative pl-4">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-purple-300 via-purple-200 to-purple-100" />
      
      <div className="space-y-3">
        {nodes.map((node, idx) => (
          <div key={idx} className="relative flex items-start gap-3">
            {/* Node dot */}
            <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              node.type === 'decision' 
                ? 'bg-purple-100 border-2 border-purple-400' 
                : node.type === 'action'
                  ? 'bg-blue-100 border-2 border-blue-400'
                  : 'bg-green-100 border-2 border-green-400'
            }`}>
              {node.icon}
            </div>
            
            {/* Node content */}
            <div className="flex-1 pb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {node.label}
              </span>
              <p className="text-sm text-gray-800 font-medium">
                {node.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResponseCard({ response, timestamp, responseTimeMs }: ResponseCardProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showDecisionTree, setShowDecisionTree] = useState(false);
  const confidence = getConfidenceLevel(response.confidence);
  const policies = extractPolicies(response.reasoning || '');
  const decisionTree = buildDecisionTree(response);

  return (
    <div className="space-y-3">
      {/* Escalation banner */}
      {response.should_escalate && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-sm animate-pulse-soft">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-amber-800">Needs Human Review</span>
            <p className="text-xs text-amber-600">This response requires approval before sending</p>
          </div>
        </div>
      )}

      {/* Main response message */}
      <div className="bg-white rounded-2xl rounded-bl-md px-5 py-4 shadow-lg border border-gray-100">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex-shrink-0">
            <span className="text-sm font-bold text-white">B</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{response.message}</p>
          </div>
        </div>
      </div>
      
      {/* Policy references */}
      {policies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Referenced:</span>
          {policies.map((policy, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 border border-purple-200"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              {policy}
            </span>
          ))}
        </div>
      )}

      {/* Metadata row: confidence + routing + response time */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        {/* Response time */}
        {responseTimeMs !== undefined && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            {responseTimeMs < 1000 
              ? `${responseTimeMs}ms` 
              : `${(responseTimeMs / 1000).toFixed(1)}s`
            }
          </span>
        )}
        
        {/* Confidence with bar */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${confidence.bgColor}`}>
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${confidence.barColor} rounded-full transition-all`} style={{ width: `${response.confidence}%` }} />
          </div>
          <span className={`text-xs font-semibold ${confidence.color}`}>{response.confidence}%</span>
        </div>

        {/* Routing badges */}
        {response.routing && (
          <>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              {response.routing.queue}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
                response.routing.auto_resolve
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {response.routing.auto_resolve ? (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Auto-resolve
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Review
                </>
              )}
            </span>
            {response.routing.intent && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                {response.routing.intent}
              </span>
            )}
          </>
        )}
      </div>
      
      {/* Decision Tree button */}
      <div className="px-1">
        <button
          onClick={() => setShowDecisionTree(!showDecisionTree)}
          className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 ${
            showDecisionTree
              ? 'bg-purple-100 border-purple-300 text-purple-700'
              : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="3"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <circle cx="6" cy="17" r="3"/>
            <circle cx="18" cy="17" r="3"/>
            <line x1="12" y1="12" x2="6" y2="14"/>
            <line x1="12" y1="12" x2="18" y2="14"/>
          </svg>
          {showDecisionTree ? 'Hide' : 'Show'} Decision Tree
        </button>
      </div>
      
      {/* Decision Tree visualization */}
      {showDecisionTree && (
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100 p-4 shadow-sm animate-expand">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="3"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <circle cx="6" cy="17" r="3"/>
              <circle cx="18" cy="17" r="3"/>
              <line x1="12" y1="12" x2="6" y2="14"/>
              <line x1="12" y1="12" x2="18" y2="14"/>
            </svg>
            Decision Flow
          </h4>
          <DecisionTree nodes={decisionTree} />
        </div>
      )}

      {/* Actions taken section */}
      {response.actions_taken.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Actions Taken ({response.actions_taken.length})
          </h4>
          <div className="space-y-2">
            {response.actions_taken.map((action, index) => (
              <ActionItem key={index} action={action} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Reasoning section (collapsible) */}
      {response.reasoning && (
        <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-all text-left"
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Reasoning
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showReasoning ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showReasoning && (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <p className="text-sm text-gray-700 leading-relaxed">{response.reasoning}</p>
            </div>
          )}
        </div>
      )}

      {/* Timestamp + Session ID */}
      <div className="flex items-center justify-between px-1 text-xs text-gray-400">
        {timestamp && <span>{formatTime(timestamp)}</span>}
        <span className="font-mono">Session: {response.session_id.slice(0, 8)}...</span>
      </div>

      {/* Custom styles */}
      <style jsx>{`
        @keyframes expand {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 500px; }
        }
        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-expand {
          animation: expand 0.3s ease-out;
        }
        .animate-pulse-soft {
          animation: pulse-soft 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
