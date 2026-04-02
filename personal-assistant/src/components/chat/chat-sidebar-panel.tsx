'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconArchive,
  IconClock,
  IconDots,
  IconMessageCircle,
  IconPlus,
  IconStar,
  IconTrash,
} from '@tabler/icons-react'
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/animate-ui/components/radix/sidebar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useChatThreads, type ChatSidebarFilter } from './chat-threads-context'

const MAX_SUMMARY_LENGTH = 72

const FILTERS: Array<{
  id: ChatSidebarFilter
  label: string
  icon: React.ElementType
}> = [
  { id: 'all', label: 'All Chats', icon: IconMessageCircle },
  { id: 'unread', label: 'Unread', icon: IconClock },
  { id: 'starred', label: 'Starred', icon: IconStar },
]

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/>\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[-*+]\s+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function clampLabel(text: string, maxLength = MAX_SUMMARY_LENGTH): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

function toSentenceCase(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function buildThreadSummary(title: string | null, preview: string | null): string {
  const candidates = [title, preview]
    .map(value => (value ? stripMarkdown(value) : ''))
    .filter(Boolean)

  const base = candidates[0] || 'Untitled conversation'
  return clampLabel(toSentenceCase(base.replace(/[.!?]+$/g, '')))
}

export function ChatSidebarPanel() {
  const {
    activeThreadId,
    refreshThreads,
    requestNewConversation,
    requestThreadPanelFocus,
    sidebarFilter: filter,
    selectThread,
    setSidebarFilter,
    threadPanelFocusNonce,
    threads,
    threadsLoading,
  } = useChatThreads()
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  const initialFocusNonceRef = useRef(threadPanelFocusNonce)
  useEffect(() => {
    if (threadPanelFocusNonce === initialFocusNonceRef.current) return
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [threadPanelFocusNonce])

  const visibleThreads = useMemo(() => {
    if (filter === 'all') return threads
    return []
  }, [filter, threads])

  const counts = useMemo(() => ({
    all: threads.length,
    unread: 0,
    starred: 0,
  }), [threads.length])

  const handleThreadAction = async (threadId: string, mode: 'archive' | 'delete', isActive: boolean) => {
    setBusyThreadId(threadId)
    try {
      const response = await fetch('/api/agent/chat/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, mode }),
      })
      if (!response.ok) {
        throw new Error(`Failed to ${mode} thread`)
      }

      await refreshThreads(false)

      if (isActive) {
        requestNewConversation(null)
      }
    } catch {
      // Non-blocking sidebar action: leave current UI intact on failure.
    } finally {
      setBusyThreadId(current => (current === threadId ? null : current))
    }
  }

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col gap-2.5 pt-1">
      <Button
        variant="default"
        size="default"
        className="h-8 w-full justify-start rounded-xl bg-foreground px-3 text-sm font-medium text-background shadow-sm hover:bg-foreground/90"
        onClick={() => requestNewConversation()}
      >
        <IconPlus className="size-4" />
        New Chat
      </Button>

      <SidebarMenu>
        {FILTERS.map(({ id, label, icon: Icon }) => {
          const isActive = filter === id
          const count = counts[id]

          return (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton
                onClick={() => {
                  setSidebarFilter(id)
                  if (id === 'all') requestThreadPanelFocus()
                }}
                isActive={isActive}
                className="h-8"
              >
                <Icon className="size-4 shrink-0" />
                <span>{label}</span>
                <SidebarMenuBadge className="right-2 h-5 min-w-5 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {count}
                </SidebarMenuBadge>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>

      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-1 top-0 z-10 h-px bg-sidebar-border/55" />
        <div aria-hidden className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-px bg-sidebar-border/55" />
        <div className="h-full overflow-y-auto py-2">
          {threadsLoading ? (
            <div className="space-y-1.5 pr-1">
              {[0, 1, 2].map(index => (
                <div key={index} className="animate-pulse rounded-xl bg-sidebar-accent/35 px-4 py-3">
                  <div className="h-4 w-4/5 rounded bg-sidebar-border/70" />
                </div>
              ))}
            </div>
          ) : visibleThreads.length === 0 ? (
            <div className="px-3 py-6 text-sm text-sidebar-foreground/60">
              {filter === 'all' ? 'No saved chats yet.' : `No ${filter} chats yet.`}
            </div>
          ) : (
            <SidebarMenu className="gap-0.5 pr-1 pb-3">
              {visibleThreads.map(thread => {
                const isActive = thread.id === activeThreadId
                const isBusy = busyThreadId === thread.id
                const summary = buildThreadSummary(thread.title, thread.preview)

                return (
                  <SidebarMenuItem key={thread.id}>
                    <SidebarMenuButton
                      disabled={isBusy}
                      isActive={isActive}
                      onClick={() => {
                        if (!isActive) {
                          selectThread(thread.id)
                        }
                      }}
                      className="pr-9 data-[active=true]:font-normal"
                      title={summary}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex-1 truncate">{summary}</span>
                      </div>
                    </SidebarMenuButton>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          showOnHover
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Thread actions"
                          disabled={isBusy}
                          className="rounded-md"
                        >
                          <IconDots className="size-3.5" />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleThreadAction(thread.id, 'archive', isActive)}>
                          <IconArchive className="size-4" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleThreadAction(thread.id, 'delete', isActive)}
                        >
                          <IconTrash className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          )}
        </div>
      </div>
    </div>
  )
}