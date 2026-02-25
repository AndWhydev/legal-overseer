'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { WatchManager } from '@/components/sentry/watch-manager';

function SentryTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Sentry</h1>
          <p className="text-sm text-muted-foreground">Monitor watches, alerts, and escalation status</p>
        </div>
      </div>

      <WatchManager />
    </div>
  );
}

export default React.memo(SentryTab);
