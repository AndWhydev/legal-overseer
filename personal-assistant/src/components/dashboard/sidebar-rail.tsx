'use client';

import React from 'react';
import Image from 'next/image';
import {
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  Brain,
  Wrench,
  Settings,
} from 'lucide-react';
import type { SidebarCategory } from '@/lib/modules/registry';
import type { BadgeCounts } from '@/hooks/use-badge-counts';

const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  Brain,
  Wrench,
  Settings,
};

interface SidebarRailProps {
  categories: SidebarCategory[];
  activeCategory: string | null;
  badgeCounts: BadgeCounts;
  onCategoryChange: (categoryId: string) => void;
  avatarUrl?: string;
  avatarFallback?: string;
  onAvatarClick: () => void;
  profileOpen: boolean;
}

export function SidebarRail({
  categories,
  activeCategory,
  badgeCounts,
  onCategoryChange,
  avatarUrl,
  avatarFallback = 'U',
  onAvatarClick,
  profileOpen,
}: SidebarRailProps) {
  // Aggregate badge count for Business category
  const businessBadge = badgeCounts.inbox + badgeCounts.leads + badgeCounts.invoices + badgeCounts.approvals;

  return (
    <div className="bb-sidebar-rail">
      {/* Logo */}
      <div className="bb-sidebar__logo" aria-label="BitBit">
        <Image src="/bitbit-logo.svg" alt="BitBit" width={28} height={28} priority style={{ filter: 'brightness(0) invert(1)' }} />
      </div>

      {/* Category icons */}
      <nav className="bb-sidebar-rail__nav" aria-label="Navigation categories">
        {categories.map(cat => {
          const Icon = CATEGORY_ICON_MAP[cat.icon];
          if (!Icon) return null;
          const isActive = activeCategory === cat.id;

          // Badge for business category
          const badge = cat.id === 'business' && businessBadge > 0 ? businessBadge : 0;

          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`bb-sidebar-rail__item${isActive ? ' bb-sidebar-rail__item--active' : ''}`}
              aria-label={cat.label}
              aria-pressed={isActive}
              data-tooltip={cat.label}
              data-category={cat.id}
            >
              <Icon size={20} strokeWidth={1.8} />
              {badge > 0 && (
                <span className="bb-sidebar-rail__badge" aria-hidden="true">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Separator */}
      <div
        style={{
          width: '32px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
          margin: '8px auto',
        }}
        aria-hidden="true"
      />

      {/* Avatar */}
      <div
        className="bb-sidebar__avatar"
        role="button"
        tabIndex={0}
        onClick={onAvatarClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAvatarClick(); } }}
        aria-expanded={profileOpen}
        aria-haspopup="true"
        data-tooltip={!profileOpen ? 'Profile' : undefined}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="User avatar" width={36} height={36} className="bb-sidebar__avatar-img" />
        ) : (
          <span
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {avatarFallback}
          </span>
        )}
      </div>
    </div>
  );
}
