'use client';

import React from 'react';
import { LeadsPage } from '@/components/leads/leads-page';
import { TabShell } from '@/components/ui/tab-shell';

function LeadsTab() {
  return (
    <TabShell variant="fixed">
      <LeadsPage />
    </TabShell>
  );
}

export default React.memo(LeadsTab);
