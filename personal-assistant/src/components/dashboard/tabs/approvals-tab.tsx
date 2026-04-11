'use client';

import React from 'react';
import { ApprovalQueue } from '@/components/dashboard/approval-queue';
import { TabShell } from '@/components/ui/tab-shell';

function ApprovalsTab() {
  return (
    <TabShell>
      <ApprovalQueue />
    </TabShell>
  );
}

export default React.memo(ApprovalsTab);
