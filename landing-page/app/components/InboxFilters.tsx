'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { Lane } from '@/lib/types';

interface FilterOption {
  value: string;
  label: string;
}

const statusOptions: FilterOption[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'needs_changes', label: 'Needs Changes' },
  { value: 'escalated', label: 'Escalated' },
];

const xixiTypeOptions: FilterOption[] = [
  { value: '', label: 'All Types' },
  { value: 'email', label: 'Customer Email' },
  { value: 'team', label: 'Team Email' },
  { value: 'content', label: 'Content' },
];

const allenTypeOptions: FilterOption[] = [
  { value: '', label: 'All Types' },
  { value: 'ops', label: 'Operations' },
  { value: 'stock', label: 'Stock' },
  { value: 'expo', label: 'Expo' },
];

const priorityOptions: FilterOption[] = [
  { value: '', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const riskOptions: FilterOption[] = [
  { value: '', label: 'All Risk Levels' },
  { value: 'high', label: 'High Risk' },
  { value: 'medium', label: 'Medium Risk' },
  { value: 'low', label: 'Low Risk' },
];

const dueDateOptions: FilterOption[] = [
  { value: '', label: 'All Due Dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due Today' },
  { value: 'this_week', label: 'Due This Week' },
  { value: 'no_due_date', label: 'No Due Date' },
];

interface InboxFiltersProps {
  lane: Lane;
}

export default function InboxFilters({ lane }: InboxFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const typeOptions = lane === 'xixi' ? xixiTypeOptions : allenTypeOptions;

  const selectClasses = `
    block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
    focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500
    cursor-pointer
  `;

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      {/* Status filter */}
      <div className="w-full sm:w-auto">
        <select
          className={selectClasses}
          value={searchParams.get('status') || ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          aria-label="Filter by status"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Type filter */}
      <div className="w-full sm:w-auto">
        <select
          className={selectClasses}
          value={searchParams.get('type') || ''}
          onChange={(e) => updateFilter('type', e.target.value)}
          aria-label="Filter by type"
        >
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Priority filter */}
      <div className="w-full sm:w-auto">
        <select
          className={selectClasses}
          value={searchParams.get('priority') || ''}
          onChange={(e) => updateFilter('priority', e.target.value)}
          aria-label="Filter by priority"
        >
          {priorityOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Risk level filter */}
      <div className="w-full sm:w-auto">
        <select
          className={selectClasses}
          value={searchParams.get('risk_level') || ''}
          onChange={(e) => updateFilter('risk_level', e.target.value)}
          aria-label="Filter by risk level"
        >
          {riskOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Due date filter */}
      <div className="w-full sm:w-auto">
        <select
          className={selectClasses}
          value={searchParams.get('due_date') || ''}
          onChange={(e) => updateFilter('due_date', e.target.value)}
          aria-label="Filter by due date"
        >
          {dueDateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear filters button - only show if filters are active */}
      {(searchParams.get('status') ||
        searchParams.get('type') ||
        searchParams.get('priority') ||
        searchParams.get('risk_level') ||
        searchParams.get('due_date')) && (
        <button
          onClick={() => {
            const params = new URLSearchParams();
            params.set('lane', lane);
            router.push(`/?${params.toString()}`);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Clear
        </button>
      )}
    </div>
  );
}
