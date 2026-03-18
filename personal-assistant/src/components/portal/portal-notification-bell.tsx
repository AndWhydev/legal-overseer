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
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setOpen(!open)
          if (!open) {
            const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
            if (unreadIds.length > 0) markRead(unreadIds)
          }
        }}
        style={{
          position: 'relative',
          padding: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#6B7280',
          transition: 'color 150ms',
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: primaryColor,
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
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
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 8,
              width: 360,
              maxHeight: 400,
              overflowY: 'auto',
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
              zIndex: 50,
            }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', fontWeight: 600, fontSize: 14, color: '#111827' }}>
              Notifications
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map(n => (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #F9FAFB',
                    background: n.read ? 'transparent' : `${primaryColor}05`,
                  }}
                >
                  <p style={{ fontSize: 14, fontWeight: n.read ? 400 : 500, color: '#111827', margin: 0 }}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>{n.body}</p>
                  )}
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: '6px 0 0' }}>
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
