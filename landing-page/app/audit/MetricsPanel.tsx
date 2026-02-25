'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { SessionSummary, AuditActionType } from '@/lib/agent/audit';

interface MetricsPanelProps {
  sessions: SessionSummary[];
  stats: {
    counts: Record<AuditActionType, number>;
    total: number;
  } | null;
}

/**
 * Animated counter hook - counts up from 0 to target
 */
function useAnimatedCounter(target: number, duration: number = 1000) {
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
      
      // Easing function for smooth animation
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
 * Animated metric card with count-up effect
 */
function AnimatedMetricCard({
  title,
  value,
  suffix = '',
  subtitle,
  icon,
  color,
  trend,
}: {
  title: string;
  value: number;
  suffix?: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const animatedValue = useAnimatedCounter(value);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:border-purple-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">
              {animatedValue}
            </span>
            {suffix && <span className="text-lg text-gray-500">{suffix}</span>}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              {trend === 'up' && <span className="text-green-500">↑</span>}
              {trend === 'down' && <span className="text-red-500">↓</span>}
              {subtitle}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color} shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/**
 * Confidence gauge - visual dial showing confidence level
 */
function ConfidenceGauge({ value }: { value: number }) {
  const animatedValue = useAnimatedCounter(value, 1200);
  const rotation = (animatedValue / 100) * 180 - 90;
  
  const getColor = () => {
    if (animatedValue >= 70) return { ring: 'text-green-500', bg: 'bg-green-100', label: 'HIGH' };
    if (animatedValue >= 50) return { ring: 'text-yellow-500', bg: 'bg-yellow-100', label: 'MEDIUM' };
    return { ring: 'text-red-500', bg: 'bg-red-100', label: 'LOW' };
  };
  
  const colors = getColor();
  
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        {/* Background arc */}
        <div className="absolute inset-0 border-[12px] border-gray-200 rounded-t-full" />
        
        {/* Colored segments */}
        <div className="absolute inset-0">
          <div 
            className="absolute inset-0 border-[12px] border-transparent rounded-t-full"
            style={{
              borderTopColor: '#EF4444',
              borderLeftColor: '#EF4444',
              clipPath: 'polygon(0 100%, 0 0, 33% 0, 33% 100%)',
            }}
          />
          <div 
            className="absolute inset-0 border-[12px] border-transparent rounded-t-full"
            style={{
              borderTopColor: '#EAB308',
              clipPath: 'polygon(33% 100%, 33% 0, 70% 0, 70% 100%)',
            }}
          />
          <div 
            className="absolute inset-0 border-[12px] border-transparent rounded-t-full"
            style={{
              borderTopColor: '#22C55E',
              borderRightColor: '#22C55E',
              clipPath: 'polygon(70% 100%, 70% 0, 100% 0, 100% 100%)',
            }}
          />
        </div>
        
        {/* Needle */}
        <div 
          className="absolute bottom-0 left-1/2 w-1 h-12 bg-gray-800 rounded-t-full origin-bottom transition-transform duration-1000 ease-out"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        
        {/* Center dot */}
        <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-gray-800 rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>
      
      <div className={`mt-3 px-3 py-1 rounded-full ${colors.bg}`}>
        <span className={`text-sm font-bold ${colors.ring.replace('text-', 'text-')}`}>
          {animatedValue}% - {colors.label}
        </span>
      </div>
    </div>
  );
}

/**
 * Animated progress bar with smooth fill
 */
function AnimatedProgressBar({
  value,
  max,
  color,
  label,
  showPercentage = false,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  showPercentage?: boolean;
}) {
  const animatedValue = useAnimatedCounter(value);
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-500">
          {animatedValue}
          {showPercentage && <span className="text-gray-400 ml-1">({percentage}%)</span>}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Tool action chip with icon
 */
function ToolChip({ name, count }: { name: string; count: number }) {
  const getToolIcon = (toolName: string) => {
    const lower = toolName.toLowerCase();
    if (lower.includes('email') || lower.includes('send')) return '📧';
    if (lower.includes('calendar') || lower.includes('schedule')) return '📅';
    if (lower.includes('search') || lower.includes('lookup')) return '🔍';
    if (lower.includes('database') || lower.includes('query')) return '🗄️';
    if (lower.includes('api') || lower.includes('fetch')) return '🔌';
    if (lower.includes('file') || lower.includes('read') || lower.includes('write')) return '📁';
    if (lower.includes('calculate') || lower.includes('compute')) return '🧮';
    if (lower.includes('notify') || lower.includes('alert')) return '🔔';
    return '⚡';
  };
  
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs">
      <span>{getToolIcon(name)}</span>
      <span className="font-medium text-purple-700 truncate max-w-[100px]" title={name}>
        {name}
      </span>
      <span className="bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
        {count}×
      </span>
    </div>
  );
}

export default function MetricsPanel({ sessions, stats }: MetricsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Calculate today's sessions
  const todaysMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySessions = sessions.filter(s => {
      const sessionDate = new Date(s.started_at);
      return sessionDate >= today;
    });

    const escalatedCount = todaySessions.filter(s => s.outcome.escalated).length;
    const resolvedCount = todaySessions.length - escalatedCount;

    const avgConfidence = todaySessions.length > 0
      ? Math.round(
          todaySessions.reduce((sum, s) => sum + s.outcome.confidence, 0) / todaySessions.length
        )
      : 0;

    return {
      total: todaySessions.length,
      escalated: escalatedCount,
      resolved: resolvedCount,
      avgConfidence,
    };
  }, [sessions]);

  // Calculate confidence distribution
  const confidenceDistribution = useMemo(() => {
    const high = sessions.filter(s => s.outcome.confidence >= 70).length;
    const medium = sessions.filter(s => s.outcome.confidence >= 50 && s.outcome.confidence < 70).length;
    const low = sessions.filter(s => s.outcome.confidence < 50).length;

    return { high, medium, low, total: sessions.length };
  }, [sessions]);

  // Calculate action breakdown
  const actionBreakdown = useMemo(() => {
    const totalToolCalls = sessions.reduce((sum, s) => sum + s.outcome.actions_count, 0);
    const avgToolCalls = sessions.length > 0
      ? (totalToolCalls / sessions.length).toFixed(1)
      : '0';

    const actionCounts: Record<string, number> = {};
    sessions.forEach(s => {
      s.trail.forEach(entry => {
        if (entry.action_type === 'tool_call') {
          const input = entry.input as { tool?: string; name?: string };
          const toolName = input?.tool || input?.name || 'unknown';
          actionCounts[toolName] = (actionCounts[toolName] || 0) + 1;
        }
      });
    });

    const topActions = Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const errorCount = stats?.counts?.error || 0;
    const totalActions = stats?.total || 0;
    const errorRate = totalActions > 0
      ? ((errorCount / totalActions) * 100).toFixed(1)
      : '0';

    return {
      avgToolCalls,
      topActions,
      errorRate,
      errorCount,
      totalToolCalls,
    };
  }, [sessions, stats]);

  if (isCollapsed) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          <svg className="w-4 h-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Show Performance Metrics
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          AI Performance Metrics
        </h2>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Collapse
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Quick Stats Row */}
        <AnimatedMetricCard
          title="Sessions Today"
          value={todaysMetrics.total}
          subtitle="conversations handled"
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
          color="bg-blue-100"
        />
        
        <AnimatedMetricCard
          title="Auto-Resolved"
          value={todaysMetrics.resolved}
          suffix=""
          subtitle={`${todaysMetrics.total > 0 ? Math.round((todaysMetrics.resolved / todaysMetrics.total) * 100) : 0}% resolution rate`}
          icon={
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="bg-green-100"
          trend="up"
        />
        
        <AnimatedMetricCard
          title="Escalated"
          value={todaysMetrics.escalated}
          subtitle="needed human review"
          icon={
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          color="bg-yellow-100"
        />
        
        <AnimatedMetricCard
          title="Tool Calls"
          value={actionBreakdown.totalToolCalls}
          subtitle={`avg ${actionBreakdown.avgToolCalls} per session`}
          icon={
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          color="bg-purple-100"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Confidence Distribution with Gauge */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            Average Confidence
          </h3>
          <ConfidenceGauge value={todaysMetrics.avgConfidence || 75} />
          
          <div className="mt-6 space-y-2">
            <AnimatedProgressBar
              value={confidenceDistribution.high}
              max={confidenceDistribution.total}
              color="bg-gradient-to-r from-green-400 to-green-500"
              label="High (70+)"
              showPercentage
            />
            <AnimatedProgressBar
              value={confidenceDistribution.medium}
              max={confidenceDistribution.total}
              color="bg-gradient-to-r from-yellow-400 to-yellow-500"
              label="Medium (50-70)"
              showPercentage
            />
            <AnimatedProgressBar
              value={confidenceDistribution.low}
              max={confidenceDistribution.total}
              color="bg-gradient-to-r from-red-400 to-red-500"
              label="Low (<50)"
              showPercentage
            />
          </div>
        </div>

        {/* Top Tool Calls */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
            Most Used Tools
          </h3>
          
          {actionBreakdown.topActions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actionBreakdown.topActions.map((action) => (
                <ToolChip key={action.name} name={action.name} count={action.count} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No tool calls recorded yet</p>
          )}
          
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Error Rate</span>
              <span className={`text-sm font-bold ${
                parseFloat(actionBreakdown.errorRate) > 5 
                  ? 'text-red-500' 
                  : parseFloat(actionBreakdown.errorRate) > 2 
                    ? 'text-yellow-500' 
                    : 'text-green-500'
              }`}>
                {actionBreakdown.errorRate}%
                {parseFloat(actionBreakdown.errorRate) <= 2 && ' ✓'}
              </span>
            </div>
          </div>
        </div>

        {/* AI Decision Quality */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Decision Quality
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">🎯</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Accuracy</p>
                <p className="text-xs text-gray-500">
                  {todaysMetrics.total > 0 
                    ? `${Math.round((todaysMetrics.resolved / todaysMetrics.total) * 100)}% first-try resolution`
                    : 'No data yet'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">⚡</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Efficiency</p>
                <p className="text-xs text-gray-500">
                  {actionBreakdown.avgToolCalls} avg tools per resolution
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Learning</p>
                <p className="text-xs text-gray-500">
                  {sessions.length} sessions analyzed
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
