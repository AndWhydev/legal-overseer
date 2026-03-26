'use client'

import React, { useState } from 'react'
import { Plus, X, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
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

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="bb-chat__drawer-backdrop"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="bb-chat__drawer">
        {/* Header — matches sidebar panel header style */}
        <div className="bb-chat__drawer-header">
          <span className="bb-chat__drawer-title">Conversations</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              style={{
                background: 'none',
                border: 'none',
                color: searchOpen ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
              }}
              aria-label="Search conversations"
            >
              <Search size={14} strokeWidth={1.8} />
            </button>
            <button
              className="bb-chat__drawer-close"
              onClick={onClose}
              aria-label="Close drawer"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Search box — slide-down + fade animation */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              key="conversation-search"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <ConversationSearch
                onSelectThread={threadId => {
                  onSelectThread(threadId)
                  onClose()
                }}
                onClose={() => setSearchOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* New chat — compact pill */}
        <div style={{ padding: '0 12px 8px' }}>
          <button
            className="bb-chat__drawer-new-btn"
            onClick={() => {
              onNewConversation()
              onClose()
            }}
          >
            <Plus size={12} />
            New chat
          </button>
        </div>

        {/* Thread list */}
        <div className="bb-chat__drawer-list">
          {isLoading ? (
            <>
              {[1, 2, 3].map(i => (
                <div key={i} className="bb-chat__drawer-card" style={{ opacity: 0.3 }}>
                  <div style={{
                    height: 12, width: `${50 + i * 15}%`,
                    background: 'var(--text-muted, rgba(255,255,255,0.15))',
                    borderRadius: 8,
                    animation: 'shimmer-pulse 1.5s ease-in-out infinite',
                  }} />
                  <div style={{
                    height: 12, width: '75%', marginTop: 4,
                    background: 'var(--text-muted, rgba(255,255,255,0.1))',
                    borderRadius: 8,
                    animation: 'shimmer-pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }} />
                </div>
              ))}
            </>
          ) : threads.length === 0 ? (
            <div className="bb-chat__drawer-empty">No conversations yet</div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className={`bb-chat__drawer-card${
                  thread.id === activeThreadId ? ' bb-chat__drawer-card--active' : ''
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
                {/* Delete button — visible on hover */}
                <button
                  className="bb-chat__drawer-card-x"
                  onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id) }}
                  aria-label="Delete conversation"
                >
                  <X size={11} />
                </button>

                {/* Title */}
                <div className="bb-chat__drawer-card-title">
                  {thread.title || 'Untitled'}
                </div>

                {/* Preview — stripped of markdown */}
                {thread.preview && (
                  <div className="bb-chat__drawer-card-preview">
                    {(() => {
                      const clean = stripMarkdown(thread.preview)
                      return clean.length > 55 ? clean.slice(0, 55) + '...' : clean
                    })()}
                  </div>
                )}

                {/* Meta row */}
                <div className="bb-chat__drawer-card-meta">
                  <span>{thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}</span>
                  <span style={{ marginLeft: 'auto' }}>{relativeTime(thread.lastActivity)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
