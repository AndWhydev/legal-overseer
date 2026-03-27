'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface TopbarConfig {
  title: string;
  breadcrumb?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  hidden?: boolean;
}

interface TopbarProps {
  config: TopbarConfig | undefined;
}

export function Topbar({ config }: TopbarProps) {
  if (!config || config.hidden) return null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/60 backdrop-blur-md px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground">{config.title}</h1>
        {config.breadcrumb && (
          <div className="text-sm text-muted-foreground">{config.breadcrumb}</div>
        )}
      </div>
      {config.centerContent && (
        <div className="flex items-center">{config.centerContent}</div>
      )}
      {config.rightContent && (
        <div className="flex items-center gap-2">{config.rightContent}</div>
      )}
    </header>
  );
}
