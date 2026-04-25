'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { Mode } from '@/lib/dashboard/mode-store';

export interface TopbarConfig {
  title: string;
  breadcrumb?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  hidden?: boolean;
}

/** Human-readable mode labels for the topbar prefix. */
const MODE_LABELS: Record<Mode, string> = {
  chat: 'CHAT',
  inbox: 'INBOX',
  work: 'WORK',
  money: 'MONEY',
};

interface TopbarProps {
  config: TopbarConfig | undefined;
  /** When set (MODES_ENABLED), prepends a subdued mode identifier before the page title. */
  activeMode?: Mode;
}

export function Topbar({ config, activeMode }: TopbarProps) {
  if (!config || config.hidden) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Mode prefix — subdued monospace caps treatment, flag-off: never rendered */}
        {activeMode && (
          <span
            className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70 select-none"
            aria-label={`Current mode: ${MODE_LABELS[activeMode]}`}
          >
            {MODE_LABELS[activeMode]}
            <span className="mx-1.5 opacity-40">·</span>
          </span>
        )}
        <h1 className="text-base font-medium">{config.title}</h1>
        {config.breadcrumb && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {config.breadcrumb}
          </div>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center">
        {config.centerContent}
      </div>
      {config.rightContent && (
        <div className="flex items-center gap-2">{config.rightContent}</div>
      )}
    </>
  );
}
