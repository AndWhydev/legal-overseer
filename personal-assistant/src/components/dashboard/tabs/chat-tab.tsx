'use client';

import React from 'react';
import { ChatInterface } from '@/components/chat/chat-interface';
import { ChatInputTooltip } from '@/components/onboarding/first-run-guide';

function ChatTab() {
  return (
    <div className="flex h-full flex-col">
      <ChatInputTooltip>
        <ChatInterface />
      </ChatInputTooltip>
    </div>
  );
}

export default React.memo(ChatTab);
