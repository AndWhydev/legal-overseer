'use client'

import { motion } from 'motion/react'
import { Plus, X } from 'lucide-react'

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
  isLoading: boolean
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
  isLoading,
}: ConversationDrawerProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="bb-chat__drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <motion.div
        className="bb-chat__drawer"
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        exit={{ x: -320 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        {/* Header */}
        <div className="bb-chat__drawer-header">
          <span className="bb-chat__drawer-title">Conversations</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="bb-chat__drawer-new-btn"
              onClick={() => {
                onNewConversation()
                onClose()
              }}
            >
              <Plus size={14} />
              New chat
            </button>
            <button
              className="bb-chat__drawer-close-btn"
              onClick={onClose}
              aria-label="Close drawer"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Thread list */}
        <div className="bb-chat__drawer-list">
          {isLoading ? (
            // Skeleton shimmer
            <>
              {[1, 2, 3].map(i => (
                <div key={i} className="bb-chat__drawer-thread" style={{ opacity: 0.4 }}>
                  <div
                    className="bb-chat__drawer-thread-title"
                    style={{
                      height: 14,
                      width: `${60 + i * 15}%`,
                      background: 'var(--text-muted, rgba(255,255,255,0.15))',
                      borderRadius: 4,
                      animation: 'shimmer-pulse 1.5s ease-in-out infinite',
                    }}
                  />
                  <div
                    className="bb-chat__drawer-thread-preview"
                    style={{
                      height: 12,
                      width: '80%',
                      marginTop: 6,
                      background: 'var(--text-muted, rgba(255,255,255,0.1))',
                      borderRadius: 3,
                      animation: 'shimmer-pulse 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                </div>
              ))}
            </>
          ) : threads.length === 0 ? (
            <div className="bb-chat__drawer-empty">No conversations yet</div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className={`bb-chat__drawer-thread ${
                  thread.id === activeThreadId ? 'bb-chat__drawer-thread--active' : ''
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
                <div className="bb-chat__drawer-thread-title">
                  {thread.title || 'Untitled'}
                </div>
                {thread.preview && (
                  <div className="bb-chat__drawer-thread-preview">
                    {thread.preview.length > 60
                      ? thread.preview.slice(0, 60) + '...'
                      : thread.preview}
                  </div>
                )}
                <div className="bb-chat__drawer-thread-time">
                  {relativeTime(thread.lastActivity)}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </>
  )
}
