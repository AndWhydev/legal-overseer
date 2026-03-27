'use client'

import React, { useState } from 'react'
import { IconPlus, IconX, IconSearch } from '@tabler/icons-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConversationSearch } from './conversation-search'

export interface Thread {
  id: string
  title: string | null
  lastActivity: string
  messageCount: number
  preview: string | null
}

interface ConversationDrawerProps {
  isOpen: boolean
  onClose: () => void
  threads: Thread[]
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onNewConversation: () => void
  onDeleteThread: (threadId: string) => void
  isLoading: boolean
}

/** Strip markdown formatting for clean plain-text display */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')      // code blocks
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // bold
    .replace(/\*([^*]+)\*/g, '$1')        // italic
    .replace(/__([^_]+)__/g, '$1')        // bold alt
    .replace(/_([^_]+)_/g, '$1')          // italic alt
    .replace(/#{1,6}\s+/g, '')            // headings
    .replace(/>\s+/g, '')                 // blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[-*+]\s+/g, '')             // list markers
    .replace(/\n+/g, ' ')                 // newlines to spaces
    .replace(/\s{2,}/g, ' ')             // collapse whitespace
    .trim()
}

/** Relative time helper */
function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  if (isNaN(then)) return ''

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
  })
}

export function ConversationDrawer({
  isOpen,
  onClose,
  threads,
  activeThreadId,
  onSelectThread,
  onNewConversation,
  onDeleteThread,
  isLoading,
}: ConversationDrawerProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const searchActive = searchOpen && searchQuery.trim().length >= 2

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-[320px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-medium">Conversations</SheetTitle>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${searchOpen ? 'text-foreground' : 'text-muted-foreground'}`}
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Search conversations"
              >
                <IconSearch size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={onClose}
                aria-label="Close drawer"
              >
                <IconX size={14} />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Search box -- slide-down + fade animation */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              key="conversation-search"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <ConversationSearch
                threads={threads}
                onSelectThread={threadId => {
                  onSelectThread(threadId)
                  onClose()
                }}
                onClose={() => { setSearchOpen(false); setSearchQuery('') }}
                onQueryChange={setSearchQuery}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* New chat (hidden when search active) */}
        {!searchActive && (
          <div className="px-3 pt-2.5 pb-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => {
                onNewConversation()
                onClose()
              }}
            >
              <IconPlus size={12} />
              New chat
            </Button>
          </div>
        )}

        {/* Thread list (hidden when search active) */}
        {!searchActive && (
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
            {isLoading ? (
              <>
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-lg p-3 opacity-40">
                    <Skeleton className="h-3 mb-2" style={{ width: `${50 + i * 15}%` }} />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </>
            ) : threads.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                No conversations yet
              </div>
            ) : (
              threads.map(thread => (
                <div
                  key={thread.id}
                  className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50 ${
                    thread.id === activeThreadId ? 'bg-muted/80' : ''
                  }`}
                  onClick={() => {
                    onSelectThread(thread.id)
                    onClose()
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectThread(thread.id)
                      onClose()
                    }
                  }}
                >
                  {/* Delete button -- visible on hover */}
                  <button
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id) }}
                    aria-label="Delete conversation"
                  >
                    <IconX size={11} />
                  </button>

                  {/* Title */}
                  <div className="text-sm font-medium text-foreground truncate pr-6">
                    {thread.title || 'Untitled'}
                  </div>

                  {/* Preview -- stripped of markdown */}
                  {thread.preview && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {(() => {
                        const clean = stripMarkdown(thread.preview)
                        return clean.length > 55 ? clean.slice(0, 55) + '...' : clean
                      })()}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center text-[11px] text-muted-foreground mt-1">
                    <span>{thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}</span>
                    <span className="ml-auto">{relativeTime(thread.lastActivity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
