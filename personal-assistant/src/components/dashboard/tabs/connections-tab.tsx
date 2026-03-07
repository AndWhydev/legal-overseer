'use client';

import React from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { ConnectionsGrid } from '@/components/connections/connections-grid';

function ConnectionsTab() {
  return (
    <TabShell>
      <div className="flex flex-col gap-6 p-6">
        <ConnectionsGrid />
      </div>
    </TabShell>
  );
}

export default React.memo(ConnectionsTab);
