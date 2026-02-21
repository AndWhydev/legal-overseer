'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ApprovalQueue } from '@/components/dashboard/approval-queue';

function ApprovalsTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/15 text-success">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">Review and resolve pending agent actions</p>
        </div>
      </div>

      <ApprovalQueue />
    </div>
  );
}

export default React.memo(ApprovalsTab);
