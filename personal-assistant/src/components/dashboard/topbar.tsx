'use client';

import React from 'react';

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
    <header className="bb-topbar">
      <div className="bb-topbar__left">
        <h1 className="bb-topbar__title">{config.title}</h1>
        {config.breadcrumb && (
          <div className="bb-topbar__breadcrumb">{config.breadcrumb}</div>
        )}
      </div>
      {config.centerContent && (
        <div className="bb-topbar__center">{config.centerContent}</div>
      )}
      {config.rightContent && (
        <div className="bb-topbar__right">{config.rightContent}</div>
      )}
    </header>
  );
}
