import type { ApprovalItem } from '@/lib/types';

interface ItemContentProps {
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

// Priority badge colors
const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: 'bg-gray-100 text-gray-800',
  low: 'bg-gray-50 text-gray-600',
};

// Risk level colors
const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

// Delivery status colors
const deliveryStatusColors: Record<string, string> = {
  processing: 'bg-gray-100 text-gray-800',
  shipped: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return dueDate < today;
}

export default function ItemContent({ item }: ItemContentProps) {
  const overdue = isOverdue(item.due_date);

  // Parse attachments if present
  let attachments: string[] = [];
  if (item.attachments) {
    try {
      attachments = JSON.parse(item.attachments);
    } catch {
      // Invalid JSON, ignore
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 p-6">
        {/* Subject */}
        <h1 className="mb-3 text-xl font-semibold text-gray-900">
          {item.subject}
        </h1>

        {/* Sender info */}
        {(item.sender_name || item.sender_email) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>
              {item.sender_name && <span className="font-medium">{item.sender_name}</span>}
              {item.sender_name && item.sender_email && <span> &middot; </span>}
              {item.sender_email && (
                <a
                  href={`mailto:${item.sender_email}`}
                  className="text-purple-600 hover:underline"
                >
                  {item.sender_email}
                </a>
              )}
            </span>
          </div>
        )}

        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              typeColors[item.type] || 'bg-gray-100 text-gray-800'
            }`}
          >
            {item.type}
          </span>

          {/* Status */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              statusColors[item.status]
            }`}
          >
            {item.status.replace('_', ' ')}
          </span>

          {/* Priority */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              priorityColors[item.priority]
            }`}
          >
            {item.priority}
          </span>

          {/* Risk Level */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              riskColors[item.risk_level]
            }`}
          >
            {item.risk_level} risk
          </span>

          {/* Due date */}
          {item.due_date && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                overdue
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {overdue ? 'Overdue: ' : 'Due: '}
              {formatDate(item.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Body content */}
      <div className="p-6">
        <div className="prose prose-sm max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-gray-700">
            {item.body}
          </pre>
        </div>
      </div>

      {/* Customer support fields */}
      {(item.order_number || item.tracking_number || item.delivery_status) && (
        <div className="border-t border-gray-100 bg-gray-50 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Order Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {item.order_number && (
              <div>
                <span className="text-gray-500">Order #:</span>{' '}
                <span className="font-medium text-gray-900">{item.order_number}</span>
              </div>
            )}
            {item.tracking_number && (
              <div>
                <span className="text-gray-500">Tracking #:</span>{' '}
                <span className="font-medium text-gray-900">{item.tracking_number}</span>
              </div>
            )}
            {item.order_date && (
              <div>
                <span className="text-gray-500">Order Date:</span>{' '}
                <span className="font-medium text-gray-900">{formatDate(item.order_date)}</span>
              </div>
            )}
            {item.delivery_status && (
              <div>
                <span className="text-gray-500">Delivery Status:</span>{' '}
                <span
                  className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    deliveryStatusColors[item.delivery_status] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {item.delivery_status.replace('_', ' ')}
                </span>
              </div>
            )}
            {item.has_shipping_insurance && (
              <div className="col-span-2">
                <span className="inline-flex items-center gap-1 text-green-700">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Shipping Insurance
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content approval fields */}
      {(item.asset_link || item.platform || item.publish_date) && (
        <div className="border-t border-gray-100 bg-gray-50 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Content Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {item.platform && (
              <div>
                <span className="text-gray-500">Platform:</span>{' '}
                <span className="font-medium text-gray-900 capitalize">{item.platform}</span>
              </div>
            )}
            {item.publish_date && (
              <div>
                <span className="text-gray-500">Publish Date:</span>{' '}
                <span className="font-medium text-gray-900">{formatDate(item.publish_date)}</span>
              </div>
            )}
            {item.asset_link && (
              <div className="col-span-2">
                <span className="text-gray-500">Asset:</span>{' '}
                <a
                  href={item.asset_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-purple-600 hover:underline"
                >
                  View Asset
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-t border-gray-100 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Attachments</h3>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <a
                key={index}
                href={attachment}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
                {attachment.split('/').pop() || `Attachment ${index + 1}`}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp footer */}
      <div className="border-t border-gray-100 px-6 py-3">
        <span className="text-xs text-gray-500">
          Received {formatRelativeTime(item.created_at)}
        </span>
      </div>
    </div>
  );
}
