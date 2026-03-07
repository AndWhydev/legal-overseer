'use client';

import React from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { ChannelGrid } from '@/components/channels/channel-grid';

function ChannelsTab() {
  return (
    <TabShell>
      <div className="flex flex-col gap-6 p-6">
        <ChannelGrid />
      </div>
    </TabShell>
  );
}

export default React.memo(ChannelsTab);
