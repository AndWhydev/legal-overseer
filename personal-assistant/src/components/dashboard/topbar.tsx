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
    <>
      <div className="flex items-center gap-2">
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
