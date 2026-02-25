'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { SidebarNav } from './sidebar-nav';
import { BitBitOverlay } from './bitbit-overlay';

interface DashboardShellProps {
  children: React.ReactNode;
  displayName: string;
  initials: string;
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/chat': 'Chat',
  '/dashboard/channels': 'Channels',
  '/dashboard/medications': 'Medications',
  '/dashboard/contacts': 'Contacts',
  '/dashboard/leads': 'Leads',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/activity': 'Activity',
  '/dashboard/settings': 'Settings',
};

export function DashboardShell({ children, displayName, initials }: DashboardShellProps) {
  const pathname = usePathname();
  const currentPage = PAGE_NAMES[pathname] || 'Dashboard';

  return (
    <BitBitOverlay currentPage={currentPage}>
      <div className="bb-layout bb-dot-grid">
        <div className="bb-sidebar-area">
          <SidebarNav
            avatarFallback={initials}
            displayName={displayName}
          />
        </div>
        <div style={{ gridColumn: 2, gridRow: '1 / -1', display: 'contents' }}>
          {children}
        </div>
      </div>
    </BitBitOverlay>
  );
}
