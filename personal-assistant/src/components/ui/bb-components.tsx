import React from 'react';

interface BBTabTitleProps {
  title: string;
  className?: string;
}

export function BBTabTitle({ title, className }: BBTabTitleProps) {
  return (
    <h2 className={className ?? 'text-2xl font-semibold tracking-tight'}>
      {title}
    </h2>
  );
}
