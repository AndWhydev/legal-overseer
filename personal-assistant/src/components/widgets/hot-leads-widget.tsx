'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

interface LeadRow {
  id: string
  prospect_name: string | null
  source_channel: string | null
  source_detail: string | null
  estimated_value: number | null
  score: string | null
  status: string
}

const SCORE_COLOR: Record<string, string> = {
  hot: 'var(--bb-red)',
  warm: 'var(--bb-amber)',
  cold: 'var(--bb-blue)',
}

export function HotLeadsWidget() {
  const [leads, setLeads] = useState<LeadRow[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('leads')
      .select('id, prospect_name, source_channel, source_detail, estimated_value, score, status')
      .in('status', ['new', 'qualified', 'booked'])
      .in('score', ['hot', 'warm'])
      .order('estimated_value', { ascending: false, nullsFirst: false })
      .limit(3)
      .then(({ data }) => { if (data) setLeads(data as LeadRow[]); });
  }, []);

  return (
    <WidgetCard
      title="Hot Leads"
      subtitle="Top opportunities this week"
      icon={<TrendingUp size={20} style={{ color: 'var(--bb-pink)' }} />}
    >
      <div className="space-y-3">
        {leads.length === 0 ? (
          <EmptyState title="No active leads" description="New leads will appear here as they come in." />
        ) : (
          leads.map(lead => (
            <div key={lead.id} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="flex-1">
                <p className="font-medium text-sm">{lead.prospect_name || lead.source_detail || lead.source_channel || 'Unnamed Lead'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lead.status === 'new' && 'New Contact'}
                  {lead.status === 'qualified' && 'Qualified'}
                  {lead.status === 'booked' && 'Booked'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {lead.score && (
                  <span style={{
                    fontSize: 14,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    color: SCORE_COLOR[lead.score] ?? 'var(--text-dim)',
                  }}>
                    {lead.score}
                  </span>
                )}
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--bb-amber)',
                }}>
                  {lead.estimated_value != null ? `$${lead.estimated_value.toLocaleString()}` : '--'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
