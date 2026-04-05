'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconFileText } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

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
      icon={<IconFileText size={20} className="text-muted-foreground" />}
    >
      <div className="flex flex-col gap-3">
        {quotes.length === 0 ? (
          <Empty><EmptyTitle>No outstanding quotes</EmptyTitle><EmptyDescription>Draft and sent quotes will appear here.</EmptyDescription></Empty>
        ) : (
          quotes.map(quote => (
            <div key={quote.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted border border-border">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base truncate">{(quote.title || quote.description || 'Untitled Quote') as string}</p>
                <p className="text-base text-muted-foreground mt-0.5">
                  {quote.customer_name ? `${quote.customer_name}` : ''}
                </p>
              </div>
              <div className="text-right flex items-center gap-2">
                <p className="text-base font-medium">{quote.total ? `$${Number(quote.total).toLocaleString()}` : '--'}</p>
                <Badge variant={quote.status === 'sent' ? 'default' : 'secondary'} className="text-base">
                  {(quote.status as string) || 'draft'}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
