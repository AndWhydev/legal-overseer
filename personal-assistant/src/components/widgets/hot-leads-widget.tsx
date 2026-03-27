'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconTrendingUp } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

interface LeadRow {
  id: string
  prospect_name: string | null
  source_channel: string | null
  source_detail: string | null
  estimated_value: number | null
  score: string | null
  status: string
}

const SCORE_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  hot: 'destructive',
  warm: 'secondary',
  cold: 'outline',
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
      icon={<IconTrendingUp size={20} className="text-pink-400" />}
    >
      <div className="flex flex-col gap-3">
        {leads.length === 0 ? (
          <Empty><EmptyTitle>No active leads</EmptyTitle><EmptyDescription>New leads will appear here as they come in.</EmptyDescription></Empty>
        ) : (
          leads.map(lead => (
            <div key={lead.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
              <div className="flex-1">
                <p className="font-medium text-sm">{lead.prospect_name || lead.source_detail || lead.source_channel || 'Unnamed Lead'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lead.status === 'new' && 'New Contact'}
                  {lead.status === 'qualified' && 'Qualified'}
                  {lead.status === 'booked' && 'Booked'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {lead.score && (
                  <Badge variant={SCORE_VARIANT[lead.score] ?? 'outline'} className="uppercase text-xs">
                    {lead.score}
                  </Badge>
                )}
                <span className="text-sm font-medium font-mono text-amber-400">
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
