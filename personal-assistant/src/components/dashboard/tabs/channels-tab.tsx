'use client';

import React from 'react';
import { Radio } from 'lucide-react';
import { ChannelGrid } from '@/components/channels/channel-grid';

function ChannelsTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4A574]/15 text-[#D4A574]">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Channels</h1>
          <p className="text-sm text-muted-foreground">Connect and sync your communication channels</p>
        </div>
      </div>
      <ChannelGrid />
    </div>
  );
}

export default React.memo(ChannelsTab);
