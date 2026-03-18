'use client';

import React from 'react';
import { MeetingsTab } from '@/components/meetings/meetings-tab';
import { TabShell } from '@/components/ui/tab-shell';

function MeetingsTabWrapper() {
  return (
    <TabShell variant="fixed">
      <MeetingsTab />
    </TabShell>
  );
}

export default React.memo(MeetingsTabWrapper);
