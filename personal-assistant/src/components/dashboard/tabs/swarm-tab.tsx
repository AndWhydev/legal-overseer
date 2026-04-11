'use client';

import React from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { SwarmDashboard } from '@/components/swarm/swarm-dashboard';

function SwarmTab() {
  return (
    <TabShell>
      <SwarmDashboard />
    </TabShell>
  );
}

export default React.memo(SwarmTab);
