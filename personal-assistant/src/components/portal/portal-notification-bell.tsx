'use client'

import { useCallback, useEffect, useState } from 'react'

interface PortalNotificationBellProps {
  accessId: string
  primaryColor: string
}

interface Notification {
  id: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

export function PortalNotificationBell({ accessId, primaryColor }: PortalNotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)

  // Suppress unused var warning — accessId used for future real-time subscriptions
  void accessId

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // Silently fail
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000) // Poll every 30s
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const markRead = async (ids: string[]) => {
    try {
      await fetch('/api/portal/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - ids.length))
    } catch {
      // Silently fail
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open)
          if (!open) {
            const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
            if (unreadIds.length > 0) markRead(unreadIds)
          }
        }}
        className="relative cursor-pointer border-none bg-transparent p-2 text-gray-500 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full text-xs font-medium leading-none text-white"
            style={{ background: primaryColor }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-h-[400px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-900">
              Notifications
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map(n => (
                <div
                  key={n.id}
                  className="border-b border-gray-50 px-4 py-3"
                  style={{ background: n.read ? 'transparent' : `${primaryColor}05` }}
                >
                  <p className={`text-sm text-gray-900 ${n.read ? '' : 'font-medium'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-1 text-sm text-gray-500">{n.body}</p>
                  )}
                  <p style={{ fontSize: 14, color: '#9CA3AF', margin: '8px 0 0' }}>
                    {formatRelative(n.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}
