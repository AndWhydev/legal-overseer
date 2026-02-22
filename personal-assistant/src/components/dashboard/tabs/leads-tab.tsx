'use client';

import React from 'react';
import { Handshake } from 'lucide-react';
import { LeadsKanban } from '@/components/leads/leads-kanban';

function LeadsTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
          <Handshake className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">Track and move leads across New, Qualified, Booked, and Won/Lost</p>
        </div>
      </div>

      <LeadsKanban />
    </div>
  );
}

export default React.memo(LeadsTab);
