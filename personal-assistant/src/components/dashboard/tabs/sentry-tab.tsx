'use client';

import React from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { WatchManager } from '@/components/sentry/watch-manager';

function SentryTab() {
  return (
    <TabShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
        <WatchManager />
      </div>
    </TabShell>
  );
}

export default React.memo(SentryTab);
