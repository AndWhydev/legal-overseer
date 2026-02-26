'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ApprovalQueue } from '@/components/dashboard/approval-queue';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';

function ApprovalsTab() {
  return (
    <TabShell>
      <TabHeader
        icon={<ShieldCheck size={22} />}
        iconColor="var(--bb-status-warning)"
        title="Approval Queue"
        subtitle="Review and resolve pending agent actions"
      />
      <ApprovalQueue />
    </TabShell>
  );
}

export default React.memo(ApprovalsTab);
