'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp } from 'lucide-react';
import { WidgetCard } from './widget-card';

export function RevenueWeekWidget() {
  const [total, setTotal] = useState<number>(0);
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    supabase.from('invoices').select('total')
      .eq('status', 'paid')
      .gte('paid_at', weekAgo.toISOString())
      .then(({ data }) => {
        if (data) {
          setCount(data.length);
          setTotal(data.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0));
        }
      });
  }, []);

  return (
    <WidgetCard
      title="Revenue This Week"
      subtitle={`${count} paid invoice${count !== 1 ? 's' : ''}`}
      icon={<TrendingUp size={20} style={{ color: 'var(--bb-status-success)' }} />}
    >
      <div className="flex items-center justify-center py-6">
        <p className="text-3xl font-bold">${total.toLocaleString()}</p>
      </div>
    </WidgetCard>
  );
}
