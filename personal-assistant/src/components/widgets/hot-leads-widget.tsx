'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

export function HotLeadsWidget() {
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('leads').select('*')
      .in('status', ['new', 'contacted', 'qualified'])
      .order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => { if (data) setLeads(data); });
  }, []);

  return (
    <WidgetCard
      title="Hot Leads"
      subtitle="Top opportunities this week"
      icon={<TrendingUp size={20} style={{ color: 'var(--bb-pink, #EC4899)' }} />}
    >
      <div className="space-y-3">
        {leads.length === 0 ? (
          <EmptyState icon={<TrendingUp size={32} />} title="No active leads" description="New leads will appear here as they come in." />
        ) : (
          leads.map(lead => (
            <div key={lead.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="flex-1">
                <p className="font-medium text-sm">{((lead.metadata as Record<string, unknown>)?.name || (lead.metadata as Record<string, unknown>)?.company || lead.source_channel || 'Unnamed Lead') as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lead.status === 'new' && 'New Contact'}
                  {lead.status === 'contacted' && 'Contacted'}
                  {lead.status === 'qualified' && 'Qualified'}
                </p>
              </div>
              <div className="text-xs font-medium text-amber-500">{(lead.metadata as Record<string, unknown>)?.value ? `$${(lead.metadata as Record<string, unknown>).value}` : (lead.budget_range as string) || '--'}</div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
