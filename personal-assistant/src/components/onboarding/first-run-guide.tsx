'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { HelpTooltip } from './help-tooltip';

interface FirstRunGuideContextType {
  isFirstRun: boolean;
  dismissedTooltips: Set<string>;
  dismissTooltip: (key: string) => void;
  skipAllTooltips: () => void;
}

const FirstRunGuideContext = createContext<FirstRunGuideContextType | undefined>(undefined);

export function FirstRunGuideProvider({ children }: { children: React.ReactNode }) {
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [dismissedTooltips, setDismissedTooltips] = useState<Set<string>>(new Set());

  // Check if first-run guide has been completed
  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        const res = await fetch('/api/profile/preferences');
        if (res.ok) {
          const { preferences } = await res.json();
          const hasSeenGuide = preferences?.first_run_guide_completed === true;
          setIsFirstRun(!hasSeenGuide);

          // Load dismissed tooltips from localStorage
          const localDismissed = new Set<string>();
          const tooltips = ['chat-input', 'kanban-board', 'channels-page', 'contacts-page'];
          tooltips.forEach((key) => {
            if (localStorage.getItem(`bitbit-help-dismissed-${key}`) === 'true') {
              localDismissed.add(key);
            }
          });
          setDismissedTooltips(localDismissed);
        }
      } catch {
        // Fall back to checking localStorage
        const localDismissed = new Set<string>();
        const tooltips = ['chat-input', 'kanban-board', 'channels-page', 'contacts-page'];
        tooltips.forEach((key) => {
          if (localStorage.getItem(`bitbit-help-dismissed-${key}`) === 'true') {
            localDismissed.add(key);
          }
        });
        setDismissedTooltips(localDismissed);
      }
    };

    checkFirstRun();
  }, []);

  const dismissTooltip = (key: string) => {
    const newDismissed = new Set(dismissedTooltips);
    newDismissed.add(key);
    setDismissedTooltips(newDismissed);

    // Check if all tooltips are dismissed
    const allTooltips = ['chat-input', 'kanban-board', 'channels-page', 'contacts-page'];
    if (allTooltips.every((t) => newDismissed.has(t))) {
      markGuideAsComplete();
    }
  };

  const skipAllTooltips = () => {
    const allTooltips = ['chat-input', 'kanban-board', 'channels-page', 'contacts-page'];
    allTooltips.forEach((key) => {
      localStorage.setItem(`bitbit-help-dismissed-${key}`, 'true');
    });
    markGuideAsComplete();
  };

  const markGuideAsComplete = () => {
    setIsFirstRun(false);
    try {
      fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_run_guide_completed: true }),
      }).catch(() => {
        // Best effort
      });
    } catch {
      // Silently fail
    }
  };

  return (
    <FirstRunGuideContext.Provider
      value={{
        isFirstRun,
        dismissedTooltips,
        dismissTooltip,
        skipAllTooltips,
      }}
    >
      {children}
    </FirstRunGuideContext.Provider>
  );
}

export function useFirstRunGuide() {
  const context = useContext(FirstRunGuideContext);
  if (!context) {
    throw new Error('useFirstRunGuide must be used within FirstRunGuideProvider');
  }
  return context;
}

// ─── Contextual Tooltip Components ───────────────────────────────────────

interface TooltipWrapperProps {
  tooltipKey: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

export function ChatInputTooltip({ children }: { children: React.ReactNode }) {
  const { isFirstRun, dismissedTooltips, dismissTooltip } = useFirstRunGuide();

  if (!isFirstRun || dismissedTooltips.has('chat-input')) {
    return <>{children}</>;
  }

  return (
    <HelpTooltip
      tooltipKey="chat-input"
      title="Ask BitBit"
      description="Ask me about your emails, tasks, or contacts. I work across all your connected tools."
      placement="top"
      onDismiss={() => dismissTooltip('chat-input')}
    >
      {children}
    </HelpTooltip>
  );
}

export function KanbanBoardTooltip({ children }: { children: React.ReactNode }) {
  const { isFirstRun, dismissedTooltips, dismissTooltip } = useFirstRunGuide();

  if (!isFirstRun || dismissedTooltips.has('kanban-board')) {
    return <>{children}</>;
  }

  return (
    <HelpTooltip
      tooltipKey="kanban-board"
      title="Organize with ease"
      description="Drag cards between columns to update status. BitBit learns your workflow."
      placement="top"
      onDismiss={() => dismissTooltip('kanban-board')}
    >
      {children}
    </HelpTooltip>
  );
}

export function ChannelsPageTooltip({ children }: { children: React.ReactNode }) {
  const { isFirstRun, dismissedTooltips, dismissTooltip } = useFirstRunGuide();

  if (!isFirstRun || dismissedTooltips.has('channels-page')) {
    return <>{children}</>;
  }

  return (
    <HelpTooltip
      tooltipKey="channels-page"
      title="Connect your sources"
      description="Connect your email and other tools to let BitBit search your messages and stay in sync."
      placement="top"
      onDismiss={() => dismissTooltip('channels-page')}
    >
      {children}
    </HelpTooltip>
  );
}

export function ContactsPageTooltip({ children }: { children: React.ReactNode }) {
  const { isFirstRun, dismissedTooltips, dismissTooltip } = useFirstRunGuide();

  if (!isFirstRun || dismissedTooltips.has('contacts-page')) {
    return <>{children}</>;
  }

  return (
    <HelpTooltip
      tooltipKey="contacts-page"
      title="Your network, enriched"
      description="BitBit automatically enriches contacts from your communications, emails, and collaborations."
      placement="top"
      onDismiss={() => dismissTooltip('contacts-page')}
    >
      {children}
    </HelpTooltip>
  );
}

export function FirstRunGuideSkipButton() {
  const { isFirstRun, skipAllTooltips } = useFirstRunGuide();

  if (!isFirstRun) {
    return null;
  }

  return (
    <button
      onClick={skipAllTooltips}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-secondary, #94A3B8)',
        fontSize: 12,
        cursor: 'pointer',
        padding: '4px 8px',
        transition: 'color 0.15s ease',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.color = 'var(--text-primary, #F1F5F9)';
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.color = 'var(--text-secondary, #94A3B8)';
      }}
      title="Skip all help tooltips for this session"
    >
      Skip all tips
    </button>
  );
}
