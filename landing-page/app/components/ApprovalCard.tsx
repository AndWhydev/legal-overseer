import Link from 'next/link';
import type { ApprovalItem } from '@/lib/types';

interface ApprovalCardProps {
  item: ApprovalItem;
}

// Status badge colors
const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  needs_changes: 'bg-orange-100 text-orange-800',
  escalated: 'bg-purple-100 text-purple-800',
};

// Type badge colors
const typeColors: Record<string, string> = {
  email: 'bg-blue-100 text-blue-800',
  content: 'bg-pink-100 text-pink-800',
  team: 'bg-indigo-100 text-indigo-800',
  ops: 'bg-gray-100 text-gray-800',
};

// Risk level colors
const riskColors: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

// Priority styling
const priorityStyles: Record<string, { border: string; label: string }> = {
  urgent: { border: 'border-l-red-500', label: 'URGENT' },
  high: { border: 'border-l-orange-400', label: 'HIGH' },
  normal: { border: 'border-l-gray-300', label: '' },
  low: { border: 'border-l-gray-200', label: '' },
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return dueDate < today;
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return '';

  const date = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(dueDate);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today';
  }
  if (dateOnly.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ApprovalCard({ item }: ApprovalCardProps) {
  const overdue = isOverdue(item.due_date);
  const priorityStyle = priorityStyles[item.priority] || priorityStyles.normal;

  return (
    <Link href={`/item/${item.id}`}>
      <article
        className={`
          group relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm
          transition-all hover:border-purple-200 hover:shadow-md
          border-l-4 ${priorityStyle.border}
        `}
      >
        {/* Header row: type badge, status, and timestamp */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type badge */}
            <span
              className={`
                inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                ${typeColors[item.type] || 'bg-gray-100 text-gray-800'}
              `}
            >
              {item.type}
            </span>

            {/* Status badge */}
            <span
              className={`
                inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                ${statusColors[item.status]}
              `}
            >
              {item.status.replace('_', ' ')}
            </span>

            {/* Risk level indicator (only for medium/high) */}
            {(item.risk_level === 'medium' || item.risk_level === 'high') && (
              <span
                className={`
                  inline-flex items-center gap-1 text-xs font-medium
                  ${riskColors[item.risk_level]}
                `}
                title={`${item.risk_level} risk`}
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {item.risk_level}
              </span>
            )}

            {/* Priority label (only for urgent/high) */}
            {priorityStyle.label && (
              <span className="text-xs font-bold text-red-600">
                {priorityStyle.label}
              </span>
            )}
          </div>

          {/* Timestamp */}
          <span className="whitespace-nowrap text-xs text-gray-400">
            {formatRelativeTime(item.created_at)}
          </span>
        </div>

        {/* Subject */}
        <h3 className="mb-1 text-sm font-semibold text-gray-900 line-clamp-1 group-hover:text-purple-600">
          {item.subject}
        </h3>

        {/* Sender info */}
        {(item.sender_name || item.sender_email) && (
          <p className="mb-2 text-xs text-gray-500">
            {item.sender_name && <span>{item.sender_name}</span>}
            {item.sender_name && item.sender_email && <span> &middot; </span>}
            {item.sender_email && <span>{item.sender_email}</span>}
          </p>
        )}

        {/* Body preview */}
        <p className="text-sm text-gray-600 line-clamp-2">{item.body}</p>

        {/* Footer: due date */}
        {item.due_date && (
          <div className="mt-3 flex items-center gap-1">
            <svg
              className={`h-4 w-4 ${overdue ? 'text-red-500' : 'text-gray-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span
              className={`text-xs font-medium ${
                overdue ? 'text-red-600' : 'text-gray-500'
              }`}
            >
              {overdue ? 'Overdue' : 'Due'}: {formatDueDate(item.due_date)}
            </span>
          </div>
        )}
      </article>
    </Link>
  );
}
