'use client';

/**
 * ChatHistorySidebar — sidebar variant for Chat mode.
 *
 * Renders pinned/recent chat threads using the existing ChatSidebarPanel
 * (which already reads from ChatThreadsContext). Delegates all thread logic
 * to that component to avoid duplication.
 */

import React from 'react';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChatSidebarPanel } from '@/components/chat/chat-sidebar-panel';

interface ChatHistorySidebarProps {
  onTabChange?: (tabId: string) => void;
}

export function ChatHistorySidebar({ onTabChange }: ChatHistorySidebarProps) {
  const handleNewChat = () => {
    onTabChange?.('chat');
    // Dispatch focus event so the chat input focuses
    window.dispatchEvent(new Event('bb-chat-focus'));
  };

  return (
    <div className="flex h-full flex-col gap-2 px-2 pb-2 pt-1">
      {/* New Chat CTA */}
      <Button
        variant="default"
        size="default"
        className="h-8 w-full justify-start rounded-xl bg-foreground px-3 text-sm font-medium text-background shadow-sm hover:bg-foreground/90 gap-2"
        onClick={handleNewChat}
      >
        <IconPlus className="size-4" />
        New chat
      </Button>

      <Separator className="mx-0" />

      {/* Thread list — delegates to existing ChatSidebarPanel */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChatSidebarPanel />
      </div>
    </div>
  );
}
