'use client';

import React from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { ConnectionsGrid } from '@/components/connections/connections-grid';
import { ChannelsPageTooltip } from '@/components/onboarding/first-run-guide';

function ConnectionsTab() {
  return (
    <TabShell>
      <ChannelsPageTooltip>
        <div className="flex flex-col gap-6 p-6">
          <ConnectionsGrid />
        </div>
      </ChannelsPageTooltip>
    </TabShell>
  );
}

export default React.memo(ConnectionsTab);
