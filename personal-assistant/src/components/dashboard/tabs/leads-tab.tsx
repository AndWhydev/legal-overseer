'use client';

import React from 'react';
import { LeadsKanban } from '@/components/leads/leads-kanban';
import { TabShell } from '@/components/ui/tab-shell';

function LeadsTab() {
  return (
    <TabShell>
      <LeadsKanban />
    </TabShell>
  );
}

export default React.memo(LeadsTab);
