'use client';

import React from 'react';
import { ChatInterface } from '@/components/chat/chat-interface';

function ChatTab() {
  return (
    <div className="flex h-full flex-col">
      <ChatInterface />
    </div>
  );
}

export default React.memo(ChatTab);
