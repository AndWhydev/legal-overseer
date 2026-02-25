'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AnalysisResult } from '@/lib/types';

interface RecommendationPanelProps {
  itemId: number;
}

type AnalysisState = {
  loading: boolean;
  generating: boolean;
  analysis: AnalysisResult | null;
  error: string | null;
};

export default function RecommendationPanel({ itemId }: RecommendationPanelProps) {
  const [state, setState] = useState<AnalysisState>({
    loading: true,
    generating: false,
    analysis: null,
    error: null,
  });

  // Fetch existing analysis on mount
  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const res = await fetch(`/api/items/${itemId}/analysis`);
        const data = await res.json();
        if (data.has_analysis) {
          setState({
            loading: false,
            generating: false,
            analysis: data.analysis,
            error: null,
          });
        } else {
          setState({
            loading: false,
            generating: false,
            analysis: null,
            error: null,
          });
        }
      } catch (err) {
        setState({
          loading: false,
          generating: false,
          analysis: null,
          error: 'Failed to fetch analysis',
        });
      }
    }
    fetchAnalysis();
  }, [itemId]);

  // Generate new analysis
  const generateAnalysis = useCallback(async () => {
    setState((prev) => ({ ...prev, generating: true, error: null }));
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (data.success) {
        setState({
          loading: false,
          generating: false,
          analysis: data.analysis,
          error: null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          generating: false,
          error: data.error || 'Analysis failed',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        generating: false,
        error: 'Failed to generate analysis',
      }));
    }
  }, [itemId]);

  const { loading, generating, analysis, error } = state;
  const hasAnalysis = !!analysis;
  const isProcessing = loading || generating;

  // Confidence bar color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Recommendation badge
  const getRecommendationBadge = (rec: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      approve: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approve' },
      needs_changes: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Needs Changes' },
      reject: { bg: 'bg-red-100', text: 'text-red-800', label: 'Reject' },
      escalate: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Escalate' },
    };
    return badges[rec] || badges.approve;
  };

  // Risk flag badge
  const getRiskBadge = (severity: string) => {
    const badges: Record<string, string> = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-gray-100 text-gray-800',
    };
    return badges[severity] || badges.low;
  };

  // Copy draft response
  const copyDraft = () => {
    if (analysis?.draft_response) {
      navigator.clipboard.writeText(analysis.draft_response);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
            <svg
              className="h-5 w-5 text-purple-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              BitBit Recommendation
            </h2>
            <p className="text-xs text-gray-500">
              {analysis
                ? `Generated in ${(analysis.generation_time_ms / 1000).toFixed(1)}s`
                : generating
                ? 'Generating...'
                : '--.-s'}
            </p>
          </div>
          {hasAnalysis && (
            <button
              onClick={generateAnalysis}
              disabled={generating}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="border-b border-red-100 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Generate button (when no analysis) */}
      {!hasAnalysis && !isProcessing && (
        <div className="p-6 text-center">
          <p className="mb-4 text-sm text-gray-500">
            No analysis yet. Click below to generate AI recommendations.
          </p>
          <button
            onClick={generateAnalysis}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Generate Analysis
          </button>
        </div>
      )}

      {/* Loading/Generating state */}
      {isProcessing && (
        <div className="divide-y divide-gray-100">
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-sm font-medium text-gray-700">Summary</h3>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <svg className="h-4 w-4 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">{generating ? 'Analyzing content...' : 'Loading...'}</span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      )}

      {/* Analysis results */}
      {hasAnalysis && !isProcessing && (
        <div className="divide-y divide-gray-100">
          {/* Summary Section */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-sm font-medium text-gray-700">Summary</h3>
            </div>
            <p className="text-sm text-gray-600">{analysis.summary}</p>
          </div>

          {/* Recommendation Section */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-medium text-gray-700">Recommendation</h3>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  getRecommendationBadge(analysis.recommendation).bg
                } ${getRecommendationBadge(analysis.recommendation).text}`}
              >
                {getRecommendationBadge(analysis.recommendation).label}
              </span>
              {/* Confidence bar */}
              <div className="flex flex-1 items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-gray-200">
                  <div
                    className={`h-2 rounded-full ${getConfidenceColor(analysis.confidence)}`}
                    style={{ width: `${analysis.confidence}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {analysis.confidence}%
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">{analysis.reasoning}</p>
          </div>

          {/* Questions for Human (if confidence < 70) */}
          {analysis.questions_for_human.length > 0 && (
            <div className="p-4 bg-amber-50">
              <div className="mb-2 flex items-center gap-2">
                <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-medium text-amber-800">Questions for Human</h3>
              </div>
              <ul className="space-y-1">
                {analysis.questions_for_human.map((q, i) => (
                  <li key={i} className="text-sm text-amber-700">
                    {i + 1}. {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Flags Section */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-sm font-medium text-gray-700">Risk Flags</h3>
            </div>
            {analysis.risk_flags.length > 0 ? (
              <ul className="space-y-2">
                {analysis.risk_flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getRiskBadge(
                        flag.severity
                      )}`}
                    >
                      {flag.severity}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-gray-700">{flag.category}</span>
                      <p className="text-sm text-gray-500">{flag.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No risks identified</p>
            )}
          </div>

          {/* Draft Response Section */}
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-medium text-gray-700">Draft Response</h3>
              </div>
              {analysis.draft_response && (
                <button
                  onClick={copyDraft}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              )}
            </div>
            {analysis.draft_response ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-gray-700">{analysis.draft_response}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No draft response generated</p>
            )}
          </div>

          {/* Suggested Tasks Section */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <h3 className="text-sm font-medium text-gray-700">Suggested Tasks</h3>
            </div>
            {analysis.suggested_tasks.length > 0 ? (
              <ul className="space-y-2">
                {analysis.suggested_tasks.map((task, i) => (
                  <li key={i} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{task.title}</span>
                      <span className="text-xs text-gray-500">
                        {task.owner} - {task.due_days}d
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{task.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No tasks suggested</p>
            )}
          </div>

          {/* Policies Applied */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-sm font-medium text-gray-700">Policies Applied</h3>
            </div>
            {analysis.policies_applied.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {analysis.policies_applied.map((policy, i) => (
                  <span
                    key={i}
                    className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                  >
                    {policy}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No policies referenced</p>
            )}
          </div>
        </div>
      )}

      {/* Decision Buttons */}
      <div className="border-t border-gray-100 p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-700">Decision</h3>
        <div className="grid grid-cols-2 gap-2">
          {/* Approve */}
          <button
            disabled={!hasAnalysis}
            className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
              hasAnalysis
                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                : 'border-green-200 bg-green-50 text-green-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Approve
          </button>

          {/* Needs Changes */}
          <button
            disabled={!hasAnalysis}
            className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
              hasAnalysis
                ? 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'border-yellow-200 bg-yellow-50 text-yellow-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Needs Changes
          </button>

          {/* Reject */}
          <button
            disabled={!hasAnalysis}
            className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
              hasAnalysis
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-red-200 bg-red-50 text-red-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject
          </button>

          {/* Escalate */}
          <button
            disabled={!hasAnalysis}
            className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
              hasAnalysis
                ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                : 'border-purple-200 bg-purple-50 text-purple-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
            </svg>
            Escalate
          </button>
        </div>
        {!hasAnalysis && (
          <p className="mt-2 text-center text-xs text-gray-400">
            Buttons will be enabled after AI analysis completes
          </p>
        )}
      </div>
    </div>
  );
}
