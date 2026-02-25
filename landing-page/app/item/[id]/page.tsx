import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItemById } from '@/lib/queries';
import ItemContent from '@/app/components/ItemContent';
import RecommendationPanel from '@/app/components/RecommendationPanel';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ItemDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const itemId = parseInt(id, 10);

  if (isNaN(itemId)) {
    notFound();
  }

  const item = getItemById(itemId);

  if (!item) {
    notFound();
  }

  // Preserve lane and filter state for back navigation
  const backParams = new URLSearchParams();
  if (resolvedSearchParams.lane) {
    backParams.set('lane', String(resolvedSearchParams.lane));
  }
  if (resolvedSearchParams.status) {
    backParams.set('status', String(resolvedSearchParams.status));
  }
  if (resolvedSearchParams.type) {
    backParams.set('type', String(resolvedSearchParams.type));
  }
  if (resolvedSearchParams.priority) {
    backParams.set('priority', String(resolvedSearchParams.priority));
  }
  if (resolvedSearchParams.risk) {
    backParams.set('risk', String(resolvedSearchParams.risk));
  }
  if (resolvedSearchParams.due) {
    backParams.set('due', String(resolvedSearchParams.due));
  }
  const backUrl = backParams.toString() ? `/?${backParams.toString()}` : '/';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href={backUrl}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Inbox
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-purple-600">BitBit</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column: Item content */}
          <div className="min-w-0">
            <ItemContent item={item} />
          </div>

          {/* Right column: Recommendation panel */}
          <div className="min-w-0">
            <RecommendationPanel itemId={item.id} />
          </div>
        </div>
      </main>
    </div>
  );
}
