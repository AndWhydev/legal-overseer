'use client';

import React from 'react';
import { Handshake } from 'lucide-react';
import { LeadsKanban } from '@/components/leads/leads-kanban';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';

function LeadsTab() {
  return (
    <TabShell>
      <TabHeader
        icon={<Handshake size={22} />}
        iconColor="var(--bb-blue)"
        title="Leads"
        subtitle="Track and move leads across New, Qualified, Booked, and Won/Lost"
      />
      <LeadsKanban />
    </TabShell>
  );
}

export default React.memo(LeadsTab);
