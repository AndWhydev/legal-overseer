'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ReceiptText } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

export function OutstandingQuotesWidget() {
  const [quotes, setQuotes] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('quotes').select('*')
      .in('status', ['draft', 'sent'])
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setQuotes(data); });
  }, []);

  return (
    <WidgetCard
      title="Outstanding Quotes"
      subtitle={`${quotes.length} quote${quotes.length !== 1 ? 's' : ''} pending`}
      icon={<ReceiptText size={20} style={{ color: 'var(--bb-status-warning)' }} />}
    >
      <div className="space-y-3">
        {quotes.length === 0 ? (
          <EmptyState title="No outstanding quotes" description="Draft and sent quotes will appear here." />
        ) : (
          quotes.map(quote => (
            <div key={quote.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{(quote.title || quote.description || 'Untitled Quote') as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {quote.customer_name ? `${quote.customer_name}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium">{quote.total ? `$${Number(quote.total).toLocaleString()}` : '--'}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  quote.status === 'sent'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}>
                  {(quote.status as string) || 'draft'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
