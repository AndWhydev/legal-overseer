'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const THREAD_STORAGE_KEY = 'bb-active-thread'

export type ChatSidebarFilter = 'all' | 'unread' | 'starred'

export type ChatSidebarThread = {
  id: string
  title: string | null
  status?: string
  lastActivity: string
  messageCount: number
  preview: string | null
}

type ThreadSelectionRequest = {
  nonce: number
  threadId: string | null
}

type NewConversationRequest = {
  nonce: number
  fromThreadId: string | null
}

interface ChatThreadsContextValue {
  activeThreadId: string | null
  sidebarFilter: ChatSidebarFilter
  setSidebarFilter: (filter: ChatSidebarFilter) => void
  setResolvedThreadId: (threadId: string | null) => void
  selectThread: (threadId: string) => void
  selectionRequest: ThreadSelectionRequest
  requestNewConversation: (fromThreadId?: string | null) => void
  newConversationRequest: NewConversationRequest
  requestThreadPanelFocus: () => void
  threadPanelFocusNonce: number
  threads: ChatSidebarThread[]
  threadsLoading: boolean
  refreshThreads: (showLoading?: boolean) => Promise<void>
}

const ChatThreadsContext = createContext<ChatThreadsContextValue | null>(null)

function readStoredThreadId(): string | null {
  if (typeof window === 'undefined') return null

  const persistedThreadId = window.localStorage.getItem(THREAD_STORAGE_KEY)
  if (persistedThreadId) return persistedThreadId

  const legacyThreadId = window.sessionStorage.getItem(THREAD_STORAGE_KEY)
  if (!legacyThreadId) return null

  window.localStorage.setItem(THREAD_STORAGE_KEY, legacyThreadId)
  window.sessionStorage.removeItem(THREAD_STORAGE_KEY)
  return legacyThreadId
}

function writeStoredThreadId(threadId: string | null) {
  if (typeof window === 'undefined') return

  if (threadId) {
    window.localStorage.setItem(THREAD_STORAGE_KEY, threadId)
  } else {
    window.localStorage.removeItem(THREAD_STORAGE_KEY)
  }

  window.sessionStorage.removeItem(THREAD_STORAGE_KEY)
}

export function ChatThreadsProvider({ children }: { children: React.ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => readStoredThreadId())
  const [sidebarFilter, setSidebarFilter] = useState<ChatSidebarFilter>('all')
  const [selectionRequest, setSelectionRequest] = useState<ThreadSelectionRequest>({ nonce: 0, threadId: null })
  const [newConversationRequest, setNewConversationRequest] = useState<NewConversationRequest>({
    nonce: 0,
    fromThreadId: null,
  })
  const [threadPanelFocusNonce, setThreadPanelFocusNonce] = useState(0)
  const [threads, setThreads] = useState<ChatSidebarThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)

  const setResolvedThreadId = useCallback((threadId: string | null) => {
    setActiveThreadId(threadId)
    writeStoredThreadId(threadId)
  }, [])

  const selectThread = useCallback((threadId: string) => {
    setSidebarFilter('all')
    setResolvedThreadId(threadId)
    setSelectionRequest(prev => ({ nonce: prev.nonce + 1, threadId }))
  }, [setResolvedThreadId])

  const requestNewConversation = useCallback((fromThreadId?: string | null) => {
    setSidebarFilter('all')
    setResolvedThreadId(null)
    setNewConversationRequest(prev => ({
      nonce: prev.nonce + 1,
      fromThreadId: fromThreadId === undefined ? activeThreadId : fromThreadId,
    }))
  }, [activeThreadId, setResolvedThreadId])

  const requestThreadPanelFocus = useCallback(() => {
    setSidebarFilter('all')
    setThreadPanelFocusNonce(prev => prev + 1)
  }, [])

  const refreshThreads = useCallback(async (showLoading = true) => {
    if (showLoading) setThreadsLoading(true)

    try {
      const response = await fetch('/api/agent/chat/history?list=threads&channel=web')
      if (!response.ok) return

      const data = await response.json()
      setThreads(
        (data.threads || []).map((thread: Record<string, unknown>) => ({
          id: thread.id as string,
          title: thread.title as string | null,
          status: thread.status as string | undefined,
          lastActivity: thread.lastActivity as string || thread.last_activity_at as string || '',
          messageCount: thread.messageCount as number || thread.message_count as number || 0,
          preview: thread.preview as string | null,
        }))
      )
    } catch {
      // Keep stale data on error — clearing threads causes a flash of
      // "No saved chats yet" before the next successful fetch overwrites it.
      if (showLoading) setThreads([])
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const value = useMemo<ChatThreadsContextValue>(() => ({
    activeThreadId,
    sidebarFilter,
    setSidebarFilter,
    setResolvedThreadId,
    selectThread,
    selectionRequest,
    requestNewConversation,
    newConversationRequest,
    requestThreadPanelFocus,
    threadPanelFocusNonce,
    threads,
    threadsLoading,
    refreshThreads,
  }), [
    activeThreadId,
    sidebarFilter,
    setSidebarFilter,
    setResolvedThreadId,
    selectThread,
    selectionRequest,
    requestNewConversation,
    newConversationRequest,
    requestThreadPanelFocus,
    threadPanelFocusNonce,
    threads,
    threadsLoading,
    refreshThreads,
  ])

  return (
    <ChatThreadsContext.Provider value={value}>
      {children}
    </ChatThreadsContext.Provider>
  )
}

export function useChatThreads() {
  const context = useContext(ChatThreadsContext)
  if (!context) {
    throw new Error('useChatThreads must be used within a ChatThreadsProvider')
  }
  return context
}

/**
 * Non-throwing variant for consumers rendered outside the provider (e.g.
 * BitBitOverlay, which wraps the whole app shell including the provider).
 * Returns null when the provider isn't available in the tree.
 */
export function useChatThreadsOptional() {
  return useContext(ChatThreadsContext)
}
