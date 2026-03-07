'use client';

import React from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { WatchManager } from '@/components/sentry/watch-manager';

function SentryTab() {
  return (
    <TabShell>
      <div className="flex flex-col gap-6 p-6">
        <WatchManager />
      </div>
    </TabShell>
  );
}

export default React.memo(SentryTab);
