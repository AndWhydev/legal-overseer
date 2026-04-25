'use client';

/**
 * WorkViewsSidebar — sidebar variant for Work mode.
 *
 * Sections: Views (Today/Upcoming/Someday), Projects (collapsible),
 * Filters (@me / Overdue / This week). CTA: + Task.
 *
 * Uses existing Shadcn primitives and Tabler icons.
 * No per-mode color tokens — monochrome only.
 */

import React, { useState } from 'react';
import {
  IconPlus,
  IconCalendar,
  IconCalendarUp,
  IconCloudUpload,
  IconChevronRight,
  IconUser,
  IconAlertTriangle,
  IconCalendarWeek,
  IconFolder,
} from '@tabler/icons-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroupLabel,
} from '@/components/animate-ui/components/radix/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkView {
  id: string;
  label: string;
  icon: React.ElementType;
  count?: number;
  tabId?: string;
}

interface WorkProject {
  id: string;
  name: string;
  taskCount: number;
  activeCount: number;
}

// ─── Static data (Phase 02 uses no new APIs — placeholder shape) ──────────────

const VIEWS: WorkView[] = [
  { id: 'today', label: 'Today', icon: IconCalendar, count: 0, tabId: 'tasks' },
  { id: 'upcoming', label: 'Upcoming', icon: IconCalendarUp, count: 0, tabId: 'tasks' },
  { id: 'someday', label: 'Someday', icon: IconCloudUpload, tabId: 'tasks' },
];

const FILTERS: WorkView[] = [
  { id: 'me', label: '@me', icon: IconUser, tabId: 'tasks' },
  { id: 'overdue', label: 'Overdue', icon: IconAlertTriangle, tabId: 'tasks' },
  { id: 'this-week', label: 'This week', icon: IconCalendarWeek, tabId: 'tasks' },
];

// Placeholder projects — in Phase 03 these will come from the tasks API
const PLACEHOLDER_PROJECTS: WorkProject[] = [];

interface WorkViewsSidebarProps {
  onTabChange?: (tabId: string) => void;
}

export function WorkViewsSidebar({ onTabChange }: WorkViewsSidebarProps) {
  const [projectsOpen, setProjectsOpen] = useState(true);

  const navigate = (tabId?: string) => {
    if (tabId) onTabChange?.(tabId);
  };

  return (
    <div className="flex h-full flex-col gap-2 px-2 pb-2 pt-1">
      {/* New Task CTA */}
      <Button
        variant="default"
        size="default"
        className="h-8 w-full justify-start rounded-xl bg-foreground px-3 text-sm font-medium text-background shadow-sm hover:bg-foreground/90 gap-2"
        onClick={() => window.dispatchEvent(new CustomEvent('sidebar-cta-tasks'))}
      >
        <IconPlus className="size-4" />
        Task
      </Button>

      <Separator className="mx-0" />

      {/* Views section */}
      <div>
        <SidebarGroupLabel className="px-1 pt-0.5 pb-1 text-[11px] uppercase tracking-wide">
          Views
        </SidebarGroupLabel>
        <SidebarMenu>
          {VIEWS.map(view => (
            <SidebarMenuItem key={view.id}>
              <SidebarMenuButton
                onClick={() => navigate(view.tabId)}
                className="h-8"
              >
                <view.icon className="size-4 shrink-0" />
                <span>{view.label}</span>
                {view.count !== undefined && view.count > 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {view.count}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>

      <Separator className="mx-0" />

      {/* Projects section */}
      <div>
        <button
          type="button"
          onClick={() => setProjectsOpen(o => !o)}
          className="flex w-full items-center justify-between px-1 pb-1"
        >
          <SidebarGroupLabel className="p-0 text-[11px] uppercase tracking-wide">
            Projects
          </SidebarGroupLabel>
          <IconChevronRight
            className={cn(
              'size-3 text-muted-foreground transition-transform',
              projectsOpen && 'rotate-90',
            )}
          />
        </button>

        {projectsOpen && (
          <SidebarMenu>
            {PLACEHOLDER_PROJECTS.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigate('tasks')}
                  className="h-8 text-muted-foreground"
                >
                  <IconFolder className="size-4 shrink-0 opacity-50" />
                  <span className="text-[12px]">No projects yet</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              PLACEHOLDER_PROJECTS.map(project => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    onClick={() => navigate('tasks')}
                    className="h-8"
                  >
                    <IconFolder className="size-4 shrink-0" />
                    <span className="truncate">{project.name}</span>
                    {project.activeCount > 0 && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {project.activeCount}/{project.taskCount}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        )}
      </div>

      <Separator className="mx-0" />

      {/* Filters section */}
      <div>
        <SidebarGroupLabel className="px-1 pt-0.5 pb-1 text-[11px] uppercase tracking-wide">
          Filters
        </SidebarGroupLabel>
        <SidebarMenu>
          {FILTERS.map(filter => (
            <SidebarMenuItem key={filter.id}>
              <SidebarMenuButton
                onClick={() => navigate(filter.tabId)}
                className="h-8"
              >
                <filter.icon className="size-4 shrink-0" />
                <span>{filter.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    </div>
  );
}
