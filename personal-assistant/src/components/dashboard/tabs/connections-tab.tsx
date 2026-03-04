'use client';

import React from 'react';
import { Plug } from 'lucide-react';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';
import { ConnectionsGrid } from '@/components/connections/connections-grid';

function ConnectionsTab() {
  return (
    <TabShell>
      <TabHeader
        icon={Plug}
        iconColor="var(--bb-orange)"
        title="Connections"
      />
      <div className="flex flex-col gap-6 p-6">
        <ConnectionsGrid />
      </div>
    </TabShell>
  );
}

export default React.memo(ConnectionsTab);
