'use client';

import React from 'react';
import { WatchManager } from '@/components/sentry/watch-manager';

function SentryTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <WatchManager />
    </div>
  );
}

export default React.memo(SentryTab);
