'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';
import { WatchManager } from '@/components/sentry/watch-manager';

function SentryTab() {
  return (
    <TabShell>
      <TabHeader
        icon={ShieldAlert}
        iconColor="var(--bb-status-error)"
        title="Sentry"
      />
      <div className="flex flex-col gap-6 p-6">
        <WatchManager />
      </div>
    </TabShell>
  );
}

export default React.memo(SentryTab);
