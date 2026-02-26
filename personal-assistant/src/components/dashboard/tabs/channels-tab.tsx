'use client';

import React from 'react';
import { Cable } from 'lucide-react';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';
import { ChannelGrid } from '@/components/channels/channel-grid';

function ChannelsTab() {
  return (
    <TabShell>
      <TabHeader
        icon={Cable}
        iconColor="var(--bb-orange)"
        title="Channels"
      />
      <div className="flex flex-col gap-6 p-6">
        <ChannelGrid />
      </div>
    </TabShell>
  );
}

export default React.memo(ChannelsTab);
